import { ok } from "assert";
import { pathToFileURL } from "url";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Diagnostic } from "vscode-languageserver/node.js";
import { parse, visitChildren } from "../../core/parser.js";
import { IdentifierNode, SyntaxKind } from "../../core/types.js";
import { createServer, Server, ServerHost } from "../../server/index.js";
import {
  createTestFileSystem,
  resolveVirtualPath,
  StandardTestLibrary,
  TestFileSystem,
} from "../../testing/index.js";

export interface TestServerHost extends ServerHost, TestFileSystem {
  server: Server;
  logMessages: readonly string[];
  getDocument(path: string): TextDocument | undefined;
  addOrUpdateDocument(path: string, content: string): TextDocument;
  getDiagnostics(path: string): readonly Diagnostic[];
  getURL(path: string): string;
}

export async function createTestServerHost(): Promise<TestServerHost> {
  const documents = new Map<string, TextDocument>();
  const diagnostics = new Map<string, Diagnostic[]>();
  const logMessages: string[] = [];
  const fileSystem = await createTestFileSystem();
  // We don't add the @test decorator for server tests
  fileSystem.compilerHost.getLibDirs = () => [".cadl/lib"];
  await fileSystem.addCadlLibrary(StandardTestLibrary);

  const serverHost: TestServerHost = {
    ...fileSystem,
    server: undefined!, // initialized later due to cycle
    logMessages,
    getDocumentByURL(url) {
      return documents.get(url);
    },
    getDocument(path: string) {
      return this.getDocumentByURL(this.getURL(path));
    },
    addOrUpdateDocument(path: string, content: string) {
      const url = this.getURL(path);
      const version = documents.get(url)?.version ?? 1;
      const document = TextDocument.create(url, "cadl", version, content);
      documents.set(url, document);
      return document;
    },
    getDiagnostics(path) {
      return diagnostics.get(this.getURL(path)) ?? [];
    },
    sendDiagnostics(params) {
      if (params.version && documents.get(params.uri)?.version !== params.version) {
        return;
      }
      diagnostics.set(params.uri, params.diagnostics);
    },
    log(message) {
      logMessages.push(message);
    },
    getURL(path: string) {
      if (path.startsWith("untitled:")) {
        return path;
      }
      return pathToFileURL(resolveVirtualPath(path)).href;
    },
  };

  const server = createServer(serverHost);
  server.initialize({
    rootUri: serverHost.getURL("./"),
    capabilities: {},
    processId: null,
    workspaceFolders: null,
  });
  server.initialized({});
  serverHost.server = server;
  return serverHost;
}

/**
 * Takes source code with a cursor position indicated by `┆`, removes the
 * `┆` and returns the source without the `┆` and the numeric cursor
 * position.
 */
export function extractCursor(sourceWithCursor: string): { source: string; pos: number } {
  const pos = sourceWithCursor.indexOf("┆");
  ok(pos >= 0, "no cursor found");
  const source = sourceWithCursor.replace("┆", "");
  return { source, pos };
}

/**
 * Extracts all identifiers marked with trailing empty comments from source
 */
export function getTestIdentifiers(source: string): IdentifierNode[] {
  const identifiers: IdentifierNode[] = [];
  const ast = parse(source);
  visitChildren(ast, function visit(node) {
    if (node.kind === SyntaxKind.Identifier) {
      if (source.substring(node.end, node.end + "/**/".length) === "/**/") {
        identifiers.push(node);
      }
    }
    visitChildren(node, visit);
  });
  identifiers.sort((x, y) => x.pos - y.pos);
  return identifiers;
}
