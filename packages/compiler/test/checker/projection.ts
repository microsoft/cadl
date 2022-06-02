import { ok, strictEqual } from "assert";
import { Program } from "../../core/program.js";
import {
  DecoratorArgumentValue,
  DecoratorContext,
  EnumType,
  InterfaceType,
  ModelType,
  NumericLiteralType,
  OperationType,
  ProjectionApplication,
  StringLiteralType,
  Type,
  UnionType,
} from "../../core/types.js";
import { getDoc } from "../../lib/decorators.js";
import { createTestHost, TestHost } from "../../testing/index.js";

describe("cadl: projections", () => {
  let testHost: TestHost;

  beforeEach(async () => {
    testHost = await createTestHost();
  });

  it("projects nested namespaces", async () => {
    const code = `
     namespace Bar.Baz;
     @test model Foo {
       a: string;
       b: int32;
     }

     #suppress "projections-are-experimental"
     projection Foo#v {
        to(version) {
          if version <= 1 {
            self::deleteProperty("a");
          };

          if version <= 2 {
            self::deleteProperty("b");
          };
        }
      }
     `;
    const result = (await testProjection(code, [projection("v", 1)])) as ModelType;
    strictEqual(
      result.namespace?.namespace?.name,
      "Bar",
      "Projections do not preserve Namespace parent relationships."
    );
  });

  it("takes parameters", async () => {
    const code = `
      @test model Foo {
        a: int32;
        b: int16;
        c: string;
      }

      #suppress "projections-are-experimental"
      projection Foo#v {
        to(version) {
          if version <= 1 {
            self::deleteProperty("c");
          };

          if version <= 2 {
            self::deleteProperty("b");
          };
        }
      }
    `;

    const result = (await testProjection(code, [projection("v", 1)])) as ModelType;
    strictEqual(result.properties.size, 1);

    const result2 = (await testProjection(code, [projection("v", 2)])) as ModelType;
    strictEqual(result2.properties.size, 2);
  });

  it("can call decorators", async () => {
    const code = `
      @test model Foo {
        a: int32;
      }

      #suppress "projections-are-experimental"
      projection Foo#test {
        to {
          @doc(self, "This is a model Foo");
          @doc(self.a, "Prop");
        }
      }
    `;
    const result = (await testProjection(code)) as ModelType;
    strictEqual(getDoc(testHost.program, result), "This is a model Foo");
    strictEqual(getDoc(testHost.program, result.properties.get("a")!), "Prop");
  });

  it("projects decorated types before projecting", async () => {
    let props;
    testHost.addJsFile("test.js", {
      $checkPropCount(_: Program, t: ModelType) {
        props = t.properties.size;
      },
    });
    const code = `
      import "./test.js";
      model Bar {
        a: int32;
      }

      #suppress "projections-are-experimental"
      projection Bar#munge {
        to {
         self::deleteProperty("a");
        }
      }

      @checkPropCount(Bar) @test model Foo { };
    `;

    await testProjection(code);
    strictEqual(props, 0);
  });

  it("imported js functions are in-scope", async () => {
    testHost.addJsFile("test.js", {
      foo() {
        return 1;
      },
    });

    const code = `
        import "./test.js";
        @test model Foo { }

        #suppress "projections-are-experimental"
        projection Foo#test {
          to {
            self::addProperty("value", foo());
          }
        }
      `;

    const result = (await testProjection(code)) as ModelType;
    const value = result.properties.get("value");
    ok(value);
    strictEqual(value.type.kind, "Number");
  });

  describe("models", () => {
    it("works for versioning", async () => {
      const addedOnKey = Symbol("addedOn");
      const removedOnKey = Symbol("removedOn");
      const renamedFromKey = Symbol("renamedFrom");
      testHost.addJsFile("versioning.js", {
        $added({ program }: DecoratorContext, t: Type, v: NumericLiteralType) {
          program.stateMap(addedOnKey).set(t, v);
        },
        $removed({ program }: DecoratorContext, t: Type, v: NumericLiteralType) {
          program.stateMap(removedOnKey).set(t, v);
        },
        $renamedFrom(
          { program }: DecoratorContext,
          t: Type,
          v: NumericLiteralType,
          oldName: StringLiteralType
        ) {
          const record = { v, oldName };
          program.stateMap(renamedFromKey).set(t, record);
        },
        getAddedOn(p: Program, t: Type) {
          return p.stateMap(addedOnKey).get(t.projectionSource ?? t) || -1;
        },
        getRemovedOn(p: Program, t: Type) {
          return p.stateMap(removedOnKey).get(t.projectionSource ?? t) || Infinity;
        },
        getRenamedFromVersion(p: Program, t: Type) {
          return p.stateMap(renamedFromKey).get(t.projectionSource ?? t)?.v ?? -1;
        },
        getRenamedFromOldName(p: Program, t: Type) {
          return p.stateMap(renamedFromKey).get(t.projectionSource ?? t)?.oldName || "";
        },
      });

      const code = `
        import "./versioning.js";

        @test model Foo {
          a: int32;
          @added(2) b: int16;
          @added(3) c: string;
          @removed(2) d: string;
          e: {
            x: string;
            @added(2) y: string;
          };
          @renamedFrom(2, "oldName") newName: string;
        }

        #suppress "projections-are-experimental"
        projection model#v {
          to(version) {
            if getAddedOn(self) > version {
              return void;
            } else {
              self::properties::forEach((p) => {
                if getAddedOn(p) > version {
                  self::deleteProperty(p::name);
                } else if getRemovedOn(p) <= version {
                  self::deleteProperty(p::name);
                } else if getRenamedFromVersion(p) > version {
                  self::renameProperty(p::name, getRenamedFromOldName(p));
                };
              });
            };
          }
          from(version) {
          }
        }
      `;

      const result = (await testProjection(code, [projection("v", 1)])) as ModelType;
      strictEqual(result.properties.size, 4);
      const resultNested = result.properties.get("e")!.type as ModelType;
      strictEqual(resultNested.properties.size, 1);

      const result2 = (await testProjection(code, [projection("v", 2)])) as ModelType;
      strictEqual(result2.properties.size, 4);
      const resultNested2 = result2.properties.get("e")!.type as ModelType;
      strictEqual(resultNested2.properties.size, 2);
    });

    it("can recursively apply projections to nested models", async () => {
      const code = `
        @test model Foo {
          prop_one: {
            nested_prop: string;
          };
        }
        
        #suppress "projections-are-experimental"
        projection model#test {
          to {
            self::properties::forEach((p) => {
              self::renameProperty(p::name, p::name::toCamelCase());
            });
          }
          from {
            self::properties::forEach((p) => {
              self::renameProperty(p::name, p::name::toSnakeCase());
            });
          }
        }
        `;

      const result = (await testProjection(code)) as ModelType;
      const propOne = result.properties.get("propOne")!;
      ok(propOne, "has propOne");
      const nestedProp = (propOne.type as ModelType).properties.get("nestedProp")!;
      ok(nestedProp, "has nestedProp");

      const backResult = (await testProjection(
        code,
        [projection("test", [], "from")],
        result
      )) as ModelType;

      const prop_one = backResult.properties.get("prop_one")!;
      ok(prop_one, "has prop_one");
      const nested_prop = (prop_one.type as ModelType).properties.get("nested_prop")!;
      ok(nested_prop, "has nested_prop");
    });

    it("can replace itself", async () => {
      const code = `
        @test model Foo {
          prop: string;
        }
        
        #suppress "projections-are-experimental"
        projection Foo#test {
          to {
            if 1 {
              return void;
            };
          }
          from {
            return void;
          }
        }`;

      const result = (await testProjection(code)) as ModelType;
      strictEqual(result.kind, "Intrinsic");
      strictEqual(result.name, "void");
    });

    describe("renaming properties", () => {
      async function testRenameProjection(verb: string, modelCode?: string): Promise<ModelType> {
        const defaultModelCode = `
          @test model Foo {
            foo_prop: string;
            bar_prop: string;
          }
        `;
        const code = `
          ${modelCode ?? defaultModelCode}
          #suppress "projections-are-experimental"
          projection Foo#test {
            to {
              self::properties::forEach((p) => {
                self::renameProperty(p::name, p::name::${verb}());
              });
            }
          }
        `;
        return (await testProjection(code)) as ModelType;
      }

      it("can round trip", async () => {
        const code = `
          @test model Foo {
            foo_prop: string;
            bar_prop: int32;
          }

          #suppress "projections-are-experimental"
          projection model#toCamelCase {
            to {
              self::properties::forEach((p) => {
                self::renameProperty(p::name, p::name::toCamelCase());
              });
            }
            from {
              self::properties::forEach((p) => {
                self::renameProperty(p::name, p::name::toSnakeCase());
              });
            }
          }
          `;
        const cased = (await testProjection(code, [projection("toCamelCase")])) as ModelType;
        ok(cased.properties.has("fooProp"));
        ok(cased.properties.has("barProp"));
        const uncased = (await testProjection(
          code,
          [projection("toCamelCase", [], "from")],
          cased
        )) as ModelType;
        ok(uncased.properties.has("foo_prop"));
        ok(uncased.properties.has("bar_prop"));
      });

      it("can camel case", async () => {
        const projected = await testRenameProjection("toCamelCase");
        strictEqual(projected.properties.size, 2);
        const foo = projected.properties.get("fooProp");
        ok(foo);
        strictEqual(foo.name, "fooProp");
        const bar = projected.properties.get("barProp");
        ok(bar);
        strictEqual(bar.name, "barProp");
      });

      it("can pascal case", async () => {
        const projected = await testRenameProjection("toPascalCase");

        strictEqual(projected.properties.size, 2);
        const foo = projected.properties.get("FooProp");
        ok(foo);
        strictEqual(foo.name, "FooProp");
        const bar = projected.properties.get("BarProp");
        ok(bar);
        strictEqual(bar.name, "BarProp");
      });

      it("can snake case", async () => {
        const projected = await testRenameProjection(
          "toSnakeCase",
          `@test model Foo { fooProp: string, barProp: string }`
        );

        strictEqual(projected.properties.size, 2);
        const foo = projected.properties.get("foo_prop");
        ok(foo);
        strictEqual(foo.name, "foo_prop");
        const bar = projected.properties.get("bar_prop");
        ok(bar);
        strictEqual(bar.name, "bar_prop");
      });

      it("can kebab case", async () => {
        const projected = await testRenameProjection("toKebabCase");

        strictEqual(projected.properties.size, 2);
        const foo = projected.properties.get("foo-prop");
        ok(foo);
        strictEqual(foo.name, "foo-prop");
        const bar = projected.properties.get("bar-prop");
        ok(bar);
        strictEqual(bar.name, "bar-prop");
      });
    });
  });

  describe("unions", () => {
    const unionCode = `
      @test union Foo {
        bar_prop: int32;
        baz_prop: string;
      }
    `;

    const defaultCode = (body: string) => `
      ${unionCode}
      ${projectionCode(body)}
    `;

    function assertHasVariant(union: UnionType, name: string) {
      const variant = union.variants.get(name);
      ok(variant, `Union ${union.name ?? "anonymous"} should have variant named ${name}`);
      strictEqual(variant.name, name);
    }

    function assertVariantType(union: UnionType, variantName: string, typeName: string) {
      assertHasVariant(union, variantName);
      const variant = union.variants.get(variantName)!;
      strictEqual((variant.type as ModelType).name, typeName);
    }

    it("can rename variants", async () => {
      const code = defaultCode(`
        self::variants::forEach((v) => {
          self::renameVariant(v::name, v::name::toCamelCase());
        });
      `);

      const result = (await testProjection(code)) as UnionType;
      assertHasVariant(result, "barProp");
      assertHasVariant(result, "bazProp");
    });

    it("can set variant types", async () => {
      const code = defaultCode(`
        self.bar_prop::setType(int16);
      `);
      const result = (await testProjection(code)) as UnionType;
      assertVariantType(result, "bar_prop", "int16");
    });
    it("can add variant types", async () => {
      const code = defaultCode(`
        self::addVariant("new", int16);
      `);
      const result = (await testProjection(code)) as UnionType;
      assertVariantType(result, "new", "int16");
    });
    it("can remove variant types", async () => {
      const code = defaultCode(`
        self::deleteVariant("bar_prop");
      `);
      const result = (await testProjection(code)) as UnionType;
      ok(!result.variants.has("bar_prop"));
    });

    it("removes variants projected to never", async () => {
      const code = `
        model Bar { }
        @test union Foo {
          a: string;
          b: Bar;
        }
        #suppress "projections-are-experimental"
        projection Bar#test {
          to {
            return never;
          }
        }
      `;

      const result = (await testProjection(code)) as UnionType;
      strictEqual(result.variants.size, 1);
      ok(result.variants.has("a"));
      ok(!result.variants.has("b"));
    });
  });

  describe("operations", () => {
    it("can access parameters and return type", async () => {
      testHost.addCadlFile(
        "main.cadl",
        `
        @test op Foo(): void;
        
        #suppress "projections-are-experimental"
        projection op#test {
          to {
            return { x: self::parameters, y: self::returnType };
          }
        }
        `
      );
      const { Foo } = (await testHost.compile("main.cadl")) as { Foo: OperationType };
      const result = testHost.program.checker.project(Foo, Foo.projections[0].to!) as ModelType;
      strictEqual(result.properties.get("x")!.type.kind, "Model");
      strictEqual(result.properties.get("y")!.type.kind, "Intrinsic");
    });
  });

  describe("interfaces", () => {
    const interfaceCode = `
      @test interface Foo {
        op1(): void;
      }
    `;

    const defaultCode = (body: string) => `
      ${interfaceCode}
      ${projectionCode(body)}
    `;

    it("can add members", async () => {
      const code = defaultCode(`self::addOperation("bar", {param: string}, void);`);
      const FooProj = (await testProjection(code)) as InterfaceType;
      const newOp = FooProj.operations.get("bar");
      ok(newOp);
      strictEqual(newOp.parameters.properties.size, 1);
      strictEqual(newOp.returnType.kind, "Intrinsic");
    });

    it("can remove members", async () => {
      const code = defaultCode(`self::deleteOperation("op1");`);
      const FooProj = (await testProjection(code)) as InterfaceType;

      strictEqual(FooProj.operations.size, 0);
    });

    it("can rename members", async () => {
      const code = defaultCode(`self::renameOperation("op1", "op2");`);
      const FooProj = (await testProjection(code)) as InterfaceType;

      ok(FooProj.operations.get("op2"));
    });
  });

  describe("enums", () => {
    const enumCode = `
      @test enum Foo {
        one: 1;
        two: 2;
      }
    `;

    const defaultCode = (body: string) => `
      ${enumCode}
      ${projectionCode(body)}
    `;

    it("can add members", async () => {
      const code = defaultCode(`self::addMember("three", 3);`);
      const result = (await testProjection(code)) as EnumType;
      strictEqual(result.members.length, 3);
      const newMember = result.members[2];
      strictEqual(newMember.name, "three");
      strictEqual(newMember.value, 3);
    });
    it("can delete members", async () => {
      const code = defaultCode(`self::deleteMember("two");`);
      const result = (await testProjection(code)) as EnumType;
      strictEqual(result.members.length, 1);
    });
    it("can rename members", async () => {
      const code = defaultCode(`self::renameMember("two", "mewtwo");`);
      const result = (await testProjection(code)) as EnumType;
      const newMember = result.members[1];
      strictEqual(newMember.name, "mewtwo");
    });
  });

  describe("arrays", () => {
    it("can get element type", async () => {
      const code = `
        @test model Foo {
          x: string[];
        }

        #suppress "projections-are-experimental"
        projection Foo#test {
          to {
            return self.x::type::elementType;
          }
        }
      `;

      const result = (await testProjection(code)) as ModelType;
      strictEqual(result.name, "string");
    });
  });

  const projectionCode = (body: string) => `
      #suppress "projections-are-experimental"
      projection Foo#test {
        to {
          ${body}
        }
      }

    `;
  async function testProjection(
    code: string,
    projections: ProjectionApplication[] = [
      {
        arguments: [],
        projectionName: "test",
      },
    ],
    startNode?: Type
  ): Promise<Type> {
    testHost.addCadlFile("main.cadl", code);
    const { Foo } = await testHost.compile("main.cadl");
    const projector = testHost.program.enableProjections(projections, startNode);
    return projector.projectedTypes.get(startNode ?? Foo)!;
  }
});

function projection(
  projectionName: string,
  args: DecoratorArgumentValue[] | DecoratorArgumentValue = [],
  direction: "to" | "from" = "to"
): ProjectionApplication {
  return {
    arguments: Array.isArray(args) ? args : [args],
    projectionName,
    direction,
  };
}
