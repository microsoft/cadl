import { rejects, strictEqual } from "assert";
import { Program } from "../../core/program";
import { ModelType } from "../../core/types";
import { createTestHost, TestHost } from "../test-host.js";

describe("compiler: using statements", () => {
  let testHost: TestHost;

  beforeEach(async () => {
    testHost = await createTestHost();
  });

  it("works in global scope", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      import "./a.cadl";
      import "./b.cadl";
      `
    );
    testHost.addCadlFile(
      "a.cadl",
      `
      namespace N;
      model X { x: int32 }
      `
    );
    testHost.addCadlFile(
      "b.cadl",
      `
      using N;
      @test model Y { ... X }
      `
    );

    const { Y } = (await testHost.compile("./")) as {
      Y: ModelType;
    };

    strictEqual(Y.properties.size, 1);
  });

  it("works in namespaces", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      import "./a.cadl";
      import "./b.cadl";
      `
    );
    testHost.addCadlFile(
      "a.cadl",
      `
      namespace N;
      model X { x: int32 }
      `
    );
    testHost.addCadlFile(
      "b.cadl",
      `
      namespace Z;
      using N;
      @test model Y { ... X }
      `
    );

    const { Y } = (await testHost.compile("./")) as {
      Y: ModelType;
    };

    strictEqual(Y.properties.size, 1);
  });

  it("works with dotted namespaces", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      import "./a.cadl";
      import "./b.cadl";
      `
    );
    testHost.addCadlFile(
      "a.cadl",
      `
      namespace N.M;
      model X { x: int32 }
      `
    );
    testHost.addCadlFile(
      "b.cadl",
      `
      using N.M;
      @test model Y { ... X }
      `
    );

    const { Y } = (await testHost.compile("./")) as {
      Y: ModelType;
    };

    strictEqual(Y.properties.size, 1);
  });

  it("throws errors for duplicate imported usings", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      import "./a.cadl";
      import "./b.cadl";
      `
    );
    testHost.addCadlFile(
      "a.cadl",
      `
      namespace N.M;
      model X { x: int32 }
      `
    );

    testHost.addCadlFile(
      "b.cadl",
      `
      using N.M;
      using N.M;
      @test model Y { ... X }
      `
    );

    await rejects(testHost.compile("./"));
  });

  it("throws errors for different usings with the same bindings", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      import "./a.cadl";
      import "./b.cadl";
      `
    );
    testHost.addCadlFile(
      "a.cadl",
      `
      namespace N {
        model A { }
      }

      namespace M {
        model A { }
      }
      `
    );

    testHost.addCadlFile(
      "b.cadl",
      `
      using N;
      using M;
      `
    );

    await rejects(testHost.compile("./"));
  });

  it("resolves 'local' decls over usings", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      import "./a.cadl";
      import "./b.cadl";
      `
    );
    testHost.addCadlFile(
      "a.cadl",
      `
      namespace N;
      model A { a: string }
      `
    );

    testHost.addCadlFile(
      "b.cadl",
      `
      using N;
      model A { a: int32 | string }
      @test model B { ... A }
      `
    );

    const { B } = (await testHost.compile("./")) as {
      B: ModelType;
    };
    strictEqual(B.properties.size, 1);
    strictEqual(B.properties.get("a")!.type.kind, "Union");
  });

  it("usings are local to a file", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      import "./a.cadl";
      import "./b.cadl";
      `
    );
    testHost.addCadlFile(
      "a.cadl",
      `
      namespace N;
      model A { a: string }
      `
    );

    testHost.addCadlFile(
      "b.cadl",
      `
      namespace M {
        using N;
      }
      
      namespace M {
        model X { a: A };
      }
      `
    );

    await rejects(testHost.compile("./"));
  });
  it("Cadl namespace is automatically using'd", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      namespace Foo;
      model test { x: int32 };
    `
    );

    await testHost.compile("./");
  });

  it("Cadl namespace is automatically using'd in eval", async () => {
    testHost.addJsFile("test.js", {
      $eval(p: Program) {
        p.evalCadlScript(`namespace Bar; model A { a: int32 };`);
      },
    });
    testHost.addCadlFile(
      "main.cadl",
      `
      import "./test.js";

      namespace Foo;
      @eval model test { x: int32 };
    `
    );

    await testHost.compile("./");
  });

  it("works with eval", async () => {
    testHost.addJsFile("test.js", {
      async $eval(p: Program) {
        await p.evalCadlScript(`using Foo; model A { a: X };`);
      },
    });
    testHost.addCadlFile(
      "main.cadl",
      `
      import "./test.js";
      namespace Foo;
      model X { };
      @eval model test { };
    `
    );

    await testHost.compile("./");
  });

  it("works when the using'd namespace is merged after the current namespace", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      import "./other.cadl";
      namespace Main;
      using Other;
      model Thing {
        other: OtherModel;
      }
    `
    );
    testHost.addCadlFile(
      "other.cadl",
      `
      namespace Other;

      model OtherModel {
      }
    `
    );
    await testHost.compile("./");
  });
});
