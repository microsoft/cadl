import { strictEqual } from "assert";
import { readdirSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import prettier from "prettier";
import { fileURLToPath } from "url";
import * as plugin from "../../../formatter/index.js";

function format(code: string): string {
  const output = prettier.format(code, {
    parser: "cadl",
    plugins: [plugin],
  });
  return output;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const scenarioRoot = resolve(__dirname, "../../../../test/formatter/scenarios");
const shouldUpdate = process.argv.indexOf("--update-snapshots") !== -1;

async function getOutput(name: string): Promise<string | undefined> {
  try {
    const output = await readFile(join(scenarioRoot, "outputs", name), "utf-8");
    return output;
  } catch {
    return undefined;
  }
}

async function saveOutput(name: string, content: string) {
  const outputDir = join(scenarioRoot, "outputs");
  await mkdir(outputDir, { recursive: true });
  await writeFile(join(outputDir, name), content);
}

async function testScenario(name: string) {
  const content = await readFile(join(scenarioRoot, "inputs", name), "utf-8");
  const output = await getOutput(name);
  const formatted = format(content);
  if (!output) {
    return await saveOutput(name, formatted);
  }
  if (output !== formatted) {
    if (shouldUpdate) {
      return await saveOutput(name, formatted);
    }

    strictEqual(
      formatted,
      output,
      `Scenario ${name} does not match expected snapshot. Run with tests '--update-snapshots' option to update.`
    );
  }
}

describe("compiler: prettier formatter scenarios", () => {
  // describe has to be sync, so using sync readdir here.
  const scenarioFiles = readdirSync(join(__dirname, "../../../../test/formatter/scenarios/inputs"));

  for (const file of scenarioFiles) {
    if (file.endsWith(".cadl")) {
      it(file, async () => {
        await testScenario(file);
      });
    }
  }
});
