import { createBinder } from "./binder.js";
import { Checker, createChecker } from "./checker.js";
import { createSourceFile } from "./diagnostics.js";
import { SymbolFlags } from "./index.js";
import { createLogger } from "./logger/index.js";
import { createDiagnostic } from "./messages.js";
import { resolveModule, ResolveModuleHost } from "./module-resolver.js";
import { CompilerOptions } from "./options.js";
import { isImportStatement, parse } from "./parser.js";
import {
  getAnyExtensionFromPath,
  getDirectoryPath,
  isPathAbsolute,
  joinPaths,
  resolvePath,
} from "./path-utils.js";
import { createProjector } from "./projector.js";
import {
  CadlScriptNode,
  CompilerHost,
  Diagnostic,
  DiagnosticTarget,
  Directive,
  DirectiveExpressionNode,
  Emitter,
  EmitterOptions,
  JsSourceFileNode,
  LiteralType,
  Logger,
  Node,
  NodeFlags,
  NoTarget,
  ProjectionApplication,
  Projector,
  SourceFile,
  Sym,
  SymbolTable,
  SyntaxKind,
  Type,
} from "./types.js";
import { doIO, loadFile } from "./util.js";

export interface Program {
  compilerOptions: CompilerOptions;
  mainFile?: CadlScriptNode;
  /** All source files in the program, keyed by their file path. */
  sourceFiles: Map<string, CadlScriptNode>;
  jsSourceFiles: Map<string, JsSourceFileNode>;
  literalTypes: Map<string | number | boolean, LiteralType>;
  host: CompilerHost;
  logger: Logger;
  checker: Checker;
  emitters: EmitterRef[];
  readonly diagnostics: readonly Diagnostic[];
  loadCadlScript(cadlScript: SourceFile): Promise<CadlScriptNode>;
  evalCadlScript(cadlScript: string): void;
  onValidate(cb: (program: Program) => void | Promise<void>): void;
  getOption(key: string): string | undefined;
  stateSet(key: symbol): Set<Type>;
  stateSets: Map<symbol, Set<Type>>;
  stateMap(key: symbol): Map<Type, any>;
  stateMaps: Map<symbol, Map<Type, any>>;
  hasError(): boolean;
  reportDiagnostic(diagnostic: Diagnostic): void;
  reportDiagnostics(diagnostics: readonly Diagnostic[]): void;
  reportDuplicateSymbols(symbols: SymbolTable | undefined): void;
  enableProjections(projections: ProjectionApplication[], startNode?: Type): Projector;
  disableProjections(): void;
  currentProjector?: Projector;
}

interface EmitterRef {
  emitter: Emitter;
  options: EmitterOptions;
}

class StateMap<V> implements Map<Type, V> {
  private internalState = new Map<undefined | Projector, Map<Type, V>>();
  constructor(public program: Program, public key: symbol) {}

  has(t: Type) {
    return this.dispatch(t)?.has(t) ?? false;
  }

  set(t: Type, v: any) {
    this.dispatch(t).set(t, v);
    return this;
  }

  get(t: Type) {
    return this.dispatch(t).get(t);
  }

  delete(t: Type) {
    return this.dispatch(t).delete(t);
  }

  forEach(cb: (value: V, key: Type, map: Map<Type, V>) => void, thisArg?: any) {
    this.dispatch().forEach(cb, thisArg);
    return this;
  }

  get size() {
    return this.dispatch().size;
  }

  clear() {
    return this.dispatch().clear();
  }

  entries() {
    return this.dispatch().entries();
  }

  values() {
    return this.dispatch().values();
  }

  keys() {
    return this.dispatch().keys();
  }

  [Symbol.iterator]() {
    return this.entries();
  }

  [Symbol.toStringTag]: "StateMap";

  dispatch(keyType?: Type): Map<Type, V> {
    const key = keyType ? keyType.projector : this.program.currentProjector;
    if (!this.internalState.has(key)) {
      this.internalState.set(key, new Map());
    }

    return this.internalState.get(key)!;
  }
}
class StateSet implements Set<Type> {
  private internalState = new Map<undefined | Projector, Set<Type>>();
  constructor(public program: Program, public key: symbol) {}

  has(t: Type) {
    return this.dispatch(t)?.has(t) ?? false;
  }

  add(t: Type) {
    this.dispatch(t).add(t);
    return this;
  }

  delete(t: Type) {
    return this.dispatch(t).delete(t);
  }

  forEach(cb: (value: Type, value2: Type, set: Set<Type>) => void, thisArg?: any) {
    this.dispatch().forEach(cb, thisArg);
    return this;
  }

  get size() {
    return this.dispatch().size;
  }

  clear() {
    return this.dispatch().clear();
  }

  values() {
    return this.dispatch().values();
  }

  keys() {
    return this.dispatch().keys();
  }

  entries() {
    return this.dispatch().entries();
  }

  [Symbol.iterator]() {
    return this.values();
  }

  [Symbol.toStringTag]: "StateSet";

  dispatch(keyType?: Type): Set<Type> {
    const key = keyType ? keyType.projector : this.program.currentProjector;
    if (!this.internalState.has(key)) {
      this.internalState.set(key, new Set());
    }

    return this.internalState.get(key)!;
  }
}

export async function createProgram(
  host: CompilerHost,
  mainFile: string,
  options: CompilerOptions = {}
): Promise<Program> {
  const validateCbs: any = [];
  const stateMaps = new Map<symbol, StateMap<any>>();
  const stateSets = new Map<symbol, StateSet>();
  const diagnostics: Diagnostic[] = [];
  const seenSourceFiles = new Set<string>();
  const duplicateSymbols = new Set<Sym>();
  let currentProjector: Projector | undefined;
  const emitters: EmitterRef[] = [];
  let error = false;

  const logger = createLogger({ sink: host.logSink, level: options.diagnosticLevel });

  const program: Program = {
    checker: undefined!,
    compilerOptions: options,
    sourceFiles: new Map(),
    jsSourceFiles: new Map(),
    literalTypes: new Map(),
    host,
    diagnostics,
    logger,
    emitters,
    loadCadlScript,
    evalCadlScript,
    getOption,
    stateMap,
    stateMaps,
    stateSet,
    stateSets,
    reportDiagnostic,
    reportDiagnostics,
    reportDuplicateSymbols,
    hasError() {
      return error;
    },
    onValidate(cb) {
      validateCbs.push(cb);
    },
    enableProjections,
    disableProjections,
    get currentProjector() {
      return currentProjector;
    },
    set currentProjector(v) {
      currentProjector = v;
    },
  };

  let virtualFileCount = 0;
  const binder = createBinder(program);

  if (!options?.nostdlib) {
    await loadStandardLibrary(program);
  }

  const resolvedMain = await resolveCadlEntrypoint(mainFile);
  // Load additional imports prior to compilation
  if (resolvedMain && options.additionalImports) {
    const importScript = options.additionalImports.map((i) => `import "${i}";`).join("\n");
    const sourceFile = createSourceFile(
      importScript,
      joinPaths(getDirectoryPath(resolvedMain), `__additional_imports`)
    );
    await loadCadlScript(sourceFile);
  }

  if (resolvedMain) {
    await loadMain(resolvedMain, options);
  }

  if (resolvedMain && options.emitters) {
    await loadEmitters(resolvedMain, options.emitters);
  }

  const checker = (program.checker = createChecker(program));
  program.checker.checkProgram();

  if (program.hasError()) {
    return program;
  }
  for (const cb of validateCbs) {
    try {
      await cb(program);
    } catch (error: any) {
      if (options.designTimeBuild) {
        program.reportDiagnostic(
          createDiagnostic({
            code: "on-validate-fail",
            format: { error: error.stack },
            target: NoTarget,
          })
        );
      } else {
        throw error;
      }
    }
  }

  if (program.hasError()) {
    return program;
  }

  for (const instance of emitters) {
    await instance.emitter(program, instance.options);
  }

  return program;

  async function loadStandardLibrary(program: Program) {
    for (const dir of host.getLibDirs()) {
      await loadDirectory(dir, NoTarget);
    }
  }

  async function loadDirectory(
    dir: string,
    diagnosticTarget: DiagnosticTarget | typeof NoTarget
  ): Promise<string> {
    const mainFile = await resolveCadlEntrypointForDir(dir);
    await loadCadlFile(mainFile, diagnosticTarget);
    return mainFile;
  }

  async function loadCadlFile(path: string, diagnosticTarget: DiagnosticTarget | typeof NoTarget) {
    if (seenSourceFiles.has(path)) {
      return;
    }
    seenSourceFiles.add(path);

    const file = await doIO(host.readFile, path, program.reportDiagnostic, {
      diagnosticTarget,
    });

    if (file) {
      await loadCadlScript(file);
    }
  }

  async function loadJsFile(
    path: string,
    diagnosticTarget: DiagnosticTarget | typeof NoTarget
  ): Promise<JsSourceFileNode | undefined> {
    const sourceFile = program.jsSourceFiles.get(path);
    if (sourceFile !== undefined) {
      return sourceFile;
    }

    const file = createSourceFile("", path);
    const exports = await doIO(host.getJsImport, path, program.reportDiagnostic, {
      diagnosticTarget,
      jsDiagnosticTarget: { file, pos: 0, end: 0 },
    });

    if (!exports) {
      return undefined;
    }

    return {
      kind: SyntaxKind.JsSourceFile,
      id: {
        kind: SyntaxKind.Identifier,
        sv: "",
        pos: 0,
        end: 0,
        symbol: undefined as any,
        flags: NodeFlags.Synthetic,
      },
      esmExports: exports,
      file,
      namespaceSymbols: [],
      symbol: undefined as any,
      pos: 0,
      end: 0,
      flags: NodeFlags.None,
    };
  }

  /**
   * Import the Javascript files decorator and lifecycle hooks.
   */
  async function importJsFile(path: string, diagnosticTarget: DiagnosticTarget | typeof NoTarget) {
    const file = await loadJsFile(path, diagnosticTarget);
    if (file !== undefined) {
      program.jsSourceFiles.set(path, file);
      if (file.symbol === undefined) {
        binder.bindJsSourceFile(file);
      }
    }
  }

  async function loadCadlScript(cadlScript: SourceFile): Promise<CadlScriptNode> {
    // This is not a diagnostic because the compiler should never reuse the same path.
    // It's the caller's responsibility to use unique paths.
    if (program.sourceFiles.has(cadlScript.path)) {
      throw new RangeError("Duplicate script path: " + cadlScript);
    }
    const sourceFile = parse(cadlScript);
    program.reportDiagnostics(sourceFile.parseDiagnostics);
    program.sourceFiles.set(cadlScript.path, sourceFile);
    binder.bindSourceFile(sourceFile);
    await loadScriptImports(sourceFile);
    return sourceFile;
  }

  function loadCadlScriptSync(cadlScript: SourceFile): CadlScriptNode {
    // This is not a diagnostic because the compiler should never reuse the same path.
    // It's the caller's responsibility to use unique paths.
    if (program.sourceFiles.has(cadlScript.path)) {
      throw new RangeError("Duplicate script path: " + cadlScript);
    }
    const sourceFile = parse(cadlScript);
    program.reportDiagnostics(sourceFile.parseDiagnostics);
    program.sourceFiles.set(cadlScript.path, sourceFile);
    for (const stmt of sourceFile.statements) {
      if (stmt.kind !== SyntaxKind.ImportStatement) break;
      program.reportDiagnostic(createDiagnostic({ code: "dynamic-import", target: stmt }));
    }
    binder.bindSourceFile(sourceFile);

    return sourceFile;
  }

  // Evaluates an arbitrary line of Cadl in the context of a
  // specified file path.  If no path is specified, use a
  // virtual file path
  function evalCadlScript(script: string): void {
    const sourceFile = createSourceFile(script, `__virtual_file_${++virtualFileCount}`);
    const cadlScript = loadCadlScriptSync(sourceFile);
    checker.mergeSourceFile(cadlScript);
    checker.setUsingsForFile(cadlScript);
    for (const ns of cadlScript.namespaces) {
      const mergedSym = checker.getMergedSymbol(ns.symbol)!;
      reportDuplicateSymbols(mergedSym.exports);
    }
    reportDuplicateSymbols(checker.getGlobalNamespaceNode().symbol.exports);
  }

  async function loadScriptImports(file: CadlScriptNode) {
    // collect imports
    const basedir = getDirectoryPath(file.file.path);
    await loadImports(
      file.statements.filter(isImportStatement).map((x) => ({ path: x.path.value, target: x })),
      basedir
    );
  }

  async function loadImports(
    imports: Array<{ path: string; target: DiagnosticTarget | typeof NoTarget }>,
    relativeTo: string
  ) {
    // collect imports
    for (const { path, target } of imports) {
      let importFilePath: string;
      if (path.startsWith("./") || path.startsWith("../")) {
        importFilePath = resolvePath(relativeTo, path);
      } else if (isPathAbsolute(path)) {
        importFilePath = resolvePath(path);
      } else {
        try {
          // attempt to resolve a node module with this name
          importFilePath = await resolveCadlLibrary(path, relativeTo);
          if (importFilePath) {
            logger.debug(`Loading library "${path}" from "${importFilePath}"`);
          }
        } catch (e: any) {
          if (e.code === "MODULE_NOT_FOUND") {
            program.reportDiagnostic(
              createDiagnostic({ code: "library-not-found", format: { path }, target })
            );
            continue;
          } else {
            throw e;
          }
        }
      }

      const ext = getAnyExtensionFromPath(importFilePath);

      if (ext === "") {
        await loadDirectory(importFilePath, target);
      } else if (ext === ".js" || ext === ".mjs") {
        await importJsFile(importFilePath, target);
      } else if (ext === ".cadl") {
        await loadCadlFile(importFilePath, target);
      } else {
        program.reportDiagnostic(createDiagnostic({ code: "invalid-import", target: target }));
      }
    }
  }

  async function loadEmitters(mainFile: string, emitters: string[]) {
    for (const emitterPackage of emitters) {
      await loadEmitter(mainFile, emitterPackage, "default");
    }
  }

  async function loadEmitter(mainFile: string, emitterPackage: string, emitterName: string) {
    const basedir = getDirectoryPath(mainFile);
    let module;
    try {
      // attempt to resolve a node module with this name
      module = await resolveJSLibrary(emitterPackage, basedir);
    } catch (e: any) {
      if (e.code === "MODULE_NOT_FOUND") {
        program.reportDiagnostic(
          createDiagnostic({
            code: "library-not-found",
            format: { path: emitterPackage },
            target: NoTarget,
          })
        );
        return;
      } else {
        throw e;
      }
    }
    const file = await loadJsFile(module, NoTarget);

    if (file === undefined) {
      program.reportDiagnostic(
        createDiagnostic({
          code: "emitter-not-found",
          format: { emitterPackage, emitterName },
          target: NoTarget,
        })
      );
      return;
    }

    const emitterFunction = file.esmExports.$onEmit;
    if (emitterFunction !== undefined) {
      emitters.push({ emitter: emitterFunction, options: { name: emitterName } });
    } else {
      program.reportDiagnostic(
        createDiagnostic({
          code: "emitter-not-found",
          format: { emitterPackage, emitterName },
          target: NoTarget,
        })
      );
    }
  }

  /**
   * resolves a module specifier like "myLib" to an absolute path where we can find the main of
   * that module, e.g. "/cadl/node_modules/myLib/main.cadl".
   */
  function resolveCadlLibrary(specifier: string, baseDir: string): Promise<string> {
    return resolveModule(getResolveModuleHost(), specifier, {
      baseDir,
      resolveMain(pkg) {
        // this lets us follow node resolve semantics more-or-less exactly
        // but using cadlMain instead of main.
        return pkg.cadlMain ?? pkg.main;
      },
    });
  }

  /**
   * resolves a module specifier like "myLib" to an absolute path where we can find the main of
   * that module, e.g. "/cadl/node_modules/myLib/dist/lib.js".
   */
  function resolveJSLibrary(specifier: string, baseDir: string): Promise<string> {
    return resolveModule(getResolveModuleHost(), specifier, { baseDir });
  }

  function getResolveModuleHost(): ResolveModuleHost {
    return {
      realpath: host.realpath,
      stat: host.stat,
      readFile: async (path) => {
        const file = await host.readFile(path);
        return file.text;
      },
    };
  }

  /**
   * Resolve the path to the main file
   * @param path path to the entrypoint of the program. Can be the main.cadl, folder containg main.cadl or a project/library root.
   * @returns Absolute path to the entrypoint.
   */
  async function resolveCadlEntrypoint(path: string): Promise<string | undefined> {
    const resolvedPath = resolvePath(path);
    const mainStat = await doIO(host.stat, resolvedPath, program.reportDiagnostic);
    if (!mainStat) {
      return undefined;
    }

    if (mainStat.isDirectory()) {
      return resolveCadlEntrypointForDir(resolvedPath);
    } else {
      return resolvedPath;
    }
  }

  async function resolveCadlEntrypointForDir(dir: string): Promise<string> {
    const pkgJsonPath = resolvePath(dir, "package.json");
    const [pkg] = await loadFile(host, pkgJsonPath, JSON.parse, program.reportDiagnostic, {
      allowFileNotFound: true,
    });
    const mainFile = resolvePath(
      dir,
      typeof pkg?.cadlMain === "string" ? pkg.cadlMain : "main.cadl"
    );
    return mainFile;
  }

  /**
   * Load the main file from the given path
   * @param mainPath Absolute path to the main file.
   * @param options Compiler options.
   * @returns
   */
  async function loadMain(mainPath: string, options: CompilerOptions): Promise<void> {
    if (!(await checkForCompilerVersionMismatch(mainPath))) {
      return;
    }
    const ext = getAnyExtensionFromPath(mainPath);

    if (ext === ".js" || ext === ".mjs") {
      await importJsFile(mainPath, NoTarget);
    } else if (ext === ".cadl") {
      await loadCadlFile(mainPath, NoTarget);
    } else {
      program.reportDiagnostic(createDiagnostic({ code: "invalid-main", target: NoTarget }));
    }
  }

  // It's important that we use the compiler version that resolves locally
  // from the input Cadl source location. Otherwise, there will be undefined
  // runtime behavior when decorators and handlers expect a
  // different version of cadl than the current one. Abort the compilation
  // with an error if the Cadl entry point resolves to a different local
  // compiler.
  async function checkForCompilerVersionMismatch(mainPath: string): Promise<boolean> {
    const baseDir = getDirectoryPath(mainPath);
    let actual: string;
    try {
      actual = await resolveModule(
        {
          realpath: host.realpath,
          stat: host.stat,
          readFile: async (path) => {
            const file = await host.readFile(path);
            return file.text;
          },
        },
        "@cadl-lang/compiler",
        { baseDir }
      );
    } catch (err: any) {
      if (err.code === "MODULE_NOT_FOUND") {
        return true; // no local cadl, ok to use any compiler
      }
      throw err;
    }

    const expected = await host.realpath(
      resolvePath(host.fileURLToPath(import.meta.url), "../index.js")
    );

    if (actual !== expected) {
      // we have resolved node_modules/@cadl-lang/compiler/dist/core/index.js and we want to get
      // to the shim executable node_modules/.bin/cadl-server
      const betterCadlServerPath = resolvePath(actual, "../../../../../.bin/cadl-server");
      program.reportDiagnostic(
        createDiagnostic({
          code: "compiler-version-mismatch",
          format: { basedir: baseDir, betterCadlServerPath },
          target: NoTarget,
        })
      );
      return false;
    }

    return true;
  }

  function getOption(key: string): string | undefined {
    return (options.miscOptions || {})[key];
  }

  function stateMap(key: symbol): StateMap<any> {
    let m = stateMaps.get(key);

    if (!m) {
      m = new StateMap(program, key);
      stateMaps.set(key, m);
    }

    return m;
  }

  function stateSet(key: symbol): StateSet {
    let s = stateSets.get(key);

    if (!s) {
      s = new StateSet(program, key);
      stateSets.set(key, s);
    }

    return s;
  }

  function enableProjections(projections: ProjectionApplication[], startNode?: Type) {
    return createProjector(program, projections, startNode);
  }

  function disableProjections() {
    currentProjector = undefined;
  }

  function reportDiagnostic(diagnostic: Diagnostic): void {
    if (shouldSuppress(diagnostic)) {
      return;
    }

    if (options.warningAsError && diagnostic.severity === "warning") {
      diagnostic = { ...diagnostic, severity: "error" };
    }

    if (diagnostic.severity === "error") {
      error = true;
    }

    diagnostics.push(diagnostic);
  }

  function reportDiagnostics(newDiagnostics: Diagnostic[]) {
    for (const diagnostic of newDiagnostics) {
      reportDiagnostic(diagnostic);
    }
  }

  function shouldSuppress(diagnostic: Diagnostic): boolean {
    const { target } = diagnostic;
    if (diagnostic.code === "error") {
      diagnostics.push(diagnostic);
      return false;
    }

    if (target === NoTarget) {
      return false;
    }

    if ("file" in target) {
      return false; // No global file suppress yet.
    }

    const node = getNode(target);
    if (node === undefined) {
      return false; // Can't find target cannot be suppressed.
    }

    const suppressing = findDirectiveSuppressingOnNode(diagnostic.code, node);
    if (suppressing) {
      if (diagnostic.severity === "error") {
        // Cannot suppress errors.
        diagnostics.push({
          severity: "error",
          code: "suppress-error",
          message: "Errors cannot be suppressed.",
          target: suppressing.node,
        });

        return false;
      } else {
        return true;
      }
    }
    return false;
  }

  function findDirectiveSuppressingOnNode(code: string, node: Node): Directive | undefined {
    let current: Node | undefined = node;
    do {
      if (current.directives) {
        const directive = findDirectiveSuppressingCode(code, current.directives);
        if (directive) {
          return directive;
        }
      }
    } while ((current = current.parent));
    return undefined;
  }

  /**
   * Returns the directive node that is suppressing this code.
   * @param code Code to check for suppression.
   * @param directives List of directives.
   * @returns Directive suppressing this code if found, `undefined` otherwise
   */
  function findDirectiveSuppressingCode(
    code: string,
    directives: readonly DirectiveExpressionNode[]
  ): Directive | undefined {
    for (const directive of directives.map((x) => parseDirective(x))) {
      if (directive.name === "suppress") {
        if (directive.code === code) {
          return directive;
        }
      }
    }
    return undefined;
  }

  function parseDirective(node: DirectiveExpressionNode): Directive {
    const args = node.arguments.map((x) => {
      return x.kind === SyntaxKind.Identifier ? x.sv : x.value;
    });
    switch (node.target.sv) {
      case "suppress":
        return { name: "suppress", code: args[0], message: args[1], node };
      default:
        throw new Error("Unexpected directive name.");
    }
  }

  function getNode(target: Node | Type | Sym): Node | undefined {
    if (!("kind" in target)) {
      // symbol
      if (target.flags & SymbolFlags.Using) {
        return target.symbolSource!.declarations[0];
      }

      return target.declarations[0]; // handle multiple decls
    } else if (typeof target.kind === "number") {
      // node
      return target as Node;
    } else {
      // type
      return (target as Type).node;
    }
  }

  function reportDuplicateSymbols(symbols: SymbolTable | undefined) {
    if (!symbols) {
      return;
    }
    for (const set of symbols.duplicates.values()) {
      for (const symbol of set) {
        if (!duplicateSymbols.has(symbol)) {
          duplicateSymbols.add(symbol);
          const name = symbol.flags & SymbolFlags.Using ? symbol.symbolSource!.name : symbol.name;
          reportDiagnostic(
            createDiagnostic({
              code: "duplicate-symbol",
              format: { name },
              target: symbol,
            })
          );
        }
      }
    }
  }
}

export async function compile(
  mainFile: string,
  host: CompilerHost,
  options?: CompilerOptions
): Promise<Program> {
  return await createProgram(host, mainFile, options);
}
