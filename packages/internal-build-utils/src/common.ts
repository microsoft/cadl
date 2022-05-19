import { ChildProcess, spawn, SpawnOptions } from "child_process";

export class CommandFailedError extends Error {
  constructor(msg: string, public proc: ChildProcess) {
    super(msg);
  }
}

/**
 * Return the correct executable name if on unix or windows(with .cmd extension)
 * @param cmd to run
 * @returns
 */
export function xplatCmd(cmd: string) {
  return process.platform === "win32" ? `${cmd}.cmd` : cmd;
}

export interface RunOptions extends SpawnOptions {
  silent?: boolean;
  encoding?: string;
  ignoreCommandNotFound?: boolean;
  throwOnNonZeroExit?: boolean;
}

export async function run(command: string, args: string[], options?: RunOptions) {
  if (!options?.silent) {
    // eslint-disable-next-line no-console
    console.log();
    // eslint-disable-next-line no-console
    console.log(`> ${command} ${args.join(" ")}`);
  }

  options = {
    stdio: "inherit",
    throwOnNonZeroExit: true,
    ...options,
  };

  try {
    const result = await execAsync(command, args, options);
    if (options.throwOnNonZeroExit && result.exitCode !== undefined && result.exitCode !== 0) {
      throw new CommandFailedError(
        `Command \`${command} ${args.join(" ")}\` failed with exit code ${result.exitCode}`,
        result.proc
      );
    }
    return result;
  } catch (e: any) {
    if (options.ignoreCommandNotFound && e.code === "ENOENT") {
      // eslint-disable-next-line no-console
      console.log(`Skipped: Command \`${command}\` not found.`);
      return undefined;
    } else {
      throw e;
    }
  }
}

export async function execAsync(
  command: string,
  args: string[],
  options: SpawnOptions
): Promise<{ exitCode: number; stdout: string; stderr: string; proc: ChildProcess }> {
  const child = spawn(command, args, options);

  return new Promise((resolve, reject) => {
    child.on("error", (error) => {
      reject(error);
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout?.on("data", (data) => stdout.push(data));
    child.stderr?.on("data", (data) => stderr.push(data));

    child.on("exit", (exitCode) => {
      resolve({
        exitCode: exitCode ?? -1,
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString(),
        proc: child,
      });
    });
  });
}

export function clearScreen() {
  process.stdout.write("\x1bc");
}

export function logWithTime(msg: string) {
  const time = new Date().toLocaleTimeString();
  // eslint-disable-next-line no-console
  console.log(`[${time}] ${msg}`);
}
