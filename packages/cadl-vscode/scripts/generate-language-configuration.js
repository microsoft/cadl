// @ts-check
import { CadlLanguageConfiguration } from "@cadl-lang/compiler";
import { mkdir, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distFolder = resolve(root, "dist");
main().catch((err) => {
  console.error(err.stack);
  process.exit(1);
});

async function main() {
  const content = JSON.stringify(CadlLanguageConfiguration, null, 2);
  await mkdir(distFolder, { recursive: true });
  await writeFile(join(distFolder, "language-configuration.json"), content);
}
