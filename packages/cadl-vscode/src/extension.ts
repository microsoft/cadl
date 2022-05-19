import { stat } from "fs/promises";
import { join } from "path";
import { commands, ExtensionContext, workspace } from "vscode";
import {
  Executable,
  ExecutableOptions,
  LanguageClient,
  LanguageClientOptions,
} from "vscode-languageclient/node.js";

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext) {
  const exe = await resolveCadlServer(context);
  const options: LanguageClientOptions = {
    synchronize: {
      fileEvents: [
        workspace.createFileSystemWatcher("**/*.cadl"),
        workspace.createFileSystemWatcher("**/cadl-project.yaml"),
        workspace.createFileSystemWatcher("**/package.json"),
      ],
    },
    documentSelector: [
      { scheme: "file", language: "cadl" },
      { scheme: "untitled", language: "cadl" },
    ],
  };

  context.subscriptions.push(commands.registerCommand("cadl.restartServer", restartCadlServer));

  const name = "Cadl";
  const id = "cadlLanguageServer";
  client = new LanguageClient(id, name, { run: exe, debug: exe }, options);
  client.start();
}

async function restartCadlServer(): Promise<void> {
  if (client) {
    await client.stop();
    client.start();
  }
}

async function resolveCadlServer(context: ExtensionContext): Promise<Executable> {
  const nodeOptions = process.env.CADL_SERVER_NODE_OPTIONS;
  const args = ["--stdio"];
  // In development mode (F5 launch from source), resolve to locally built server.js.
  if (process.env.CADL_DEVELOPMENT_MODE) {
    const script = context.asAbsolutePath("../compiler/dist/server/server.js");
    // we use CLI instead of NODE_OPTIONS environment variable in this case
    // because --nolazy is not supported by NODE_OPTIONS.
    const options = nodeOptions?.split(" ") ?? [];
    return { command: "node", args: [...options, script, ...args] };
  }

  let options: ExecutableOptions | undefined;
  if (nodeOptions) {
    options = {
      env: { ...process.env, NODE_OPTIONS: nodeOptions },
    };
  }

  // In production, first try VS Code configuration, which allows a global machine
  // location that is not on PATH, or a workspace-specific installation.
  let serverPath = workspace.getConfiguration().get("cadl.cadl-server.path") as string;
  if (serverPath && typeof serverPath !== "string") {
    throw new Error("VS Code configuration option 'cadl.cadl-server.path' must be a string");
  }

  // Default to cadl-server on PATH, which would come from `npm install -g
  // @cadl-lang/compiler` in a vanilla setup.
  if (!serverPath) {
    const executable = process.platform === "win32" ? "cadl-server.cmd" : "cadl-server";
    return { command: executable, args, options };
  }

  if (serverPath.includes("${workspaceRoot}")) {
    const workspaceRoot = workspace.workspaceFolders?.[0]?.uri?.fsPath ?? "";
    serverPath = serverPath.replace("${workspaceRoot}", workspaceRoot);
  }

  if (!serverPath.endsWith(".js")) {
    // Allow path to cadl-server.cmd to be passed.
    if (await isFile(serverPath)) {
      const command =
        process.platform === "win32" && !serverPath.endsWith(".cmd")
          ? `${serverPath}.cmd`
          : "cadl-server";

      return { command, args, options };
    } else {
      serverPath = join(serverPath, "cmd/cadl-server.js");
    }
  }

  return { command: "node", args: [serverPath, ...args], options };
}

async function isFile(path: string) {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch {
    return false;
  }
}

export async function deactivate() {
  await client?.stop();
}
