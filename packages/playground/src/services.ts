import {
  CadlLanguageConfiguration,
  createScanner,
  createServer,
  createSourceFile,
  ServerHost,
  Token,
} from "@cadl-lang/compiler";
import * as monaco from "monaco-editor";
import * as lsp from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { BrowserHost } from "./browserHost";
import "./style.css";

export function attachServices(host: BrowserHost) {
  monaco.languages.register({ id: "cadl" });
  monaco.languages.setLanguageConfiguration("cadl", CadlLanguageConfiguration as any);

  const serverHost: ServerHost = {
    compilerHost: host,
    getDocumentByURL(url: string) {
      const model = monaco.editor.getModel(monaco.Uri.parse(url));
      return model ? textDocumentForModel(model) : undefined;
    },
    sendDiagnostics() {},
    // eslint-disable-next-line no-console
    log: console.log,
  };

  const serverLib = createServer(serverHost);
  const lsConfig = serverLib.initialize({
    capabilities: {},
    processId: 1,
    workspaceFolders: [],
    rootUri: "inmemory://",
  });
  serverLib.initialized({});

  function textDocumentForModel(model: monaco.editor.IModel) {
    return TextDocument.create(
      model.uri.toString(),
      "cadl",
      model.getVersionId(),
      model.getValue()
    );
  }

  function lspArgs(model: monaco.editor.ITextModel, pos: monaco.Position) {
    return {
      textDocument: textDocumentForModel(model),
      position: lspPosition(pos),
    };
  }

  function lspPosition(pos: monaco.Position): lsp.Position {
    return {
      line: pos.lineNumber - 1,
      character: pos.column - 1,
    };
  }

  function monacoLocation(loc: lsp.Location): monaco.languages.Location {
    return {
      uri: monaco.Uri.parse(loc.uri),
      range: monacoRange(loc.range),
    };
  }

  function monacoRange(range: lsp.Range): monaco.IRange {
    return {
      startColumn: range.start.character + 1,
      startLineNumber: range.start.line + 1,
      endColumn: range.end.character + 1,
      endLineNumber: range.end.line + 1,
    };
  }

  function monacoTextEdit(edit: lsp.TextEdit): monaco.languages.TextEdit {
    return {
      range: monacoRange(edit.range),
      text: edit.newText,
    };
  }

  function monacoWorkspaceEdit(edit: lsp.WorkspaceEdit): monaco.languages.WorkspaceEdit {
    const edits: monaco.languages.WorkspaceTextEdit[] = [];
    for (const [uri, changes] of Object.entries(edit.changes ?? {})) {
      const resource = monaco.Uri.parse(uri);
      for (const change of changes) {
        edits.push({ resource, edit: monacoTextEdit(change) });
      }
    }
    return { edits };
  }

  monaco.languages.registerDefinitionProvider("cadl", {
    async provideDefinition(model, position) {
      const results = await serverLib.gotoDefinition(lspArgs(model, position));
      return results.map(monacoLocation);
    },
  });

  monaco.languages.registerReferenceProvider("cadl", {
    async provideReferences(model, position, context) {
      const results = await serverLib.findReferences({ ...lspArgs(model, position), context });
      return results.map(monacoLocation);
    },
  });

  monaco.languages.registerRenameProvider("cadl", {
    async resolveRenameLocation(model, position): Promise<monaco.languages.RenameLocation> {
      const result = await serverLib.prepareRename(lspArgs(model, position));
      if (!result) {
        throw new Error("This element can't be renamed.");
      }
      const text = model.getWordAtPosition(position)?.word;
      if (!text) {
        throw new Error("Failed to obtain word at position.");
      }
      return { text, range: monacoRange(result) };
    },

    async provideRenameEdits(model, position, newName) {
      const result = await serverLib.rename({ ...lspArgs(model, position), newName });
      return monacoWorkspaceEdit(result);
    },
  });

  monaco.languages.registerCompletionItemProvider("cadl", {
    triggerCharacters: lsConfig.capabilities.completionProvider!.triggerCharacters,
    async provideCompletionItems(model, position) {
      const result = await serverLib.complete(lspArgs(model, position));
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions: monaco.languages.CompletionItem[] = [];
      for (const item of result.items) {
        suggestions.push({
          label: item.label,
          kind: item.kind as any,
          documentation: item.documentation,
          insertText: item.insertText!,
          range,
          commitCharacters:
            item.commitCharacters ?? lsConfig.capabilities.completionProvider!.allCommitCharacters,
        });
      }

      return { suggestions };
    },
  });

  const tokenTypes = [
    "comment",
    "string",
    "number",
    "keyword",
    "namespace",
    "variable",
    "type",
    "function",
    "operator",
    "source",
  ];

  function mapToken(tok: Token) {
    switch (tok) {
      case Token.SingleLineComment:
      case Token.MultiLineComment:
        return 0;
      case Token.StringLiteral:
        return 1;
      case Token.NumericLiteral:
        return 2;
      case Token.TrueKeyword:
      case Token.FalseKeyword:
      case Token.IfKeyword:
      case Token.IsKeyword:
      case Token.AliasKeyword:
      case Token.OpKeyword:
      case Token.ElseKeyword:
      case Token.EnumKeyword:
      case Token.VoidKeyword:
      case Token.ModelKeyword:
      case Token.NeverKeyword:
      case Token.UnionKeyword:
      case Token.UsingKeyword:
      case Token.ImportKeyword:
      case Token.ReturnKeyword:
      case Token.ExtendsKeyword:
      case Token.InterfaceKeyword:
      case Token.NamespaceKeyword:
      case Token.ProjectionKeyword:
        return 3;
      default:
        return 9;
    }
  }
  monaco.languages.registerDocumentSemanticTokensProvider("cadl", {
    getLegend() {
      return {
        tokenTypes,
        tokenModifiers: [],
      };
    },
    provideDocumentSemanticTokens(model) {
      const content = model.getValue();
      const file = createSourceFile(content, "");
      const scanner = createScanner(file, () => {});
      const tokens = [];
      let prevLine = 0;
      let prevChar = 0;

      let tok = scanner.scan();
      while (tok !== Token.EndOfFile) {
        const pos = file.getLineAndCharacterOfPosition(scanner.tokenPosition);

        tokens.push(
          pos.line - prevLine,
          prevLine === pos.line ? pos.character - prevChar : pos.character,
          scanner.position - scanner.tokenPosition,
          mapToken(tok),
          0
        );
        prevLine = pos.line;
        prevChar = pos.character;

        tok = scanner.scan();
      }

      return {
        data: new Uint32Array(tokens),
      };
    },
    releaseDocumentSemanticTokens() {},
  });
}
