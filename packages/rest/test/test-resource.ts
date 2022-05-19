import { expectDiagnostics } from "@cadl-lang/compiler/testing";
import { deepStrictEqual } from "assert";
import { compileOperations, createRestTestRunner, getRoutesFor } from "./test-host.js";

describe("rest: resources", () => {
  it("resources: generates standard operations for resource types and their children", async () => {
    const routes = await getRoutesFor(
      `
      using Cadl.Rest.Resource;

      namespace Things {
        model Thing {
          @key
          @segment("things")
          thingId: string;
        }

        @parentResource(Thing)
        model Subthing {
          @key
          @segment("subthings")
          subthingId: string;
        }

        @error model Error {}

        interface Things extends ResourceOperations<Thing, Error> {}
        interface Subthings extends ResourceOperations<Subthing, Error> {}
      }
      `
    );

    deepStrictEqual(routes, [
      {
        verb: "get",
        path: "/things/{thingId}",
        params: ["thingId"],
      },
      {
        verb: "patch",
        path: "/things/{thingId}",
        params: ["thingId"],
      },
      {
        verb: "delete",
        path: "/things/{thingId}",
        params: ["thingId"],
      },
      {
        verb: "post",
        path: "/things",
        params: [],
      },
      {
        verb: "get",
        path: "/things",
        params: [],
      },
      {
        verb: "get",
        path: "/things/{thingId}/subthings/{subthingId}",
        params: ["thingId", "subthingId"],
      },
      {
        verb: "patch",
        path: "/things/{thingId}/subthings/{subthingId}",
        params: ["thingId", "subthingId"],
      },
      {
        verb: "delete",
        path: "/things/{thingId}/subthings/{subthingId}",
        params: ["thingId", "subthingId"],
      },
      {
        path: "/things/{thingId}/subthings",
        verb: "post",
        params: ["thingId"],
      },
      {
        verb: "get",
        path: "/things/{thingId}/subthings",
        params: ["thingId"],
      },
    ]);
  });

  it("resources: resources with parents must not have duplicate their parents' key names", async () => {
    const [_, diagnostics] = await compileOperations(`
      using Cadl.Rest.Resource;

      namespace Things {
        model Thing {
          @key("thingId")
          @segment("things")
          id: string;
        }

        @parentResource(Thing)
        model Subthing {
          @key
          @segment("subthings")
          thingId: string;
        }

        @parentResource(Subthing)
        model SubSubthing {
          @key("thingId")
          @segment("subsubthings")
          subSubthingId: string;
        }
      }
      `);

    expectDiagnostics(diagnostics, [
      {
        code: "@cadl-lang/rest/duplicate-parent-key",
        message: `Resource type 'Subthing' has a key property named 'thingId' which is already used by parent type 'Thing'.`,
      },
      {
        code: "@cadl-lang/rest/duplicate-parent-key",
        message: `Resource type 'SubSubthing' has a key property named 'thingId' which is already used by parent type 'Subthing'.`,
      },
    ]);
  });

  it("singleton resource: generates standard operations", async () => {
    const routes = await getRoutesFor(
      `
      using Cadl.Rest.Resource;

      namespace Things {
        model Thing {
          @key
          @segment("things")
          thingId: string;
        }

        @segment("singleton")
        model Singleton {
          data: string;
        }

        @error model Error {}

        interface Things extends ResourceRead<Thing, Error> {}
        interface ThingsSingleton extends SingletonResourceOperations<Singleton, Thing, Error> {}
      }
      `
    );

    deepStrictEqual(routes, [
      {
        verb: "get",
        path: "/things/{thingId}",
        params: ["thingId"],
      },
      {
        verb: "get",
        path: "/things/{thingId}/singleton",
        params: ["thingId"],
      },
      {
        verb: "patch",
        path: "/things/{thingId}/singleton",
        params: ["thingId"],
      },
    ]);
  });

  it("extension resources: generates standard operations for extensions on parent and child resources", async () => {
    const routes = await getRoutesFor(
      `
      using Cadl.Rest.Resource;

      namespace Things {
        model Thing {
          @key
          @segment("things")
          thingId: string;
        }

        @parentResource(Thing)
        model Subthing {
          @key
          @segment("subthings")
          subthingId: string;
        }

        model Exthing {
          @key
          @segment("extension")
          exthingId: string;
        }

        @error model Error {}

        interface ThingsExtension extends ExtensionResourceOperations<Exthing, Thing, Error> {}
        interface SubthingsExtension extends ExtensionResourceOperations<Exthing, Subthing, Error> {}
      }
      `
    );

    deepStrictEqual(routes, [
      {
        verb: "get",
        path: "/things/{thingId}/extension/{exthingId}",
        params: ["thingId", "exthingId"],
      },
      {
        verb: "patch",
        path: "/things/{thingId}/extension/{exthingId}",
        params: ["thingId", "exthingId"],
      },
      {
        verb: "delete",
        path: "/things/{thingId}/extension/{exthingId}",
        params: ["thingId", "exthingId"],
      },
      {
        verb: "post",
        path: "/things/{thingId}/extension",
        params: ["thingId"],
      },
      {
        verb: "get",
        path: "/things/{thingId}/extension",
        params: ["thingId"],
      },
      {
        verb: "get",
        path: "/things/{thingId}/subthings/{subthingId}/extension/{exthingId}",
        params: ["thingId", "subthingId", "exthingId"],
      },
      {
        verb: "patch",
        path: "/things/{thingId}/subthings/{subthingId}/extension/{exthingId}",
        params: ["thingId", "subthingId", "exthingId"],
      },
      {
        verb: "delete",
        path: "/things/{thingId}/subthings/{subthingId}/extension/{exthingId}",
        params: ["thingId", "subthingId", "exthingId"],
      },
      {
        verb: "post",
        path: "/things/{thingId}/subthings/{subthingId}/extension",
        params: ["thingId", "subthingId"],
      },
      {
        verb: "get",
        path: "/things/{thingId}/subthings/{subthingId}/extension",
        params: ["thingId", "subthingId"],
      },
    ]);
  });

  it("emit diagnostic if missing @key decorator on resource", async () => {
    const runner = await createRestTestRunner();
    const diagnostics = await runner.diagnose(
      `
      using Cadl.Rest.Resource;

      interface Dogs extends ResourceOperations<Dog, Error> {}

      model Dog {}
      @error model Error {code: string}
      `
    );
    expectDiagnostics(diagnostics, {
      code: "@cadl-lang/rest/resource-missing-key",
      message:
        "Type 'Dog' is used as a resource and therefore must have a key. Use @key to designate a property as the key.",
    });
  });

  it("emit diagnostic if missing @error decorator on error", async () => {
    const runner = await createRestTestRunner();
    const diagnostics = await runner.diagnose(
      `
      using Cadl.Rest.Resource;

      interface Dogs extends ResourceOperations<Dog, Error> {}
      
      model Dog {
        @key foo: string
      }
      model Error {code: string}
      `
    );
    expectDiagnostics(diagnostics, {
      code: "@cadl-lang/rest/resource-missing-error",
      message:
        "Type 'Error' is used as an error and therefore must have the @error decorator applied.",
    });
  });
});
