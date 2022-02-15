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
    const data = await readFile("./dist/cadl.tmLanguage");
    return parseRawGrammar(data.toString());
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
    namespace: createToken("namespace", "keyword.other.cadl"),
    other: (text: string) => createToken(text, "keyword.other.cadl"),
  },
  meta: (text: string, meta: string) => createToken(text, `meta.${meta}.cadl`),
  identifiers: {
    type: (name: string) => createToken(name, "entity.name.type.cadl"),
  },
  punctuation: {
    accessor: createToken(".", "punctuation.accessor.cadl"),
    openBrace: createToken("{", "punctuation.curlybrace.open.cadl"),
    closeBrace: createToken("}", "punctuation.curlybrace.close.cadl"),
    semicolon: createToken(";", "punctuation.terminator.statement.cadl"),
  },
} as const;
