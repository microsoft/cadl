// @ts-check
import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const root = fileURLToPath(new URL("..", import.meta.url).href);
const distDir = join(root, "dist");
const manifestTarget = join(distDir, "manifest.js");

function loadPackageJson() {
  const packageJsonPath = join(root, "package.json");
  return JSON.parse(readFileSync(packageJsonPath, "utf-8"));
}

function getCommit() {
  return execSync("git rev-parse HEAD").toString().trim();
}

function getPrNumber() {
  // Set by Azure DevOps.
  return process.env["SYSTEM_PULLREQUEST_PULLREQUESTNUMBER"];
}

function main() {
  const pkg = loadPackageJson();

  const manifest = {
    version: pkg.version,
    commit: getCommit(),
    pr: getPrNumber(),
  };

  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }
  const manifestJs = `export default ${JSON.stringify(manifest, null, 2)};`;
  writeFileSync(manifestTarget, manifestJs);
}

main();
