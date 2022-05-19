import { ok, strictEqual } from "assert";
import { Program } from "../../core/program.js";
import { DecoratorContext, ModelType, NamespaceType, Type } from "../../core/types.js";
import { createTestHost, TestHost } from "../../testing/index.js";

describe("compiler: namespaces with blocks", () => {
  const blues = new WeakSet();
  function $blue(_: any, target: Type) {
    blues.add(target);
  }

  let testHost: TestHost;

  beforeEach(async () => {
    testHost = await createTestHost();
    testHost.addJsFile("blue.js", { $blue });
  });

  it("can be decorated", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      import "./blue.js";
      @blue @test namespace Z.Q;
      @blue @test namespace N { }
      @blue @test namespace X.Y { }
      `
    );
    const { N, Y, Q } = (await testHost.compile("./")) as {
      N: NamespaceType;
      Y: NamespaceType;
      Q: NamespaceType;
    };

    ok(blues.has(N), "N is blue");
    ok(blues.has(Y), "Y is blue");
    ok(blues.has(Q), "Q is blue");
  });

  it("merges like namespaces", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      @test
      namespace N { @test model X { x: string } }
      namespace N { @test model Y { y: string } }
      namespace N { @test model Z { ... X, ... Y } }
      `
    );
    const { N, X, Y, Z } = (await testHost.compile("./")) as {
      N: NamespaceType;
      X: ModelType;
      Y: ModelType;
      Z: ModelType;
    };
    strictEqual(X.namespace, N);
    strictEqual(Y.namespace, N);
    strictEqual(Z.namespace, N);
    strictEqual(Z.properties.size, 2, "has two properties");
  });

  it("merges like namespaces across files", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      import "./a.cadl";
      import "./b.cadl";
      import "./c.cadl";
      `
    );
    testHost.addCadlFile(
      "a.cadl",
      `
      @test
      namespace N { @test model X { x: string } }
      `
    );
    testHost.addCadlFile(
      "b.cadl",
      `
      namespace N { @test model Y { y: int32 } }
      `
    );
    testHost.addCadlFile(
      "c.cadl",
      `
      namespace N { @test model Z { ... X, ... Y } }
      `
    );
    const { N, X, Y, Z } = (await testHost.compile("./")) as {
      N: NamespaceType;
      X: ModelType;
      Y: ModelType;
      Z: ModelType;
    };
    strictEqual(X.namespace, N, "X namespace");
    strictEqual(Y.namespace, N, "Y namespace");
    strictEqual(Z.namespace, N, "Z namespace");
    strictEqual(Z.properties.size, 2, "has two properties");
  });

  it("merges sub-namespaces across files", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      import "./a.cadl";
      import "./b.cadl";
      import "./c.cadl";
      `
    );
    testHost.addCadlFile(
      "a.cadl",
      `
      namespace N { namespace M { model X { x: string } } }
      `
    );
    testHost.addCadlFile(
      "b.cadl",
      `
      namespace N { namespace M { model Y { y: int32 } } }
      `
    );
    testHost.addCadlFile(
      "c.cadl",
      `
      namespace N { @test model Z { ... M.X, ... M.Y } }
      `
    );

    const { Z } = (await testHost.compile("./")) as {
      Z: ModelType;
    };
    strictEqual(Z.properties.size, 2, "has two properties");
  });

  it("runs all decorators on merged namespaces", async () => {
    const reds = new WeakSet();
    let isRedDuringRef = false;
    let isBlueDuringRef = false;
    testHost.addJsFile("red.js", {
      $red(p: Program, t: Type) {
        reds.add(t);
      },
      $ref(p: Program, t: Type, arg: Type) {
        isRedDuringRef = reds.has(arg);
        isBlueDuringRef = blues.has(arg);
      },
    });

    testHost.addCadlFile(
      "main.cadl",
      `
      import "./blue.js";
      import "./red.js";

      @ref(N)
      namespace A { }
      
      @red
      @test
      namespace N {}

      @blue
      namespace N {}
      `
    );

    const { N } = (await testHost.compile("./")) as {
      N: NamespaceType;
    };

    ok(reds.has(N), "is ultimately red"); // passes
    ok(blues.has(N), "is ultimately blue"); // passes

    ok(isRedDuringRef, "red at ref point");
    ok(isBlueDuringRef, "blue at ref point"); // fails
  });

  it("runs all decorators on merged namespaces across files", async () => {
    const reds = new WeakSet();
    let isRedDuringRef = false;
    let isBlueDuringRef = false;
    testHost.addJsFile("red.js", {
      $red(p: Program, t: Type) {
        reds.add(t);
      },
      $ref(p: Program, t: Type, arg: Type) {
        isRedDuringRef = reds.has(arg);
        isBlueDuringRef = blues.has(arg);
      },
    });

    testHost.addCadlFile(
      "main.cadl",
      `
      import "./blue.js";
      import "./red.js";
      import "./one.cadl";
      import "./two.cadl";
      
      @ref(N)
      namespace A { }
    
      `
    );

    testHost.addCadlFile(
      "one.cadl",
      `
      @red
      @test
      namespace N {}
    
      `
    );

    testHost.addCadlFile(
      "two.cadl",
      `
      @blue
      namespace N {}
      `
    );

    const { N } = (await testHost.compile("./")) as {
      N: NamespaceType;
    };

    ok(reds.has(N), "is ultimately red"); // passes
    ok(blues.has(N), "is ultimately blue"); // passes

    ok(isRedDuringRef, "red at ref point");
    ok(isBlueDuringRef, "blue at ref point"); // fails
  });

  it("can see things in outer scope same file", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      model A { }
      namespace N { model B extends A { } }
      `
    );
    await testHost.compile("./");
  });

  it("can see things in outer scope cross file", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      import "./a.cadl";
      import "./b.cadl";
      import "./c.cadl";
      `
    );
    testHost.addCadlFile(
      "a.cadl",
      `
      model A { }
      `
    );
    testHost.addCadlFile(
      "b.cadl",
      `
      model B extends A { }
      `
    );
    testHost.addCadlFile(
      "c.cadl",
      `
      model C { }
      namespace foo {
        op foo(a: A, b: B): C;
      }
      `
    );
    await testHost.compile("./");
  });

  it("accumulates declarations inside of it", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      @test namespace Foo {
        namespace Bar { };
        op Baz(): {};
        model Qux { };
      }
      `
    );

    const { Foo } = (await testHost.compile("./")) as {
      Foo: NamespaceType;
    };

    strictEqual(Foo.operations.size, 1);
    strictEqual(Foo.models.size, 1);
    strictEqual(Foo.namespaces.size, 1);
  });

  it("can be decorated, passing a model in a later namespace", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      @test(Azure.Foo)
      namespace Baz { };
      namespace Azure {
        model Foo { }
      }

      `
    );

    await testHost.compile("./");
  });
});

describe("compiler: blockless namespaces", () => {
  const blues = new WeakSet();
  function $blue(_: any, target: Type) {
    blues.add(target);
  }

  let testHost: TestHost;

  beforeEach(async () => {
    testHost = await createTestHost();
    testHost.addJsFile("blue.js", { $blue });
  });

  it("merges properly with other namespaces", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      import "./a.cadl";
      import "./b.cadl";
      import "./c.cadl";
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
      namespace N;
      model Y { y: int32 }
      `
    );
    testHost.addCadlFile(
      "c.cadl",
      `
      @test model Z { ... N.X, ... N.Y }
      `
    );
    const { Z } = (await testHost.compile("./")) as {
      Z: ModelType;
    };
    strictEqual(Z.properties.size, 2, "has two properties");
  });

  it("merges properly with other namespaces using eval", async () => {
    testHost.addJsFile("test.js", {
      $eval({ program }: DecoratorContext) {
        program.evalCadlScript(`namespace N; @test model Z { ... X, ... Y }`);
      },
    });
    testHost.addCadlFile(
      "main.cadl",
      `
      import "./a.cadl";
      import "./b.cadl";
      import "./c.cadl";
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
      namespace N;
      model Y { y: int32 }
      `
    );
    testHost.addCadlFile(
      "c.cadl",
      `
      import "./test.js";
      @eval model test { }
      `
    );
    const { Z } = (await testHost.compile("./")) as {
      Z: ModelType;
    };
    strictEqual(Z.properties.size, 2, "has two properties");
  });

  it("can access the cadl namespace using eval", async () => {
    testHost.addJsFile("test.js", {
      $eval({ program }: DecoratorContext) {
        program.evalCadlScript(`namespace Z; @test model Z { @doc("x") x: int32 }`);
      },
    });

    testHost.addCadlFile(
      "main.cadl",
      `
      import "./test.js";

      @test @eval model X { x: int32 }
      `
    );

    const { X } = (await testHost.compile("./")) as {
      X: ModelType;
    };
    strictEqual((X.properties.get("x")!.type as ModelType).name, "int32");
  });

  it("does lookup correctly", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      namespace Repro;
      model Yo {
      }
      model Hey {
        wat: Yo;
      }
      `
    );

    await testHost.compile("./");
  });

  it("does lookup correctly with nested namespaces", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      namespace Repro;
      model Yo {
      }
      model Hey {
        wat: Yo;
      }
      `
    );
    testHost.addCadlFile(
      "b.cadl",
      `
      namespace Repro.Uhoh;
      model SayYo {
        yo: Hey;
        wat: Yo;
      }
      `
    );

    await testHost.compile("./");
  });

  it("binds correctly", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      namespace N.M;
      model A { }
      `
    );
    testHost.addCadlFile(
      "b.cadl",
      `
      model X { a: N.M.A }
      `
    );

    await testHost.compile("./");
  });

  it("works with blockful namespaces", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      @test
      namespace N;

      @test
      namespace M {
        model A { }
      }
      `
    );
    testHost.addCadlFile(
      "b.cadl",
      `
      model X { a: N.M.A }
      `
    );
    const { N, M } = (await testHost.compile("./")) as {
      N: NamespaceType;
      M: NamespaceType;
    };

    ok(M.namespace);
    strictEqual(M.namespace, N);
  });

  it("works with nested blockless and blockfull namespaces", async () => {
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
      @test
      namespace N.M;

      @test
      namespace O {
        model A { }
      }
      `
    );
    testHost.addCadlFile(
      "b.cadl",
      `
      model X { a: N.M.O.A }
      `
    );
    const { M, O } = (await testHost.compile("./")) as {
      M: NamespaceType;
      O: NamespaceType;
    };

    ok(M.namespace);
    ok(O.namespace);
    strictEqual(O.namespace, M);
  });

  it("works when namespaces aren't evaluated first", async () => {
    testHost.addCadlFile(
      "a.cadl",
      `
      import "./b.cadl";
      model M {x: N.X }
      `
    );
    testHost.addCadlFile(
      "b.cadl",
      `
      namespace N;
      model X {}
      `
    );

    await testHost.compile("./a.cadl");
  });

  it("accumulates declarations inside of it", async () => {
    testHost.addCadlFile(
      "a.cadl",
      `
      @test namespace Foo;
      namespace Bar { };
      op Baz(): {};
      model Qux { };
      `
    );

    const { Foo } = (await testHost.compile("./a.cadl")) as {
      Foo: NamespaceType;
    };

    strictEqual(Foo.operations.size, 1);
    strictEqual(Foo.models.size, 1);
    strictEqual(Foo.namespaces.size, 1);
  });
});

describe("compiler: namespace type name", () => {
  let testHost: TestHost;

  beforeEach(async () => {
    testHost = await createTestHost();
  });

  it("prefix with the namespace of the entity", async () => {
    testHost.addCadlFile(
      "a.cadl",
      `
      namespace Foo;
      
      @test()
      model Model1 {}

      namespace Other.Bar {
         @test()
        model Model2 {}
      }
      `
    );

    const { Model1, Model2 } = await testHost.compile("./a.cadl");
    strictEqual(testHost.program.checker.getTypeName(Model1), "Foo.Model1");
    strictEqual(testHost.program.checker.getTypeName(Model2), "Foo.Other.Bar.Model2");
  });

  it("gets full name in edge case with decorators", async () => {
    testHost.addJsFile("lib.js", {
      namespace: "AnotherNamespace",
      $dec() {},
    });

    testHost.addCadlFile(
      "main.cadl",
      `
      import "./lib.js";

      @AnotherNamespace.dec(AnotherNamespace.AnotherModel)
      namespace SomeNamespace {
        @test()
        model SomeModel {}
      }

      namespace AnotherNamespace {
        @test()
        model AnotherModel {}
      }
      `
    );

    const { SomeModel, AnotherModel } = await testHost.compile("./main.cadl");
    const checker = testHost.program.checker;
    strictEqual(checker.getTypeName(SomeModel), "SomeNamespace.SomeModel");
    strictEqual(checker.getTypeName(AnotherModel), "AnotherNamespace.AnotherModel");
  });
});

describe("compiler: decorators in namespaces", () => {
  let testHost: TestHost;

  beforeEach(async () => {
    testHost = await createTestHost();
  });

  it("puts decorators in namespaces using an exported string", async () => {
    let fooCalled = false;
    let barCalled = false;

    const dec = {
      namespace: "A.B",
      $foo() {
        fooCalled = true;
      },
      $bar() {
        barCalled = true;
      },
    };

    (dec.$bar as any).namespace = "C";

    testHost.addJsFile("dec.js", dec);

    testHost.addCadlFile(
      "main.cadl",
      `
      import "./dec.js";
      @A.B.foo @A.B.C.bar model M { };
      `
    );

    await testHost.compile("main.cadl");
    ok(fooCalled);
    ok(barCalled);
  });

  it("puts decorators in a namespace using the .namespace property", async () => {
    let fooCalled = false;
    let barCalled = false;
    const dec = {
      $foo() {
        fooCalled = true;
      },
      $bar() {
        barCalled = true;
      },
    };

    (dec.$foo as any).namespace = "A";
    (dec.$bar as any).namespace = "A.B";
    testHost.addJsFile("dec.js", dec);

    testHost.addCadlFile(
      "main.cadl",
      `
      import "./dec.js";

      @A.foo @A.B.bar model M { };
      `
    );

    await testHost.compile("main.cadl");
    ok(fooCalled);
    ok(barCalled);
  });
});
