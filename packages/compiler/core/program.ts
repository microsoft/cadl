import { dirname, extname, isAbsolute, join, resolve } from "path";
import { fileURLToPath } from "url";
import { createBinder } from "./binder.js";
import { Checker, createChecker } from "./checker.js";
import { createSourceFile } from "./diagnostics.js";
import { createLogger } from "./logger.js";
import { createDiagnostic } from "./messages.js";
import { CompilerOptions } from "./options.js";
import { parse } from "./parser.js";
import {
  CadlScriptNode,
  CompilerHost,
  Diagnostic,
  DiagnosticTarget,
  Directive,
  DirectiveExpressionNode,
  JsSourceFile,
  LiteralType,
  Logger,
  Node,
  NoTarget,
  SourceFile,
  Sym,
  SymbolTable,
  SyntaxKind,
  Type,
} from "./types.js";
import { doIO, loadFile, resolvePluginModule } from "./util.js";

export interface Program {
  compilerOptions: CompilerOptions;
  mainFile?: CadlScriptNode;
  /** All source files in the program, keyed by their file path. */
  sourceFiles: Map<string, CadlScriptNode>;
  jsSourceFiles: Map<string, JsSourceFile>;
  literalTypes: Map<string | number | boolean, LiteralType>;
  host: CompilerHost;
  logger: Logger;
  checker?: Checker;
  readonly diagnostics: readonly Diagnostic[];
  loadCadlScript(cadlScript: SourceFile): Promise<CadlScriptNode>;
  evalCadlScript(cadlScript: string): void;
  onBuild(cb: (program: Program) => void): Promise<void> | void;
  getOption(key: string): string | undefined;
  stateSet(key: Symbol): Set<any>;
  stateMap(key: Symbol): Map<any, any>;
  hasError(): boolean;
  reportDiagnostic(diagnostic: Diagnostic): void;
  reportDiagnostics(diagnostics: Diagnostic[]): void;
  reportDuplicateSymbols(symbols: SymbolTable | undefined): void;
}

export async function createProgram(
  host: CompilerHost,
  mainFile: string,
  options: CompilerOptions = {}
): Promise<Program> {
  const buildCbs: any = [];
  const stateMaps = new Map<Symbol, Map<any, any>>();
  const stateSets = new Map<Symbol, Set<any>>();
  const diagnostics: Diagnostic[] = [];
  const seenSourceFiles = new Set<string>();
  const duplicateSymbols = new Set<Sym>();
  let error = false;

  const logger = createLogger({ sink: host.logSink, level: options.diagnosticLevel });

  const program: Program = {
    compilerOptions: options,
    sourceFiles: new Map(),
    jsSourceFiles: new Map(),
    literalTypes: new Map(),
    host,
    diagnostics,
    logger,
    loadCadlScript,
    evalCadlScript,
    getOption,
    stateMap,
    stateSet,
    reportDiagnostic,
    reportDiagnostics,
    reportDuplicateSymbols,
    hasError() {
      return error;
    },
    onBuild(cb) {
      buildCbs.push(cb);
    },
  };

  let virtualFileCount = 0;
  const binder = createBinder(program);

  if (!options?.nostdlib) {
    await loadStandardLibrary(program);
  }

  // Load additional imports prior to compilation
  if (options.additionalImports) {
    const importScript = options.additionalImports.map((i) => `import "${i}";`).join("\n");
    const sourceFile = createSourceFile(importScript, `__additional_imports`);
    await loadCadlScript(sourceFile);
  }

  await loadMain(mainFile, options);

  const checker = (program.checker = createChecker(program));
  program.checker.checkProgram();

  for (const cb of buildCbs) {
    await cb(program);
  }

  return program;

  async function loadStandardLibrary(program: Program) {
    for (const dir of host.getLibDirs()) {
      await loadDirectory(dir);
    }
  }

  async function loadDirectory(dir: string, diagnosticTarget?: DiagnosticTarget) {
    const pkgJsonPath = resolve(dir, "package.json");
    let [pkg] = await loadFile(host, pkgJsonPath, JSON.parse, program.reportDiagnostic, {
      allowFileNotFound: true,
      diagnosticTarget,
    });
    const mainFile = resolve(dir, typeof pkg?.cadlMain === "string" ? pkg.cadlMain : "main.cadl");
    await loadCadlFile(mainFile, diagnosticTarget);
  }

  async function loadCadlFile(path: string, diagnosticTarget?: DiagnosticTarget) {
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

  async function loadJsFile(path: string, diagnosticTarget: DiagnosticTarget) {
    if (program.jsSourceFiles.has(path)) return;

    const file = createSourceFile("", path);
    const exports = await doIO(host.getJsImport, path, program.reportDiagnostic, {
      diagnosticTarget,
      jsDiagnosticTarget: { file, pos: 0, end: 0 },
    });

    if (!exports) {
      return;
    }

    const sourceFile: JsSourceFile = {
      kind: "JsSourceFile",
      esmExports: exports,
      file,
      namespaces: [],
    };

    program.jsSourceFiles.set(path, sourceFile);

    binder.bindJsSourceFile(sourceFile);
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
    await loadImports(sourceFile);
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
    checker.mergeCadlSourceFile(cadlScript);
    checker.setUsingsForFile(cadlScript);
    reportDuplicateSymbols(cadlScript.locals);
    for (const ns of cadlScript.namespaces) {
      const mergedNs = checker.getMergedNamespace(ns);
      reportDuplicateSymbols(mergedNs.locals);
      reportDuplicateSymbols(mergedNs.exports);
    }
    reportDuplicateSymbols(checker.getGlobalNamespaceType().node!.exports);
  }

  async function loadImports(file: CadlScriptNode) {
    // collect imports
    for (const stmt of file.statements) {
      if (stmt.kind !== SyntaxKind.ImportStatement) break;
      const path = stmt.path.value;
      const basedir = dirname(file.file.path);

      let target: string;
      if (path.startsWith("./") || path.startsWith("../")) {
        target = resolve(basedir, path);
      } else if (isAbsolute(path)) {
        target = path;
      } else {
        try {
          // attempt to resolve a node module with this name
          target = await resolveModuleSpecifier(path, basedir);
        } catch (e: any) {
          if (e.code === "MODULE_NOT_FOUND") {
            program.reportDiagnostic(
              createDiagnostic({ code: "library-not-found", format: { path }, target: stmt })
            );
            continue;
          } else {
            throw e;
          }
        }
      }

      const ext = extname(target);

      if (ext === "") {
        await loadDirectory(target, stmt);
      } else if (ext === ".js" || ext === ".mjs") {
        await loadJsFile(target, stmt);
      } else if (ext === ".cadl") {
        await loadCadlFile(target, stmt);
      } else {
        program.reportDiagnostic(createDiagnostic({ code: "invalid-import", target: stmt }));
      }
    }
  }

  /**
   * resolves a module specifier like "myLib" to an absolute path where we can find the main of
   * that module, e.g. "/cadl/node_modules/myLib/main.cadl".
   */
  function resolveModuleSpecifier(
    specifier: string,
    basedir: string,
    useCadlMain = true
  ): Promise<string> {
    return resolvePluginModule(
      host,
      specifier,
      basedir,
      useCadlMain ? (pkg) => pkg.adlMain : undefined
    );
  }

  async function loadMain(mainFile: string, options: CompilerOptions) {
    const mainPath = host.resolveAbsolutePath(mainFile);
    const mainStat = await doIO(host.stat, mainPath, program.reportDiagnostic);
    if (!mainStat) {
      return;
    }

    if (!(await checkForCompilerVersionMismatch(mainPath, mainStat.isDirectory()))) {
      return;
    }

    if (mainStat.isDirectory()) {
      await loadDirectory(mainPath);
    } else {
      await loadCadlFile(mainPath);
    }
  }

  // It's important that we use the compiler version that resolves locally
  // from the input Cadl source location. Otherwise, there will be undefined
  // runtime behavior when decorators and onBuild handlers expect a
  // different version of cadl than the current one. Abort the compilation
  // with an error if the Cadl entry point resolves to a different local
  // compiler.
  async function checkForCompilerVersionMismatch(
    mainPath: string,
    mainPathIsDirectory: boolean
  ): Promise<boolean> {
    const basedir = mainPathIsDirectory ? mainPath : dirname(mainPath);
    let actual: string;
    try {
      actual = await resolveModuleSpecifier("@cadl-lang/compiler", basedir, false);
    } catch (err: any) {
      if (err.code === "MODULE_NOT_FOUND") {
        return true; // no local cadl, ok to use any compiler
      }
      throw err;
    }

    // NOTE: realpath here ensures consistent path normalization with resolveModuleSpecifier below.
    const expected = await host.realpath(join(fileURLToPath(import.meta.url), "../index.js"));
    if (actual !== expected) {
      // we have resolved node_modules/@cadl-lang/compiler/dist/core/index.js and we want to get
      // to the shim executable node_modules/.bin/cadl-server
      const betterCadlServerPath = resolve(actual, "../../../../../.bin/cadl-server");
      program.reportDiagnostic(
        createDiagnostic({
          code: "compiler-version-mismatch",
          format: { basedir, betterCadlServerPath },
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

  function stateMap(key: Symbol): Map<any, any> {
    let m = stateMaps.get(key);
    if (!m) {
      m = new Map();
      stateMaps.set(key, m);
    }

    return m;
  }

  function stateSet(key: Symbol): Set<any> {
    let s = stateSets.get(key);
    if (!s) {
      s = new Set();
      stateSets.set(key, s);
    }

    return s;
  }

  function reportDiagnostic(diagnostic: Diagnostic): void {
    if (diagnostic.severity === "error") {
      error = true;
    }
    if (shouldSuppress(diagnostic)) {
      return;
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
    directives: DirectiveExpressionNode[]
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
    if ("node" in target) {
      return target.node;
    }

    if (target.kind === "decorator") {
      return undefined;
    }

    if (target.kind === "Intrinsic") {
      return undefined;
    }
    return target;
  }

  function reportDuplicateSymbols(symbols: SymbolTable | undefined) {
    if (!symbols) {
      return;
    }
    for (const symbol of symbols.duplicates) {
      if (!duplicateSymbols.has(symbol)) {
        duplicateSymbols.add(symbol);
        reportDiagnostic(
          createDiagnostic({
            code: "duplicate-symbol",
            format: { name: symbol.name },
            target: symbol,
          })
        );
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
