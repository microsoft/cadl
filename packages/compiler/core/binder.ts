import { compilerAssert } from "./diagnostics.js";
import { NodeFlags, visitChildren } from "./parser.js";
import { Program } from "./program.js";
import {
  AliasStatementNode,
  CadlScriptNode,
  ContainerNode,
  Declaration,
  DecoratorSymbol,
  EnumStatementNode,
  ExportSymbol,
  IdentifierNode,
  InterfaceStatementNode,
  JsSourceFile,
  LocalSymbol,
  ModelStatementNode,
  NamespaceStatementNode,
  Node,
  OperationStatementNode,
  ScopeNode,
  Sym,
  SymbolTable,
  SyntaxKind,
  TemplateParameterDeclarationNode,
  TypeSymbol,
  UnionStatementNode,
  UsingStatementNode,
  Writable,
} from "./types.js";

// Use a regular expression to define the prefix for Cadl-exposed functions
// defined in JavaScript modules
const DecoratorFunctionPattern = /^\$/;

const SymbolTable = class<T extends Sym> extends Map<string, T> implements SymbolTable<T> {
  duplicates = new Map<T, Set<T>>();

  // First set for a given key wins, but record all duplicates for diagnostics.
  set(key: string, value: T) {
    const existing = super.get(key);
    if (existing === undefined) {
      super.set(key, value);
    } else {
      if (existing.kind === "using") {
        existing.duplicate = true;
      }

      const duplicateArray = this.duplicates.get(existing);
      if (duplicateArray) {
        duplicateArray.add(value);
      } else {
        this.duplicates.set(existing, new Set([existing, value]));
      }
    }
    return this;
  }
};

export interface Binder {
  bindSourceFile(sourceFile: CadlScriptNode): void;
  bindJsSourceFile(sourceFile: JsSourceFile): void;
  bindNode(node: Node): void;
}

export function createSymbolTable<T extends Sym>(): SymbolTable<T> {
  return new SymbolTable<T>();
}

export interface BinderOptions {
  // Configures the initial parent node to use when calling bindNode.  This is
  // useful for binding Cadl fragments outside the context of a full script node.
  initialParentNode?: Node;
}

export function createBinder(program: Program, options: BinderOptions = {}): Binder {
  let currentFile: CadlScriptNode;
  let parentNode: Node | undefined = options?.initialParentNode;
  let fileNamespace: NamespaceStatementNode | CadlScriptNode;
  let currentNamespace: ContainerNode;
  let isJsFile = false;

  // Node where locals go.
  let scope: ScopeNode | JsSourceFile;

  return {
    bindSourceFile,
    bindNode,
    bindJsSourceFile,
  };

  function isFunctionName(name: string): boolean {
    return DecoratorFunctionPattern.test(name);
  }

  function getFunctionName(name: string): string {
    return name.replace(DecoratorFunctionPattern, "");
  }

  function bindJsSourceFile(sourceFile: JsSourceFile) {
    sourceFile.exports = createSymbolTable();
    isJsFile = true;
    const rootNs = sourceFile.esmExports["namespace"];
    const namespaces = new Set<NamespaceStatementNode>();
    for (const [key, member] of Object.entries(sourceFile.esmExports)) {
      if (typeof member === "function" && isFunctionName(key)) {
        // lots of 'any' casts here because control flow narrowing `member` to Function
        // isn't particularly useful it turns out.

        const name = getFunctionName(key);
        if (name === "onValidate") {
          program.onValidate(member as any);
          continue;
        } else if (name === "onEmit") {
          // nothing to do here this is loaded as emitter.
          continue;
        }

        const memberNs: string = (member as any).namespace;
        const nsParts = [];
        if (rootNs) {
          nsParts.push(...rootNs.split("."));
        }

        if (memberNs) {
          nsParts.push(...memberNs.split("."));
        }

        scope = sourceFile;
        for (const part of nsParts) {
          const existingBinding = scope.exports!.get(part);
          if (
            existingBinding &&
            existingBinding.kind === "type" &&
            namespaces.has(existingBinding.node as NamespaceStatementNode)
          ) {
            // since the namespace was "declared" as part of this source file,
            // we can simply re-use it.
            scope = existingBinding.node as NamespaceStatementNode;
          } else {
            // need to synthesize a namespace declaration node
            // consider creating a "synthetic" node flag if necessary
            const nsNode = createSyntheticNamespace(part);

            if (existingBinding && existingBinding.kind === "type") {
              nsNode.symbol = existingBinding;
              nsNode.exports = (existingBinding.node as NamespaceStatementNode).exports;
            } else {
              declareSymbol(scope.exports!, nsNode, part);
            }

            namespaces.add(nsNode);
            scope = nsNode;
          }
        }
        const sym = createDecoratorSymbol(name, sourceFile.file.path, member);
        scope.exports!.set(sym.name, sym);
      }
    }

    (sourceFile as any).namespaces = Array.from(namespaces);
  }

  function bindSourceFile(sourceFile: Writable<CadlScriptNode>) {
    isJsFile = false;
    sourceFile.exports = createSymbolTable();
    fileNamespace = currentFile = sourceFile;
    currentNamespace = scope = fileNamespace;
    bindNode(sourceFile);
  }

  function bindNode(node: Node) {
    if (!node) return;
    // set the node's parent since we're going for a walk anyway
    node.parent = parentNode;

    switch (node.kind) {
      case SyntaxKind.ModelStatement:
        bindModelStatement(node);
        break;
      case SyntaxKind.InterfaceStatement:
        bindInterfaceStatement(node);
        break;
      case SyntaxKind.UnionStatement:
        bindUnionStatement(node);
        break;
      case SyntaxKind.AliasStatement:
        bindAliasStatement(node);
        break;
      case SyntaxKind.EnumStatement:
        bindEnumStatement(node);
        break;
      case SyntaxKind.NamespaceStatement:
        bindNamespaceStatement(node);
        break;
      case SyntaxKind.OperationStatement:
        bindOperationStatement(node);
        break;
      case SyntaxKind.TemplateParameterDeclaration:
        bindTemplateParameterDeclaration(node);
        break;
      case SyntaxKind.UsingStatement:
        bindUsingStatement(node);
        break;
    }

    const prevParent = parentNode;
    // set parent node when we walk into children
    parentNode = node;

    if (hasScope(node)) {
      const prevScope = scope;
      const prevNamespace = currentNamespace;
      scope = node;
      if (node.kind === SyntaxKind.NamespaceStatement) {
        currentNamespace = node;
      }

      visitChildren(node, bindNode);

      if (node.kind !== SyntaxKind.NamespaceStatement && node.locals) {
        program.reportDuplicateSymbols(node.locals!);
      }

      scope = prevScope;
      currentNamespace = prevNamespace;
    } else {
      visitChildren(node, bindNode);
    }

    // restore parent node
    parentNode = prevParent;
  }

  function getContainingSymbolTable() {
    switch (scope.kind) {
      case SyntaxKind.NamespaceStatement:
        return scope.exports!;
      case SyntaxKind.CadlScript:
        return fileNamespace.exports!;
      case "JsSourceFile":
        return scope.exports!;
      default:
        return scope.locals!;
    }
  }

  function bindTemplateParameterDeclaration(node: TemplateParameterDeclarationNode) {
    declareSymbol(getContainingSymbolTable(), node, node.id.sv);
  }

  function bindModelStatement(node: ModelStatementNode) {
    declareSymbol(getContainingSymbolTable(), node, node.id.sv);
    // Initialize locals for type parameters
    node.locals = new SymbolTable<LocalSymbol>();
  }

  function bindInterfaceStatement(node: InterfaceStatementNode) {
    declareSymbol(getContainingSymbolTable(), node, node.id.sv);
    node.locals = new SymbolTable<LocalSymbol>();
  }

  function bindUnionStatement(node: UnionStatementNode) {
    declareSymbol(getContainingSymbolTable(), node, node.id.sv);
    node.locals = new SymbolTable<LocalSymbol>();
  }

  function bindAliasStatement(node: AliasStatementNode) {
    declareSymbol(getContainingSymbolTable(), node, node.id.sv);
    // Initialize locals for type parameters
    node.locals = new SymbolTable<LocalSymbol>();
  }

  function bindEnumStatement(node: EnumStatementNode) {
    declareSymbol(getContainingSymbolTable(), node, node.id.sv);
  }

  function bindNamespaceStatement(statement: Writable<NamespaceStatementNode>) {
    // check if there's an existing symbol for this namespace
    const existingBinding = currentNamespace.exports!.get(statement.name.sv);
    if (existingBinding && existingBinding.kind === "type") {
      statement.symbol = existingBinding;
      // locals are never shared.
      statement.locals = createSymbolTable();

      // todo: don't merge exports
      statement.exports = (existingBinding.node as NamespaceStatementNode).exports;
    } else {
      declareSymbol(getContainingSymbolTable(), statement, statement.name.sv);

      // Initialize locals for non-exported symbols
      statement.locals = createSymbolTable();

      // initialize exports for exported symbols
      statement.exports = new SymbolTable<ExportSymbol>();
    }

    currentFile.namespaces.push(statement);

    if (statement.statements === undefined) {
      scope = currentNamespace = statement;
      fileNamespace = statement;
      let current: CadlScriptNode | NamespaceStatementNode = statement;
      while (current.kind !== SyntaxKind.CadlScript) {
        (currentFile.inScopeNamespaces as NamespaceStatementNode[]).push(current);
        current = current.parent as CadlScriptNode | NamespaceStatementNode;
      }
    }
  }

  function bindUsingStatement(statement: UsingStatementNode) {
    (currentFile.usings as UsingStatementNode[]).push(statement);
  }

  function bindOperationStatement(statement: OperationStatementNode) {
    if (scope.kind !== SyntaxKind.InterfaceStatement) {
      declareSymbol(getContainingSymbolTable(), statement, statement.id.sv);
    }
  }

  function declareSymbol(table: SymbolTable<Sym>, node: Writable<Declaration>, name: string) {
    compilerAssert(table, "Attempted to declare symbol on non-existent table");
    const symbol = createTypeSymbol(node, name);
    node.symbol = symbol;

    if (scope.kind === SyntaxKind.NamespaceStatement) {
      compilerAssert(
        node.kind !== SyntaxKind.TemplateParameterDeclaration,
        "Attempted to declare template parameter in namespace",
        node
      );

      node.namespaceSymbol = scope.symbol;
    } else if (scope.kind === SyntaxKind.CadlScript) {
      compilerAssert(
        node.kind !== SyntaxKind.TemplateParameterDeclaration,
        "Attempted to declare template parameter in global scope",
        node
      );

      if (fileNamespace.kind !== SyntaxKind.CadlScript) {
        node.namespaceSymbol = fileNamespace.symbol;
      }
    }

    table.set(name, symbol);
  }
}

function hasScope(node: Node): node is ScopeNode {
  switch (node.kind) {
    case SyntaxKind.ModelStatement:
    case SyntaxKind.AliasStatement:
      return true;
    case SyntaxKind.NamespaceStatement:
      return node.statements !== undefined;
    case SyntaxKind.CadlScript:
      return true;
    case SyntaxKind.InterfaceStatement:
      return true;
    case SyntaxKind.UnionStatement:
      return true;
    default:
      return false;
  }
}

function createTypeSymbol(node: Node, name: string): TypeSymbol {
  return {
    kind: "type",
    node,
    name,
  };
}

function createDecoratorSymbol(name: string, path: string, value: any): DecoratorSymbol {
  return {
    kind: "decorator",
    name: `@` + name,
    path,
    value,
  };
}

function createSyntheticNamespace(
  name: string
): Writable<NamespaceStatementNode & { flags: NodeFlags }> {
  const nsId: IdentifierNode = {
    kind: SyntaxKind.Identifier,
    pos: 0,
    end: 0,
    sv: name,
  };

  return {
    kind: SyntaxKind.NamespaceStatement,
    decorators: [],
    pos: 0,
    end: 0,
    name: nsId,
    symbol: undefined as any,
    locals: createSymbolTable(),
    exports: createSymbolTable(),
    flags: NodeFlags.Synthetic,
  };
}
