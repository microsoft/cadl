import { TextDocument } from "vscode-languageserver-textdocument";
import {
  CompletionItemKind,
  CompletionList,
  CompletionParams,
  DefinitionParams,
  Diagnostic as VSDiagnostic,
  DiagnosticSeverity,
  DidChangeWatchedFilesParams,
  InitializedParams,
  InitializeParams,
  InitializeResult,
  Location,
  PrepareRenameParams,
  PublishDiagnosticsParams,
  Range,
  ReferenceParams,
  RenameParams,
  ServerCapabilities,
  TextDocumentChangeEvent,
  TextDocumentIdentifier,
  TextDocumentSyncKind,
  TextEdit,
  WorkspaceEdit,
  WorkspaceFolder,
  WorkspaceFoldersChangeEvent,
} from "vscode-languageserver/node.js";
import { loadCadlConfigForPath } from "../config/config-loader.js";
import {
  compilerAssert,
  createSourceFile,
  formatDiagnostic,
  getSourceLocation,
} from "../core/diagnostics.js";
import { CompilerOptions } from "../core/options.js";
import { getNodeAtPosition, visitChildren } from "../core/parser.js";
import {
  ensureTrailingDirectorySeparator,
  getDirectoryPath,
  joinPaths,
  resolvePath,
} from "../core/path-utils.js";
import { createProgram, Program } from "../core/program.js";
import {
  CadlScriptNode,
  CompilerHost,
  Diagnostic as CadlDiagnostic,
  DiagnosticTarget,
  IdentifierNode,
  SourceFile,
  SymbolFlags,
  SyntaxKind,
  Type,
} from "../core/types.js";
import { doIO, loadFile } from "../core/util.js";
import { getDoc, isIntrinsic } from "../lib/decorators.js";

export interface ServerHost {
  compilerHost: CompilerHost;
  getDocumentByURL(url: string): TextDocument | undefined;
  sendDiagnostics(params: PublishDiagnosticsParams): void;
  log(message: string): void;
}

export interface Server {
  readonly pendingMessages: readonly string[];
  readonly workspaceFolders: readonly ServerWorkspaceFolder[];
  initialize(params: InitializeParams): InitializeResult;
  initialized(params: InitializedParams): void;
  workspaceFoldersChanged(e: WorkspaceFoldersChangeEvent): void;
  watchedFilesChanged(params: DidChangeWatchedFilesParams): void;
  gotoDefinition(params: DefinitionParams): Promise<Location[]>;
  complete(params: CompletionParams): Promise<CompletionList>;
  findReferences(params: ReferenceParams): Promise<Location[]>;
  prepareRename(params: PrepareRenameParams): Promise<Range | undefined>;
  rename(params: RenameParams): Promise<WorkspaceEdit>;
  checkChange(change: TextDocumentChangeEvent<TextDocument>): Promise<void>;
  documentClosed(change: TextDocumentChangeEvent<TextDocument>): void;
  log(message: string, details?: any): void;
}

export interface ServerSourceFile extends SourceFile {
  // Keep track of the open doucment (if any) associated with a source file.
  readonly document?: TextDocument;
}

export interface ServerWorkspaceFolder extends WorkspaceFolder {
  // Remember path to URL conversion for workspace folders. This path must
  // be resolved and normalized as other paths and have a trailing separator
  // character so that we can test if a path is within a workspace using
  // startsWith.
  path: string;
}

interface CachedFile {
  type: "file";
  file: SourceFile;

  // Cache additional data beyond the raw text of the source file. Currently
  // used only for JSON.parse result of package.json.
  data?: any;
}

interface CachedError {
  type: "error";
  error: unknown;
  data?: any;
}

interface KeywordArea {
  root?: boolean;
  namespace?: boolean;
  model?: boolean;
  identifier?: boolean;
}

const serverOptions: CompilerOptions = {
  noEmit: true,
  designTimeBuild: true,
};

const keywords = [
  // Root only
  ["import", { root: true }],

  // Root and namespace
  ["using", { root: true, namespace: true }],
  ["model", { root: true, namespace: true }],
  ["namespace", { root: true, namespace: true }],
  ["interface", { root: true, namespace: true }],
  ["union", { root: true, namespace: true }],
  ["enum", { root: true, namespace: true }],
  ["alias", { root: true, namespace: true }],
  ["op", { root: true, namespace: true }],

  // On model `model Foo <keyword> ...`
  ["extends", { model: true }],
  ["is", { model: true }],

  // On identifier`
  ["true", { identifier: true }],
  ["false", { identifier: true }],
] as const;

export function createServer(host: ServerHost): Server {
  // Remember original URL when we convert it to a local path so that we can
  // get it back. We can't convert it back because things like URL-encoding
  // could give us back an equivalent but non-identical URL but the original
  // URL is used as a key into the opened documents and so we must reproduce
  // it exactly.
  const pathToURLMap: Map<string, string> = new Map();

  // Cache all file I/O. Only open documents are sent over the LSP pipe. When
  // the compiler reads a file that isn't open, we use this cache to avoid
  // hitting the disk. Entries are invalidated when LSP client notifies us of
  // a file change.
  const fileSystemCache = new Map<string, CachedFile | CachedError>();

  const compilerHost: CompilerHost = {
    ...host.compilerHost,
    readFile,
    stat,
  };

  let workspaceFolders: ServerWorkspaceFolder[] = [];
  let isInitialized = false;
  let pendingMessages: string[] = [];

  return {
    get pendingMessages() {
      return pendingMessages;
    },
    get workspaceFolders() {
      return workspaceFolders;
    },
    initialize,
    initialized,
    workspaceFoldersChanged,
    watchedFilesChanged,
    gotoDefinition,
    documentClosed,
    complete,
    findReferences,
    prepareRename,
    rename,
    checkChange,
    log,
  };

  function initialize(params: InitializeParams): InitializeResult {
    const capabilities: ServerCapabilities = {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      definitionProvider: true,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: [".", "@"],
        allCommitCharacters: [".", ",", ";", "("],
      },
      referencesProvider: true,
      renameProvider: {
        prepareProvider: true,
      },
    };

    if (params.capabilities.workspace?.workspaceFolders) {
      workspaceFolders =
        params.workspaceFolders?.map((w) => ({
          ...w,
          path: ensureTrailingDirectorySeparator(resolvePath(compilerHost.fileURLToPath(w.uri))),
        })) ?? [];
      capabilities.workspace = {
        workspaceFolders: {
          supported: true,
          changeNotifications: true,
        },
      };
    } else if (params.rootUri) {
      workspaceFolders = [
        {
          name: "<root>",
          uri: params.rootUri,
          path: ensureTrailingDirectorySeparator(
            resolvePath(compilerHost.fileURLToPath(params.rootUri))
          ),
        },
      ];
    } else if (params.rootPath) {
      workspaceFolders = [
        {
          name: "<root>",
          uri: compilerHost.pathToFileURL(params.rootPath),
          path: ensureTrailingDirectorySeparator(resolvePath(params.rootPath)),
        },
      ];
    }

    log("Workspace Folders", workspaceFolders);
    return { capabilities };
  }

  function initialized(params: InitializedParams): void {
    isInitialized = true;
    log("Initialization complete.");
  }

  function workspaceFoldersChanged(e: WorkspaceFoldersChangeEvent) {
    log("Workspace Folders Changed", e);
    const map = new Map(workspaceFolders.map((f) => [f.uri, f]));
    for (const folder of e.removed) {
      map.delete(folder.uri);
    }
    for (const folder of e.added) {
      map.set(folder.uri, { ...folder, path: compilerHost.fileURLToPath(folder.uri) });
    }
    workspaceFolders = Array.from(map.values());
    log("Workspace Folders", workspaceFolders);
  }

  function watchedFilesChanged(params: DidChangeWatchedFilesParams) {
    // remove stale file system cache entries on file change notification
    for (const each of params.changes) {
      if (each.uri.startsWith("file:")) {
        const path = compilerHost.fileURLToPath(each.uri);
        fileSystemCache.delete(path);
      }
    }
  }

  type CompileCallback<T> = (
    program: Program,
    document: TextDocument,
    script: CadlScriptNode
  ) => (T | undefined) | Promise<T | undefined>;

  async function compile(
    document: TextDocument | TextDocumentIdentifier
  ): Promise<Program | undefined>;

  async function compile<T>(
    document: TextDocument | TextDocumentIdentifier,
    callback: CompileCallback<T>
  ): Promise<T | undefined>;

  async function compile<T>(
    document: TextDocument | TextDocumentIdentifier,
    callback?: CompileCallback<T>
  ): Promise<T | Program | undefined> {
    const path = getPath(document);
    const mainFile = await getMainFileForDocument(path);
    const config = await loadCadlConfigForPath(compilerHost, mainFile);

    const options = {
      ...serverOptions,
      emitters: config.emitters ? Object.keys(config.emitters) : [],
    };

    if (!upToDate(document)) {
      return undefined;
    }

    let program: Program;
    try {
      program = await createProgram(compilerHost, mainFile, options);
      if (!upToDate(document)) {
        return undefined;
      }

      if (mainFile !== path && !program.sourceFiles.has(path)) {
        // If the file that changed wasn't imported by anything from the main
        // file, retry using the file itself as the main file.
        program = await createProgram(compilerHost, path, options);
      }

      if (!upToDate(document)) {
        return undefined;
      }

      if (callback) {
        const doc = "version" in document ? document : host.getDocumentByURL(document.uri);
        compilerAssert(doc, "Failed to get document.");
        const path = getPath(doc);
        const script = program.sourceFiles.get(path);
        compilerAssert(script, "Failed to get script.");
        return await callback(program, doc, script);
      }

      return program;
    } catch (err: any) {
      host.sendDiagnostics({
        uri: document.uri,
        diagnostics: [
          {
            severity: DiagnosticSeverity.Error,
            range: Range.create(0, 0, 0, 0),
            message:
              `Internal compiler error!\nFile issue at https://github.com/microsoft/cadl\n\n` +
              err.stack,
          },
        ],
      });

      return undefined;
    }
  }

  async function checkChange(change: TextDocumentChangeEvent<TextDocument>) {
    const program = await compile(change.document);
    if (!program) {
      return;
    }

    // Group diagnostics by file.
    //
    // Initialize diagnostics for all source files in program to empty array
    // as we must send an empty array when a file has no diagnostics or else
    // stale diagnostics from a previous run will stick around in the IDE.
    //
    const diagnosticMap: Map<TextDocument, VSDiagnostic[]> = new Map();
    diagnosticMap.set(change.document, []);
    for (const each of program.sourceFiles.values()) {
      const document = (each.file as ServerSourceFile)?.document;
      if (document) {
        diagnosticMap.set(document, []);
      }
    }

    for (const each of program.diagnostics) {
      let document: TextDocument | undefined;

      const location = getSourceLocation(each.target);
      if (location?.file) {
        document = (location.file as ServerSourceFile).document;
      } else {
        // https://github.com/Microsoft/language-server-protocol/issues/256
        //
        // LSP does not currently allow sending a diagnostic with no location so
        // we report diagnostics with no location on the document that changed to
        // trigger.
        document = change.document;
      }

      if (!document || !upToDate(document)) {
        continue;
      }

      const start = document.positionAt(location?.pos ?? 0);
      const end = document.positionAt(location?.end ?? 0);
      const range = Range.create(start, end);
      const severity = convertSeverity(each.severity);
      const diagnostic = VSDiagnostic.create(range, each.message, severity, each.code, "Cadl");
      const diagnostics = diagnosticMap.get(document);
      compilerAssert(
        diagnostics,
        "Diagnostic reported against a source file that was not added to the program."
      );
      diagnostics.push(diagnostic);
    }

    for (const [document, diagnostics] of diagnosticMap) {
      sendDiagnostics(document, diagnostics);
    }
  }

  async function gotoDefinition(params: DefinitionParams): Promise<Location[]> {
    const sym = await compile(params.textDocument, (program, document, file) => {
      const id = getNodeAtPosition(file, document.offsetAt(params.position));
      return id?.kind == SyntaxKind.Identifier ? program.checker.resolveIdentifier(id) : undefined;
    });
    return getLocations(sym?.declarations);
  }

  async function complete(params: CompletionParams): Promise<CompletionList> {
    const completions: CompletionList = {
      isIncomplete: false,
      items: [],
    };

    await compile(params.textDocument, (program, document, file) => {
      const node = getNodeAtPosition(file, document.offsetAt(params.position));
      if (node === undefined) {
        addKeywordCompletion("root", completions);
      } else {
        switch (node.kind) {
          case SyntaxKind.NamespaceStatement:
            addKeywordCompletion("namespace", completions);
            break;
          case SyntaxKind.Identifier:
            addIdentifierCompletion(program, node, completions);
            break;
        }
      }
    });

    return completions;
  }

  async function findReferences(params: ReferenceParams): Promise<Location[]> {
    const identifiers = await compile(params.textDocument, (program, document, file) =>
      findReferenceIdentifiers(program, file, document.offsetAt(params.position))
    );
    return getLocations(identifiers);
  }

  async function prepareRename(params: PrepareRenameParams): Promise<Range | undefined> {
    return await compile(params.textDocument, (_, document, file) => {
      const id = getNodeAtPosition(file, document.offsetAt(params.position));
      return id?.kind === SyntaxKind.Identifier ? getLocation(id)?.range : undefined;
    });
  }

  async function rename(params: RenameParams): Promise<WorkspaceEdit> {
    const changes: Record<string, TextEdit[]> = {};
    await compile(params.textDocument, (program, document, file) => {
      const identifiers = findReferenceIdentifiers(
        program,
        file,
        document.offsetAt(params.position)
      );
      for (const id of identifiers) {
        const location = getLocation(id);
        if (!location) {
          continue;
        }
        const change = TextEdit.replace(location.range, params.newName);
        if (location.uri in changes) {
          changes[location.uri].push(change);
        } else {
          changes[location.uri] = [change];
        }
      }
    });
    return { changes };
  }

  function findReferenceIdentifiers(
    program: Program,
    file: CadlScriptNode,
    pos: number
  ): IdentifierNode[] {
    const id = getNodeAtPosition(file, pos);
    if (id?.kind !== SyntaxKind.Identifier) {
      return [];
    }

    const sym = program.checker.resolveIdentifier(id);
    if (!sym) {
      return [id];
    }

    const references: IdentifierNode[] = [];
    for (const script of program.sourceFiles.values() ?? []) {
      visitChildren(script, function visit(node) {
        if (
          node.kind === SyntaxKind.Identifier &&
          program.checker.resolveIdentifier(node) === sym
        ) {
          references.push(node);
        }
        visitChildren(node, visit);
      });
    }

    return references;
  }

  function addKeywordCompletion(area: keyof KeywordArea, completions: CompletionList) {
    const filteredKeywords = keywords.filter(([_, x]) => area in x);
    for (const [keyword] of filteredKeywords) {
      completions.items.push({
        label: keyword,
        kind: CompletionItemKind.Keyword,
      });
    }
  }

  /**
   * Add completion options for an identifier.
   */
  function addIdentifierCompletion(
    program: Program,
    node: IdentifierNode,
    completions: CompletionList
  ) {
    const result = program.checker.resolveCompletions(node);
    if (result.size === 0) {
      return;
    }
    for (const [key, { sym, label }] of result) {
      let documentation: string | undefined;
      let kind: CompletionItemKind;
      if (sym.flags & (SymbolFlags.Function | SymbolFlags.Decorator)) {
        kind = CompletionItemKind.Function;
      } else if (
        sym.flags & SymbolFlags.Namespace &&
        sym.declarations[0].kind !== SyntaxKind.NamespaceStatement
      ) {
        kind = CompletionItemKind.Module;
      } else {
        const type = program.checker.getTypeForNode(sym.declarations[0]);
        documentation = getDoc(program, type);
        kind = getCompletionItemKind(program, type);
      }
      completions.items.push({
        label: label ?? key,
        documentation,
        kind,
        insertText: key,
      });
    }

    if (node.parent?.kind === SyntaxKind.TypeReference) {
      addKeywordCompletion("identifier", completions);
    }
  }

  function getCompletionItemKind(program: Program, target: Type): CompletionItemKind {
    switch (target.node?.kind) {
      case SyntaxKind.EnumStatement:
      case SyntaxKind.UnionStatement:
        return CompletionItemKind.Enum;
      case SyntaxKind.AliasStatement:
        return CompletionItemKind.Variable;
      case SyntaxKind.ModelStatement:
        return isIntrinsic(program, target) ? CompletionItemKind.Keyword : CompletionItemKind.Class;
      case SyntaxKind.NamespaceStatement:
        return CompletionItemKind.Module;
      default:
        return CompletionItemKind.Struct;
    }
  }

  function documentClosed(change: TextDocumentChangeEvent<TextDocument>) {
    // clear diagnostics on file close
    sendDiagnostics(change.document, []);
  }

  function getLocations(targets: DiagnosticTarget[] | undefined): Location[] {
    return targets?.map(getLocation).filter((x): x is Location => !!x) ?? [];
  }

  function getLocation(target: DiagnosticTarget): Location | undefined {
    const location = getSourceLocation(target);
    if (location.isSynthetic) {
      return undefined;
    }

    const start = location.file.getLineAndCharacterOfPosition(location.pos);
    const end = location.file.getLineAndCharacterOfPosition(location.end);
    return {
      uri: getURL(location.file.path),
      range: Range.create(start, end),
    };
  }

  function convertSeverity(severity: "warning" | "error"): DiagnosticSeverity {
    switch (severity) {
      case "warning":
        return DiagnosticSeverity.Warning;
      case "error":
        return DiagnosticSeverity.Error;
    }
  }

  function log(message: string, details: any = undefined) {
    message = `[${new Date().toLocaleTimeString()}] ${message}`;
    if (details) {
      message += ": " + JSON.stringify(details, undefined, 2);
    }

    if (!isInitialized) {
      pendingMessages.push(message);
      return;
    }

    for (const pending of pendingMessages) {
      host.log(pending);
    }

    pendingMessages = [];
    host.log(message);
  }

  function sendDiagnostics(document: TextDocument, diagnostics: VSDiagnostic[]) {
    host.sendDiagnostics({
      uri: document.uri,
      version: document.version,
      diagnostics,
    });
  }

  /**
   * Determine if the given document is the latest version.
   *
   * A document can become out-of-date if a change comes in during an async
   * operation.
   */
  function upToDate(document: TextDocument | TextDocumentIdentifier) {
    if (!("version" in document)) {
      return true;
    }
    return document.version === host.getDocumentByURL(document.uri)?.version;
  }

  /**
   * Infer the appropriate entry point (a.k.a. "main file") for analyzing a
   * change to the file at the given path. This is necessary because different
   * results can be obtained from compiling the same file with different entry
   * points.
   *
   * Walk directory structure upwards looking for package.json with cadlMain or
   * main.cadl file. Stop search when reaching a workspace root. If a root is
   * reached without finding an entry point, use the given path as its own
   * entry point.
   *
   * Untitled documents are always treated as their own entry points as they
   * do not exist in a directory that could pull them in via another entry
   * point.
   */
  async function getMainFileForDocument(path: string) {
    if (path.startsWith("untitled:")) {
      return path;
    }

    let dir = getDirectoryPath(path);
    const options = { allowFileNotFound: true };

    while (inWorkspace(dir)) {
      let mainFile = "main.cadl";
      let pkg: any;
      const pkgPath = joinPaths(dir, "package.json");
      const cached = fileSystemCache.get(pkgPath)?.data;

      if (cached) {
        pkg = cached;
      } else {
        [pkg] = await loadFile(
          compilerHost,
          pkgPath,
          JSON.parse,
          logMainFileSearchDiagnostic,
          options
        );
        fileSystemCache.get(pkgPath)!.data = pkg ?? {};
      }

      if (typeof pkg?.cadlMain === "string") {
        mainFile = pkg.cadlMain;
      }

      const candidate = joinPaths(dir, mainFile);
      const stat = await doIO(
        () => compilerHost.stat(candidate),
        candidate,
        logMainFileSearchDiagnostic,
        options
      );

      if (stat?.isFile()) {
        return candidate;
      }

      dir = getDirectoryPath(dir);
    }

    return path;

    function logMainFileSearchDiagnostic(diagnostic: CadlDiagnostic) {
      log(
        `Unexpected diagnostic while looking for main file of ${path}`,
        formatDiagnostic(diagnostic)
      );
    }
  }

  function inWorkspace(path: string) {
    path = ensureTrailingDirectorySeparator(path);
    return workspaceFolders.some((f) => path.startsWith(f.path));
  }

  function getPath(document: TextDocument | TextDocumentIdentifier) {
    if (isUntitled(document.uri)) {
      return document.uri;
    }
    const path = resolvePath(compilerHost.fileURLToPath(document.uri));
    pathToURLMap.set(path, document.uri);
    return path;
  }

  function getURL(path: string) {
    if (isUntitled(path)) {
      return path;
    }
    return pathToURLMap.get(path) ?? compilerHost.pathToFileURL(path);
  }

  function isUntitled(pathOrUrl: string) {
    return pathOrUrl.startsWith("untitled:");
  }

  function getDocument(path: string) {
    const url = getURL(path);
    return url ? host.getDocumentByURL(url) : undefined;
  }

  async function readFile(path: string): Promise<ServerSourceFile> {
    // Try open files sent from client over LSP
    const document = getDocument(path);
    if (document) {
      return {
        document,
        ...createSourceFile(document.getText(), path),
      };
    }

    // Try file system cache
    const cached = fileSystemCache.get(path);
    if (cached) {
      if (cached.type === "error") {
        throw cached.error;
      }
      return cached.file;
    }

    // Hit the disk and cache
    try {
      const file = await host.compilerHost.readFile(path);
      fileSystemCache.set(path, { type: "file", file });
      return file;
    } catch (error) {
      fileSystemCache.set(path, { type: "error", error });
      throw error;
    }
  }

  async function stat(path: string): Promise<{ isDirectory(): boolean; isFile(): boolean }> {
    // if we have an open document for the path or a cache entry, then we know
    // it's a file and not a directory and needn't hit the disk.
    if (getDocument(path) || fileSystemCache.get(path)?.type === "file") {
      return {
        isFile() {
          return true;
        },
        isDirectory() {
          return false;
        },
      };
    }
    return await host.compilerHost.stat(path);
  }
}
