import { runWatch } from "@cadl-lang/internal-build-utils";
import { createRequire } from "module";
import { resolve } from "path";

const require = createRequire(import.meta.url);
const script = resolve("dist-dev/src/tmlanguage.js");

async function regenerate() {
  // For perf, we don't want to shell out to a new process every build and we
  // particularly want to avoid reinitialzing onigasm, which is relatively slow.
  // So we purge the script from the require cache and re-run it with changes
  // in-proc.
  delete require.cache[script];
  await require(script).main();
}

runWatch("dist-dev/src", regenerate, {
  // This filter doesn't do as much as one might hope because tsc writes out all
  // the files on recompilation. So tmlanguage.js changes when other .ts files
  // in cadl-vscode change but tmlanguage.ts has not changed. We could check the
  // tmlanguage.ts timestamp to fix it, but it didn't seem worth the complexity.
  // We can't just watch tmlanguage.ts because we need to wait for tsc to
  // compile it.
  filter: (file) => file === script,
});
