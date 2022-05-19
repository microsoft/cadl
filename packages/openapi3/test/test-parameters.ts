import { expectDiagnostics } from "@cadl-lang/compiler/testing";
import { deepStrictEqual, ok, strictEqual } from "assert";
import { diagnoseOpenApiFor, openApiFor } from "./test-host.js";

describe("openapi3: parameters", () => {
  it("create a query param", async () => {
    const res = await openApiFor(
      `
      op test(@query arg1: string): void;
      `
    );
    strictEqual(res.paths["/"].get.parameters[0].in, "query");
    strictEqual(res.paths["/"].get.parameters[0].name, "arg1");
    deepStrictEqual(res.paths["/"].get.parameters[0].schema, { type: "string" });
  });

  // Regression test for https://github.com/microsoft/cadl/issues/414
  it("@doc set the description on the parameter not its schema", async () => {
    const res = await openApiFor(
      `
      op test(@query @doc("mydoc") arg1: string): void;
      `
    );
    strictEqual(res.paths["/"].get.parameters[0].description, "mydoc");
    strictEqual(res.paths["/"].get.parameters[0].schema.description, undefined);
  });

  it("errors on duplicate parameter keys", async () => {
    const diagnostics = await diagnoseOpenApiFor(
      `
      model P {
        @query id: string;
      }

      @friendlyName("P")
      model Q {
        @header id: string;
      }

      @route("/test1")
      op test1(...P): void;

      @route("/test2")
      op test2(...Q): void;
      `
    );

    expectDiagnostics(diagnostics, [
      {
        code: "@cadl-lang/openapi/duplicate-type-name",
        message: /parameter/,
      },
    ]);
  });

  it("encodes parameter keys in references", async () => {
    const oapi = await openApiFor(
      `
      model Pet extends Pet$Id {
        name: string;
      }
      model Pet$Id {
        @path
        petId: string;
      }
      @route("/Pets")
      namespace root {
        @get()
        op get(... Pet$Id): Pet;
      }
      `
    );

    ok(oapi.paths["/Pets/{petId}"].get);
    strictEqual(
      oapi.paths["/Pets/{petId}"].get.parameters[0]["$ref"],
      "#/components/parameters/Pet%24Id"
    );
    strictEqual(oapi.components.parameters["Pet$Id"].name, "petId");
  });
});
