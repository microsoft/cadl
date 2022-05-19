import { join } from "path";
import { run } from "./common.js";
import { vsMinimumVersion } from "./constants.js";

const vswhereArgs = [
  "-latest",
  "-prerelease",
  "-version",
  `[${vsMinimumVersion},`,
  "-property",
  "installationPath",
];

export async function getVisualStudioMsBuildPath(): Promise<{ path: string } | { error: string }> {
  if (process.platform !== "win32") {
    return { error: "Not on windows." };
  }

  const vswhere = join(
    process.env["ProgramFiles(x86)"]!,
    "Microsoft Visual Studio/Installer/vswhere.exe"
  );

  const result = await run(vswhere, vswhereArgs, {
    ignoreCommandNotFound: true,
    throwOnNonZeroExit: false,
    encoding: "utf-8",
    stdio: [null, "pipe", "inherit"],
  });

  if (!result || result.exitCode !== 0 || !result.stdout) {
    return { error: `Visual Studio ${vsMinimumVersion} or later not found` };
  }

  return { path: join(result.stdout.trim(), "MSBuild/Current/Bin/MSBuild.exe") };
}
