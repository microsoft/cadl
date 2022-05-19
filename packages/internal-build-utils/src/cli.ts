import yargs from "yargs";
import { generateThirdPartyNotice } from "./generate-third-party-notice.js";
import { bumpVersionsForPrerelease } from "./prerelease.js";

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

async function main() {
  await yargs(process.argv.slice(2))
    .scriptName("cadl-build-tool")
    .help()
    .strict()
    .command(
      "generate-third-party-notices",
      "Generate the third party notice",
      () => {},
      () => generateThirdPartyNotice()
    )
    .command(
      "bump-version-preview <workspaceRoots...>",
      "Bump all package version for the preview",
      (cmd) =>
        cmd.positional("workspaceRoots", {
          type: "string",
          array: true,
          demandOption: true,
        }),
      (args) => bumpVersionsForPrerelease(args.workspaceRoots)
    ).argv;
}
