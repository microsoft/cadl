import { ok, strictEqual } from "assert";
import { Binder, createBinder } from "../core/binder.js";
import { createSourceFile } from "../core/diagnostics.js";
import { parse } from "../core/parser.js";
import { Program } from "../core/program.js";
import {
  AliasStatementNode,
  InterfaceStatementNode,
  JsSourceFileNode,
  ModelStatementNode,
  NodeFlags,
  ProjectionExpressionStatement,
  ProjectionLambdaExpressionNode,
  ProjectionStatementNode,
  Sym,
  SymbolFlags,
  SymbolTable,
  SyntaxKind,
  UnionStatementNode,
} from "../core/types.js";

describe("compiler: binder", () => {
  let binder: Binder;
  beforeEach(() => {
    binder = createBinder(createProgramShim());
  });

  it("binds blockless namespaces", () => {
    const code = `
      namespace A.B;
      namespace C {

      }
      model D { }
    `;
    const script = bindCadl(code);
    strictEqual(script.namespaces.length, 3);
    assertBindings("root", script.symbol.exports!, {
      A: {
        declarations: [SyntaxKind.NamespaceStatement],
        flags: SymbolFlags.Namespace,
        exports: {
          B: {
            flags: SymbolFlags.Namespace,
            exports: {
              C: {
                flags: SymbolFlags.Namespace,
                exports: {},
              },
              D: {
                flags: SymbolFlags.Model,
              },
            },
          },
        },
      },
    });
  });
  it("binds namespaces", () => {
    const code = `
      namespace A {
        namespace B {

        }
      }
    `;
    const script = bindCadl(code);
    strictEqual(script.namespaces.length, 2);
    assertBindings("root", script.symbol.exports!, {
      A: {
        declarations: [SyntaxKind.NamespaceStatement],
        flags: SymbolFlags.Namespace,
        exports: {
          B: {
            flags: SymbolFlags.Namespace,
            exports: {},
          },
        },
      },
    });
  });

  it("binds duplicate namespaces declared in the same file", () => {
    const code = `
      namespace test;
      namespace A {
        namespace B {

        }

        op get1() { }
      }

      namespace A {
        namespace B {

        }

        op get2() { }
      }
    `;
    const script = bindCadl(code);
    strictEqual(script.namespaces.length, 5);
    assertBindings("root", script.symbol.exports!, {
      test: {
        declarations: [SyntaxKind.NamespaceStatement],
        flags: SymbolFlags.Namespace,
        exports: {
          A: {
            declarations: [SyntaxKind.NamespaceStatement, SyntaxKind.NamespaceStatement],
            flags: SymbolFlags.Namespace,
            exports: {
              B: {
                declarations: [SyntaxKind.NamespaceStatement, SyntaxKind.NamespaceStatement],
                flags: SymbolFlags.Namespace,
                exports: {},
              },
              get1: {
                flags: SymbolFlags.Operation,
              },
              get2: {
                flags: SymbolFlags.Operation,
              },
            },
          },
        },
      },
    });
  });

  it("binds models", () => {
    const code = `
      namespace A {
        model A { }
      }

      model B<Foo, Bar> { }
    `;
    const script = bindCadl(code);
    strictEqual(script.namespaces.length, 1);
    assertBindings("root", script.symbol.exports!, {
      A: {
        declarations: [SyntaxKind.NamespaceStatement],
        flags: SymbolFlags.Namespace,
        exports: {
          A: {
            flags: SymbolFlags.Model,
          },
        },
      },
      B: {
        declarations: [SyntaxKind.ModelStatement],
        flags: SymbolFlags.Model,
      },
    });

    const BNode = script.statements[1] as ModelStatementNode;
    assertBindings("B", BNode.locals!, {
      Foo: { flags: SymbolFlags.TemplateParameter },
      Bar: { flags: SymbolFlags.TemplateParameter },
    });
  });
  it("binds enums", () => {
    const code = `
      namespace A {
        enum A { }
      }

      enum B { }
    `;
    const script = bindCadl(code);
    strictEqual(script.namespaces.length, 1);
    assertBindings("root", script.symbol.exports!, {
      A: {
        declarations: [SyntaxKind.NamespaceStatement],
        flags: SymbolFlags.Namespace,
        exports: {
          A: {
            flags: SymbolFlags.Enum,
          },
        },
      },
      B: {
        declarations: [SyntaxKind.EnumStatement],
        flags: SymbolFlags.Enum,
      },
    });
  });

  it("binds operations", () => {
    const code = `
      namespace A {
        op Foo(): void;
      }

      op Foo(): void
    `;
    const script = bindCadl(code);
    strictEqual(script.namespaces.length, 1);
    assertBindings("root", script.symbol.exports!, {
      A: {
        declarations: [SyntaxKind.NamespaceStatement],
        flags: SymbolFlags.Namespace,
        exports: {
          Foo: {
            declarations: [SyntaxKind.OperationStatement],
            flags: SymbolFlags.Operation,
          },
        },
      },
      Foo: {
        declarations: [SyntaxKind.OperationStatement],
        flags: SymbolFlags.Operation,
      },
    });
  });

  it("binds interfaces", () => {
    const code = `
      namespace A {
        interface Foo { }
      }

      interface Bar<T, U> { }
    `;
    const script = bindCadl(code);
    strictEqual(script.namespaces.length, 1);
    assertBindings("root", script.symbol.exports!, {
      A: {
        declarations: [SyntaxKind.NamespaceStatement],
        flags: SymbolFlags.Namespace,
        exports: {
          Foo: {
            declarations: [SyntaxKind.InterfaceStatement],
            flags: SymbolFlags.Interface,
          },
        },
      },
      Bar: {
        declarations: [SyntaxKind.InterfaceStatement],
        flags: SymbolFlags.Interface,
      },
    });

    const INode = script.statements[1] as InterfaceStatementNode;
    assertBindings("Bar", INode.locals!, {
      T: { flags: SymbolFlags.TemplateParameter },
      U: { flags: SymbolFlags.TemplateParameter },
    });
  });

  it("binds union statements", () => {
    const code = `
      namespace A {
        union Foo { }
      }

      union Bar<T, U> { }
    `;
    const script = bindCadl(code);
    strictEqual(script.namespaces.length, 1);
    assertBindings("root", script.symbol.exports!, {
      A: {
        declarations: [SyntaxKind.NamespaceStatement],
        flags: SymbolFlags.Namespace,
        exports: {
          Foo: {
            declarations: [SyntaxKind.UnionStatement],
            flags: SymbolFlags.Union,
          },
        },
      },
      Bar: {
        declarations: [SyntaxKind.UnionStatement],
        flags: SymbolFlags.Union,
      },
    });

    const UNode = script.statements[1] as UnionStatementNode;
    assertBindings("Bar", UNode.locals!, {
      T: { flags: SymbolFlags.TemplateParameter },
      U: { flags: SymbolFlags.TemplateParameter },
    });
  });

  it("binds alias statements", () => {
    const code = `
      namespace A {
        alias Foo = string;
      }

      alias Bar<T, U> = { a: T, b: U };
    `;
    const script = bindCadl(code);
    strictEqual(script.namespaces.length, 1);
    assertBindings("root", script.symbol.exports!, {
      A: {
        declarations: [SyntaxKind.NamespaceStatement],
        flags: SymbolFlags.Namespace,
        exports: {
          Foo: {
            declarations: [SyntaxKind.AliasStatement],
            flags: SymbolFlags.Alias,
          },
        },
      },
      Bar: {
        declarations: [SyntaxKind.AliasStatement],
        flags: SymbolFlags.Alias,
      },
    });

    const ANode = script.statements[1] as AliasStatementNode;
    assertBindings("Bar", ANode.locals!, {
      T: { flags: SymbolFlags.TemplateParameter },
      U: { flags: SymbolFlags.TemplateParameter },
    });
  });

  it("binds projection statements", () => {
    const code = `
      projection Foo#proj {
        to(a) { }
      }
      projection model#proj {
        to(a) { },
        from(a) { }
      }
      projection op#proj {
        to(a) { },
      }
    `;
    const script = bindCadl(code);
    strictEqual(script.namespaces.length, 0);
    assertBindings("root", script.symbol.exports!, {
      proj: {
        declarations: [
          SyntaxKind.ProjectionStatement,
          SyntaxKind.ProjectionStatement,
          SyntaxKind.ProjectionStatement,
        ],
        flags: SymbolFlags.Projection,
      },
    });
    const toNode = (script.statements[0] as ProjectionStatementNode).to!;
    assertBindings("Foo#proj to", toNode.locals!, {
      a: { flags: SymbolFlags.ProjectionParameter },
    });
  });

  it("binds projection lambda expressions", () => {
    const code = `
      projection model#proj {
        to() {
          (a) => 1;
        }
      }
    `;
    const script = bindCadl(code);
    const lambdaNode = (
      (script.statements[0] as ProjectionStatementNode).to!.body[0] as ProjectionExpressionStatement
    ).expr as ProjectionLambdaExpressionNode;
    assertBindings("lambda", lambdaNode.locals!, {
      a: { flags: SymbolFlags.FunctionParameter },
    });
  });

  it("binds JS files", () => {
    const $dec = () => {};
    const $dec2 = () => {};
    $dec2.namespace = "Bar";

    const fn = () => {};
    const fn2 = () => {};
    fn2.namespace = "Bar";

    const exports = {
      namespace: "Foo",
      $dec,
      $dec2,
      fn,
      fn2,
    };

    const sourceFile = bindJs(exports);
    assertBindings("jsFile", sourceFile.symbol.exports!, {
      Foo: {
        flags: SymbolFlags.Namespace,
        declarations: [SyntaxKind.JsSourceFile],
        exports: {
          Bar: {
            flags: SymbolFlags.Namespace,
            declarations: [SyntaxKind.JsSourceFile],
            exports: {
              "@dec2": {
                flags: SymbolFlags.Decorator,
                declarations: [SyntaxKind.JsSourceFile],
              },
              fn2: {
                flags: SymbolFlags.Function,
                declarations: [SyntaxKind.JsSourceFile],
              },
            },
          },
          "@dec": {
            flags: SymbolFlags.Decorator,
            declarations: [SyntaxKind.JsSourceFile],
          },
          fn: {
            flags: SymbolFlags.Function,
            declarations: [SyntaxKind.JsSourceFile],
          },
        },
      },
    });
  });

  function bindCadl(code: string) {
    const sourceFile = parse(code);
    binder.bindSourceFile(sourceFile);
    return sourceFile;
  }

  function bindJs(exports: any) {
    const sourceFile = createJsSourceFile(exports);
    binder.bindJsSourceFile(sourceFile);
    return sourceFile;
  }
});

type BindTest = Record<string, BindingDescriptor>;
interface BindingDescriptor {
  flags?: SymbolFlags;
  exports?: BindTest;
  declarations?: SyntaxKind[];
}

function assertBindings(path: string, table: SymbolTable, descriptor: BindTest, parent?: Sym) {
  strictEqual(table.duplicates.size, 0, `no duplicate bindings for ${path}`);
  for (const [key, value] of Object.entries(descriptor)) {
    const subpath = `${path}.${key}`;
    const binding = table.get(key);
    ok(binding, `binding for ${subpath}`);
    if (parent) {
      strictEqual(parent, binding.parent, `parent for ${path}`);
    }

    if (value.flags) {
      strictEqual(binding.flags, value.flags, `flags for ${subpath}`);
    }

    if (value.exports) {
      ok(binding.exports, `exports for ${subpath} should be present`);
      const expectedBindingNames = Object.keys(value.exports);

      for (const exportBindingName of binding.exports.keys()) {
        if (expectedBindingNames.indexOf(exportBindingName) === -1) {
          throw new Error(
            `Unexpected binding '${exportBindingName}' at ${subpath}, expected bindings are ${expectedBindingNames}`
          );
        }
      }

      assertBindings(subpath, binding.exports, value.exports, binding);
    } else {
      strictEqual(binding.exports, undefined, `exports for ${subpath} should be undefined`);
    }

    if (value.declarations) {
      strictEqual(
        binding.declarations.length,
        value.declarations.length,
        `declaration count for ${subpath}`
      );
      for (const [i, kind] of value.declarations.entries()) {
        strictEqual(binding.declarations[i].kind, kind, `declaration ${i} of ${subpath}`);
      }
    }
  }
}

function createProgramShim(): Program {
  return {
    reportDuplicateSymbols() {},
    onValidate() {},
  } as any;
}

function createJsSourceFile(exports: any): JsSourceFileNode {
  const file = createSourceFile("", "path");
  return {
    kind: SyntaxKind.JsSourceFile,
    id: {
      kind: SyntaxKind.Identifier,
      sv: "",
      pos: 0,
      end: 0,
      symbol: undefined as any,
      flags: NodeFlags.Synthetic,
    },
    esmExports: exports,
    signatures: {},
    file,
    namespaceSymbols: [],
    symbol: undefined as any,
    pos: 0,
    end: 0,
    flags: NodeFlags.None,
  };
}
