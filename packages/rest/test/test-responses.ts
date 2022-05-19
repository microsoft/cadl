import { ModelType } from "@cadl-lang/compiler";
import { expectDiagnosticEmpty, expectDiagnostics } from "@cadl-lang/compiler/testing";
import { ok, strictEqual } from "assert";
import { compileOperations, getOperations } from "./test-host.js";

describe("cadl: rest: responses", () => {
  it("issues diagnostics for duplicate body decorator", async () => {
    const [_, diagnostics] = await compileOperations(
      `
      model Foo {
        foo: string;
      }
      model Bar {
        bar: string;
      }
      @route("/")
      namespace root {
        @get
        op read(): { @body body1: Foo, @body body2: Bar };
      }
      `
    );
    expectDiagnostics(diagnostics, [{ code: "@cadl-lang/rest/duplicate-body" }]);
  });

  it("issues diagnostics for return type with duplicate status code", async () => {
    const [_, diagnostics] = await compileOperations(
      `
    model Foo {
      foo: string;
    }
    model Error {
      code: string;
    }
    @route("/")
    namespace root {
      @get
      op read(): Foo | Error;
    }
    `
    );
    expectDiagnostics(diagnostics, {
      code: "@cadl-lang/rest/duplicate-response",
      message: "Multiple return types for content type application/json and status code 200",
    });
  });

  it("issues diagnostics for invalid content types", async () => {
    const [_, diagnostics] = await compileOperations(
      `
      model Foo {
        foo: string;
      }

      model TextPlain {
        contentType: "text/plain";
      }

      namespace root {
        @route("/test1")
        @get
        op test1(): { @header contentType: string, @body body: Foo };
        @route("/test2")
        @get
        op test2(): { @header contentType: 42, @body body: Foo };
        @route("/test3")
        @get
        op test3(): { @header contentType: "application/json" | TextPlain, @body body: Foo };
      }
    `
    );
    expectDiagnostics(diagnostics, [
      { code: "@cadl-lang/rest/content-type-string" },
      { code: "@cadl-lang/rest/content-type-string" },
      { code: "@cadl-lang/rest/content-type-string" },
    ]);
  });

  // Regression test for https://github.com/microsoft/cadl/issues/328
  it("empty response model becomes body if it has childrens", async () => {
    const [routes, diagnostics] = await getOperations(
      `
      @route("/") op read(): A;

      model A {}

      model B extends A {
        foo: "B";
        b: string;
      }

      model C extends A {
        foo: "C";
        c: string;
      }

    `
    );
    expectDiagnosticEmpty(diagnostics);
    strictEqual(routes.length, 1);
    const responses = routes[0].responses;
    strictEqual(responses.length, 1);
    const response = responses[0];
    const body = response.responses[0].body;
    ok(body);
    strictEqual((body.type as ModelType).name, "A");
  });
});
