import { ModelType, NamespaceType, Program } from "@cadl-lang/compiler";
import {
  BasicTestRunner,
  createTestWrapper,
  expectDiagnosticEmpty,
  expectDiagnostics,
} from "@cadl-lang/compiler/testing";
import { ok, strictEqual } from "assert";
import { buildVersionProjections } from "../src/versioning.js";
import { createVersioningTestHost } from "./test-host.js";
import { assertHasProperties } from "./utils.js";

describe("versioning: reference versioned library", () => {
  let runner: BasicTestRunner;

  beforeEach(async () => {
    const host = await createVersioningTestHost();
    runner = createTestWrapper(
      host,
      (code) => `
      import "@cadl-lang/versioning";

      @versioned("1" | "2")
      namespace VersionedLib {
        model Foo {
          name: string;
          @added("2") age: int32;
        }
      }
      ${code}`
    );
  });

  function assertFooV1(foo: ModelType) {
    ok(foo.properties.has("name"));
    ok(!foo.properties.has("age"), "Age was added in version 2 and version 1 was selected.");
  }

  function assertFooV2(Foo: ModelType) {
    ok(Foo.properties.has("name"));
    ok(Foo.properties.has("age"), "Age was added in version 2 and version 1 was selected.");
  }

  describe("when project is not-versioned", () => {
    it("use a versioned library given version", async () => {
      const { MyService, Test } = (await runner.compile(`
        @versionedDependency(VersionedLib, "1")
        @test namespace MyService {
          @test model Test extends VersionedLib.Foo {}
        } 
    `)) as { MyService: NamespaceType; Test: ModelType };
      const versions = buildVersionProjections(runner.program, MyService);
      strictEqual(versions.length, 1);
      strictEqual(versions[0].version, undefined);
      strictEqual(versions[0].projections.length, 1);

      const projector = runner.program.enableProjections(versions[0].projections, Test);
      const Foo = (projector.projectedTypes.get(Test) as any).baseModel;

      assertFooV1(Foo);
    });

    it("emit diagnostic if passing version mapping", async () => {
      const diagnostics = await runner.diagnose(`
        @versionedDependency(VersionedLib, {v1: "1", v2: "2"})
        namespace MyService {
          model Test extends VersionedLib.Foo {}
        } 
    `);
      expectDiagnostics(diagnostics, {
        code: "@cadl-lang/versioning/versioned-dependency-not-string",
        message:
          "The versionedDependency decorator must provide a version of the dependency 'VersionedLib'.",
      });
    });
  });

  describe("when project is versioned", () => {
    it("use a versioned library given version", async () => {
      const { MyService, Test } = (await runner.compile(`
        @versioned("v1" | "v2")
        @versionedDependency(VersionedLib, {v1: "1", v2: "2"})
        @test namespace MyService {
          @test model Test extends VersionedLib.Foo {}
        } 
    `)) as { MyService: NamespaceType; Test: ModelType };
      const versions = buildVersionProjections(runner.program, MyService);
      strictEqual(versions.length, 2);
      strictEqual(versions[0].version, "v1");
      strictEqual(versions[1].version, "v2");

      const projectorV1 = runner.program.enableProjections(versions[0].projections, Test);
      const FooV1 = (projectorV1.projectedTypes.get(Test) as any).baseModel;

      assertFooV1(FooV1);

      const projectorV2 = runner.program.enableProjections(versions[1].projections, Test);
      const FooV2 = (projectorV2.projectedTypes.get(Test) as any).baseModel;
      assertFooV2(FooV2);
    });

    it("emit diagnostic if passing a specific version", async () => {
      const diagnostics = await runner.diagnose(`
        @versioned("v1" | "v2")
        @versionedDependency(VersionedLib, "1")
        namespace MyService {
          model Test extends VersionedLib.Foo {}
        } 
    `);
      expectDiagnostics(diagnostics, {
        code: "@cadl-lang/versioning/versioned-dependency-record-not-model",
        message:
          "The versionedDependency decorator must provide a model mapping local versions to dependency 'VersionedLib' versions",
      });
    });
  });

  describe("when using versioned library without @versionedDependency", () => {
    it("emit diagnostic when used in extends", async () => {
      const diagnostics = await runner.diagnose(`
        namespace MyService {
          model Test extends VersionedLib.Foo {}
        } 
    `);
      expectDiagnostics(diagnostics, {
        code: "@cadl-lang/versioning/using-versioned-library",
        message:
          "Namespace 'MyService' is referencing types from versioned namespace 'VersionedLib' but didn't specify which versions with @versionedDependency.",
      });
    });

    it("emit diagnostic when used in properties", async () => {
      const diagnostics = await runner.diagnose(`
        namespace MyService {
          model Test {
            foo: VersionedLib.Foo
          }
        } 
    `);
      expectDiagnostics(diagnostics, {
        code: "@cadl-lang/versioning/using-versioned-library",
        message:
          "Namespace 'MyService' is referencing types from versioned namespace 'VersionedLib' but didn't specify which versions with @versionedDependency.",
      });
    });

    it("emit diagnostic when project has no namespace", async () => {
      const diagnostics = await runner.diagnose(`
        model Test extends VersionedLib.Foo {}
    `);
      expectDiagnostics(diagnostics, {
        code: "@cadl-lang/versioning/using-versioned-library",
        message:
          "Namespace '' is referencing types from versioned namespace 'VersionedLib' but didn't specify which versions with @versionedDependency.",
      });
    });

    it("doesn't emit diagnostic when versioned library use templated type from non versioned lib", async () => {
      const diagnostics = await runner.diagnose(`
        namespace NonVersioned {
          model Foo<T> {
            foo: T;
          }
        }

        @versioned("v1" | "v2")
        namespace MyService {
          model Bar {}
          model Test extends NonVersioned.Foo<Bar> {}
        } 

    `);
      expectDiagnosticEmpty(diagnostics);
    });

    it("doesn't emit diagnostic when mixin interface of non versioned lib", async () => {
      const diagnostics = await runner.diagnose(`
        @versioned("v1" | "v2")
        namespace MyService {
          model Foo {}

          interface Test {
            test(): Foo;
          }
        } 
    `);
      expectDiagnosticEmpty(diagnostics);
    });

    it("doesn't emit diagnostic using union in non versioned lib", async () => {
      const diagnostics = await runner.diagnose(`
        @versioned("v1" | "v2")
        namespace DemoService {
          model Foo {}

          interface Test extends NonVersioned.Foo<Foo> {}
        }

        namespace NonVersioned {
          interface Foo<T> {
            foo(): T | {};
          }
        }
    `);
      expectDiagnosticEmpty(diagnostics);
    });

    it("emit diagnostic when used in properties of generic type", async () => {
      const diagnostics = await runner.diagnose(`
        namespace MyService {
          model Test<T> {
            t: T;
            foo: VersionedLib.Foo
          }
        } 
    `);
      expectDiagnostics(diagnostics, {
        code: "@cadl-lang/versioning/using-versioned-library",
        message:
          "Namespace 'MyService' is referencing types from versioned namespace 'VersionedLib' but didn't specify which versions with @versionedDependency.",
      });
    });
  });
});

describe("versioning: dependencies", () => {
  let runner: BasicTestRunner;

  beforeEach(async () => {
    const host = await createVersioningTestHost();
    runner = createTestWrapper(
      host,
      (code) => `
      import "@cadl-lang/versioning";
      ${code}`
    );
  });

  it("can spread versioned model from another library", async () => {
    const { MyService, Test } = (await runner.compile(`
      @versioned("l1" | "l2")
      namespace VersionedLib {
        model Spread<T> {
          t: string;
          ...T;
        }
      }

      @versioned("1" | "2")
      @versionedDependency(VersionedLib, {"1": "l1", "2": "l2"})
      @test namespace MyService {
        model Spreadable {
          a: int32;
          @added("2") b: int32;
        }
        @test model Test extends VersionedLib.Spread<Spreadable> {}
      }
      `)) as { MyService: NamespaceType; Test: ModelType };

    const [v1, v2] = runProjections(runner.program, MyService);

    const SpreadInstance1 = (v1.projectedTypes.get(Test) as any).baseModel;
    assertHasProperties(SpreadInstance1, ["t", "a"]);
    const SpreadInstance2 = (v2.projectedTypes.get(Test) as any).baseModel;
    assertHasProperties(SpreadInstance2, ["t", "a", "b"]);
  });

  // Todo https://github.com/microsoft/cadl/issues/466
  it.skip("can handle when the versions name are the same across different libraries", async () => {
    const { MyService, Test } = (await runner.compile(`
      @versioned("1" | "2")
      namespace VersionedLib {
        model Spread<T> {
          t: string;
          ...T;
        }
      }

      @versioned("1" | "2")
      @versionedDependency(VersionedLib, {"1": "2", "2": "1"})
      @test namespace MyService {
        model Spreadable {
          a: int32;
          @added("2") b: int32;
        }
        @test model Test extends VersionedLib.Spread<Spreadable> {}
      }
      `)) as { MyService: NamespaceType; Test: ModelType };

    const [v1, v2] = runProjections(runner.program, MyService);

    const SpreadInstance1 = (v1.projectedTypes.get(Test) as any).baseModel;
    assertHasProperties(SpreadInstance1, ["t", "a"]);
    const SpreadInstance2 = (v2.projectedTypes.get(Test) as any).baseModel;
    assertHasProperties(SpreadInstance2, ["t", "a", "b"]);
  });
});

function runProjections(program: Program, rootNs: NamespaceType) {
  const versions = buildVersionProjections(program, rootNs);
  return versions.map((x) => program.enableProjections(x.projections, rootNs));
}
