import { readFile } from "fs/promises";
import * as path from "path";
import { createOnigScanner, createOnigString, loadWASM } from "vscode-oniguruma";
import { IOnigLib, parseRawGrammar, Registry, StackElement } from "vscode-textmate";
import { CadlScope } from "../src/tmlanguage.js";

async function createOnigLib(): Promise<IOnigLib> {
  const onigWasm = await readFile(`${path.dirname(require.resolve("vscode-oniguruma"))}/onig.wasm`);

  await loadWASM(onigWasm.buffer);

  return {
    createOnigScanner: (sources) => createOnigScanner(sources),
    createOnigString,
  };
}

const registry = new Registry({
  onigLib: createOnigLib(),
  loadGrammar: async (scopeName) => {
    const data = await readFile(path.resolve(__dirname, "../../dist/cadl.tmLanguage"), "utf-8");
    return parseRawGrammar(data);
  },
});

export type MetaScope = `meta.${string}.cadl`;
export type TokenScope = CadlScope | MetaScope;
export interface Token {
  text: string;
  type: TokenScope;
}

const excludedTypes = ["source.cadl"];

export async function tokenize(
  input: string | Input,
  excludeTypes: boolean = true
): Promise<Token[]> {
  if (typeof input === "string") {
    input = Input.FromText(input);
  }

  let tokens: Token[] = [];
  let previousStack: StackElement | null = null;
  const grammar = await registry.loadGrammar("source.cadl");

  if (grammar === null) {
    throw new Error("Unexpected null grammar");
  }

  for (let lineIndex = 0; lineIndex < input.lines.length; lineIndex++) {
    const line = input.lines[lineIndex];

    let lineResult = grammar.tokenizeLine(line, previousStack);
    previousStack = lineResult.ruleStack;

    if (lineIndex < input.span.startLine || lineIndex > input.span.endLine) {
      continue;
    }

    for (const token of lineResult.tokens) {
      if (
        (lineIndex === input.span.startLine && token.startIndex < input.span.startIndex) ||
        (lineIndex === input.span.endLine && token.endIndex > input.span.endIndex)
      ) {
        continue;
      }

      const text = line.substring(token.startIndex, token.endIndex);
      const type = token.scopes[token.scopes.length - 1] as TokenScope;

      if (excludeTypes === false || !excludeType(type)) {
        tokens.push(createToken(text, type));
      }
    }
  }

  return tokens;
}

function excludeType(type: TokenScope): type is CadlScope {
  return excludedTypes.includes(type) || type.startsWith("meta.");
}

interface Span {
  startLine: number;
  startIndex: number;
  endLine: number;
  endIndex: number;
}

export class Input {
  private constructor(public lines: string[], public span: Span) {}

  public static FromText(text: string) {
    // ensure consistent line-endings irrelevant of OS
    text = text.replace("\r\n", "\n");
    let lines = text.split("\n");

    return new Input(lines, {
      startLine: 0,
      startIndex: 0,
      endLine: lines.length - 1,
      endIndex: lines[lines.length - 1].length,
    });
  }
}

function createToken(text: string, type: TokenScope) {
  return { text, type };
}

export const Token = {
  keywords: {
    model: createToken("model", "keyword.other.cadl"),
    operation: createToken("op", "keyword.other.cadl"),
    namespace: createToken("namespace", "keyword.other.cadl"),
    interface: createToken("interface", "keyword.other.cadl"),
    alias: createToken("alias", "keyword.other.cadl"),
    extends: createToken("extends", "keyword.other.cadl"),
    is: createToken("is", "keyword.other.cadl"),
    other: (text: string) => createToken(text, "keyword.other.cadl"),
  },
  meta: (text: string, meta: string) => createToken(text, `meta.${meta}.cadl`),
  identifiers: {
    variable: (name: string) => createToken(name, "variable.name.cadl"),
    functionName: (name: string) => createToken(name, "entity.name.function.cadl"),
    tag: (name: string) => createToken(name, "entity.name.tag.cadl"),
    type: (name: string) => createToken(name, "entity.name.type.cadl"),
  },

  operators: {
    assignement: createToken("=", "keyword.operator.assignment.cadl"),
    optional: createToken("?", "keyword.operator.optional.cadl"),
    typeAnnotation: createToken(":", "keyword.operator.type.annotation.cadl"),
    spread: createToken("...", "keyword.operator.spread.cadl"),
  },

  punctuation: {
    comma: createToken(",", "punctuation.comma.cadl"),
    accessor: createToken(".", "punctuation.accessor.cadl"),
    openBracket: createToken("[", "punctuation.squarebracket.open.cadl"),
    closeBracket: createToken("]", "punctuation.squarebracket.close.cadl"),
    openBrace: createToken("{", "punctuation.curlybrace.open.cadl"),
    closeBrace: createToken("}", "punctuation.curlybrace.close.cadl"),
    openParen: createToken("(", "punctuation.parenthesis.open.cadl"),
    closeParen: createToken(")", "punctuation.parenthesis.close.cadl"),
    semicolon: createToken(";", "punctuation.terminator.statement.cadl"),

    string: {
      doubleQuote: createToken('"', "string.quoted.double.cadl"),
    },
    typeParameters: {
      begin: createToken("<", "punctuation.definition.typeparameters.begin.cadl"),
      end: createToken(">", "punctuation.definition.typeparameters.end.cadl"),
    },
  },

  literals: {
    numeric: (text: string) => createToken(text, "constant.numeric.cadl"),
    string: (text: string) => createToken(text, "string.quoted.double.cadl"),
  },
} as const;
