import { deepStrictEqual, ok, strictEqual } from "assert";
import { CompletionItem, CompletionItemKind, CompletionList } from "vscode-languageserver/node.js";
import { createTestServerHost, extractCursor } from "./test-server-host.js";

describe("compiler: server: completion", () => {
  it("completes globals", async () => {
    const completions = await complete(
      `
      model M {
        s: ┆
      }
      `
    );

    check(completions, [
      {
        label: "int32",
        insertText: "int32",
        kind: CompletionItemKind.Keyword,
        documentation: undefined,
      },
      {
        label: "Map",
        insertText: "Map",
        kind: CompletionItemKind.Class,
        documentation: undefined,
      },
    ]);
  });

  it("completes decorators on namespaces", async () => {
    const completions = await complete(
      `
      @┆
      namespace N {}
      `
    );

    check(completions, [
      {
        label: "doc",
        insertText: "doc",
        kind: CompletionItemKind.Function,
        documentation: undefined,
      },
    ]);
  });

  it("does not complete functions or decorators in type position", async () => {
    const completions = await complete(
      `
      model M {
        s: ┆
      }
      `
    );

    deepStrictEqual(
      [],
      completions.items.filter(
        (c) => c.label === "doc" || c.label === "getDoc" || c.kind === CompletionItemKind.Function
      )
    );
  });

  it("completes decorators on models", async () => {
    const completions = await complete(
      `
      @┆
      model M {}
      `
    );

    check(completions, [
      {
        label: "doc",
        insertText: "doc",
        kind: CompletionItemKind.Function,
        documentation: undefined,
      },
    ]);
  });

  it("completes partial identifiers", async () => {
    const completions = await complete(
      `
      model M {
        s: stri┆
      }
      `
    );

    check(completions, [
      {
        label: "string",
        insertText: "string",
        kind: CompletionItemKind.Keyword,
        documentation: undefined,
      },
    ]);
  });

  it("completes partial identifier with astral character", async () => {
    const completions = await complete(
      `
      model 𐌰𐌲𐌰𐌲𐌰𐌲 {}
      model M {
        s: 𐌰𐌲┆
      }
      `
    );

    check(completions, [
      {
        label: "𐌰𐌲𐌰𐌲𐌰𐌲",
        insertText: "𐌰𐌲𐌰𐌲𐌰𐌲",
        kind: CompletionItemKind.Class,
        documentation: undefined,
      },
    ]);
  });

  it("completes namespace members", async () => {
    const completions = await complete(
      `
      namespace N {
        model A {}
        model B {}
      }

      model M extends N.┆
      `
    );

    check(
      completions,
      [
        {
          label: "A",
          insertText: "A",
          kind: CompletionItemKind.Class,
          documentation: undefined,
        },
        {
          label: "B",
          insertText: "B",
          kind: CompletionItemKind.Class,
          documentation: undefined,
        },
      ],
      {
        allowAdditionalCompletions: false,
      }
    );
  });

  it("completes template parameter uses", async () => {
    const completions = await complete(
      `
      model Template<Param> {
        prop: ┆
      }
      `
    );

    check(completions, [
      {
        label: "Param",
        insertText: "Param",
        kind: CompletionItemKind.Struct,
        documentation: undefined,
      },
    ]);
  });

  it("completes sibling in namespace", async () => {
    const completions = await complete(
      `
      namespace N {
        model A {}
        model B extends ┆
      }
        `
    );

    check(completions, [
      {
        label: "A",
        insertText: "A",
        kind: CompletionItemKind.Class,
        documentation: undefined,
      },
    ]);
  });

  it("completes using statements", async () => {
    const completions = await complete(
      `
      namespace A {
        namespace B {
          model M  {}
        }
      }

      using A.┆;
      }
      `
    );

    check(
      completions,
      [
        {
          label: "B",
          insertText: "B",
          kind: CompletionItemKind.Module,
          documentation: undefined,
        },
      ],
      {
        allowAdditionalCompletions: false,
      }
    );
  });

  it("completes qualified decorators", async () => {
    const js = {
      name: "decorators.js",
      js: {
        namespace: "Outer",
        $innerDecorator: function () {},
        $outerDecorator: function () {},
      },
    };
    (js.js.$innerDecorator as any).namespace = "Inner";

    const completions = await complete(
      `
      import "./decorators.js";
      namespace A {
        namespace B {
          model M  {}
        }
      }

      @Outer.┆
      model M {}
      `,
      js
    );
    check(
      completions,
      [
        {
          label: "Inner",
          insertText: "Inner",
          kind: CompletionItemKind.Module,
          documentation: undefined,
        },
        {
          label: "outerDecorator",
          insertText: "outerDecorator",
          kind: CompletionItemKind.Function,
          documentation: undefined,
        },
      ],
      {
        allowAdditionalCompletions: false,
      }
    );
  });
  it("deals with trivia before missing identifier", async () => {
    const completions = await complete(
      `
      namespace N {
        model A {}
        model B {}
      }

      model M extends N.┆
      // single line comment
      /*
        multi-line comment
      */
      {/*<-- missing identifier immediately before this brace*/}
      `
    );

    check(
      completions,
      [
        {
          label: "A",
          insertText: "A",
          kind: CompletionItemKind.Class,
          documentation: undefined,
        },
        {
          label: "B",
          insertText: "B",
          kind: CompletionItemKind.Class,
          documentation: undefined,
        },
      ],
      {
        allowAdditionalCompletions: false,
      }
    );
  });

  function check(
    list: CompletionList,
    expectedItems: CompletionItem[],
    options = { allowAdditionalCompletions: true }
  ) {
    ok(!list.isIncomplete, "list should not be incomplete.");

    const expectedMap = new Map(expectedItems.map((i) => [i.label, i]));
    strictEqual(
      expectedMap.size,
      expectedItems.length,
      "Duplicate labels in expected completions."
    );

    const actualMap = new Map(list.items.map((i) => [i.label, i]));
    strictEqual(actualMap.size, list.items.length, "Duplicate labels in actual completions.");

    for (const expected of expectedItems) {
      const actual = actualMap.get(expected.label);
      ok(actual, `Expected completion item not found: '${expected.label}'.`);
      deepStrictEqual(actual, expected);
      actualMap.delete(actual.label);
      expectedMap.delete(expected.label);
    }

    const expectedRemaining = Array.from(expectedMap.values());
    deepStrictEqual(expectedRemaining, [], "Not all expected completions were found.");

    if (!options.allowAdditionalCompletions) {
      const actualRemaining = Array.from(actualMap.values());
      deepStrictEqual(actualRemaining, [], "Extra completions were found.");
    }
  }

  async function complete(
    sourceWithCursor: string,
    jsSourceFile?: { name: string; js: Record<string, any> }
  ): Promise<CompletionList> {
    const { source, pos } = extractCursor(sourceWithCursor);
    const testHost = await createTestServerHost();
    if (jsSourceFile) {
      testHost.addJsFile(jsSourceFile.name, jsSourceFile.js);
    }
    const textDocument = testHost.addOrUpdateDocument("test.cadl", source);
    return await testHost.server.complete({
      textDocument,
      position: textDocument.positionAt(pos),
    });
  }
});
