// @ts-check
import { run, xplatCmd } from "@cadl-lang/internal-build-utils";
import { readFileSync } from "fs";

const version = JSON.parse(readFileSync("package.json", "utf-8")).version;
const vsix = `cadl-vscode-${version}.vsix`;

const options = {
  ignoreCommandNotFound: true,
  // Code CLI emits node warnings we can't prevent
  env: { ...process.env, NODE_NO_WARNINGS: "1" },
};

for (const command of ["code", "code-insiders"]) {
  await run(xplatCmd(command), ["--install-extension", vsix], options);
}
