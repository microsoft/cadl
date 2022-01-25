import { deepStrictEqual, strictEqual } from "assert";
import { compileOperations, getRoutesFor } from "./test-host.js";

describe("rest: routes", () => {
  it("finds routes on bare operations", async () => {
    const routes = await getRoutesFor(
      `
      @route("/things")
      @get op GetThing(): string;

      @route("/things/{thingId}")
      @post op CreateThing(@path thingId: string): string;
      `
    );

    deepStrictEqual(routes, [
      { verb: "get", path: "/things", params: [] },
      { verb: "post", path: "/things/{thingId}", params: ["thingId"] },
    ]);
  });

  it("combines routes on namespaced bare operations", async () => {
    const routes = await getRoutesFor(
      `
      @route("/things")
      namespace Things {
        @get op GetThing(): string;

        @route("/{thingId}")
        @put op CreateThing(@path thingId: string): string;

        @route("/{thingId}/subthings")
        namespace Subthing {
          @get op GetSubthing(@path thingId: string): string;

          @route("/{subthingId}")
          @post op CreateSubthing(@path thingId: string, @path subthingId: string): string;
        }
      }
      `
    );

    deepStrictEqual(routes, [
      { verb: "get", path: "/things", params: [] },
      { verb: "put", path: "/things/{thingId}", params: ["thingId"] },
      { verb: "get", path: "/things/{thingId}/subthings", params: ["thingId"] },
      {
        verb: "post",
        path: "/things/{thingId}/subthings/{subthingId}",
        params: ["thingId", "subthingId"],
      },
    ]);
  });

  it("combines routes between namespaces and interfaces", async () => {
    const routes = await getRoutesFor(
      `
      @route("/things")
      namespace Things {
        @get op GetThing(): string;

        @route("/{thingId}")
        @put op CreateThing(@path thingId: string): string;

        @route("/{thingId}/subthings")
        interface Subthing {
          @get GetSubthing(@path thingId: string): string;

          @route("/{subthingId}")
          @post CreateSubthing(@path thingId: string, @path subthingId: string): string;
        }
      }
      `
    );

    deepStrictEqual(routes, [
      { verb: "get", path: "/things", params: [] },
      { verb: "put", path: "/things/{thingId}", params: ["thingId"] },
      { verb: "get", path: "/things/{thingId}/subthings", params: ["thingId"] },
      {
        verb: "post",
        path: "/things/{thingId}/subthings/{subthingId}",
        params: ["thingId", "subthingId"],
      },
    ]);
  });

  it("generates action route fragments when @action is applied", async () => {
    const routes = await getRoutesFor(
      `
      model ThingId {
        @path
        @segment("things")
        thingId: string;
      }

      @autoRoute
      namespace Things {
        @action
        op ActionOne(...ThingId): string;

        @action("customActionTwo")
        @put op ActionTwo(...ThingId): string;

        @action
        @post op ActionThree(...ThingId, @body bodyParam: string): string;
      }
      `
    );

    deepStrictEqual(routes, [
      { verb: "get", path: "/things/{thingId}/actionOne", params: ["thingId"] },
      { verb: "put", path: "/things/{thingId}/customActionTwo", params: ["thingId"] },
      { verb: "post", path: "/things/{thingId}/actionThree", params: ["thingId"] },
    ]);
  });

  it("automatically generates routes for operations in various scopes when specified", async () => {
    const routes = await getRoutesFor(
      `
      using Cadl.Rest.Resource;

      @route("/api")
      namespace Things {
        model Thing {
          @key
          @segment("things")
          thingId: string;
        }

        model Subthing {
          @key
          @segment("subthings")
          subthingId: string;
        }

        @get op GetThing(): string;

        @autoRoute
        @get op GetThingWithParams(...KeysOf<Thing>): string;

        @autoRoute
        namespace SubNamespace {
          @put op CreateThing(...KeysOf<Thing>): string;
        }

        @autoRoute
        interface SubInterface {
          @get
          @list(Subthing)
          @segmentOf(Subthing)
          GetSubthings(...KeysOf<Thing>): string;

          @post CreateSubthing(...KeysOf<Thing>, ...KeysOf<Subthing>): string;
        }
      }
      `
    );

    deepStrictEqual(routes, [
      { verb: "get", path: "/api", params: [] },
      { verb: "get", path: "/api/things/{thingId}", params: ["thingId"] },
      { verb: "put", path: "/api/things/{thingId}", params: ["thingId"] },
      { verb: "get", path: "/api/things/{thingId}/subthings", params: ["thingId"] },
      {
        verb: "post",
        path: "/api/things/{thingId}/subthings/{subthingId}",
        params: ["thingId", "subthingId"],
      },
    ]);
  });

  it("emit diagnostics if operation has a body but didn't specify the verb", async () => {
    const [_, diagnostics] = await compileOperations(`
        @route("/test")
        op get(@body body: string): string;
    `);
    strictEqual(diagnostics.length, 1);
    strictEqual(diagnostics[0].code, "@cadl-lang/rest/http-verb-missing-with-body");
    strictEqual(diagnostics[0].message, "Operation get has a body but doesn't specify a verb.");
  });

  it("emit diagnostics if 2 operation have the same path and verb", async () => {
    const [_, diagnostics] = await compileOperations(`
        @route("/test")
        op get1(): string;

        @route("/test")
        op get2(): string;
    `);

    // Has one diagnostic per duplicate operation
    strictEqual(diagnostics.length, 2);
    strictEqual(diagnostics[0].code, "@cadl-lang/rest/duplicate-operation");
    strictEqual(diagnostics[0].message, `Duplicate operation "get1" routed at "get /test".`);
    strictEqual(diagnostics[1].code, "@cadl-lang/rest/duplicate-operation");
    strictEqual(diagnostics[1].message, `Duplicate operation "get2" routed at "get /test".`);
  });

  describe("operation parameters", () => {
    it("emit diagnostic for parameters with multiple http request annotations", async () => {
      const [_, diagnostics] = await compileOperations(`
        @route("/test")
        @get op get(@body body: string, @path @query multiParam: string): string;
      `);

      strictEqual(diagnostics.length, 1);
      strictEqual(diagnostics[0].code, "@cadl-lang/rest/operation-param-duplicate-type");
      strictEqual(diagnostics[0].message, "Param multiParam has multiple types: [query, path]");
    });

    it("emit diagnostic when there are multiple unannotated parameters", async () => {
      const [_, diagnostics] = await compileOperations(`
        @route("/test")
        @get op get(param1: string, param2: string): string;
      `);

      strictEqual(diagnostics.length, 1);
      strictEqual(diagnostics[0].code, "@cadl-lang/rest/duplicate-body");
      strictEqual(
        diagnostics[0].message,
        "Operation has multiple unannotated parameters. There can only be one representing the body"
      );
    });

    it("emit diagnostic when there is an unannotated parameter and a @body param", async () => {
      const [_, diagnostics] = await compileOperations(`
        @route("/test")
        @get op get(param1: string, @body param2: string): string;
      `);

      strictEqual(diagnostics.length, 1);
      strictEqual(diagnostics[0].code, "@cadl-lang/rest/duplicate-body");
      strictEqual(
        diagnostics[0].message,
        "Operation has a @body and an unannotated parameter. There can only be one representing the body"
      );
    });

    it("emit diagnostic when there are multiple @body param", async () => {
      const [_, diagnostics] = await compileOperations(`
        @route("/test")
        @get op get(@query select: string, @body param1: string, @body param2: string): string;
      `);

      strictEqual(diagnostics.length, 1);
      strictEqual(diagnostics[0].code, "@cadl-lang/rest/duplicate-body");
      strictEqual(diagnostics[0].message, "Operation has multiple @body parameters declared");
    });

    it("resolve body when defined with @body", async () => {
      const [routes, diagnostics] = await compileOperations(`
        @route("/test")
        @get op get(@query select: string, @body bodyParam: string): string;
      `);

      strictEqual(diagnostics.length, 0);
      deepStrictEqual(routes, [
        {
          verb: "get",
          path: "/test",
          params: { params: [{ type: "query", name: "select" }], body: "bodyParam" },
        },
      ]);
    });

    it("resolves a single unannotated parameter as request body", async () => {
      const [routes, diagnostics] = await compileOperations(`
        @route("/test")
        @get op get(@query select: string, unannotedBodyParam: string): string;
      `);

      strictEqual(diagnostics.length, 0);
      deepStrictEqual(routes, [
        {
          verb: "get",
          path: "/test",
          params: { params: [{ type: "query", name: "select" }], body: "unannotedBodyParam" },
        },
      ]);
    });
  });
});
