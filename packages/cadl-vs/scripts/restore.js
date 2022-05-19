// @ts-check
import { ensureDotnetVersion, runDotnet } from "@cadl-lang/internal-build-utils";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await ensureDotnetVersion({ exitIfError: true });
await runDotnet(["restore", "Microsoft.Cadl.VS.sln"], { cwd: pkgRoot });
