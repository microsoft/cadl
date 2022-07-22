import { expectDiagnosticEmpty } from "@cadl-lang/compiler/testing";
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

  it("routeReset enables an operation to override entire route", async () => {
    const routes = await getRoutesFor(
      `
      @route("/things")
      namespace Things {
        @get op GetThing(): string;

        @routeReset("/createThing/{thingId}")
        @put op CreateThing(@path thingId: string): string;
      }
      `
    );

    deepStrictEqual(routes, [
      { verb: "get", path: "/things", params: [] },
      { verb: "put", path: "/createThing/{thingId}", params: ["thingId"] },
    ]);
  });

  it("routeReset enables a container to reset route prefix for all contained operations", async () => {
    const routes = await getRoutesFor(
      `
      @route("/things")
      namespace Things {
        @get op GetThing(): string;

        @route("/{thingId}")
        @put op CreateThing(@path thingId: string): string;

        @routeReset("/newRoot/{thingId}/subthings")
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
      { verb: "get", path: "/newRoot/{thingId}/subthings", params: ["thingId"] },
      {
        verb: "post",
        path: "/newRoot/{thingId}/subthings/{subthingId}",
        params: ["thingId", "subthingId"],
      },
    ]);
  });

  it("routeReset can be used on an autoRoute container", async () => {
    const routes = await getRoutesFor(
      `
      @route("/things")
      namespace Things {
        @autoRoute
        @routeReset("/newRoot")
        interface Subthing {
          @segment("subthings")
          @get GetSubthing(
            @segment("things")
            @path thingId: string
          ): string;

          @post CreateSubthing(
            @segment("things")
            @path thingId: string,

            @segment("subthings")
            @path subthingId: string
          ): string;
        }
      }
      `
    );

    deepStrictEqual(routes, [
      { verb: "get", path: "/newRoot/things/{thingId}/subthings", params: ["thingId"] },
      {
        verb: "post",
        path: "/newRoot/things/{thingId}/subthings/{subthingId}",
        params: ["thingId", "subthingId"],
      },
    ]);
  });

  it("route and routeReset decorators can override autoRoute on operations", async () => {
    const routes = await getRoutesFor(
      `
      @route("/service")
      namespace Things {
        @autoRoute
        @post op CreateThingBase<TResponse>(
          @segment("things")
          @path thingId: string
        ): TResponse;

        op CreateThing is CreateThingBase<{}>;

        @route("/nonReset/{thingId}")
        op NotResetCreateThing is CreateThingBase<{}>;

        @routeReset("/reset/{thingId}")
        op ResetCreateThing is CreateThingBase<{}>;
      }
      `
    );

    deepStrictEqual(routes, [
      { verb: "post", path: "/service/things/{thingId}", params: ["thingId"] },
      { verb: "post", path: "/service/nonReset/{thingId}", params: ["thingId"] },
      { verb: "post", path: "/reset/{thingId}", params: ["thingId"] },
    ]);
  });

  it("join empty route segments correctly", async () => {
    const routes = await getRoutesFor(
      `
      @route("")
      interface Foo {
        @get @route("") index(): {};
      }
      `
    );

    deepStrictEqual(routes, [{ verb: "get", path: "/", params: [] }]);
  });

  it("join / route segments correctly", async () => {
    const routes = await getRoutesFor(
      `
      @route("/")
      interface Foo {
        @get @route("/") index(): {};
      }
      `
    );

    deepStrictEqual(routes, [{ verb: "get", path: "/", params: [] }]);
  });

  it("always produces a route starting with /", async () => {
    const routes = await getRoutesFor(
      `
      @get
      @route(":action")
      op colonRoute(): {};

      @get
      @autoRoute
      @segment("actionTwo")
      @segmentSeparator(":")
      op separatorRoute(): {};
      `
    );

    deepStrictEqual(routes, [
      { verb: "get", path: "/:action", params: [] },
      { verb: "get", path: "/:actionTwo", params: [] },
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
        @get
        @action
        op ActionOne(...ThingId): string;

        @action("customActionTwo")
        @put op ActionTwo(...ThingId): string;

        @action
        op ActionThree(...ThingId, @body bodyParam: string): string;
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

  it("models with non-required key property will produce required path parameter for key", async () => {
    const [routes, diagnostics] = await compileOperations(`
      using Cadl.Rest.Resource;

      namespace Things {
        model Thing {
          @key
          @segment("things")
          thingId?: string;
        }

        @autoRoute
        @get op GetThingWithParams(...KeysOf<Thing>): string;
      }
      `);

    deepStrictEqual(routes, [
      {
        verb: "get",
        path: "/things/{thingId}",
        params: { body: undefined, params: [{ name: "thingId", type: "path" }] },
      },
    ]);
    expectDiagnosticEmpty(diagnostics);
  });

  it("autoRoute operations filter out path parameters with a string literal type", async () => {
    const routes = await getRoutesFor(
      `
      model ThingId {
        @path
        @segment("things")
        thingId: string;
      }

      @autoRoute
      namespace Things {
        @get
        op WithFilteredParam(
          @path
          @segment("subscriptions")
          subscriptionId: string,

          @path
          @segment("providers")
          provider: "Microsoft.Things",
          ...ThingId
        ): string;
      }
      `
    );

    deepStrictEqual(routes, [
      {
        verb: "get",
        path: "/subscriptions/{subscriptionId}/providers/Microsoft.Things/things/{thingId}",
        params: ["subscriptionId", "thingId"],
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

      expectDiagnosticEmpty(diagnostics);
      deepStrictEqual(routes, [
        {
          verb: "get",
          path: "/test",
          params: { params: [{ type: "query", name: "select" }], body: "bodyParam" },
        },
      ]);
    });

    it("resolves single unannotated parameter as request body", async () => {
      const [routes, diagnostics] = await compileOperations(`
        @route("/test")
        @get op get(@query select: string, unannotatedBodyParam: string): string;
      `);

      expectDiagnosticEmpty(diagnostics);
      deepStrictEqual(routes, [
        {
          verb: "get",
          path: "/test",
          params: {
            params: [{ type: "query", name: "select" }],
            body: ["unannotatedBodyParam"],
          },
        },
      ]);
    });

    it("resolves multiple unannotated parameters as request body", async () => {
      const [routes, diagnostics] = await compileOperations(`
        @route("/test")
        @get op get(
          @query select: string,
          unannotatedBodyParam1: string,
          unannotatedBodyParam2: string): string;
      `);

      expectDiagnosticEmpty(diagnostics);
      deepStrictEqual(routes, [
        {
          verb: "get",
          path: "/test",
          params: {
            params: [{ type: "query", name: "select" }],
            body: ["unannotatedBodyParam1", "unannotatedBodyParam2"],
          },
        },
      ]);
    });
  });

  describe("double @route", () => {
    it("emit diagnostic if specifying route twice on operation", async () => {
      const [_, diagnostics] = await compileOperations(`
        @route("/test")
        @route("/test")
        op get(): string;
    `);
      strictEqual(diagnostics.length, 1);
      strictEqual(diagnostics[0].code, "@cadl-lang/rest/duplicate-route-decorator");
      strictEqual(diagnostics[0].message, "@route was defined twice on this operation.");
    });

    it("emit diagnostic if specifying route twice on interface", async () => {
      const [_, diagnostics] = await compileOperations(`
        @route("/test")
        @route("/test")
        interface Foo {
          get(): string
        }
    `);
      strictEqual(diagnostics.length, 1);
      strictEqual(diagnostics[0].code, "@cadl-lang/rest/duplicate-route-decorator");
      strictEqual(diagnostics[0].message, "@route was defined twice on this interface.");
    });

    it("emit diagnostic if namespace have route but different values", async () => {
      const [_, diagnostics] = await compileOperations(`
        @route("/test1")
        namespace Foo {
          @route("/get1")
          op get1(): string;
        }

        @route("/test2")
        namespace Foo {
          @route("/get2")
          op get2(): string;
        }
    `);

      strictEqual(diagnostics.length, 1);
      strictEqual(diagnostics[0].code, "@cadl-lang/rest/duplicate-route-decorator");
      strictEqual(
        diagnostics[0].message,
        "@route was defined twice on this namespace and has different values."
      );
    });

    it("merge namespace if @route value is the same", async () => {
      const [_, diagnostics] = await compileOperations(`
        @route("/test")
        namespace Foo {
          @route("/get1")
          op get1(): string;
        }

        @route("/test")
        namespace Foo {
          @route("/get2")
          op get2(): string;
        }
    `);

      expectDiagnosticEmpty(diagnostics);
    });
  });

  it("allows customization of path parameters in generated routes", async () => {
    const routes = await getRoutesFor(
      `
      @get
      @autoRoute
      op TestRoute(
        @path
        @segment("things")
        thingId: string;

        @path
        @segment("subthings")
        subThingId: string;
      ): string;
      `,
      {
        autoRouteOptions: {
          routeParamFilter: (_, param) => {
            return {
              routeParamString: param.name === "subThingId" ? "bar" : "{foo}",
              excludeFromOperationParams: true,
            };
          },
        },
      }
    );

    deepStrictEqual(routes, [{ verb: "get", path: "/things/{foo}/subthings/bar", params: [] }]);
  });

  it("allows customization of segment separators", async () => {
    const routes = await getRoutesFor(
      `
      @autoRoute
      namespace Things {
        @action
        @segmentSeparator(":")
        @put op customAction(
          @segment("things")
          @path thingId: string
        ): string;

        @get op getAccount(
          @segment("subscriptions")
          @path subscriptionId: string;

          // Is it useful for ARM modelling?
          @path
          @segment("accounts")
          @segmentSeparator("Microsoft.Accounts/")
          accountName: string;
        ): string;
      }
      `
    );

    deepStrictEqual(routes, [
      { verb: "put", path: "/things/{thingId}:customAction", params: ["thingId"] },
      {
        verb: "get",
        path: "/subscriptions/{subscriptionId}/Microsoft.Accounts/accounts/{accountName}",
        params: ["subscriptionId", "accountName"],
      },
    ]);
  });

  it("skips templated operations", async () => {
    const routes = await getRoutesFor(
      `
      @route("/things")
      namespace Things {
        @get op GetThingBase<TResponse>(): TResponse;
        op GetThing is GetThingBase<string>;

        @route("/{thingId}")
        @put op CreateThing(@path thingId: string): string;
      }
      `
    );

    deepStrictEqual(routes, [
      { verb: "get", path: "/things", params: [] },
      { verb: "put", path: "/things/{thingId}", params: ["thingId"] },
    ]);
  });
});
