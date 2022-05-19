import { deepStrictEqual, fail, strictEqual } from "assert";
import { getSourceLocation } from "../../core/diagnostics.js";
import { Diagnostic, ModelType, StringLiteralType } from "../../core/types.js";
import { createTestHost, expectDiagnostics, TestHost } from "../../testing/index.js";

describe("compiler: templates", () => {
  let testHost: TestHost;

  beforeEach(async () => {
    testHost = await createTestHost();
  });

  function getLineAndCharOfDiagnostic(diagnostic: Diagnostic) {
    const source = getSourceLocation(diagnostic.target);
    if (source === undefined) {
      fail(`Couldn't resolve the source of diagnostic ${diagnostic}`);
    }
    return source.file.getLineAndCharacterOfPosition(source.pos);
  }

  it("emit diagnostics when using template params on non templated model", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
        model A {}
        model B { 
          foo: A<string>
        };
      `
    );
    const diagnostics = await testHost.diagnose("main.cadl");
    strictEqual(diagnostics.length, 1);
    strictEqual(diagnostics[0].code, "invalid-template-args");
    strictEqual(diagnostics[0].message, "Can't pass template arguments to non-templated type");
    // Should point to the start of A<string>
    deepStrictEqual(getLineAndCharOfDiagnostic(diagnostics[0]), {
      line: 3,
      character: 15,
    });
  });

  it("emit diagnostics when using template without passing any arguments", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
        model A<T> {}
        model B { 
          foo: A
        };
      `
    );
    const diagnostics = await testHost.diagnose("main.cadl");
    strictEqual(diagnostics.length, 1);
    strictEqual(diagnostics[0].code, "invalid-template-args");
    strictEqual(diagnostics[0].message, "Too few template arguments provided.");
    // Should point to the start of A
    deepStrictEqual(getLineAndCharOfDiagnostic(diagnostics[0]), {
      line: 3,
      character: 15,
    });
  });

  it("emit diagnostics when using template with too many arguments", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
        model A<T> {}
        model B { 
          foo: A<string, string>
        };
      `
    );
    const diagnostics = await testHost.diagnose("main.cadl");
    strictEqual(diagnostics.length, 1);
    strictEqual(diagnostics[0].code, "invalid-template-args");
    strictEqual(diagnostics[0].message, "Too many template arguments provided.");

    // Should point to the start of A<string, string>
    deepStrictEqual(getLineAndCharOfDiagnostic(diagnostics[0]), {
      line: 3,
      character: 15,
    });
  });

  it("allows default template parameters", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
        @test model A<T, U = "hi"> { a: T, b: U }
        model B { 
          foo: A<"bye">
        };
      `
    );

    const { A } = (await testHost.compile("main.cadl")) as { A: ModelType };
    const a = A.properties.get("a")!;
    const b = A.properties.get("b")!;
    strictEqual(a.type.kind, "String");
    strictEqual((a.type as StringLiteralType).value, "bye");
    strictEqual(b.type.kind, "String");
    strictEqual((b.type as StringLiteralType).value, "hi");
  });

  it("allows default template parameters that are models", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
        @test model A<T = string> { a: T }
        model B { 
          foo: A
        };
      `
    );

    const { A } = (await testHost.compile("main.cadl")) as { A: ModelType };
    const a = A.properties.get("a")!;
    strictEqual(a.type.kind, "Model");
    strictEqual((a.type as ModelType).name, "string");
  });

  it("template instance should be the exact same when passing value that is the same as the default", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
        model Foo<A = string, B=string> { a: A, b: B }
        @test model Test { 
          a: Foo;
          b: Foo<string>;
          c: Foo<string, string>;
        };
      `
    );

    const { Test } = (await testHost.compile("main.cadl")) as { Test: ModelType };
    const a = Test.properties.get("a")!;
    const b = Test.properties.get("b")!;
    const c = Test.properties.get("c")!;
    strictEqual(a.type, b.type);
    strictEqual(a.type, c.type);
  });

  it("emits diagnostics when using too few template parameters", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
        @test model A<T, U, V = "hi"> { a: T, b: U, c: V }
        model B { 
          foo: A<"bye">
        };
      `
    );

    const diagnostics = await testHost.diagnose("main.cadl");
    strictEqual(diagnostics.length, 1);
    strictEqual(diagnostics[0].code, "invalid-template-args");
    strictEqual(diagnostics[0].message, "Too few template arguments provided.");
  });

  it("emits diagnostics when non-defaulted template parameter comes after defaulted one", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
        @test model A<T = "hi", U> { a: T, b: U }
      `
    );

    const diagnostics = await testHost.diagnose("main.cadl");
    expectDiagnostics(diagnostics, { code: "default-required" });
  });

  it("emits diagnostics when defaulted template use later template parameter", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
        @test model A<A = B, B = "hi"> { a: A, b: B }
      `
    );

    const diagnostics = await testHost.diagnose("main.cadl");
    expectDiagnostics(diagnostics, {
      code: "invalid-template-default",
      message:
        "Template parameter defaults can only reference previously declared type parameters.",
    });
  });

  it("emits diagnostics when defaulted template use later template parameter in complex type", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
        @test model A<A = "one" | B, B = "hi"> { a: A, b: B }
      `
    );

    const diagnostics = await testHost.diagnose("main.cadl");
    expectDiagnostics(diagnostics, {
      code: "invalid-template-default",
      message:
        "Template parameter defaults can only reference previously declared type parameters.",
    });
  });

  it("emits diagnostics for template parameter defaults that are incorrect", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
        @test model A<T = Map> { a: T }
      `
    );

    const diagnostics = await testHost.diagnose("main.cadl");
    expectDiagnostics(diagnostics, { code: "invalid-template-args" });
  });

  it("can reference other parameters", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
        @test model A<T, X = T> { a: T, b: X }
        model B { 
          foo: A<"bye">
        };
      `
    );

    const { A } = (await testHost.compile("main.cadl")) as { A: ModelType };
    const a = A.properties.get("a")!;
    const b = A.properties.get("b")!;
    strictEqual(a.type.kind, "String");
    strictEqual((a.type as StringLiteralType).value, "bye");
    strictEqual(b.type.kind, "String");
    strictEqual((b.type as StringLiteralType).value, "bye");
  });

  it("emit diagnostics if referencing itself", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
        @test model A<T = T> { a: T }
        model B { 
          foo: A
        };
      `
    );

    const diagnostics = await testHost.diagnose("main.cadl");
    expectDiagnostics(diagnostics, {
      code: "invalid-template-default",
      message:
        "Template parameter defaults can only reference previously declared type parameters.",
    });
  });

  it("emit diagnostics if args reference each other", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
        @test model A<T = K, K = T> { a: T }
        model B { 
          foo: A
        };
      `
    );

    const diagnostics = await testHost.diagnose("main.cadl");
    expectDiagnostics(diagnostics, {
      code: "invalid-template-default",
      message:
        "Template parameter defaults can only reference previously declared type parameters.",
    });
  });

  it("emit diagnostics if referencing itself nested", async () => {
    testHost.addCadlFile(
      "main.cadl",
      `
        @test model A<T = {foo: T}> { a: T }
        model B { 
          foo: A
        };
      `
    );

    const diagnostics = await testHost.diagnose("main.cadl");
    expectDiagnostics(diagnostics, {
      code: "invalid-template-default",
      message:
        "Template parameter defaults can only reference previously declared type parameters.",
    });
  });
});
