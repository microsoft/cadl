// @ts-check
import {
  ensureDotnetVersion,
  runDotnetFormat,
} from "../../packages/internal-build-utils/dist/src/index.js";
import { CommandFailedError, runPrettier } from "./helpers.js";

try {
  runPrettier("--list-different");
  ensureDotnetVersion({ exitIfError: true });
  runDotnetFormat("--verify-no-changes");
} catch (err) {
  if (err instanceof CommandFailedError) {
    console.error(
      "\nERROR: Files above are not formatted correctly. Run `rush format` and commit the changes."
    );
    process.exit(err.proc?.status ?? 1);
  }
  throw err;
}
