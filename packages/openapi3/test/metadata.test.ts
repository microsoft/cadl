import { deepStrictEqual } from "assert";
import { openApiFor } from "./test-host.js";

describe("openapi3: metadata", () => {
  it("supports nested metadata", async () => {
    const res = await openApiFor(
      `
      model Parameters {
        @query query: string;
        more: {
          @path path: string;
          more: {
            @header header: string;
          }
        }
      }

      @route("/")
      @get
      op test(...Parameters): void;
      `
    );

    deepStrictEqual(res.paths["/{path}"].get.parameters, [
      {
        // REVIEW: Only root spread parameters are ref'ed
        $ref: "#/components/parameters/Parameters.query",
      },
      {
        name: "path",
        in: "path",
        required: true,
        schema: {
          type: "string",
        },
      },
      {
        name: "header",
        in: "header",
        required: true,
        schema: {
          type: "string",
        },
      },
    ]);
  });

  it("applies visibility automatically and moves inapplicable metadata to schema", async () => {
    const res: any = await openApiFor(
      `
      model Pet {
        @header("ETag") etag: string;

        @visibility("read", "update")
        @path id: string;

        name: string;
      }

      @route("/pets")
      interface Pets {
        @post op create(pet: Pet): Pet;
        @get op list(): Pet[];
      }
      `
    );

    deepStrictEqual(res.paths, {
      "/pets": {
        post: {
          operationId: "Pets_create",
          parameters: [
            {
              name: "etag",
              in: "header",
              required: true,
              schema: {
                type: "string",
              },
            },
          ],
          responses: {
            "200": {
              description: "Ok",
              headers: {
                ETag: {
                  schema: {
                    type: "string",
                  },
                },
              },
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/Pet",
                  },
                },
              },
            },
          },
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/PetCreate",
                },
              },
            },
          },
        },
        get: {
          operationId: "Pets_list",
          parameters: [],
          responses: {
            "200": {
              description: "Ok",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      $ref: "#/components/schemas/PetItem",
                    },
                    "x-cadl-name": "Pet[]",
                  },
                },
              },
            },
          },
        },
      },
    });

    deepStrictEqual(res.components.schemas, {
      PetCreate: {
        type: "object",
        properties: {
          name: {
            type: "string",
          },
        },
        required: ["name"],
      },
      Pet: {
        type: "object",
        properties: {
          id: {
            type: "string",
          },
          name: {
            type: "string",
          },
        },
        required: ["id", "name"],
      },
      PetItem: {
        type: "object",
        properties: {
          etag: {
            type: "string",
          },
          id: {
            type: "string",
          },
          name: {
            type: "string",
          },
        },
        required: ["etag", "id", "name"],
      },
    });
  });
});
