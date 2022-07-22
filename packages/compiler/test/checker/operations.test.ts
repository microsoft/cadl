import { ok, strictEqual } from "assert";
import { DecoratorContext, IntrinsicType, OperationType, Type } from "../../core/types.js";
import { createTestHost, expectDiagnostics, TestHost } from "../../testing/index.js";

describe("compiler: operations", () => {
  let testHost: TestHost;

  beforeEach(async () => {
    testHost = await createTestHost();
  });

  it("can return void", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      @test op foo(): void;
    `
    );

    const { foo } = (await testHost.compile("./main.cadl")) as { foo: OperationType };
    strictEqual(foo.returnType.kind, "Intrinsic");
    strictEqual((foo.returnType as IntrinsicType).name, "void");
  });

  it("can be templated and referenced to define other operations", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `op Foo<TName, TPayload>(name: TName, payload: TPayload): boolean;

      @test
      op newFoo is Foo<string, string>;`
    );

    const [result, diagnostics] = await testHost.compileAndDiagnose("./main.cadl");
    expectDiagnostics(diagnostics, []);

    const { newFoo } = result as { newFoo: OperationType };
    strictEqual(newFoo.parameters.properties.size, 2);
    const props = Array.from(newFoo.parameters.properties.values());

    strictEqual(props[0].name, "name");
    strictEqual(props[0].type.kind, "Model");
    strictEqual(props[1].name, "payload");
    strictEqual(props[1].type.kind, "Model");
  });

  it("can be defined based on other operation references", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `op Foo<TName, TPayload>(name: TName, payload: TPayload): boolean;
      op NewFooBase<TPayload> is Foo<string, TPayload>;

      @test
      op newFoo is NewFooBase<string>;`
    );

    const [result, diagnostics] = await testHost.compileAndDiagnose("./main.cadl");
    expectDiagnostics(diagnostics, []);

    const { newFoo } = result as { newFoo: OperationType };
    strictEqual(newFoo.parameters.properties.size, 2);
    const props = Array.from(newFoo.parameters.properties.values());

    strictEqual(props[0].name, "name");
    strictEqual(props[0].type.kind, "Model");
    strictEqual(props[1].name, "payload");
    strictEqual(props[1].type.kind, "Model");
  });

  it("can reference an operation when being defined in an interface", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `op Foo<TName, TPayload>(name: TName, payload: TPayload): boolean;

      interface Test {
        @test
        newFoo is Foo<string, string>;
      }`
    );

    const { newFoo } = (await testHost.compile("./main.cadl")) as { newFoo: OperationType };
    strictEqual(newFoo.parameters.properties.size, 2);
    const props = Array.from(newFoo.parameters.properties.values());

    strictEqual(props[0].name, "name");
    strictEqual(props[0].type.kind, "Model");
    strictEqual(props[1].name, "payload");
    strictEqual(props[1].type.kind, "Model");
  });

  it("can reference an operation defined inside an interface", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      interface Foo {
        bar(): boolean;
      }
      
      @test op newFoo is Foo.bar;
      `
    );

    const { newFoo } = (await testHost.compile("./main.cadl")) as { newFoo: OperationType };

    strictEqual(newFoo.returnType.kind, "Model" as const);
    strictEqual(newFoo.returnType.name, "boolean");
  });

  it("can reference an operation defined in the same interface", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      interface Foo {
        bar(): boolean;
        @test op newFoo is Foo.bar;
      }
      `
    );

    const { newFoo } = (await testHost.compile("./main.cadl")) as { newFoo: OperationType };

    strictEqual(newFoo.returnType.kind, "Model" as const);
    strictEqual(newFoo.returnType.name, "boolean");
  });

  it("applies the decorators of the referenced operation and its transitive references", async () => {
    const alphaTargets = new Map<Type, Type>();
    const betaTargets = new Set<Type>();
    const gammaTargets = new Set<Type>();

    testHost.addJsFile("test.js", {
      $alpha(context: DecoratorContext, target: Type, param: Type) {
        alphaTargets.set(target, param);
      },

      $beta(context: DecoratorContext, target: Type) {
        betaTargets.add(target);
      },

      $gamma(context: DecoratorContext, target: Type) {
        gammaTargets.add(target);
      },
    });

    testHost.addCadlFile(
      "main.cadl",
      `
      import "./test.js";
      @alpha(TPayload)
      op Foo<TName, TPayload>(name: TName, payload: TPayload): boolean;

      @beta
      op NewFooBase<TPayload> is Foo<string, TPayload>;

      @test
      @gamma
      op newFoo is NewFooBase<string>;`
    );

    const [result, diagnostics] = await testHost.compileAndDiagnose("./main.cadl");
    expectDiagnostics(diagnostics, []);

    const { newFoo } = result as { newFoo: OperationType };
    strictEqual(newFoo.parameters.properties.size, 2);

    // Check that the decorators were applied correctly to `newFoo`
    strictEqual(alphaTargets.get(newFoo)?.kind, "Model");
    ok(betaTargets.has(newFoo));
    ok(gammaTargets.has(newFoo));
  });

  it("prevents the definition of a templated operation in an interface", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      interface Test {
        getResource<TResource>(name: string): TResource;
      }`
    );

    const [_, diagnostics] = await testHost.compileAndDiagnose("./main.cadl");
    expectDiagnostics(diagnostics, [
      {
        code: "token-expected",
        message: `'(', or 'is' expected.`,
      },
      {
        code: "token-expected",
        message: `';' expected.`,
      },
      {
        code: "unknown-identifier",
        message: `Unknown identifier TResource`,
      },
    ]);
  });

  it("emit diagnostic when operation is referencing itself as signature", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      op foo is foo;
      `
    );
    const diagnostics = await testHost.diagnose("main.cadl");
    expectDiagnostics(diagnostics, [
      {
        code: "circular-op-signature",
        message: "Operation 'foo' recursively references itself.",
      },
    ]);
  });

  it("emit diagnostic when operations reference each other using signature", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
      op foo is bar;
      op bar is foo;
      `
    );
    const diagnostics = await testHost.diagnose("main.cadl");
    expectDiagnostics(diagnostics, [
      {
        code: "circular-op-signature",
        message: "Operation 'foo' recursively references itself.",
      },
      {
        code: "circular-op-signature",
        message: "Operation 'bar' recursively references itself.",
      },
    ]);
  });
});
