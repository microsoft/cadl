import { deepStrictEqual, match, ok, strictEqual } from "assert";
import { isTemplate } from "../../core/semantic-walker.js";
import { ModelType, ModelTypeProperty, Type } from "../../core/types.js";
import {
  createTestHost,
  expectDiagnosticEmpty,
  expectDiagnostics,
  TestHost,
} from "../../testing/index.js";

describe("compiler: models", () => {
  let testHost: TestHost;

  beforeEach(async () => {
    testHost = await createTestHost();
  });

  it("allow template parameters passed into decorators", async () => {
    let t1, t2;

    testHost.addJsFile("dec.js", {
      $dec(p: any, t: any, _t1: ModelType, _t2: ModelType) {
        t1 = _t1;
        t2 = _t2;
      },
    });

    testHost.addCadlFile(
      "main.cadl",
      `
      import "./dec.js";
      model B { }
      model C { }
      @dec(T1, T2)
      model A<T1,T2> {

      }
      `
    );

    const { B, C } = (await testHost.compile("./")) as {
      B: ModelType;
      C: ModelType;
    };

    strictEqual(t1, B);
    strictEqual(t2, C);
  });

  it("doesn't allow duplicate properties", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      model A { x: int32; x: int32; }
      `
    );
    const diagnostics = await testHost.diagnose("main.cadl");
    strictEqual(diagnostics.length, 1);
    match(diagnostics[0].message, /Model already has a property/);
  });

  it("doesn't invoke decorators on uninstantiated templates", async () => {
    const blues = new WeakSet();
    let calls = 0;
    testHost.addJsFile("dec.js", {
      $blue(p: any, t: Type) {
        calls++;
        blues.add(t);
      },
    });
    testHost.addCadlFile(
      "main.cadl",
      `
      import "./dec.js";
      @blue model A<T> { @blue x: int32}
      `
    );
    await testHost.compile("./");
    strictEqual(calls, 0);
  });

  it("emit single error when there is an invalid ref in a templated type", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
        model A<T> {t: T, invalid: notValidType }

        model Bar {
          instance1: A<string>;
          instance2: A<int32>;
        }
        `
    );
    const diagnostics = await testHost.diagnose("main.cadl");
    expectDiagnostics(diagnostics, [
      {
        code: "unknown-identifier",
        message: "Unknown identifier notValidType",
      },
    ]);
  });

  describe("assign default values", () => {
    const testCases: [string, string, any][] = [
      ["boolean", `false`, { kind: "Boolean", value: false }],
      ["boolean", `true`, { kind: "Boolean", value: true }],
      ["string", `"foo"`, { kind: "String", value: "foo" }],
      ["int32", `123`, { kind: "Number", value: 123 }],
    ];

    for (const [type, defaultValue, expectedValue] of testCases) {
      it(`foo?: ${type} = ${defaultValue}`, async () => {
        testHost.addCadlFile(
          "main.cadl",
          `
          model A { @test foo?: ${type} = ${defaultValue} }
          `
        );
        const { foo } = (await testHost.compile("main.cadl")) as { foo: ModelTypeProperty };
        deepStrictEqual({ ...foo.default }, expectedValue);
      });
    }
  });

  describe("doesn't allow a default of different type than the property type", () => {
    const testCases: [string, string, RegExp][] = [
      ["string", "123", /Default must be a string/],
      ["int32", `"foo"`, /Default must be a number/],
      ["boolean", `"foo"`, /Default must be a boolean/],
      ["string[]", `["foo", 123]`, /Default must be a string/],
      [`"foo" | "bar"`, `"foo1"`, /Type 'foo1' is not assignable to type 'foo | bar'/],
    ];

    for (const [type, defaultValue, errorRegex] of testCases) {
      it(`foo?: ${type} = ${defaultValue}`, async () => {
        testHost.addCadlFile(
          "main.cadl",
          `
          model A { foo?: ${type} = ${defaultValue} }
          `
        );
        const diagnostics = await testHost.diagnose("main.cadl");
        strictEqual(diagnostics.length, 1);
        match(diagnostics[0].message, errorRegex);
      });
    }
  });

  it(`doesn't emit unsuported-default diagnostic when type is an error`, async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
        model A { foo?: bool = false }
      `
    );
    const diagnostics = await testHost.diagnose("main.cadl");
    expectDiagnostics(diagnostics, [
      { code: "unknown-identifier", message: "Unknown identifier bool" },
    ]);
  });

  it("provides parent model of properties", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      @test
      model A {
        pA: int32;
      }

      @test
      model B {
        pB: int32;

      }

      @test
      model C {
        pC: int32;
      }

      @test
      model D {
        ...A,
        pD: B & C;
      }
      `
    );

    const { A, B, C, D } = await testHost.compile("./");

    ok(A.kind === "Model", "model expected");
    strictEqual(A.properties.size, 1);
    const pA = A.properties.get("pA");
    strictEqual(pA?.model, A);

    ok(B.kind === "Model", "model expected");
    strictEqual(B.properties.size, 1);
    const pB = B.properties.get("pB");
    strictEqual(pB?.model, B);

    ok(C.kind === "Model", "model expected");
    strictEqual(C.properties.size, 1);
    const pC = C.properties.get("pC");
    strictEqual(pC?.model, C);

    ok(D.kind === "Model", "model expected");
    strictEqual(D.properties.size, 2);
    const pA_of_D = D.properties.get("pA");
    const pD = D.properties.get("pD");
    strictEqual(pA_of_D?.model, D);
    strictEqual(pD?.model, D);

    const BC = pD.type;
    ok(BC.kind === "Model", "model expected");
    strictEqual(BC.properties.size, 2);
    const pB_of_BC = BC.properties.get("pB");
    const pC_of_BC = BC.properties.get("pC");
    strictEqual(pB_of_BC?.model, BC);
    strictEqual(pC_of_BC?.model, BC);
  });

  describe("with extends", () => {
    it("doesn't allow duplicate properties", async () => {
      testHost.addCadlFile(
        "main.cadl",
        `
        model A { x: int32 }
        model B extends A { x: int32 };
        `
      );
      const diagnostics = await testHost.diagnose("main.cadl");
      strictEqual(diagnostics.length, 1);
      match(diagnostics[0].message, /Model has an inherited property/);
    });

    it("keeps reference of childrens", async () => {
      testHost.addCadlFile(
        "main.cadl",
        `
        @test model Pet {
          name: true;
        }

        @test model Cat extends Pet {
          meow: true;
        }

        @test model Dog extends Pet {
          bark: true;
        }
        `
      );
      const { Pet, Dog, Cat } = (await testHost.compile("main.cadl")) as {
        Pet: ModelType;
        Dog: ModelType;
        Cat: ModelType;
      };
      ok(Pet.derivedModels);
      strictEqual(Pet.derivedModels.length, 2);
      strictEqual(Pet.derivedModels[0], Cat);
      strictEqual(Pet.derivedModels[1], Dog);
    });

    it("keeps reference of childrens with templates", async () => {
      testHost.addCadlFile(
        "main.cadl",
        `
        @test model Pet {
          name: true;
        }

        model TPet<T> extends Pet {
          t: T;
        }

        @test model Cat is TPet<string> {
          meow: true;
        }

        @test model Dog is TPet<string> {
          bark: true;
        }
        `
      );
      const { Pet, Dog, Cat } = (await testHost.compile("main.cadl")) as {
        Pet: ModelType;
        Dog: ModelType;
        Cat: ModelType;
      };
      strictEqual(Pet.derivedModels.length, 4);
      strictEqual(Pet.derivedModels[0].name, "TPet");
      ok(isTemplate(Pet.derivedModels[0]));

      strictEqual(Pet.derivedModels[1].name, "TPet");
      ok(Pet.derivedModels[1].templateArguments);
      strictEqual(Pet.derivedModels[1].templateArguments[0].kind, "Model");
      strictEqual((Pet.derivedModels[1].templateArguments[0] as ModelType).name, "string");

      strictEqual(Pet.derivedModels[2], Cat);
      strictEqual(Pet.derivedModels[3], Dog);
    });

    it("emit error when extends itself", async () => {
      testHost.addCadlFile(
        "main.cadl",
        `
        model A extends A {}
        `
      );
      const diagnostics = await testHost.diagnose("main.cadl");
      strictEqual(diagnostics.length, 1);
      strictEqual(
        diagnostics[0].message,
        "Model type 'A' recursively references itself as a base type."
      );
    });

    it("emit error when extends ciruclar reference", async () => {
      testHost.addCadlFile(
        "main.cadl",
        `
        model A extends B {}
        model B extends A {}
        `
      );
      const diagnostics = await testHost.diagnose("main.cadl");
      strictEqual(diagnostics.length, 1);
      strictEqual(
        diagnostics[0].message,
        "Model type 'A' recursively references itself as a base type."
      );
    });

    it("emit no error when extends has property to base model", async () => {
      testHost.addCadlFile(
        "main.cadl",
        `
        model A extends B {}
        model B {
          a: A
        }
        `
      );
      const diagnostics = await testHost.diagnose("main.cadl");
      expectDiagnosticEmpty(diagnostics);
    });
  });

  describe("with is", () => {
    let testHost: TestHost;
    const blues = new WeakSet();
    const reds = new WeakSet();
    beforeEach(async () => {
      testHost = await createTestHost();
      testHost.addJsFile("dec.js", {
        $blue(p: any, t: Type) {
          blues.add(t);
        },
        $red(p: any, t: Type) {
          reds.add(t);
        },
      });
    });

    it("copies decorators", async () => {
      testHost.addCadlFile(
        "main.cadl",
        `
        import "./dec.js";
        @blue model A { }
        @test @red model B is A { };
        `
      );
      const { B } = (await testHost.compile("main.cadl")) as { B: ModelType };
      ok(blues.has(B));
      ok(reds.has(B));
    });

    it("copies properties", async () => {
      testHost.addCadlFile(
        "main.cadl",
        `
        model A { x: int32 }
        @test model B is A { y: string };
        `
      );
      const { B } = (await testHost.compile("main.cadl")) as { B: ModelType };
      ok(B.properties.has("x"));
      ok(B.properties.has("y"));
    });

    it("copies heritage", async () => {
      testHost.addCadlFile(
        "main.cadl",
        `
        import "./dec.js";
        @test model A { x: int32 }
        model B extends A { y: string };
        @test model C is B { }
        `
      );
      const { A, C } = (await testHost.compile("main.cadl")) as { A: ModelType; C: ModelType };
      strictEqual(C.baseModel, A);
      strictEqual(A.derivedModels[1], C);
    });

    it("doesn't allow duplicate properties", async () => {
      testHost.addCadlFile(
        "main.cadl",
        `
        import "./dec.js";
        model A { x: int32 }
        model B is A { x: int32 };
        `
      );
      const diagnostics = await testHost.diagnose("main.cadl");
      strictEqual(diagnostics.length, 1);
      match(diagnostics[0].message, /Model already has a property/);
    });

    it("emit error when is itself", async () => {
      testHost.addCadlFile(
        "main.cadl",
        `
        model A is A {}
        `
      );
      const diagnostics = await testHost.diagnose("main.cadl");
      strictEqual(diagnostics.length, 1);
      strictEqual(
        diagnostics[0].message,
        "Model type 'A' recursively references itself as a base type."
      );
    });

    it("emit single error when is itself as a templated with mutliple instantiations", async () => {
      testHost.addCadlFile(
        "main.cadl",
        `
        model A<T> is A<T> {}

        model Bar {
          instance1: A<string>;
          instance2: A<int32>;
        }
        `
      );
      const diagnostics = await testHost.diagnose("main.cadl");
      expectDiagnostics(diagnostics, [
        {
          code: "circular-base-type",
          message: "Model type 'A' recursively references itself as a base type.",
        },
      ]);
    });

    it("emit error when 'is' has circular reference", async () => {
      testHost.addCadlFile(
        "main.cadl",
        `
        model A is B {}
        model B is A {}
        `
      );
      const diagnostics = await testHost.diagnose("main.cadl");
      strictEqual(diagnostics.length, 1);
      strictEqual(
        diagnostics[0].message,
        "Model type 'A' recursively references itself as a base type."
      );
    });

    it("emit error when 'is' circular reference via extends", async () => {
      testHost.addCadlFile(
        "main.cadl",
        `
        model A is B {}
        model B extends A {}
        `
      );
      const diagnostics = await testHost.diagnose("main.cadl");
      strictEqual(diagnostics.length, 1);
      strictEqual(
        diagnostics[0].message,
        "Model type 'A' recursively references itself as a base type."
      );
    });

    it("emit no error when extends has property to base model", async () => {
      testHost.addCadlFile(
        "main.cadl",
        `
        model A is B {}
        model B {
          a: A
        }
        `
      );
      const diagnostics = await testHost.diagnose("main.cadl");
      expectDiagnosticEmpty(diagnostics);
    });

    it("resolve recursive template types", async () => {
      testHost.addCadlFile(
        "main.cadl",
        `
        model A<T> {
          c: T;
          b: B
        }
        @test
        model B is A<string> {}
        @test
        model C is A<int32> {}
        `
      );
      const { B, C } = await testHost.compile("main.cadl");
      strictEqual((B as ModelType).properties.size, 2);
      strictEqual(((B as ModelType).properties.get("c")?.type as any).name, "string");
      strictEqual(((B as ModelType).properties.get("b")?.type as any).name, "B");

      strictEqual((C as ModelType).properties.size, 2);
      strictEqual(((C as ModelType).properties.get("c")?.type as any).name, "int32");
      strictEqual(((C as ModelType).properties.get("b")?.type as any).name, "B");
    });
  });
});
