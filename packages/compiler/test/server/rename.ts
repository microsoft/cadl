import { deepStrictEqual, strictEqual } from "assert";
import { Range } from "vscode-languageserver/node.js";
import { createTestServerHost, extractCursor, getTestIdentifiers } from "./test-server-host.js";

describe("compiler: server: rename and find references", () => {
  // `┆` marks where the cursor is positioned
  // trailing /**/ marks identifiers that should be found/renamed

  test(
    "models",
    `
      model Model/**/ {
        prop: Mo┆del/**/; 
      }

      model A extends Model/**/ {}

      model D extends C<Model/**/>

      namespace M {
        model Model {} // different model
      }

      model B {
        Model: string; // property name
      }

      model C<Model> {} // template parameter name
      `
  );

  test(
    "template parameters",
    `
    model Template<T┆/**/> {
      prop: T/**/;
    }

    // different T
    model AnotherTemplate<T> { 
      prop: T;
    }
    `
  );

  test(
    "namespaces",
    `
    namespace A.B/**/.C {

    }

    namespace A {
      namespace B┆/**/ {
      }
    }

    // different namespace
    namespace B {
    }
    `
  );

  test(
    "aliases",
    `alias Alias┆/**/ = string;
    op foo(): Alias/**/;`
  );
});

function test(things: string, sourceWithCursor: string) {
  it(`renames ${things}`, () => testRename(sourceWithCursor));
  it(`finds ${things}`, () => testFindReferences(sourceWithCursor));
}

async function testFindReferences(sourceWithCursor: string) {
  const { source, pos } = extractCursor(sourceWithCursor);
  const testHost = await createTestServerHost();
  const doc = await testHost.addOrUpdateDocument("test.cadl", source);

  const references = await testHost.server.findReferences({
    textDocument: doc,
    position: doc.positionAt(pos),
    context: { includeDeclaration: true },
  });

  deepStrictEqual(
    references.sort((x, y) => doc.offsetAt(x.range.start) - doc.offsetAt(y.range.start)),
    getTestIdentifiers(source).map((id) => ({
      uri: doc.uri,
      range: Range.create(doc.positionAt(id.pos), doc.positionAt(id.end)),
    }))
  );
}

async function testRename(sourceWithCursor: string) {
  const { source, pos } = extractCursor(sourceWithCursor);
  const testHost = await createTestServerHost();
  const doc = await testHost.addOrUpdateDocument("test.cadl", source);

  const edit = await testHost.server.rename({
    textDocument: doc,
    position: doc.positionAt(pos),
    newName: "NewName",
  });

  const entries = Object.entries(edit.changes ?? {});
  strictEqual(entries.length, 1, "Expecting single document to be changed.");

  const [uri, changes] = entries[0];
  strictEqual(uri, doc.uri, "URI should match the single document.");

  deepStrictEqual(
    changes.sort((x, y) => doc.offsetAt(x.range.start) - doc.offsetAt(y.range.start)),
    getTestIdentifiers(source).map((id) => ({
      newText: "NewName",
      range: Range.create(doc.positionAt(id.pos), doc.positionAt(id.end)),
    }))
  );
}
