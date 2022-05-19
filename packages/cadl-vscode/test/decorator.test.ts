import { deepStrictEqual } from "assert";
import { Token, tokenize } from "./utils";

describe("vscode: tmlanguage: decorators", () => {
  it("simple parameterless decorator", async () => {
    const tokens = await tokenize("@foo");
    deepStrictEqual(tokens, [Token.identifiers.tag("@foo")]);
  });

  it("fully qualified decorator name", async () => {
    const tokens = await tokenize("@Foo.bar");
    deepStrictEqual(tokens, [Token.identifiers.tag("@Foo.bar")]);
  });

  it("decorator with parameters", async () => {
    const tokens = await tokenize(`@foo("param1", 123)`);
    deepStrictEqual(tokens, [
      Token.identifiers.tag("@foo"),
      Token.punctuation.openParen,
      Token.punctuation.string.doubleQuote,
      Token.literals.string("param1"),
      Token.punctuation.string.doubleQuote,
      Token.punctuation.comma,
      Token.literals.numeric("123"),
      Token.punctuation.closeParen,
    ]);
  });
});
