try {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  await import("source-map-support/register.js");
} catch {
  // package only present in dev.
}

/* eslint-disable no-console */
import { spawnSync, SpawnSyncOptionsWithStringEncoding } from "child_process";
import { mkdtemp, readdir, rm } from "fs/promises";
import mkdirp from "mkdirp";
import watch from "node-watch";
import os from "os";
import { resolve } from "path";
import prompts from "prompts";
import url from "url";
import yargs from "yargs";
import { CadlConfig, loadCadlConfigForPath } from "../config/index.js";
import { CompilerOptions } from "../core/options.js";
import { compile, Program } from "../core/program.js";
import { initCadlProject } from "../init/index.js";
import { compilerAssert, logDiagnostics } from "./diagnostics.js";
import { findUnformattedCadlFiles, formatCadlFiles } from "./formatter.js";
import { CompilerHost } from "./index.js";
import { installCadlDependencies } from "./install.js";
import { createConsoleSink } from "./logger/index.js";
import { NodeHost } from "./node-host.js";
import { getAnyExtensionFromPath, getBaseFileName, joinPaths, resolvePath } from "./path-utils.js";
import { Diagnostic } from "./types.js";
import { cadlVersion } from "./util.js";

async function main() {
  console.log(`Cadl compiler v${cadlVersion}\n`);

  await yargs(process.argv.slice(2))
    .scriptName("cadl")
    .help()
    .strict()
    .parserConfiguration({
      "greedy-arrays": false,
      "boolean-negation": false,
    })
    .option("debug", {
      type: "boolean",
      description: "Output debug log messages.",
      default: false,
    })
    .option("pretty", {
      type: "boolean",
      description:
        "Enable color and formatting in Cadl's output to make compiler errors easier to read.",
      default: true,
    })
    .command(
      "compile <path>",
      "Compile Cadl source.",
      (cmd) => {
        return cmd
          .positional("path", {
            description: "The path to the main.cadl file or directory containing main.cadl.",
            type: "string",
            demandOption: true,
          })
          .option("output-path", {
            type: "string",
            default: "./cadl-output",
            describe:
              "The output path for generated artifacts.  If it does not exist, it will be created.",
          })
          .option("options", {
            type: "array",
            alias: "option",
            string: true,
            describe:
              "Key/value pairs that can be used to set emitter options. The format is '<emitterName>.<key>=<value>'. This parameter can be used multiple times to add more options.",
          })
          .option("nostdlib", {
            type: "boolean",
            default: false,
            describe: "Don't load the Cadl standard library.",
          })
          .option("import", {
            type: "array",
            string: true,
            describe:
              "Additional imports to include.  This parameter can be used multiple times to add more imports.",
          })
          .option("watch", {
            type: "boolean",
            default: false,
            describe: "Watch project files for changes and recompile.",
          })
          .option("emit", {
            type: "array",
            string: true,
            describe: "Name of the emitters",
          })
          .option("diagnostic-level", {
            type: "string",
            default: "info",
            choices: ["error", "warn", "info", "verbose", "debug"],
            describe: "Diagnostics of this level or above will be reported.",
          })
          .option("warn-as-error", {
            type: "boolean",
            default: false,
            describe: "Treat warnings as errors and return non-zero exit code if there are any.",
          })
          .option("no-emit", {
            type: "boolean",
            default: false,
            describe: "Run emitters but do not emit any output.",
          });
      },
      async (args) => {
        const host = createCLICompilerHost(args);
        const cliOptions = await getCompilerOptions(host, args);

        const program = await compileInput(host, args.path, cliOptions);
        if (program.hasError()) {
          process.exit(1);
        }
        if (program.emitters.length === 0 && !program.compilerOptions.noEmit) {
          console.log(
            "No emitter was configured, no output was generated. Use `--emit <emitterName>` to pick emitter or specify it in the cadl config."
          );
        }
      }
    )
    .command("code", "Manage VS Code Extension.", (cmd) => {
      return cmd
        .demandCommand(1, "No command specified.")
        .option("insiders", {
          type: "boolean",
          description: "Use VS Code Insiders",
          default: false,
        })
        .command(
          "install",
          "Install VS Code Extension",
          () => {},
          (args) => installVSCodeExtension(args.insiders, args.debug)
        )
        .command(
          "uninstall",
          "Uninstall VS Code Extension",
          () => {},
          (args) => uninstallVSCodeExtension(args.insiders, args.debug)
        );
    })
    .command("vs", "Manage Visual Studio Extension.", (cmd) => {
      return cmd
        .demandCommand(1, "No command specified")
        .command(
          "install",
          "Install Visual Studio Extension.",
          () => {},
          (args) => installVSExtension(args.debug)
        )
        .command(
          "uninstall",
          "Uninstall VS Extension",
          () => {},
          () => uninstallVSExtension()
        );
    })
    .command(
      "format <include...>",
      "Format given list of Cadl files.",
      (cmd) => {
        return cmd
          .positional("include", {
            description: "Wildcard pattern of the list of files.",
            type: "string",
            array: true,
            demandOption: true,
          })
          .option("exclude", {
            alias: "x",
            type: "string",
            array: true,
            describe: "Pattern to exclude",
          })
          .option("check", {
            alias: "c",
            type: "boolean",
            describe: "Verify the files are formatted.",
          });
      },
      async (args) => {
        if (args["check"]) {
          const unformatted = await findUnformattedCadlFiles(args["include"], {
            exclude: args["exclude"],
            debug: args.debug,
          });
          if (unformatted.length > 0) {
            console.log(`Found ${unformatted.length} unformatted files:`);
            for (const file of unformatted) {
              console.log(` - ${file}`);
            }
            process.exit(1);
          }
        } else {
          await formatCadlFiles(args["include"], { exclude: args["exclude"], debug: args.debug });
        }
      }
    )
    .command(
      "init [templatesUrl]",
      "Create a new Cadl project.",
      (cmd) =>
        cmd.positional("templatesUrl", {
          description: "Url of the initialization template",
          type: "string",
        }),
      (args) => initCadlProject(createCLICompilerHost(args), process.cwd(), args.templatesUrl)
    )
    .command(
      "install",
      "Install cadl dependencies",
      () => {},
      () => installCadlDependencies(process.cwd())
    )
    .command(
      "info",
      "Show information about current Cadl compiler.",
      () => {},
      (args) => printInfo(createCLICompilerHost(args))
    )
    .version(cadlVersion)
    .demandCommand(1, "You must use one of the supported commands.").argv;
}

function compileInput(
  host: CompilerHost,
  path: string,
  compilerOptions: CompilerOptions,
  printSuccess = true
): Promise<Program> {
  let compileRequested: boolean = false;
  let currentCompilePromise: Promise<Program> | undefined = undefined;
  const log = (message?: any, ...optionalParams: any[]) => {
    const prefix = compilerOptions.watchForChanges ? `[${new Date().toLocaleTimeString()}] ` : "";
    console.log(`${prefix}${message}`, ...optionalParams);
  };

  const runCompilePromise = () => {
    // Don't run the compiler if it's already running
    if (!currentCompilePromise) {
      // Clear the console before compiling in watch mode
      if (compilerOptions.watchForChanges) {
        console.clear();
      }

      currentCompilePromise = compile(resolve(path), host, compilerOptions)
        .then(onCompileFinished)
        .catch(internalCompilerError);
    } else {
      compileRequested = true;
    }

    return currentCompilePromise;
  };

  const runCompile = () => void runCompilePromise();

  const onCompileFinished = (program: Program) => {
    if (program.diagnostics.length > 0) {
      log("Diagnostics were reported during compilation:\n");
      logDiagnostics(program.diagnostics, host.logSink);
      logDiagnosticCount(program.diagnostics);
    } else {
      if (printSuccess) {
        log(
          `Compilation completed successfully, output files are in ${compilerOptions.outputPath}.`
        );
      }
    }

    console.log(); // Insert a newline
    currentCompilePromise = undefined;
    if (compilerOptions.watchForChanges && compileRequested) {
      compileRequested = false;
      runCompile();
    }

    return program;
  };

  if (compilerOptions.watchForChanges) {
    runCompile();
    return new Promise((resolve, reject) => {
      const watcher = watch(
        path,
        {
          recursive: true,
          filter: (f) =>
            [".js", ".cadl"].indexOf(getAnyExtensionFromPath(f)) > -1 && !/node_modules/.test(f),
        },
        (e, name) => {
          runCompile();
        }
      );

      // Handle Ctrl+C for termination
      process.on("SIGINT", () => {
        watcher.close();
        console.info("Terminating watcher...\n");
      });
    });
  } else {
    return runCompilePromise();
  }
}

function logDiagnosticCount(diagnostics: readonly Diagnostic[]) {
  const errorCount = diagnostics.filter((x) => x.severity === "error").length;
  const warningCount = diagnostics.filter((x) => x.severity === "warning").length;

  const addSuffix = (count: number, suffix: string) =>
    count > 1 ? `${count} ${suffix}s` : count === 1 ? `${count} ${suffix}` : undefined;
  const errorText = addSuffix(errorCount, "error");
  const warningText = addSuffix(warningCount, "warning");

  console.log(`\nFound ${[errorText, warningText].filter((x) => x !== undefined).join(", ")}.`);
}

function createCLICompilerHost(args: { pretty?: boolean }): CompilerHost {
  return { ...NodeHost, logSink: createConsoleSink({ pretty: args.pretty }) };
}

interface CompileCliArgs {
  "output-path": string;
  nostdlib?: boolean;
  options?: string[];
  import?: string[];
  watch?: boolean;
  emit?: string[];
  debug?: boolean;
  "diagnostic-level": string;
  "warn-as-error"?: boolean;
  "no-emit"?: boolean;
}

async function getCompilerOptions(
  host: CompilerHost,
  args: CompileCliArgs
): Promise<CompilerOptions> {
  // Workaround for https://github.com/npm/cli/issues/3680
  const pathArg = args["output-path"].replace(/\\\\/g, "\\");
  const outputPath = resolvePath(process.cwd(), pathArg);
  await mkdirp(outputPath);

  const config = await loadCadlConfigForPath(host, process.cwd());

  if (config.diagnostics.length > 0) {
    logDiagnostics(config.diagnostics, host.logSink);
    logDiagnosticCount(config.diagnostics);
    if (config.diagnostics.some((d) => d.severity === "error")) {
      process.exit(1);
    }
  }

  const cliOptions = resolveOptions(args);
  return {
    outputPath,
    nostdlib: args["nostdlib"],
    additionalImports: args["import"],
    watchForChanges: args["watch"],
    diagnosticLevel: args.debug ? "debug" : (args["diagnostic-level"] as any),
    warningAsError: args["warn-as-error"],
    noEmit: args["no-emit"],
    miscOptions: cliOptions.miscOptions,
    emitters: resolveEmitters(config, cliOptions, args),
  };
}

function resolveOptions(
  args: CompileCliArgs
): Record<string | "miscOptions", Record<string, unknown>> {
  const options: Record<string, Record<string, string>> = {};
  for (const option of args.options ?? []) {
    const optionParts = option.split("=");
    if (optionParts.length != 2) {
      throw new Error(
        `The --option parameter value "${option}" must be in the format: <emitterName>.some-options=value`
      );
    }
    const optionKeyParts = optionParts[0].split(".");
    if (optionKeyParts.length === 1) {
      const key = optionKeyParts[0];
      if (!("miscOptions" in options)) {
        options.miscOptions = {};
      }
      options.miscOptions[key] = optionParts[1];
    } else if (optionKeyParts.length > 2) {
      throw new Error(
        `The --option parameter value "${option}" must be in the format: <emitterName>.some-options=value`
      );
    }
    const emitterName = optionKeyParts[0];
    const key = optionKeyParts[1];
    if (!(emitterName in options)) {
      options[emitterName] = {};
    }
    options[emitterName][key] = optionParts[1];
  }
  return options;
}

function resolveEmitters(
  config: CadlConfig,
  options: Record<string | "miscOptions", Record<string, unknown>>,
  args: CompileCliArgs
): Record<string, Record<string, unknown> | boolean> {
  const emitters = resovleSelectedEmittersFromConfig(config, args.emit);

  const configuredEmitters: Record<string, Record<string, unknown> | boolean> = {};

  for (const [emitterName, emitterConfig] of Object.entries(emitters)) {
    const cliOptionOverride = options[emitterName];

    if (cliOptionOverride) {
      configuredEmitters[emitterName] = {
        ...(emitterConfig === true ? {} : emitterConfig),
        ...cliOptionOverride,
      };
    } else {
      configuredEmitters[emitterName] = emitterConfig;
    }
  }

  return configuredEmitters;
}

function resovleSelectedEmittersFromConfig(
  config: CadlConfig,
  selectedEmitters: string[] | undefined
): Record<string, Record<string, unknown> | boolean> {
  if (selectedEmitters) {
    const emitters: Record<string, Record<string, unknown> | boolean> = {};
    for (const emitter of selectedEmitters) {
      emitters[emitter] = config.emitters[emitter] ?? true;
    }
    return emitters;
  }
  return config.emitters;
}

async function installVsix(pkg: string, install: (vsixPaths: string[]) => void, debug: boolean) {
  // download npm package to temporary directory
  const temp = await mkdtemp(joinPaths(os.tmpdir(), "cadl"));
  const npmArgs = ["install"];

  // hide npm output unless --debug was passed to cadl
  if (!debug) {
    npmArgs.push("--silent");
  }

  // NOTE: Using cwd=temp with `--prefix .` instead of `--prefix ${temp}` to
  // workaround https://github.com/npm/cli/issues/3256. It's still important
  // to pass --prefix even though we're using cwd as otherwise, npm might
  // find a package.json file in a parent directory and install to that
  // directory.
  npmArgs.push("--prefix", ".");

  // To debug with a locally built package rather than pulling from npm,
  // specify the full path to the packed .tgz using CADL_DEBUG_VSIX_TGZ
  // environment variable.
  npmArgs.push(process.env.CADL_DEBUG_VSIX_TGZ ?? pkg);

  run("npm", npmArgs, { cwd: temp, debug });

  // locate .vsix
  const dir = joinPaths(temp, "node_modules", pkg);
  const files = await readdir(dir);
  const vsixPaths: string[] = [];
  for (const file of files) {
    if (file.endsWith(".vsix")) {
      vsixPaths.push(joinPaths(dir, file));
    }
  }

  compilerAssert(
    vsixPaths.length > 0,
    `Installed ${pkg} from npm, but didn't find any .vsix files in it.`
  );

  // install extension
  install(vsixPaths);

  // delete temporary directory
  await rm(temp, { recursive: true });
}

function runCode(codeArgs: string[], insiders: boolean, debug: boolean) {
  try {
    run(insiders ? "code-insiders" : "code", codeArgs, {
      // VS Code's CLI emits node warnings that we can't do anything about. Suppress them.
      extraEnv: { NODE_NO_WARNINGS: "1" },
      debug,
      allowNotFound: true,
    });
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.error(
        `error: Couldn't find VS Code 'code' command in PATH. Make sure you have the VS Code executable added to the system PATH.`
      );
      if (process.platform === "darwin") {
        console.log("See instruction for Mac OS here https://code.visualstudio.com/docs/setup/mac");
      }
      if (debug) {
        console.log(error.stack);
      }
      process.exit(1);
    }
  }
}

async function installVSCodeExtension(insiders: boolean, debug: boolean) {
  await installVsix(
    "cadl-vscode",
    (vsixPaths) => {
      runCode(["--install-extension", vsixPaths[0]], insiders, debug);
    },
    debug
  );
}

async function uninstallVSCodeExtension(insiders: boolean, debug: boolean) {
  await runCode(["--uninstall-extension", "microsoft.cadl-vscode"], insiders, debug);
}

function getVsixInstallerPath(): string {
  return getVSInstallerPath(
    "resources/app/ServiceHub/Services/Microsoft.VisualStudio.Setup.Service/VSIXInstaller.exe"
  );
}

function getVSWherePath(): string {
  return getVSInstallerPath("vswhere.exe");
}

function getVSInstallerPath(relativePath: string) {
  if (process.platform !== "win32") {
    console.error("error: Visual Studio extension is not supported on non-Windows.");
    process.exit(1);
  }

  return joinPaths(
    process.env["ProgramFiles(x86)"] ?? "",
    "Microsoft Visual Studio/Installer",
    relativePath
  );
}

function isVSInstalled(versionRange: string) {
  const vswhere = getVSWherePath();
  const proc = run(vswhere, ["-property", "instanceid", "-prerelease", "-version", versionRange], {
    stdio: [null, "pipe", "inherit"],
    allowNotFound: true,
  });
  return proc.status === 0 && proc.stdout;
}

const VSIX_ALREADY_INSTALLED = 1001;
const VSIX_NOT_INSTALLED = 1002;
const VSIX_USER_CANCELED = 2005;

async function installVSExtension(debug: boolean) {
  const vsixInstaller = getVsixInstallerPath();
  const versionMap = new Map([
    [
      "Microsoft.Cadl.VS2019.vsix",
      {
        friendlyVersion: "2019",
        versionRange: "[16.0, 17.0)",
        installed: false,
      },
    ],
    [
      "Microsoft.Cadl.VS2022.vsix",
      {
        friendlyVersion: "2022",
        versionRange: "[17.0, 18.0)",
        installed: false,
        selected: true,
      },
    ],
  ]);

  let versionsFound = 0;
  let latestVersionFound: string | undefined;
  let versionsToInstall: string[] = [];
  for (const entry of versionMap.values()) {
    if (isVSInstalled(entry.versionRange)) {
      entry.installed = true;
      versionsFound++;
      latestVersionFound = entry.friendlyVersion;
    }
  }

  if (versionsFound == 0) {
    console.error("error: No compatible version of Visual Studio found.");
    process.exit(1);
  } else if (versionsFound == 1) {
    compilerAssert(
      latestVersionFound,
      "expected latestFoundVersion to be defined if versionsFound == 1"
    );
    versionsToInstall = [latestVersionFound];
  } else {
    const choices = Array.from(versionMap.values())
      .filter((x) => x.installed)
      .map((x) => ({
        title: `Visual Studio ${x.friendlyVersion}`,
        value: x.friendlyVersion,
        selected: x.selected,
      }));

    const response = await prompts({
      type: "multiselect",
      name: "versions",
      message: `Visual Studio Version(s)`,
      choices,
    });

    versionsToInstall = response.versions;
  }

  await installVsix(
    "cadl-vs",
    (vsixPaths) => {
      for (const vsix of vsixPaths) {
        const vsixFilename = getBaseFileName(vsix);
        const entry = versionMap.get(vsixFilename);
        compilerAssert(entry, "Unexpected vsix filename:" + vsix);
        if (versionsToInstall.includes(entry.friendlyVersion)) {
          console.log(`Installing extension for Visual Studio ${entry?.friendlyVersion}...`);
          run(vsixInstaller, [vsix], {
            allowedExitCodes: [VSIX_ALREADY_INSTALLED, VSIX_USER_CANCELED],
          });
        }
      }
    },
    debug
  );
}

async function uninstallVSExtension() {
  const vsixInstaller = getVsixInstallerPath();
  run(vsixInstaller, ["/uninstall:88b9492f-c019-492c-8aeb-f325a7e4cf23"], {
    allowedExitCodes: [VSIX_NOT_INSTALLED, VSIX_USER_CANCELED],
  });
}

/**
 * Print the resolved Cadl configuration.
 */
async function printInfo(host: CompilerHost) {
  const cwd = process.cwd();
  console.log(`Module: ${url.fileURLToPath(import.meta.url)}`);

  const config = await loadCadlConfigForPath(host, cwd);
  const jsyaml = await import("js-yaml");
  const excluded = ["diagnostics", "filename"];
  const replacer = (emitter: string, value: any) =>
    excluded.includes(emitter) ? undefined : value;

  console.log(`User Config: ${config.filename ?? "No config file found"}`);
  console.log("-----------");
  console.log(jsyaml.dump(config, { replacer }));
  console.log("-----------");
  logDiagnostics(config.diagnostics, host.logSink);
  logDiagnosticCount(config.diagnostics);
  if (config.diagnostics.some((d) => d.severity === "error")) {
    process.exit(1);
  }
}

// NOTE: We could also use { shell: true } to let windows find the .cmd, but that breaks
// ENOENT checking and handles spaces poorly in some cases.
const isCmdOnWindows = ["code", "code-insiders", "npm"];

interface RunOptions extends Partial<SpawnSyncOptionsWithStringEncoding> {
  debug?: boolean;
  extraEnv?: NodeJS.ProcessEnv;
  allowNotFound?: boolean;
  allowedExitCodes?: number[];
}

function run(command: string, commandArgs: string[], options?: RunOptions) {
  if (options?.debug) {
    if (options) {
      console.log(options);
    }
    console.log(`> ${command} ${commandArgs.join(" ")}\n`);
  }

  if (options?.extraEnv) {
    options.env = {
      ...(options?.env ?? process.env),
      ...options.extraEnv,
    };
  }

  const baseCommandName = getBaseFileName(command);
  if (process.platform === "win32" && isCmdOnWindows.includes(command)) {
    command += ".cmd";
  }

  const finalOptions: SpawnSyncOptionsWithStringEncoding = {
    encoding: "utf-8",
    stdio: "inherit",
    ...(options ?? {}),
  };

  const proc = spawnSync(command, commandArgs, finalOptions);
  if (options?.debug) {
    console.log(proc);
  }

  if (proc.error) {
    if ((proc.error as any).code === "ENOENT" && !options?.allowNotFound) {
      console.error(`error: Command '${baseCommandName}' not found.`);
      if (options?.debug) {
        console.log(proc.error.stack);
      }
      process.exit(1);
    } else {
      throw proc.error;
    }
  }

  if (proc.status !== 0 && !options?.allowedExitCodes?.includes(proc.status ?? 0)) {
    console.error(
      `error: Command '${baseCommandName} ${commandArgs.join(" ")}' failed with exit code ${
        proc.status
      }.`
    );
    process.exit(proc.status || 1);
  }

  return proc;
}

function internalCompilerError(error: unknown): never {
  // NOTE: An expected error, like one thrown for bad input, shouldn't reach
  // here, but be handled somewhere else. If we reach here, it should be
  // considered a bug and therefore we should not suppress the stack trace as
  // that risks losing it in the case of a bug that does not repro easily.
  console.error("Internal compiler error!");
  console.error("File issue at https://github.com/microsoft/cadl");
  console.error();
  console.error(error);
  process.exit(1);
}

process.on("unhandledRejection", (error: unknown) => {
  console.error("Unhandled promise rejection!");
  internalCompilerError(error);
});

main().catch(internalCompilerError);
