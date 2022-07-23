import { deepStrictEqual } from "assert";
import { openApiFor } from "./test-host.js";

describe("openapi3: schema", () => {
  it("union with self reference model and null", async () => {
    const res = await openApiFor(
      `
      model Thing {
        id: string;
        properties: Thing | null;
      }
      op doStuff(): Thing;
      `
    );
    deepStrictEqual(res.components.schemas.Thing.properties.properties, {
      type: "object",
      allOf: [{ $ref: "#/components/schemas/Thing" }],
      nullable: true,
      "x-cadl-name": "Thing | null",
    });
  });
});
