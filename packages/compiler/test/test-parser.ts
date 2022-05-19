import assert, { deepStrictEqual } from "assert";
import { CharCode } from "../core/charcode.js";
import { formatDiagnostic, logVerboseTestOutput } from "../core/diagnostics.js";
import { hasParseError, parse, visitChildren } from "../core/parser.js";
import { CadlScriptNode, Node, NodeFlags, SourceFile, SyntaxKind } from "../core/types.js";

describe("compiler: syntax", () => {
  describe("import statements", () => {
    parseEach(['import "x";']);

    parseErrorEach([
      ['namespace Foo { import "x"; }', [/Imports must be top-level/]],
      ['namespace Foo { } import "x";', [/Imports must come prior/]],
      ['model Foo { } import "x";', [/Imports must come prior/]],
    ]);
  });

  describe("empty script", () =>
    parseEach([["", (n) => assert.strictEqual(n.statements.length, 0)]]));

  describe("model statements", () => {
    parseEach([
      "model Car { };",
      `@foo()
       model Car { };`,

      `model Car {
         prop1: number,
         prop2: string
       };`,

      `model Car {
         optional?: number;
         withDefault?: string = "mydefault";
       };`,

      `model Car {
         prop1: number;
         prop2: string;
       }`,

      `model Car {
          engine: V6
        }
        
        model V6 {
          name: string
        }`,

      `model Car {
         @foo.bar(a, b)
         prop1: number,
         
         @foo.baz(10, "hello")
         prop2: string
       };`,

      `model Car {
         @foo()
         "prop-1": number;
       }`,

      `
      @Foo()
      model Car {
         @Foo.bar(10, "hello")
         prop1: number,
         
         @Foo.baz(a, b)
         prop2: string
       };`,

      `@doc("""
       Documentation
       """)
       model Car {
         @doc("first")
         prop1: number;

         @doc("second")
         prop2: number;
       }`,

      'model Foo { "strKey": number, "😂😂😂": string }',

      "model Foo<A, B> { }",

      "model Car { @foo @bar x: number }",

      "model Car { ... A, ... B, c: number, ... D, e: string }",

      "model Car { ... A.B, ... C<D> }",

      "model Car is Vehicle { }",
    ]);

    parseErrorEach([
      ["model Car is { }", [/Identifier expected/]],
      ["model Car is Foo extends Bar { }", [/'{' expected/]],
      ["model Car extends Bar is Foo { }", [/'{' expected/]],
      ["model Car { withDefaultMissing?: string =  }", [/Expression expected/]],
      [
        `model Car { withDefaultButNotOptional: string = "foo" }`,
        [/Cannot use default with non optional properties/],
      ],
      ["model", [/Identifier expected/]],
    ]);
  });

  describe("model extends statements", () => {
    parseEach([
      "model foo extends bar { }",
      "model foo extends bar.baz { }",
      "model foo extends bar<T> { }",
      "model foo<T> extends bar<T> { }",
      "model foo<T> extends bar.baz<T> { }",
    ]);
    parseErrorEach([
      ["model foo extends { }", [/Identifier expected/]],
      ["model foo extends bar, baz { }", [/'{' expected/]],
      ["model foo extends = { }", [/Identifier expected/]],
      ["model foo extends bar = { }", [/'{' expected/]],
    ]);
  });

  describe("model = statements", () => {
    parseErrorEach([
      ["model x = y;", [/'{' expected/]],
      ["model foo = bar | baz;", [/'{' expected/]],
      ["model bar<a, b> = a | b;", [/'{' expected/]],
    ]);
  });
  describe("interface statements", () => {
    parseEach([
      "interface Foo { }",
      "interface Foo<T> { }",
      "interface Foo<T> extends Bar<T> { }",
      "interface Foo extends Bar, Baz<T> { }",
      "interface Foo { foo(): int32; }",
      "interface Foo { foo(): int32; bar(): int32; }",
      "interface Foo { op foo(): int32; op bar(): int32; baz(): int32; }",
    ]);

    parseErrorEach([
      ["interface X {", [/'}' expected/]],
      ["interface X { foo(): string; interface Y", [/'}' expected/]],
      ["interface X { foo(a: string", [/'\)' expected/]],
      ["interface X { foo(@dec", [/Property expected/]],
      ["interface X { foo(#suppress x", [/Property expected/]],
    ]);
  });

  describe("model expressions", () => {
    parseEach(['model Car { engine: { type: "v8" } }']);
  });

  describe("tuple model expressions", () => {
    parseEach([
      'namespace A { op b(param: [number, string]): [1, "hi"]; }',
      "alias EmptyTuple =  [];",
      "model Template<T=[]> { }",
    ]);
  });

  describe("array expressions", () => {
    parseEach(["model A { foo: B[] }", "model A { foo: B[][] }"]);
  });

  describe("union expressions", () => {
    parseEach(["model A { foo: B | C }", "model A { foo: B | C & D }", "model A { foo: | B | C }"]);
  });

  describe("union declarations", () => {
    parseEach([
      "union A { x: number, y: number } ",
      "@dec union A { @dec a: string }",
      "union A<T, V> { a: T; none: {} }",
      `union A { "hi there": string }`,
    ]);

    parseErrorEach([
      [
        'union A { @dec "x" x: number, y: string }',
        [/':' expected/],
        (n) => assert(!n.printable, "should not be printable"),
      ],
    ]);
  });

  describe("template instantiations", () => {
    parseEach(["model A { x: Foo<number, string>; }", "model B { x: Foo<number, string>[]; }"]);
  });

  describe("intersection expressions", () => {
    parseEach(["model A { foo: B & C }", "model A { foo: & B & C }"]);
  });

  describe("parenthesized expressions", () => {
    parseEach(["model A { x: ((B | C) & D)[]; }"]);
  });

  describe("namespace statements", () => {
    parseEach([
      "namespace Store {}",
      "namespace Store { op read(): int32; }",
      "namespace Store { op read(): int32; op write(v: int32): {}; }",
      "namespace Store.Read { op read(): int32; }",
      "@foo namespace Store { @dec op read(): number; @dec op write(n: number): {}; }",
      "@foo @bar namespace Store { @foo @bar op read(): number; }",
      "namespace Store { namespace Read { op read(): int32; } namespace Write { op write(v: int32): {}; } }",
      "namespace Store.Read { }",
      "namespace Store;",
      "namespace Store.Read;",
      "@foo namespace Store.Read;",
      "@foo namespace Store.Read { };",
    ]);

    parseErrorEach([
      ["namespace Foo { namespace Store; }", [/Blockless namespace can only be top-level/]],
      ["namespace Store; namespace Store2;", [/Cannot use multiple blockless namespaces/]],
      ["model Foo { }; namespace Store;", [/Blockless namespaces can't follow other/]],
      ["namespace Foo { }; namespace Store;", [/Blockless namespaces can't follow other/]],
    ]);
  });

  describe("using statements", () => {
    parseEach(["using A;", "using A.B;", "namespace Foo { using A; }"]);
  });

  describe("multiple statements", () => {
    parseEach([
      `
      model A { };
      model B { }
      ;
      namespace I {
        op foo(): number;
      }
      namespace J {

      }


    `,
    ]);
  });

  describe("comments", () => {
    parseEach([
      `
      // Comment
      model A { /* Another comment */
        /*
          and
          another
        */
        property /* 👀 */ : /* 👍 */ int32; // one more
      }
      `,
    ]);
  });

  describe("empty statements", () => {
    parseEach([`;;;;`, `namespace Foo { model Car { }; };`, `model Car { };;;;`]);
  });

  describe("recovery", () => {
    parseErrorEach([
      [`model M { ]`, [/Property expected/]],
      [
        `
        @dec1 @dec2 import "foo";
        banana
        model Foo
        `,
        [
          /Cannot decorate import/,
          /Cannot decorate import/,
          /Statement expected/,
          /'{', '=', 'extends', or 'is' expected/,
        ],
      ],
      ["model M {}; This is not a valid statement", [/Statement expected/]],
      ["model M {}; @dec ;", [/Cannot decorate empty statement/]],
    ]);
  });

  describe("BOM", () => {
    parseEach(["\u{FEFF}/*<--BOM*/ model M {}"]);
    parseErrorEach([["model\u{FEFF}/*<--BOM*/ M {}", [/Statement expected/]]]);
  });

  describe("unterminated tokens", () => {
    parseErrorEach([["/* Yada yada yada", [/Unterminated multi-line comment/]]]);

    const strings = [
      '"banana',
      '"banana\\',
      '"banana\r"',
      '"banana\n"',
      '"banana\r\n"',
      '"""\nbanana',
      '"""\nbanana\\',
    ];
    parseErrorEach(
      Array.from(strings.entries()).map((e) => [
        `alias ${String.fromCharCode(CharCode.A + e[0])} = ${e[1]}`,
        [/Unterminated string literal/],
        (node) => {
          const statement = node.statements[0];
          assert(statement.kind === SyntaxKind.AliasStatement, "alias statement expected");
          const value = statement.value;
          assert(value.kind === SyntaxKind.StringLiteral, "string literal expected");
          assert.strictEqual(value.value, "banana");
        },
      ])
    );
  });

  describe("terminated tokens at EOF", () => {
    parseErrorEach([
      ["alias X = 0x10101", [/';' expected/]],
      ["alias X = 0xBEEF", [/';' expected/]],
      ["alias X = 123", [/';' expected/]],
      ["alias X = 123e45", [/';' expected/]],
      ["alias X = 123.45", [/';' expected/]],
      ["alias X = 123.45e2", [/';' expected/]],
      ["alias X = Banana", [/';' expected/]],
      ['alias X = "Banana"', [/';' expected/]],
      ['alias X = """\nBanana\n"""', [/';' expected/]],
    ]);
  });

  describe("numeric literals", () => {
    const good: [string, number][] = [
      // Some questions remain here: https://github.com/Microsoft/cadl/issues/506
      ["-0", -0],
      ["1e9999", Infinity],
      ["1e-9999", 0],
      ["-1e-9999", -0],
      ["-1e9999", -Infinity],

      // NOTE: No octal in Cadl
      ["077", 77],
      ["+077", 77],
      ["-077", -77],

      ["0xABCD", 0xabcd],
      ["0xabcd", 0xabcd],
      ["0x1010", 0x1010],
      ["0b1010", 0b1010],
      ["0", 0],
      ["+0", 0],
      ["0.0", 0.0],
      ["+0.0", 0],
      ["-0.0", -0.0],
      ["123", 123],
      ["+123", 123],
      ["-123", -123],
      ["123.123", 123.123],
      ["+123.123", 123.123],
      ["-123.123", -123.123],
      ["789e42", 789e42],
      ["+789e42", 789e42],
      ["-789e42", -789e42],
      ["654.321e9", 654.321e9],
      ["+654.321e9", 654.321e9],
      ["-654.321e9", -654.321e9],
    ];

    const bad: [string, RegExp][] = [
      ["123.", /Digit expected/],
      ["123.0e", /Digit expected/],
      ["123e", /Digit expected/],
      ["0b", /Binary digit expected/],
      ["0b2", /Binary digit expected/],
      ["0x", /Hexadecimal digit expected/],
      ["0xG", /Hexadecimal digit expected/],
    ];

    parseEach(good.map((c) => [`alias M = ${c[0]};`, (node) => isNumericLiteral(node, c[1])]));
    parseErrorEach(bad.map((c) => [`alias M = ${c[0]};`, [c[1]]]));

    function isNumericLiteral(node: CadlScriptNode, value: number) {
      const statement = node.statements[0];
      assert(statement.kind === SyntaxKind.AliasStatement, "alias statement expected");
      const assignment = statement.value;
      assert(assignment?.kind === SyntaxKind.NumericLiteral, "numeric literal expected");
      assert.strictEqual(assignment.value, value);
    }
  });

  describe("identifiers", () => {
    const good = [
      "short",
      "short42",
      "lowercaseandlong",
      "lowercaseandlong42",
      "camelCase",
      "camelCase42",
      "PascalCase",
      "PascalCase42",
      "has_underscore",
      "has_$dollar",
      "_startsWithUnderscore",
      "$startsWithDollar",
      "Incompréhensible",
      "incompréhensible",
      "IncomprÉhensible",
      "incomprÉhensible",
      // normalization
      ["e\u{0301}toile", "étoile"],
      // leading astral character
      "𐌰𐌲",
      // continuing astral character
      "Banana𐌰𐌲42Banana",
      "banana𐌰𐌲42banana",
      // ZWNJ
      "deaf\u{200c}ly",
      // ZWJ
      "क्‍ष",
      // Leading emoji
      "😁Yay",
      // Continuing emoji
      "Hi✋There",
    ];

    const bad: [string, RegExp][] = [
      ["\u{D800}", /Invalid character/], // unpaired surrogate
      ["\u{E000}", /Invalid character/], // private use
      ["\u{FDD0}", /Invalid character/], // non-character
      ["\u{244B}", /Invalid character/], // unassigned
      ["\u{009F}", /Invalid character/], // control
      ["\u{FFFD}", /Invalid character/], // replacement character
      ["#", /Identifier expected/], // directive
      ["42", /Identifier expected/],
      ["true", /Keyword cannot be used as identifier/],
    ];

    parseEach(
      good.map((entry) => {
        const input = typeof entry === "string" ? entry : entry[0];
        const expected = typeof entry === "string" ? entry : entry[1];

        return [
          `model ${input} {}`,
          (node) => {
            const statement = node.statements[0];
            assert(statement.kind === SyntaxKind.ModelStatement, "Model statement expected.");
            assert.strictEqual(statement.id.sv, expected);
          },
        ];
      })
    );

    parseErrorEach(bad.map((e) => [`model ${e[0]} {}`, [e[1]]]));
  });

  // smaller repro of previous regen-samples baseline failures
  describe("sample regressions", () => {
    parseEach([
      [
        `/* \\n <-- before string! */ @pattern("\\\\w") model M {}`,
        (node) => {
          assert(node.statements[0].kind === SyntaxKind.ModelStatement);
          assert(node.statements[0].decorators[0].arguments[0].kind === SyntaxKind.StringLiteral);
          assert.strictEqual(node.statements[0].decorators[0].arguments[0].value, "\\w");
        },
      ],
    ]);
  });

  describe("enum statements", () => {
    parseEach([
      "enum Foo { }",
      "enum Foo { a, b }",
      'enum Foo { a: "hi", c: 10 }',
      "@foo enum Foo { @bar a, @baz b: 10 }",
    ]);

    parseErrorEach([
      ["enum Foo { a: number }", [/Expected numeric or string literal/]],
      ["enum Foo { a: [number] }", [/Expected numeric or string literal/]],
      ["enum Foo { a: ; b: ; }", [/Expression expected/, /Expression expected/]],
      ["enum Foo { ;+", [/Enum member expected/]],
      ["enum { }", [/Identifier expected/]],
    ]);
  });

  describe("alias statements", () => {
    parseEach(["alias X = 1;", "alias X = A | B;", "alias MaybeUndefined<T> = T | undefined;"]);
    parseErrorEach([
      ["@foo alias Bar = 1;", [/Cannot decorate alias statement/]],
      ["alias Foo =", [/Expression expected/]],
      ["alias Foo<> =", [/Identifier expected/, /Expression expected/]],
      ["alias Foo<T> = X |", [/Expression expected/]],
      ["alias =", [/Identifier expected/]],
    ]);
  });

  describe("directives", () => {
    describe("emit single diagnostic when the parameters are not expected types", () => {
      parseErrorEach(
        [
          ["#suppress foo;\nmodel Foo {}", [/Unexpected token Semicolon/]],
          ["#suppress foo 123\nmodel Foo {}", [/Unexpected token NumericLiteral/]],
        ],
        { strict: true }
      );
    });
  });

  describe("projections", () => {
    describe("selectors", () => {
      const selectors = ["model", "op", "interface", "union", "someId"];
      const codes = selectors.map((s) => `projection ${s}#tag { }`);
      parseEach(codes);
    });

    describe("direction", () => {
      parseEach([`projection model#tag { to { } }`, `projection model #tag { from { } }`]);
    });

    describe("projection parameters", () => {
      parseEach([
        `projection model#v { to(version) { } }`,
        `projection model#foo{ from(bar, baz) { } }`,
      ]);
    });
    describe("projection expressions", () => {
      const exprs = [
        `x || y`,
        `x || y || z`,
        `x && y`,
        `x && y && z`,
        `x && y || z && q`,
        `x || y && z || q`,
        `x * y`,
        `x + y`,
        `x / y`,
        `x - y`,
        `x + y * z / a + b - c`,
        `x <= y`,
        `x >= y`,
        `x > y`,
        `x < y`,
        `!x`,
        `x()`,
        `x(a, b, c)`,
        `x.y`,
        `x().y`,
        `x().y()`,
        `x()()`,
        `x()(T)`,
        `x(T)()`,
        `x(T).y()(T)`,
        `self`,
        `if x { }`,
        `if x { a; b; } else { c; }`,
        `if x > 1 { }`,
        `if if x > 1 { a; } else { b; } { c; } else { d; }`,
        `(x) => { x + 1; }`,
        `(x) => { if x { x; } else { y; }; }`,
        `1`,
        `"string"`,
        `{ x: 1 }`,
        `{ x: if 1 { Foo; } else { Bar; } }`,
        `[a, b]`,
        `[]`,
        `(a)`,
        `(a + 1)`,
      ];
      const codes = exprs.map((exp) => `projection foo#tag { to { ${exp}; } }`);
      parseEach(codes);
    });

    describe("recovery", () => {
      parseErrorEach([
        [`projection `, [/identifier, 'model', 'op', 'interface', 'union', or 'enum' expected/]],
        [`projection x `, [/'#' expected/]],
        [`projection x#`, [/Identifier expected/]],
        [`projection x#f`, [/'{' expected/]],
        [`projection x#f {`, [/'}' expected/]],
        [`projection x#f { asdf`, [/from or to expected/]],
        [`projection x#f { to (`, [/'\)' expected/]],
        [`projection x#f { to @`, [/'{' expected/]],
        [`projection x#f { to {`, [/} expected/]],
        [`projection x#f { to {}`, [/'}' expected/]],
      ]);
    });
  });
});

type Callback = (node: CadlScriptNode) => void;

function parseEach(cases: (string | [string, Callback])[]) {
  for (const each of cases) {
    const code = typeof each === "string" ? each : each[0];
    const callback = typeof each === "string" ? undefined : each[1];
    it("parses `" + shorten(code) + "`", () => {
      logVerboseTestOutput("=== Source ===");
      logVerboseTestOutput(code);

      logVerboseTestOutput("\n=== Parse Result ===");
      const astNode = parse(code);
      if (callback) {
        callback(astNode);
      }
      dumpAST(astNode);

      logVerboseTestOutput("\n=== Diagnostics ===");
      if (astNode.parseDiagnostics.length > 0) {
        const diagnostics = astNode.parseDiagnostics.map(formatDiagnostic).join("\n");
        assert.strictEqual(
          hasParseError(astNode),
          astNode.parseDiagnostics.some((e) => e.severity === "error"),
          "root node claims to have no parse errors, but these were reported:\n" +
            diagnostics +
            "\n(If you've added new AST nodes or properties, make sure you implemented the new visitors)"
        );

        assert.fail("Unexpected parse errors in test:\n" + diagnostics);
      }

      assert(astNode.printable, "Parse tree with no errors should be printable");

      checkInvariants(astNode);
    });
  }
}

function checkInvariants(astNode: CadlScriptNode) {
  checkVisitChildren(astNode, astNode.file);
  checkPositioning(astNode, astNode.file);
}

function dynamicVisitChildren(node: Node, cb: (key: string, child: any) => void) {
  for (const [key, value] of Object.entries(node)) {
    switch (key) {
      case "parent":
      case "parseDiagnostics":
        return;
    }
    if (Array.isArray(value)) {
      for (const each of value) {
        cb(key, each);
      }
    } else if (typeof value === "object" && "kind" in value) {
      cb(key, value);
    }
  }
}

function checkVisitChildren(node: Node, file: SourceFile) {
  const visited = new Map<Node, string>();

  dynamicVisitChildren(node, (key, child) => visited.set(child, key));
  visitChildren(node, (child) => void visited.delete(child));

  deepStrictEqual(
    Array.from(visited.values()),
    [],
    `Nodes not visited by visitChildren of ${SyntaxKind[node.kind]}`
  );

  visitChildren(node, (child) => checkVisitChildren(child, file));
}

function checkPositioning(node: Node, file: SourceFile) {
  visitChildren(node, (child) => {
    if (child.pos < node.pos || child.end > node.end) {
      logVerboseTestOutput("Parent: ");
      dumpAST(node, file);
      logVerboseTestOutput("Child: ");
      dumpAST(child, file);
      assert.fail("child node positioned outside parent node");
    }
    checkPositioning(child, file);
  });
}

/**
 *
 * @param cases Test cases
 * @param options {
 *   strict: Make sure there is exactly the same amount of diagnostics reported as the number of matches.
 * }
 */
function parseErrorEach(
  cases: [string, RegExp[], Callback?][],
  options: { strict?: boolean } = {}
) {
  for (const [code, matches, callback] of cases) {
    it(`doesn't parse '${shorten(code)}'`, () => {
      logVerboseTestOutput("=== Source ===");
      logVerboseTestOutput(code);

      const astNode = parse(code);
      if (callback) {
        callback(astNode);
      }
      logVerboseTestOutput("\n=== Parse Result ===");
      dumpAST(astNode);

      logVerboseTestOutput("\n=== Diagnostics ===");
      logVerboseTestOutput((log) => {
        for (const each of astNode.parseDiagnostics) {
          log(formatDiagnostic(each));
        }
      });
      assert.notStrictEqual(astNode.parseDiagnostics.length, 0, "no diagnostics reported");
      if (options.strict) {
        assert.strictEqual(
          astNode.parseDiagnostics.length,
          matches.length,
          "More diagnostics reported than expected."
        );
      }
      let i = 0;
      for (const match of matches) {
        assert.match(astNode.parseDiagnostics[i++].message, match);
      }
      assert(
        hasParseError(astNode),
        "node claims to have no parse errors, but above were reported."
      );

      assert(
        !astNode.printable ||
          !astNode.parseDiagnostics.some((d) => !/^'[,;:{}()]' expected\.$/.test(d.message)),
        "parse tree with errors other than missing punctuation should not be printable"
      );

      checkInvariants(astNode);
    });
  }
}

function dumpAST(astNode: Node, file?: SourceFile) {
  if (!file && astNode.kind === SyntaxKind.CadlScript) {
    file = astNode.file;
  }
  logVerboseTestOutput((log) => {
    hasParseError(astNode); // force flags to initialize
    const json = JSON.stringify(astNode, replacer, 2);
    log(json);
  });

  function replacer(key: string, value: any) {
    if (key === "parent") {
      return undefined; // prevent cycles if run on bound nodes
    }
    if (key === "kind") {
      // swap numeric kind for readable name
      return SyntaxKind[value];
    }

    if (file && (key === "pos" || key === "end")) {
      // include line and column numbers
      const pos = file.getLineAndCharacterOfPosition(value);
      const line = pos.line + 1;
      const col = pos.character + 1;
      return `${value} (line ${line}, column ${col})`;
    }

    if (key === "parseDiagnostics" || key === "file") {
      // these will be logged separately in more readable form
      return undefined;
    }

    if (key === "locals" && value.size === 0) {
      // this will be an empty symbol table after parsing, hide it
      return undefined;
    }

    if (Array.isArray(value) && value.length === 0) {
      // hide empty arrays too
      return undefined;
    }

    if (key === "flags") {
      return [
        value & NodeFlags.DescendantErrorsExamined ? "DescendantErrorsExamined" : "",
        value & NodeFlags.ThisNodeHasError ? "ThisNodeHasError" : "",
        value & NodeFlags.DescendantHasError ? "DescendantHasError" : "",
      ].join(",");
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      // Show the text of the given node
      if (file && "pos" in value && "end" in value) {
        value.source = shorten(file.text.substring(value.pos, value.end));
      }

      // sort properties by type so that the short ones can be read without
      // scrolling past the long ones and getting disoriented.
      const sorted: any = {};
      for (const prop of sortKeysByType(value)) {
        sorted[prop] = value[prop];
      }
      return sorted;
    }

    return value;
  }

  function sortKeysByType(o: any) {
    const score = {
      undefined: 0,
      string: 1,
      boolean: 2,
      number: 3,
      bigint: 4,
      symbol: 5,
      function: 6,
      object: 7,
    };
    return Object.keys(o).sort((x, y) => score[typeof o[x]] - score[typeof o[y]]);
  }
}

function shorten(code: string) {
  return code.replace(/\s+/g, " ");
}
