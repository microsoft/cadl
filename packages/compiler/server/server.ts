import { Console } from "console";
import { fileURLToPath } from "url";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  createConnection,
  ProposedFeatures,
  PublishDiagnosticsParams,
  TextDocuments,
} from "vscode-languageserver/node.js";
import { NodeHost } from "../core/node-host.js";
import { cadlVersion } from "../core/util.js";
import { createServer, Server, ServerHost } from "./serverlib.js";

let server: Server | undefined = undefined;

process.on("unhandledRejection", fatalError);
try {
  main();
} catch (e) {
  fatalError(e);
}

function main() {
  // Redirect all console stdout output to stderr since LSP pipe uses stdout
  // and writing to stdout for anything other than LSP protocol will break
  // things badly.
  global.console = new Console(process.stderr, process.stderr);

  let clientHasWorkspaceFolderCapability = false;
  const connection = createConnection(ProposedFeatures.all);
  const documents = new TextDocuments(TextDocument);

  const host: ServerHost = {
    compilerHost: NodeHost,
    sendDiagnostics(params: PublishDiagnosticsParams) {
      connection.sendDiagnostics(params);
    },
    log(message: string) {
      connection.console.log(message);
    },
    getDocumentByURL(url: string) {
      return documents.get(url);
    },
  };

  const s = createServer(host);
  server = s;
  s.log(`Cadl language server v${cadlVersion}`);
  s.log("Module", fileURLToPath(import.meta.url));
  s.log("Process ID", process.pid);
  s.log("Command Line", process.argv);

  connection.onInitialize((params) => {
    if (params.capabilities.workspace?.workspaceFolders) {
      clientHasWorkspaceFolderCapability = true;
    }
    return s.initialize(params);
  });

  connection.onInitialized((params) => {
    if (clientHasWorkspaceFolderCapability) {
      connection.workspace.onDidChangeWorkspaceFolders(s.workspaceFoldersChanged);
    }
    s.initialized(params);
  });

  connection.onDidChangeWatchedFiles(s.watchedFilesChanged);
  connection.onDefinition(s.gotoDefinition);
  connection.onCompletion(s.complete);
  connection.onReferences(s.findReferences);
  connection.onRenameRequest(s.rename);
  connection.onPrepareRename(s.prepareRename);
  documents.onDidChangeContent(s.checkChange);
  documents.onDidClose(s.documentClosed);

  documents.listen(connection);
  connection.listen();
}

function fatalError(e: unknown) {
  // If we failed to send any log messages over LSP pipe, send them to
  // stderr before exiting.
  for (const pending of server?.pendingMessages ?? []) {
    // eslint-disable-next-line no-console
    console.error(pending);
  }
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
}
