import { deepStrictEqual } from "assert";
import { Token, tokenize } from "./utils";

describe("vscode: tmlanguage: interfaces", () => {
  it("empty interface", async () => {
    const tokens = await tokenize("interface Foo {}");
    deepStrictEqual(tokens, [
      Token.keywords.interface,
      Token.identifiers.type("Foo"),
      Token.punctuation.openBrace,
      Token.punctuation.closeBrace,
    ]);
  });

  it("interface with single extends", async () => {
    const tokens = await tokenize("interface Foo extends Bar {}");
    deepStrictEqual(tokens, [
      Token.keywords.interface,
      Token.identifiers.type("Foo"),
      Token.keywords.extends,
      Token.identifiers.type("Bar"),
      Token.punctuation.openBrace,
      Token.punctuation.closeBrace,
    ]);
  });

  it("interface with multiple extends", async () => {
    const tokens = await tokenize("interface Foo extends Bar1, Bar2 {}");
    deepStrictEqual(tokens, [
      Token.keywords.interface,
      Token.identifiers.type("Foo"),
      Token.keywords.extends,
      Token.identifiers.type("Bar1"),
      Token.punctuation.comma,
      Token.identifiers.type("Bar2"),
      Token.punctuation.openBrace,
      Token.punctuation.closeBrace,
    ]);
  });

  it("template interface", async () => {
    const tokens = await tokenize("interface Foo<T> {}");
    deepStrictEqual(tokens, [
      Token.keywords.interface,
      Token.identifiers.type("Foo"),
      Token.punctuation.typeParameters.begin,
      Token.identifiers.type("T"),
      Token.punctuation.typeParameters.end,
      Token.punctuation.openBrace,
      Token.punctuation.closeBrace,
    ]);
  });

  it("template interface with extends", async () => {
    const tokens = await tokenize("interface Foo<T> extends Bar<T> {}");
    deepStrictEqual(tokens, [
      Token.keywords.interface,
      Token.identifiers.type("Foo"),
      Token.punctuation.typeParameters.begin,
      Token.identifiers.type("T"),
      Token.punctuation.typeParameters.end,
      Token.keywords.extends,
      Token.identifiers.type("Bar"),
      Token.punctuation.typeParameters.begin,
      Token.identifiers.type("T"),
      Token.punctuation.typeParameters.end,
      Token.punctuation.openBrace,
      Token.punctuation.closeBrace,
    ]);
  });

  it("interface with operations", async () => {
    const tokens = await tokenize(`
    interface Foo {
      bar(): string;
    }`);
    deepStrictEqual(tokens, [
      Token.keywords.interface,
      Token.identifiers.type("Foo"),
      Token.punctuation.openBrace,
      Token.identifiers.functionName("bar"),
      Token.punctuation.openParen,
      Token.punctuation.closeParen,
      Token.operators.typeAnnotation,
      Token.identifiers.type("string"),
      Token.punctuation.closeBrace,
    ]);
  });
});
