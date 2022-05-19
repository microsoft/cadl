import { deepStrictEqual, ok, strictEqual } from "assert";
import { ModelType } from "../../core/index.js";
import {
  getDoc,
  getFriendlyName,
  getKeyName,
  getKnownValues,
  isErrorModel,
} from "../../lib/decorators.js";
import { BasicTestRunner, createTestRunner, expectDiagnostics } from "../../testing/index.js";

describe("compiler: built-in decorators", () => {
  let runner: BasicTestRunner;

  beforeEach(async () => {
    runner = await createTestRunner();
  });

  describe("@doc", () => {
    it("applies @doc on model", async () => {
      const { A } = await runner.compile(
        `
        @test
        @doc("My Doc")
        model A { }
        `
      );

      strictEqual(getDoc(runner.program, A), "My Doc");
    });

    it("formats @doc string using source object", async () => {
      const { A, B } = await runner.compile(
        `
        @doc("Templated {name}", T)
        model Template<T>  {
        }

        @test
        @doc("Model {name}", A)
        model A { }

        @test
        model B is Template<B> {
        }
        `
      );
      strictEqual(getDoc(runner.program, A), "Model A");
      strictEqual(getDoc(runner.program, B), "Templated B");
    });

    it("applies @doc on namespace", async () => {
      const { TestDoc } = await runner.compile(
        `
        @test
        @doc("doc for namespace")
        namespace TestDoc {
        }
        `
      );

      strictEqual(getDoc(runner.program, TestDoc), "doc for namespace");
    });

    it("applies @doc on enum", async () => {
      const { Color, Red } = await runner.compile(
        `
        @test
        @doc("doc for enum")
        enum Color {
          @test
          @doc("doc for enum element")
          Red: "red",
        }
        `
      );

      strictEqual(getDoc(runner.program, Color), "doc for enum");
      strictEqual(getDoc(runner.program, Red), "doc for enum element");
    });

    it("applies @doc on union", async () => {
      const { AB } = await runner.compile(
        `
        model A { }
        model B { }

        @test
        @doc("doc for union")
        union AB { a: A, b: B }
        `
      );

      strictEqual(getDoc(runner.program, AB), "doc for union");
    });

    it("applies @doc on interfaces", async () => {
      const { TestDoc, a } = await runner.compile(
        `
        @test
        @doc("doc for interface")
        interface TestDoc {
          @test
          @doc("doc for interface operation")
          a(): string;
        }
        `
      );

      strictEqual(getDoc(runner.program, TestDoc), "doc for interface");
      strictEqual(getDoc(runner.program, a), "doc for interface operation");
    });

    it("applies @doc on operations", async () => {
      const { b } = await runner.compile(
        `
        @test
        @doc("doc for an operation")
        op b(): string;
        `
      );

      strictEqual(getDoc(runner.program, b), "doc for an operation");
    });

    it("emit diagnostic if doc is not a string", async () => {
      const diagnostics = await runner.diagnose(`
        @doc("foo" | "bar")
        model A { }
      `);

      expectDiagnostics(diagnostics, {
        code: "invalid-argument",
        message: `Argument 'foo | bar' of type 'Union' is not assignable to parameter of type 'String'`,
      });
    });
  });

  describe("@friendlyName", () => {
    it("applies @friendlyName on model", async () => {
      const { A, B, C } = await runner.compile(`
        @test
        @friendlyName("MyNameIsA")
        model A { }

        @test
        @friendlyName("{name}Model", B)
        model B { }

        @friendlyName("Templated{name}", T)
        model Templated<T> {
          prop: T;
        }

        @test
        model C is Templated<B>{};
        `);
      strictEqual(getFriendlyName(runner.program, A), "MyNameIsA");
      strictEqual(getFriendlyName(runner.program, B), "BModel");
      strictEqual(getFriendlyName(runner.program, C), "TemplatedB");
    });
  });

  describe("@error", () => {
    it("applies @error on model", async () => {
      const { A } = await runner.compile(`
        @test
        @error
        model A { }
      `);
      ok(isErrorModel(runner.program, A), "isError should be true");
    });

    it("emit diagnostic if error is not applied to a model", async () => {
      const diagnostics = await runner.diagnose(`
        @error
        enum A { B, C }
        `);

      strictEqual(diagnostics.length, 1);
      strictEqual(diagnostics[0].code, "decorator-wrong-target");
      strictEqual(diagnostics[0].message, `Cannot apply @error decorator to Enum`);
    });
  });

  describe("@knownValues", () => {
    it("assign the known values to string model", async () => {
      const { Bar } = (await runner.compile(`
        enum Foo {one: "one", two: "two"}
        @test
        @knownValues(Foo)
        model Bar is string {}
      `)) as { Bar: ModelType };

      ok(Bar.kind);
      const knownValues = getKnownValues(runner.program, Bar);
      ok(knownValues);
      strictEqual(knownValues.kind, "Enum");
    });

    it("assign the known values to number model", async () => {
      const { Bar } = (await runner.compile(`
        enum Foo {
          one: 1; 
          two: 2;
        }
        @test
        @knownValues(Foo)
        model Bar is int32 {}
      `)) as { Bar: ModelType };

      ok(Bar.kind);
      const knownValues = getKnownValues(runner.program, Bar);
      ok(knownValues);
      strictEqual(knownValues.kind, "Enum");
    });

    it("emit diagnostics when used on non model", async () => {
      const diagnostics = await runner.diagnose(`
        enum Foo {one, two}
        @knownValues(Foo)
        enum Bar {}
      `);

      expectDiagnostics(diagnostics, {
        code: "decorator-wrong-target",
        message: "Cannot apply @format decorator to Enum",
      });
    });

    it("emit diagnostics when enum has invalid members", async () => {
      const diagnostics = await runner.diagnose(`
         enum Foo {
          one: 1; 
          two: 2;
        }
        @knownValues(Foo)
        model Bar is string {}
      `);

      expectDiagnostics(diagnostics, {
        code: "known-values-invalid-enum",
        message: "Enum cannot be used on this type. Member one is not assignable to type string.",
      });
    });

    it("emit diagnostics when used on non string model", async () => {
      const diagnostics = await runner.diagnose(`
        enum Foo {one, two}
        @knownValues(Foo)
        model Bar {}
      `);

      expectDiagnostics(diagnostics, {
        code: "decorator-wrong-target",
        message:
          "Cannot apply @knownValues decorator to type it is not one of: string, int8, int16, int32, int64, float32, float64",
      });
    });

    it("emit diagnostics when known values is not an enum", async () => {
      const diagnostics = await runner.diagnose(`
        model Foo {}
        @knownValues(Foo)
        model Bar is string {}
      `);

      expectDiagnostics(diagnostics, {
        code: "invalid-argument",
        message: "Argument 'Foo' of type 'Model' is not assignable to parameter of type 'Enum'",
      });
    });
  });

  describe("@key", () => {
    it("emits diagnostic when argument is not a string", async () => {
      const diagnostics = await runner.diagnose(
        `model M {
          @key(4)
          prop: string;
        }`
      );

      expectDiagnostics(diagnostics, [
        {
          code: "invalid-argument",
          message: "Argument '4' of type 'Number' is not assignable to parameter of type 'String'",
        },
      ]);
    });

    it("emits diagnostic when not applied to model property", async () => {
      const diagnostics = await runner.diagnose(
        `@key
        model M {}`
      );

      expectDiagnostics(diagnostics, [
        {
          code: "decorator-wrong-target",
          message: "Cannot apply @key decorator to Model",
        },
      ]);
    });

    it("sets key to property name by default", async () => {
      const { prop } = await runner.compile(
        `model M {
          @test
          @key
          prop: string;
        }`
      );

      ok(prop.kind === "ModelProperty", "should be a model property");
      strictEqual(getKeyName(runner.program, prop), "prop");
    });

    it("sets key to alternate name when provided", async () => {
      const { prop } = await runner.compile(
        `model M {
          @test
          @key("alternateName")
          prop: string;
        }`
      );

      ok(prop.kind === "ModelProperty", "should be a model property");
      strictEqual(getKeyName(runner.program, prop), "alternateName");
    });
  });

  describe("@withoutOmittedProperties", () => {
    it("removes a model property when given a string literal", async () => {
      const { TestModel } = await runner.compile(
        `
        model OriginalModel {
          removeMe: string;
          notMe: string;
        }

        @test
        model TestModel is OmitProperties<OriginalModel, "removeMe"> {
        }`
      );

      const properties = TestModel.kind === "Model" ? Array.from(TestModel.properties.keys()) : [];
      deepStrictEqual(properties, ["notMe"]);
    });

    it("removes model properties when given a union containing strings", async () => {
      const { TestModel } = await runner.compile(
        `
        model OriginalModel {
          removeMe: string;
          removeMeToo: string;
          notMe: string;
        }

        @test
        model TestModel is OmitProperties<OriginalModel, "removeMe" | "removeMeToo"> {
        }`
      );

      const properties = TestModel.kind === "Model" ? Array.from(TestModel.properties.keys()) : [];
      deepStrictEqual(properties, ["notMe"]);
    });
  });
});
