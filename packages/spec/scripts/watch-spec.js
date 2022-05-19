// @ts-check
import { runWatch } from "@cadl-lang/internal-build-utils";
import ecmarkup from "ecmarkup";
import { readFile, writeFile } from "fs/promises";
import { resolve } from "path";

async function build() {
  const infile = resolve("src/spec.emu.html");
  const outfile = resolve("../../docs/spec.html");
  const fetch = (path) => readFile(path, "utf-8");

  try {
    const spec = await ecmarkup.build(infile, fetch, {
      outfile,
      warn,
    });
    for (const [file, contents] of spec.generatedFiles) {
      await writeFile(file, contents);
    }
  } catch (err) {
    console.log(`${infile}(1,1): error EMU0001: Error generating spec: ${err.message}`);
    throw err;
  }

  function warn(warning) {
    const file = warning.file ?? infile;
    const line = warning.line ?? 1;
    const col = warning.column ?? 1;
    const id = "EMU0002" + (warning.ruleId ? `: ${warning.ruleId}` : "");
    console.log(`${file}(${line},${col}): warning ${id}: ${warning.message}`);
  }
}

runWatch("src", build);
