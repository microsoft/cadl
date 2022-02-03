import { ok, strictEqual } from "assert";
import { ModelType, Type } from "../../core/types.js";
import { createTestHost, TestHost } from "../../testing/index.js";

describe("compiler: spread", () => {
  const blues = new WeakSet();
  function $blue(_: any, target: Type) {
    blues.add(target);
  }

  let testHost: TestHost;

  beforeEach(async () => {
    testHost = await createTestHost();
    testHost.addJsFile("blue.js", { $blue });
  });

  it("clones decorated properties", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      import "./blue.js";
      model A { @blue foo: string }
      model B { @blue bar: string }
      @test model C { ... A, ... B }
      `
    );
    const { C } = (await testHost.compile("./")) as { C: ModelType };

    strictEqual(C.kind, "Model");
    strictEqual(C.properties.size, 2);

    for (const [_, prop] of C.properties) {
      ok(blues.has(prop), prop.name + " is blue");
    }
  });
});
