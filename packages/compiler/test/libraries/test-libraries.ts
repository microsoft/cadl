import { fileURLToPath, URL } from "url";
import { NodeHost } from "../../core/node-host.js";
import { createProgram } from "../../core/program.js";
import { createTestHost, expectDiagnosticEmpty, expectDiagnostics } from "../../testing/index.js";

const libs = [
  "simple", // Load a library in `node_modules`
  "library-dev/samples", // Load library defined in parent folder.
];

describe("compiler: libraries", () => {
  for (const lib of libs) {
    describe(lib, () => {
      it("compiles without error", async () => {
        const mainFile = fileURLToPath(
          new URL(`../../../test/libraries/${lib}/main.cadl`, import.meta.url)
        );
        const program = await createProgram(NodeHost, mainFile, { noEmit: true });
        expectDiagnosticEmpty(program.diagnostics);
      });
    });
  }

  it("detects compiler version mismatches", async () => {
    const testHost = await createTestHost();
    testHost.addCadlFile("main.cadl", "");
    testHost.addJsFile("./node_modules/@cadl-lang/compiler/index.js", {});
    const diagnostics = await testHost.diagnose("main.cadl");
    expectDiagnostics(diagnostics, {
      code: "compiler-version-mismatch",
      severity: "error",
      message: /Current Cadl compiler conflicts with local version/,
    });
  });

  it("report errors in js files", async () => {
    const testHost = await createTestHost();
    testHost.addJsFile("lib1.js", { $dec: () => null });
    testHost.addJsFile("lib2.js", { $dec: () => null });
    testHost.addCadlFile(
      "main.cadl",
      `
    import "./lib1.js";
    import "./lib2.js";
    `
    );
    const diagnostics = await testHost.diagnose("main.cadl");
    expectDiagnostics(diagnostics, [
      {
        code: "duplicate-symbol",
        message: `Duplicate name: "@dec"`,
        file: "lib1.js",
      },
      {
        code: "duplicate-symbol",
        message: `Duplicate name: "@dec"`,
        file: "lib2.js",
      },
    ]);
  });
});
