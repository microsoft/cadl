import { spawn, spawnSync } from "child_process";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

function read(filename) {
  const txt = readFileSync(filename, "utf-8")
    .replace(/\r/gm, "")
    .replace(/\n/gm, "«")
    .replace(/\/\*.*?\*\//gm, "")
    .replace(/«/gm, "\n")
    .replace(/\s+\/\/.*/g, "");
  return JSON.parse(txt);
}

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const prettier = resolve(repoRoot, "packages/compiler/node_modules/.bin/prettier");
export const tsc = resolve(repoRoot, "packages/compiler/node_modules/.bin/tsc");

const rush = read(`${repoRoot}/rush.json`);

export function forEachProject(onEach) {
  // load all the projects
  for (const each of rush.projects) {
    const packageName = each.packageName;
    const projectFolder = resolve(`${repoRoot}/${each.projectFolder}`);
    const project = JSON.parse(readFileSync(`${projectFolder}/package.json`, "utf-8"));
    onEach(packageName, projectFolder, project);
  }
}

export function npmForEach(cmd, options) {
  forEachProject((name, location, project) => {
    if (cmd === "test-official" && !project.scripts[cmd] && project.scripts["test"]) {
      const pj = join(location, "package.json");
      throw new Error(`${pj} has a 'test' script, but no 'test-official' script for CI.`);
    }

    if (project.scripts[cmd] || cmd === "pack") {
      const args = cmd === "pack" ? [cmd] : ["run", cmd];
      run("npm", args, { cwd: location, ...options });
    }
  });
}

// We could use { shell: true } to let Windows find .cmd, but that causes other issues.
// It breaks ENOENT checking for command-not-found and also handles command/args with spaces
// poorly.
const isCmdOnWindows = ["rush", "npm", "code", "code-insiders", tsc, prettier];

export class CommandFailedError extends Error {
  constructor(msg, proc) {
    super(msg);
    this.proc = proc;
  }
}

export function run(command, args, options) {
  console.log();
  console.log(`> ${command} ${args.join(" ")}`);

  options = {
    stdio: "inherit",
    sync: true,
    throwOnNonZeroExit: true,
    ...options,
  };

  if (process.platform === "win32" && isCmdOnWindows.includes(command)) {
    command += ".cmd";
  }

  const proc = (options.sync ? spawnSync : spawn)(command, args, options);
  if (proc.error) {
    if (options.ignoreCommandNotFound && proc.error.code === "ENOENT") {
      console.log(`Skipped: Command \`${command}\` not found.`);
    } else {
      throw proc.error;
    }
  } else if (options.throwOnNonZeroExit && proc.status !== undefined && proc.status !== 0) {
    throw new CommandFailedError(
      `Command \`${command} ${args.join(" ")}\` failed with exit code ${proc.status}`,
      proc
    );
  }

  return proc;
}

export function runPrettier(...args) {
  run(
    prettier,
    [
      ...args,
      "--config",
      ".prettierrc.json",
      "--ignore-path",
      ".prettierignore",
      "**/*.{ts,js,cjs,mjs,json,yml,yaml,cadl,md}",
    ],
    {
      cwd: repoRoot,
    }
  );
}
