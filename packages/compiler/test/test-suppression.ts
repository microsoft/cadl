import { strictEqual } from "assert";
import { navigateProgram } from "../core/semantic-walker.js";
import { createTestHost, TestHost } from "../testing/index.js";

describe("compiler: suppress", () => {
  let host: TestHost;

  beforeEach(async () => {
    host = await createTestHost();
  });

  async function run(cadl: string) {
    host.addCadlFile("main.adl", cadl);

    await host.compile("main.adl", { nostdlib: true });

    navigateProgram(host.program, {
      model: (model) => {
        if (model.name === "") {
          host.program.reportDiagnostic({
            severity: "warning",
            code: "no-inline-model",
            message: "Inline models are not recommended",
            target: model,
          });
        }
      },
      modelProperty: (prop) => {
        if (prop.name === "id") {
          host.program.reportDiagnostic({
            severity: "error",
            code: "no-id-property",
            message: "Id properties on models are forbidden",
            target: prop,
          });
        }
      },
    });

    return host.program.diagnostics;
  }

  it("emit warning diagnostics when there is no suppression", async () => {
    const diagnostics = await run(`
      model Foo {
        inline: {
          name: 123;
        };
      }
    `);

    strictEqual(diagnostics.length, 1);
    strictEqual(diagnostics[0].code, "no-inline-model");
  });

  it("suppress warning diagnostic on item itself", async () => {
    const diagnostics = await run(`
      model Foo {
        #suppress "no-inline-model" "This is needed"
        inline: {
          name: 123;
        };
      }
    `);

    strictEqual(diagnostics.length, 0);
  });

  it("suppress warning diagnostic on parent node", async () => {
    const diagnostics = await run(`
      #suppress "no-inline-model"  "This is needed"
      model Foo {
        inline: {
          name: 123;
        };
      }
    `);

    strictEqual(diagnostics.length, 0);
  });

  it("error diagnostics cannot be suppressed and emit another error", async () => {
    const diagnostics = await run(`
      model Foo {
        #suppress "no-id-property" "This is needed"
        id: 123;
      }
    `);

    strictEqual(diagnostics.length, 2);
    strictEqual(diagnostics[0].code, "suppress-error");
    strictEqual(diagnostics[1].code, "no-id-property");
  });
});
