// @ts-check
import { run, xplatCmd } from "@cadl-lang/internal-build-utils";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = JSON.parse(readFileSync(resolve(pkgRoot, "package.json"), "utf-8")).version;

console.log("Packing...");
await run(xplatCmd("npm"), ["pack"]);
console.log("Installing...");
await run(xplatCmd("npm"), ["install", "-g", `cadl-lang-compiler-${version}.tgz`]);
