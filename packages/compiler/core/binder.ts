import { visitChildren } from "./parser.js";
import { Program } from "./program.js";
import {
  AliasStatementNode,
  CadlScriptNode,
  Declaration,
  EnumStatementNode,
  InterfaceStatementNode,
  JsSourceFileNode,
  ModelStatementNode,
  NamespaceStatementNode,
  Node,
  OperationStatementNode,
  ProjectionLambdaExpressionNode,
  ProjectionLambdaParameterDeclarationNode,
  ProjectionNode,
  ProjectionParameterDeclarationNode,
  ProjectionStatementNode,
  ScopeNode,
  Sym,
  SymbolFlags,
  SymbolTable,
  SyntaxKind,
  TemplateParameterDeclarationNode,
  UnionStatementNode,
  UsingStatementNode,
  Writable,
} from "./types.js";

// Use a regular expression to define the prefix for Cadl-exposed functions
// defined in JavaScript modules
const DecoratorFunctionPattern = /^\$/;

const SymbolTable = class extends Map<string, Sym> implements SymbolTable {
  duplicates = new Map<Sym, Set<Sym>>();

  // First set for a given key wins, but record all duplicates for diagnostics.
  set(key: string, value: Sym) {
    const existing = super.get(key);
    if (existing === undefined) {
      super.set(key, value);
    } else {
      if (existing.flags & SymbolFlags.Using) {
        existing.flags |= SymbolFlags.DuplicateUsing;
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
  bindJsSourceFile(sourceFile: JsSourceFileNode): void;
  bindNode(node: Node): void;
}

export function createSymbolTable(): SymbolTable {
  return new SymbolTable();
}

export interface BinderOptions {
  // Configures the initial parent node to use when calling bindNode.  This is
  // useful for binding Cadl fragments outside the context of a full script node.
  initialParentNode?: Node;
}

export function createBinder(program: Program, options: BinderOptions = {}): Binder {
  let currentFile: CadlScriptNode;
  let parentNode: Node | undefined = options?.initialParentNode;
  let fileNamespace: NamespaceStatementNode | undefined;
  let scope: ScopeNode;

  // tracks which selectors were used with which projection symbols
  // for reporting duplicates
  const projectionSymbolSelectors = new Map<Sym, Set<string>>();

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

  function bindJsSourceFile(sourceFile: Writable<JsSourceFileNode>) {
    fileNamespace = undefined;
    sourceFile.symbol = createSymbol(sourceFile, sourceFile.file.path, SymbolFlags.SourceFile);
    const rootNs = sourceFile.esmExports["namespace"];

    for (const [key, member] of Object.entries(sourceFile.esmExports)) {
      let name: string;
      let kind: "decorator" | "function";
      let containerSymbol = sourceFile.symbol;
      const signature = sourceFile.signatures[key];

      if (typeof member === "function") {
        // lots of 'any' casts here because control flow narrowing `member` to Function
        // isn't particularly useful it turns out.
        if (isFunctionName(key)) {
          name = getFunctionName(key);
          kind = "decorator";
          if (name === "onValidate") {
            program.onValidate(member as any);
            continue;
          } else if (name === "onEmit") {
            // nothing to do here this is loaded as emitter.
            continue;
          }
        } else {
          name = key;
          kind = "function";
        }

        const memberNs: string = (member as any).namespace;
        const nsParts = [];
        if (rootNs) {
          nsParts.push(...rootNs.split("."));
        }

        if (memberNs) {
          nsParts.push(...memberNs.split("."));
        }

        for (const part of nsParts) {
          const existingBinding = containerSymbol.exports!.get(part);
          if (existingBinding) {
            if (existingBinding.flags & SymbolFlags.Namespace) {
              // since the namespace was "declared" as part of this source file,
              // we can simply re-use it.
              containerSymbol = existingBinding;
            } else {
              // we have some conflict, lets report a duplicate binding error.
              containerSymbol.exports!.set(
                part,
                createSymbol(sourceFile, part, SymbolFlags.Namespace, containerSymbol)
              );
            }
          } else {
            const sym = createSymbol(sourceFile, part, SymbolFlags.Namespace, containerSymbol);
            sym.exports = createSymbolTable();
            containerSymbol.exports!.set(part, sym);
            containerSymbol = sym;
          }
        }
        let sym;
        if (kind === "decorator") {
          sym = createSymbol(sourceFile, "@" + name, SymbolFlags.Decorator, containerSymbol);
        } else {
          sym = createSymbol(sourceFile, name, SymbolFlags.Function, containerSymbol);
        }
        sym.value = { signature, fn: member };
        containerSymbol.exports!.set(sym.name, sym);
      }
    }
  }

  function bindSourceFile(sourceFile: Writable<CadlScriptNode>) {
    sourceFile.symbol = createSymbol(sourceFile, sourceFile.file.path, SymbolFlags.SourceFile);
    sourceFile.symbol.exports = createSymbolTable();
    fileNamespace = undefined;
    currentFile = sourceFile;
    scope = sourceFile;
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
      case SyntaxKind.Projection:
        bindProjection(node);
        break;
      case SyntaxKind.ProjectionStatement:
        bindProjectionStatement(node);
        break;
      case SyntaxKind.ProjectionParameterDeclaration:
        bindProjectionParameterDeclaration(node);
        break;
      case SyntaxKind.ProjectionLambdaParameterDeclaration:
        bindProjectionLambdaParameterDeclaration(node);
        break;
      case SyntaxKind.ProjectionLambdaExpression:
        bindProjectionLambdaExpression(node);
    }

    const prevParent = parentNode;
    // set parent node when we walk into children
    parentNode = node;

    if (hasScope(node)) {
      const prevScope = scope;
      scope = node;
      visitChildren(node, bindNode);

      if ("locals" in node) {
        program.reportDuplicateSymbols(node.locals);
      }

      scope = prevScope;
    } else {
      visitChildren(node, bindNode);
    }

    // restore parent node
    parentNode = prevParent;
  }

  function bindProjection(node: Writable<ProjectionNode>) {
    node.locals = new SymbolTable();
  }

  /**
   * Binding projection statements is interesting because there may be
   * multiple declarations spread across various source files that all
   * contribute to the same symbol because they declare the same
   * projection on different selectors.
   *
   * There is presently an issue where we do not check for duplicate
   * projections when they're applied to a specific type. This could
   * be done with ease in the checker during evaluation, but could
   * probably instead be done in a post-bind phase - we just need
   * all the symbols in place so we know if a projection was declared
   * multiple times for the same symbol.
   *
   */
  function bindProjectionStatement(node: Writable<ProjectionStatementNode>) {
    const name = node.id.sv;
    const table: SymbolTable = (scope as NamespaceStatementNode | CadlScriptNode).symbol.exports!;
    let sym: Sym;
    if (table.has(name)) {
      sym = table.get(name)!;
      if (!(sym.flags & SymbolFlags.Projection)) {
        // clashing with some other decl, report duplicate symbol
        declareSymbol(node, SymbolFlags.Projection);
        return;
      }
      sym.declarations.push(node);
    } else {
      sym = createSymbol(node, name, SymbolFlags.Projection, scope.symbol);
      table.set(name, sym);
    }

    node.symbol = sym;

    if (
      node.selector.kind !== SyntaxKind.Identifier &&
      node.selector.kind !== SyntaxKind.MemberExpression
    ) {
      const selectorString =
        node.selector.kind === SyntaxKind.ProjectionModelSelector
          ? "model"
          : node.selector.kind === SyntaxKind.ProjectionOperationSelector
          ? "op"
          : node.selector.kind === SyntaxKind.ProjectionUnionSelector
          ? "union"
          : node.selector.kind === SyntaxKind.ProjectionEnumSelector
          ? "enum"
          : "interface";
      let existingSelectors = projectionSymbolSelectors.get(sym);
      if (!existingSelectors) {
        existingSelectors = new Set();
        projectionSymbolSelectors.set(sym, existingSelectors);
      }
      if (existingSelectors.has(selectorString)) {
        // clashing with a like-named decl with this selector, so throw.
        declareSymbol(node, SymbolFlags.Projection);
        return;
      }

      existingSelectors.add(selectorString);
    }
  }

  function bindProjectionParameterDeclaration(node: ProjectionParameterDeclarationNode) {
    declareSymbol(node, SymbolFlags.ProjectionParameter);
  }

  function bindProjectionLambdaParameterDeclaration(
    node: ProjectionLambdaParameterDeclarationNode
  ) {
    declareSymbol(node, SymbolFlags.FunctionParameter);
  }

  function bindProjectionLambdaExpression(node: Writable<ProjectionLambdaExpressionNode>) {
    node.locals = new SymbolTable();
  }

  function bindTemplateParameterDeclaration(node: TemplateParameterDeclarationNode) {
    declareSymbol(node, SymbolFlags.TemplateParameter);
  }

  function bindModelStatement(node: ModelStatementNode) {
    declareSymbol(node, SymbolFlags.Model);
    // Initialize locals for type parameters
    node.locals = new SymbolTable();
  }

  function bindInterfaceStatement(node: InterfaceStatementNode) {
    declareSymbol(node, SymbolFlags.Interface);
    node.locals = new SymbolTable();
  }

  function bindUnionStatement(node: UnionStatementNode) {
    declareSymbol(node, SymbolFlags.Union);
    node.locals = new SymbolTable();
  }

  function bindAliasStatement(node: AliasStatementNode) {
    declareSymbol(node, SymbolFlags.Alias);
    // Initialize locals for type parameters
    node.locals = new SymbolTable();
  }

  function bindEnumStatement(node: EnumStatementNode) {
    declareSymbol(node, SymbolFlags.Enum);
  }

  function bindNamespaceStatement(statement: Writable<NamespaceStatementNode>) {
    // check if there's an existing symbol for this namespace
    const existingBinding = (scope as NamespaceStatementNode).symbol.exports!.get(statement.id.sv);
    if (existingBinding && existingBinding.flags & SymbolFlags.Namespace) {
      statement.symbol = existingBinding;
      // locals are never shared.
      statement.locals = createSymbolTable();
      existingBinding.declarations.push(statement);
    } else {
      // Initialize locals for non-exported symbols
      statement.locals = createSymbolTable();
      declareSymbol(statement, SymbolFlags.Namespace);
    }

    currentFile.namespaces.push(statement);

    if (statement.statements === undefined) {
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
      declareSymbol(statement, SymbolFlags.Operation);
      statement.locals = new SymbolTable();
    }
  }

  function declareSymbol(node: Writable<Declaration>, flags: SymbolFlags) {
    switch (scope.kind) {
      case SyntaxKind.NamespaceStatement:
        return declareNamespaceMember(node, flags);
      case SyntaxKind.CadlScript:
      case SyntaxKind.JsSourceFile:
        return declareScriptMember(node, flags);
      default:
        const symbol = createSymbol(node, node.id.sv, flags, scope.symbol);
        node.symbol = symbol;
        scope.locals!.set(node.id.sv, symbol);
        return symbol;
    }
  }

  function declareNamespaceMember(node: Writable<Declaration>, flags: SymbolFlags) {
    if (
      flags & SymbolFlags.Namespace &&
      mergeNamespaceDeclarations(node as NamespaceStatementNode, scope)
    ) {
      return;
    }
    const symbol = createSymbol(node, node.id.sv, flags, scope.symbol);
    node.symbol = symbol;
    scope.symbol.exports!.set(node.id.sv, symbol);
    return symbol;
  }

  function declareScriptMember(node: Writable<Declaration>, flags: SymbolFlags) {
    const effectiveScope = fileNamespace ?? scope;
    if (
      flags & SymbolFlags.Namespace &&
      mergeNamespaceDeclarations(node as NamespaceStatementNode, effectiveScope)
    ) {
      return;
    }
    const symbol = createSymbol(node, node.id.sv, flags, fileNamespace?.symbol);
    node.symbol = symbol;
    effectiveScope.symbol.exports!.set(node.id.sv, symbol);
    return symbol;
  }

  function mergeNamespaceDeclarations(node: Writable<NamespaceStatementNode>, scope: ScopeNode) {
    // we are declaring a namespace in either global scope, or a blockless namespace.
    const existingBinding = scope.symbol.exports!.get(node.id.sv);
    if (existingBinding) {
      // we have an existing binding, so just push this node to its declarations
      existingBinding!.declarations.push(node);
      node.symbol = existingBinding;
      return true;
    }
    return false;
  }
}

function hasScope(node: Node): node is ScopeNode {
  switch (node.kind) {
    case SyntaxKind.ModelStatement:
    case SyntaxKind.AliasStatement:
    case SyntaxKind.CadlScript:
    case SyntaxKind.InterfaceStatement:
    case SyntaxKind.OperationStatement:
    case SyntaxKind.UnionStatement:
    case SyntaxKind.Projection:
    case SyntaxKind.ProjectionLambdaExpression:
      return true;
    case SyntaxKind.NamespaceStatement:
      return node.statements !== undefined;
    default:
      return false;
  }
}

export function createSymbol(
  node: Node | undefined,
  name: string,
  flags: SymbolFlags,
  parent?: Sym,
  value?: any
): Sym {
  let exports: SymbolTable | undefined;
  if (flags & SymbolFlags.ExportContainer) {
    exports = createSymbolTable();
  }
  let members: SymbolTable | undefined;
  if (flags & SymbolFlags.MemberContainer) {
    members = createSymbolTable();
  }

  return {
    declarations: node ? [node] : [],
    name,
    exports,
    members,
    flags,
    value,
    parent,
  };
}
