import { notStrictEqual } from "assert";
import { assert } from "console";
import { ModelType } from "../../core/types.js";
import { createTestHost, TestHost } from "../../testing/index.js";

describe("compiler: global namespace", () => {
  let testHost: TestHost;

  beforeEach(async () => {
    testHost = await createTestHost();
  });

  describe("it adds top level entities to the global namespace", () => {
    it("adds top-level namespaces", async () => {
      testHost.addCadlFile("main.cadl", `namespace Foo {}`);

      await testHost.compile("./");

      const globalNamespaceType = testHost.program.checker.getGlobalNamespaceType();
      assert(
        globalNamespaceType?.namespaces.get("Foo"),
        "Namespace Foo was added to global namespace type"
      );
    });

    it("adds top-level models", async () => {
      testHost.addCadlFile("main.cadl", `model MyModel {}`);

      await testHost.compile("./");

      const globalNamespaceType = testHost.program.checker.getGlobalNamespaceType();
      assert(
        globalNamespaceType?.models.get("MyModel"),
        "model MyModel was added to global namespace type"
      );
    });

    it("adds top-level operations", async () => {
      testHost.addCadlFile("main.cadl", `op myOperation(): string;`);

      await testHost.compile("./");

      const globalNamespaceType = testHost.program.checker.getGlobalNamespaceType();
      assert(
        globalNamespaceType?.operations.get("myOperation"),
        "operation myOperation was added to global namespace type"
      );
    });
  });

  describe("it adds top level entities used in other files to the global namespace", () => {
    beforeEach(() => {
      testHost.addCadlFile(
        "main.cadl",
        `
      import "./a.cadl";

      model Base {}
      `
      );
    });

    it("adds top-level namespaces", async () => {
      testHost.addCadlFile("a.cadl", `namespace Foo {}`);

      await testHost.compile("./");

      const globalNamespaceType = testHost.program.checker.getGlobalNamespaceType();
      assert(
        globalNamespaceType?.namespaces.get("Foo"),
        "Namespace Foo was added to global namespace type"
      );
      assert(
        globalNamespaceType?.namespaces.get("Base"),
        "Should still reference main file top-level entities"
      );
    });

    it("adds top-level models", async () => {
      testHost.addCadlFile("a.cadl", `model MyModel {}`);

      await testHost.compile("./");

      const globalNamespaceType = testHost.program.checker.getGlobalNamespaceType();
      assert(
        globalNamespaceType?.models.get("MyModel"),
        "model MyModel was added to global namespace type"
      );
    });

    it("adds top-level operations", async () => {
      testHost.addCadlFile("a.cadl", `op myOperation(): string;`);

      await testHost.compile("./");

      const globalNamespaceType = testHost.program.checker.getGlobalNamespaceType();
      assert(
        globalNamespaceType?.operations.get("myOperation"),
        "operation myOperation was added to global namespace type"
      );
    });
  });

  it("can override cadl library things", async () => {
    testHost.addCadlFile("./main.cadl", `@test model int32 { x: Cadl.int32 }`);

    const { int32 } = (await testHost.compile("./")) as { int32: ModelType };
    notStrictEqual(int32, int32.properties.get("x")!.type);
  });
});
