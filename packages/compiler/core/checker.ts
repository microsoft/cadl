import { getDeprecated } from "../lib/decorators.js";
import { createSymbol, createSymbolTable } from "./binder.js";
import { compilerAssert, ProjectionError } from "./diagnostics.js";
import {
  DecoratorContext,
  Diagnostic,
  DiagnosticTarget,
  Expression,
  getIndexer,
  getIntrinsicModelName,
  IdentifierKind,
  IntrinsicModelName,
  isIntrinsic,
  isNeverType,
  isUnknownType,
  isVoidType,
  JsSourceFileNode,
  ModelIndexer,
  ModelKeyIndexer,
  ModelSpreadPropertyNode,
  NeverIndexer,
  NeverType,
  ProjectionModelExpressionNode,
  ProjectionModelPropertyNode,
  ProjectionModelSpreadPropertyNode,
  reportDeprecated,
  SymbolFlags,
  TemplateParameterType,
  UnknownType,
  VoidType,
} from "./index.js";
import { createDiagnostic, reportDiagnostic } from "./messages.js";
import { getIdentifierContext, hasParseError, visitChildren } from "./parser.js";
import { Program } from "./program.js";
import { createProjectionMembers } from "./projection-members.js";
import {
  AliasStatementNode,
  ArrayExpressionNode,
  BooleanLiteralNode,
  BooleanLiteralType,
  CadlScriptNode,
  DecoratorApplication,
  DecoratorArgument,
  DecoratorExpressionNode,
  EnumMemberNode,
  EnumMemberType,
  EnumStatementNode,
  EnumType,
  ErrorType,
  FunctionType,
  IdentifierNode,
  InterfaceStatementNode,
  InterfaceType,
  IntersectionExpressionNode,
  LiteralNode,
  LiteralType,
  MemberExpressionNode,
  ModelExpressionNode,
  ModelPropertyNode,
  ModelStatementNode,
  ModelType,
  ModelTypeProperty,
  NamespaceStatementNode,
  NamespaceType,
  Node,
  NodeFlags,
  NumericLiteralNode,
  NumericLiteralType,
  OperationStatementNode,
  OperationType,
  ProjectionArithmeticExpressionNode,
  ProjectionBlockExpressionNode,
  ProjectionCallExpressionNode,
  ProjectionDecoratorReferenceExpressionNode,
  ProjectionEqualityExpressionNode,
  ProjectionExpression,
  ProjectionExpressionStatement,
  ProjectionIfExpressionNode,
  ProjectionLambdaExpressionNode,
  ProjectionMemberExpressionNode,
  ProjectionNode,
  ProjectionRelationalExpressionNode,
  ProjectionStatementItem,
  ProjectionStatementNode,
  ProjectionType,
  ProjectionUnaryExpressionNode,
  ReturnExpressionNode,
  ReturnRecord,
  StringLiteralNode,
  StringLiteralType,
  Sym,
  SymbolLinks,
  SymbolTable,
  SyntaxKind,
  TemplateDeclarationNode,
  TemplateParameterDeclarationNode,
  TupleExpressionNode,
  TupleType,
  Type,
  TypeInstantiationMap,
  TypeOrReturnRecord,
  TypeReferenceNode,
  UnionExpressionNode,
  UnionStatementNode,
  UnionType,
  UnionTypeVariant,
  UnionVariantNode,
  Writable,
} from "./types.js";
import { isArray } from "./util.js";

export interface TypeNameOptions {
  namespaceFilter: (ns: NamespaceType) => boolean;
}

export interface Checker {
  getTypeForNode(node: Node): Type;
  setUsingsForFile(file: CadlScriptNode): void;
  checkProgram(): void;
  checkSourceFile(file: CadlScriptNode): void;
  getGlobalNamespaceType(): NamespaceType;
  getGlobalNamespaceNode(): NamespaceStatementNode;
  getMergedSymbol(sym: Sym | undefined): Sym | undefined;
  mergeSourceFile(file: CadlScriptNode | JsSourceFileNode): void;
  getLiteralType(node: StringLiteralNode): StringLiteralType;
  getLiteralType(node: NumericLiteralNode): NumericLiteralType;
  getLiteralType(node: BooleanLiteralNode): BooleanLiteralType;
  getLiteralType(node: LiteralNode): LiteralType;
  getTypeName(type: Type, options?: TypeNameOptions): string;
  getNamespaceString(type: NamespaceType | undefined, options?: TypeNameOptions): string;
  cloneType<T extends Type>(type: T, additionalProps?: { [P in keyof T]?: T[P] }): T;
  evalProjection(node: ProjectionNode, target: Type, args: Type[]): Type;
  project(
    target: Type,
    projection: ProjectionNode,
    args?: (Type | string | number | boolean)[]
  ): Type;
  resolveIdentifier(node: IdentifierNode): Sym | undefined;
  resolveCompletions(node: IdentifierNode): Map<string, CadlCompletionItem>;
  createType<T>(typeDef: T): T & TypePrototype;
  createAndFinishType<U extends Type extends any ? Omit<Type, keyof TypePrototype> : never>(
    typeDef: U
  ): U & TypePrototype;
  finishType<T extends Type>(typeDef: T): T;
  createFunctionType(fn: (...args: Type[]) => Type): FunctionType;
  createLiteralType(value: string, node?: StringLiteralNode): StringLiteralType;
  createLiteralType(value: number, node?: NumericLiteralNode): NumericLiteralType;
  createLiteralType(value: boolean, node?: BooleanLiteralNode): BooleanLiteralType;
  createLiteralType(
    value: string | number | boolean,
    node?: StringLiteralNode | NumericLiteralNode | BooleanLiteralNode
  ): StringLiteralType | NumericLiteralType | BooleanLiteralType;
  createLiteralType(
    value: string | number | boolean,
    node?: StringLiteralNode | NumericLiteralNode | BooleanLiteralNode
  ): StringLiteralType | NumericLiteralType | BooleanLiteralType;

  /**
   * Check if the source type can be assigned to the target type.
   * @param source Source type, should be assignable to the target.
   * @param target Target type
   * @param diagnosticTarget Target for the diagnostic, unless something better can be inffered.
   * @returns [related, list of diagnostics]
   */
  isTypeAssignableTo(
    source: Type,
    target: Type,
    diagnosticTarget: DiagnosticTarget
  ): [boolean, Diagnostic[]];

  /**
   * Check if the given type is one of the built-in standard Cadl Types.
   * @param type Type to check
   * @param stdType If provided check is that standard type
   */
  isStdType(type: Type, stdType?: IntrinsicModelName | "Array" | "Record"): boolean;

  /**
   * Applies a filter to the properties of a given type. If no properties
   * are filtered out, then return the input unchanged. Otherwise, return
   * a new anonymous model with only the filtered properties.
   *
   * @param model The input model to filter.
   * @param filter The filter to apply. Properties are kept when this returns true.
   */
  filterModelProperties(
    model: ModelType,
    filter: (property: ModelTypeProperty) => boolean
  ): ModelType;

  /**
   * If the input is anonymous (or the provided filter removes properties)
   * and there exists a named model with the same set of properties
   * (ignoring filtered properties), then return that named model.
   * Otherwise, return the input unchanged.
   *
   * This can be used by emitters to find a better name for a set of
   * properties after filtering. For example, given `{ @metadata prop:
   * string} & SomeName`, and an emitter that wishes to discard properties
   * marked with `@metadata`, the emitter can use this to recover that the
   * best name for the remaining properties is `SomeName`.
   *
   * @param model The input model
   * @param filter An optional filter to apply to the input model's
   * properties.
   */
  getEffectiveModelType(
    model: ModelType,
    filter?: (property: ModelTypeProperty) => boolean
  ): ModelType;

  errorType: ErrorType;
  voidType: VoidType;
  neverType: NeverType;
  anyType: UnknownType;
}

interface TypePrototype {
  projections: ProjectionStatementNode[];
  projectionsByName(name: string): ProjectionStatementNode[];
}

export interface CadlCompletionItem {
  sym: Sym;

  /**
   *  Optional label if different from the text to complete.
   */
  label?: string;
}

/**
 * A map keyed by a set of objects.
 *
 * This is likely non-optimal.
 */
class MultiKeyMap<K extends object[], V> {
  #currentId = 0;
  #idMap = new WeakMap<object, number>();
  #items = new Map<string, V>();

  get(items: K): V | undefined {
    return this.#items.get(this.compositeKeyFor(items));
  }

  set(items: K, value: V): void {
    const key = this.compositeKeyFor(items);
    this.#items.set(key, value);
  }

  private compositeKeyFor(items: K) {
    return items.map((i) => this.keyFor(i)).join(",");
  }

  private keyFor(item: object) {
    if (this.#idMap.has(item)) {
      return this.#idMap.get(item);
    }

    const id = this.#currentId++;
    this.#idMap.set(item, id);
    return id;
  }
}

/**
 * Maps type arguments to type instantiation.
 */
const TypeInstantiationMap = class
  extends MultiKeyMap<Type[], Type>
  implements TypeInstantiationMap {};

type StdTypeName = IntrinsicModelName | "Array" | "Record";

export function createChecker(program: Program): Checker {
  let templateInstantiation: Type[] = [];
  let instantiatingTemplate: Node | undefined;
  let currentSymbolId = 0;
  const stdTypes: Partial<Record<StdTypeName, ModelType>> = {};
  const symbolLinks = new Map<number, SymbolLinks>();
  const mergedSymbols = new Map<Sym, Sym>();
  const typePrototype: TypePrototype = {
    get projections(): ProjectionStatementNode[] {
      return (projectionsByTypeKind.get((this as Type).kind) || []).concat(
        projectionsByType.get(this as Type) || []
      );
    },
    projectionsByName(name: string): ProjectionStatementNode[] {
      return this.projections.filter((p) => p.id.sv === name);
    },
  };
  const globalNamespaceNode = createGlobalNamespaceNode();
  const globalNamespaceType = createGlobalNamespaceType();
  let cadlNamespaceNode: NamespaceStatementNode | undefined;

  const errorType: ErrorType = createType({ kind: "Intrinsic", name: "ErrorType" });
  const voidType = createType({ kind: "Intrinsic", name: "void" } as const);
  const neverType = createType({ kind: "Intrinsic", name: "never" } as const);
  const unknownType = createType({ kind: "Intrinsic", name: "unknown" } as const);

  const projectionsByTypeKind = new Map<Type["kind"], ProjectionStatementNode[]>([
    ["Model", []],
    ["Union", []],
    ["Operation", []],
    ["Interface", []],
    ["Enum", []],
  ]);
  const projectionsByType = new Map<Type, ProjectionStatementNode[]>();
  // whether we've checked this specific projection statement before
  // and added it to the various projection maps.
  const processedProjections = new Set<ProjectionStatementNode>();

  // interpreter state
  let currentProjectionDirection: "to" | "from" | undefined;
  /**
   * Set keeping track of node pending type resolution.
   * Key is the SymId of a node. It can be retrieved with getNodeSymId(node)
   */
  const pendingResolutions = new Set<number>();

  for (const file of program.jsSourceFiles.values()) {
    mergeSourceFile(file);
  }

  for (const file of program.sourceFiles.values()) {
    mergeSourceFile(file);
  }

  for (const file of program.sourceFiles.values()) {
    setUsingsForFile(file);
  }

  const cadlNamespaceBinding = globalNamespaceNode.symbol.exports!.get("Cadl");
  if (cadlNamespaceBinding) {
    // the cadl namespace binding will be absent if we've passed
    // the no-std-lib option.
    // the first declaration here is the JS file for the cadl script.
    cadlNamespaceNode = cadlNamespaceBinding.declarations[1] as NamespaceStatementNode;
    initializeCadlIntrinsics();
    for (const file of program.sourceFiles.values()) {
      for (const [name, binding] of cadlNamespaceBinding.exports!) {
        const usedSym = createUsingSymbol(binding);
        file.locals!.set(name, usedSym);
      }
    }
  }

  let evalContext: EvalContext | undefined = undefined;

  const checker: Checker = {
    getTypeForNode,
    checkProgram,
    checkSourceFile,
    getLiteralType,
    getTypeName,
    getNamespaceString,
    getGlobalNamespaceType,
    getGlobalNamespaceNode,
    setUsingsForFile,
    getMergedSymbol,
    mergeSourceFile,
    cloneType,
    resolveIdentifier,
    resolveCompletions,
    evalProjection: evalProjectionStatement,
    project,
    neverType,
    errorType,
    anyType: unknownType,
    voidType,
    createType,
    createAndFinishType,
    createFunctionType,
    createLiteralType,
    finishType,
    isTypeAssignableTo,
    isStdType,
    getEffectiveModelType,
    filterModelProperties,
  };

  const projectionMembers = createProjectionMembers(checker);
  return checker;

  function initializeCadlIntrinsics() {
    // a utility function to log strings or numbers
    cadlNamespaceBinding!.exports!.set("log", {
      flags: SymbolFlags.Function,
      name: "log",
      value(p: Program, str: string): Type {
        program.logger.log({ level: "debug", message: str });
        return voidType;
      },
      declarations: [],
    });
  }

  function getStdType<T extends StdTypeName>(name: T): ModelType & { name: T } {
    const type = stdTypes[name];
    if (type !== undefined) {
      return type as any;
    }

    const sym = cadlNamespaceBinding?.exports?.get(name);
    checkModelStatement(sym!.declarations[0] as any);

    const loadedType = stdTypes[name];
    compilerAssert(
      loadedType,
      "Cadl built-in array type should have been initalized before using array syntax."
    );
    return loadedType as any;
  }

  function mergeSourceFile(file: CadlScriptNode | JsSourceFileNode) {
    mergeSymbolTable(file.symbol.exports!, globalNamespaceNode.symbol.exports!);
  }

  function setUsingsForFile(file: CadlScriptNode) {
    const usedUsing = new Set<Sym>();

    for (const using of file.usings) {
      const parentNs = using.parent! as NamespaceStatementNode | CadlScriptNode;
      const sym = resolveTypeReference(using.name);
      if (!sym) {
        continue;
      }

      if (!(sym.flags & SymbolFlags.Namespace)) {
        program.reportDiagnostic(createDiagnostic({ code: "using-invalid-ref", target: using }));
      }

      const namespaceSym = getMergedSymbol(sym)!;

      if (usedUsing.has(namespaceSym)) {
        reportDiagnostic(program, {
          code: "duplicate-using",
          format: { usingName: memberExpressionToString(using.name) },
          target: using,
        });
        continue;
      }
      usedUsing.add(namespaceSym);

      for (const [name, binding] of sym.exports!) {
        parentNs.locals!.set(name, createUsingSymbol(binding));
      }
    }

    if (cadlNamespaceNode) {
      for (const [name, binding] of cadlNamespaceBinding!.exports!) {
        file.locals!.set(name, createUsingSymbol(binding));
      }
    }
  }

  function getTypeForNode(node: Node): Type {
    switch (node.kind) {
      case SyntaxKind.ModelExpression:
        return checkModel(node);
      case SyntaxKind.ModelStatement:
        return checkModel(node);
      case SyntaxKind.ModelProperty:
        return checkModelProperty(node);
      case SyntaxKind.AliasStatement:
        return checkAlias(node);
      case SyntaxKind.EnumStatement:
        return checkEnum(node);
      case SyntaxKind.InterfaceStatement:
        return checkInterface(node);
      case SyntaxKind.UnionStatement:
        return checkUnion(node);
      case SyntaxKind.NamespaceStatement:
        return checkNamespace(node);
      case SyntaxKind.OperationStatement:
        return checkOperation(node);
      case SyntaxKind.NumericLiteral:
        return checkNumericLiteral(node);
      case SyntaxKind.BooleanLiteral:
        return checkBooleanLiteral(node);
      case SyntaxKind.TupleExpression:
        return checkTupleExpression(node);
      case SyntaxKind.StringLiteral:
        return checkStringLiteral(node);
      case SyntaxKind.ArrayExpression:
        return checkArrayExpression(node);
      case SyntaxKind.UnionExpression:
        return checkUnionExpression(node);
      case SyntaxKind.IntersectionExpression:
        return checkIntersectionExpression(node);
      case SyntaxKind.TypeReference:
        return checkTypeReference(node);
      case SyntaxKind.TemplateParameterDeclaration:
        return checkTemplateParameterDeclaration(node);
      case SyntaxKind.ProjectionStatement:
        return checkProjectionDeclaration(node);
      case SyntaxKind.VoidKeyword:
        return voidType;
      case SyntaxKind.NeverKeyword:
        return neverType;
      case SyntaxKind.UnknownKeyword:
        return unknownType;
    }

    // we don't emit an error here as we blindly call this function
    // with any node type, but some nodes don't produce a type
    // (e.g. imports). errorType should result in an error if it
    // bubbles out somewhere its not supposed to be.
    return errorType;
  }

  function getTypeName(type: Type, options?: TypeNameOptions): string {
    switch (type.kind) {
      case "Model":
        return getModelName(type, options);
      case "ModelProperty":
        return getModelPropertyName(type, options);
      case "Interface":
        return getInterfaceName(type, options);
      case "Operation":
        return getOperationName(type, options);
      case "Enum":
        return getEnumName(type, options);
      case "EnumMember":
        return `${getEnumName(type.enum, options)}.${type.name}`;
      case "Union":
        return type.name || type.options.map((x) => getTypeName(x, options)).join(" | ");
      case "UnionVariant":
        return getTypeName(type.type, options);
      case "Tuple":
        return "[" + type.values.map((x) => getTypeName(x, options)).join(", ") + "]";
      case "String":
      case "Number":
      case "Boolean":
        return type.value.toString();
      case "Intrinsic":
        return type.name;
    }

    return "(unnamed type)";
  }

  function getNamespaceString(type: NamespaceType | undefined, options?: TypeNameOptions): string {
    if (!type || !type.name) {
      return "";
    }

    const filter = options?.namespaceFilter;
    if (filter && !filter(type)) {
      return "";
    }

    const parent = getNamespaceString(type.namespace, options);
    return parent ? `${parent}.${type.name}` : type.name;
  }

  function getFullyQualifiedSymbolName(sym: Sym | undefined): string {
    if (!sym) return "";
    const parent = sym.parent;
    return parent && parent.name !== ""
      ? `${getFullyQualifiedSymbolName(parent)}.${sym.name}`
      : sym.name;
  }

  function getEnumName(e: EnumType, options: TypeNameOptions | undefined): string {
    const nsName = getNamespaceString(e.namespace, options);
    return nsName ? `${nsName}.${e.name}` : e.name;
  }

  /**
   * Return a fully qualified id of node
   */
  function getNodeSymId(
    node:
      | ModelStatementNode
      | AliasStatementNode
      | InterfaceStatementNode
      | OperationStatementNode
      | UnionStatementNode
  ): number {
    return node.symbol!.id!;
  }

  /**
   * Check if the given namespace is the standard library `Cadl` namespace.
   */
  function isCadlNamespace(
    namespace: NamespaceType
  ): namespace is NamespaceType & { name: "Cadl"; namespace: NamespaceType } {
    return (
      namespace.name === "Cadl" &&
      (namespace.namespace === globalNamespaceType ||
        namespace.namespace === program.currentProjector?.projectedGlobalNamespace)
    );
  }

  /**
   * Check if the given type is defined right in the Cadl namespace.
   */
  function isInCadlNamespace(type: Type & { namespace?: NamespaceType }): boolean {
    return Boolean(type.namespace && isCadlNamespace(type.namespace));
  }

  function getModelName(model: ModelType, options: TypeNameOptions | undefined) {
    const nsName = getNamespaceString(model.namespace, options);
    if (model.name === "" && model.properties.size === 0) {
      return "{}";
    }
    if (model.indexer && model.indexer.key.kind === "Model") {
      if (model.name === "Array" && isInCadlNamespace(model)) {
        return `${getTypeName(model.indexer.value!, options)}[]`;
      }
    }

    const modelName = (nsName ? nsName + "." : "") + (model.name || "(anonymous model)");
    if (model.templateArguments && model.templateArguments.length > 0) {
      // template instantiation
      const args = model.templateArguments.map((x) => getTypeName(x, options));
      return `${modelName}<${args.join(", ")}>`;
    } else if ((model.node as ModelStatementNode)?.templateParameters?.length > 0) {
      // template
      const params = (model.node as ModelStatementNode).templateParameters.map((t) => t.id.sv);
      return `${model.name}<${params.join(", ")}>`;
    } else {
      // regular old model.
      return modelName;
    }
  }

  function getModelPropertyName(prop: ModelTypeProperty, options: TypeNameOptions | undefined) {
    const modelName = prop.model ? getModelName(prop.model, options) : undefined;

    return `${modelName ?? "(anonymous model)"}.${prop.name}`;
  }

  function getInterfaceName(iface: InterfaceType, options: TypeNameOptions | undefined) {
    const nsName = getNamespaceString(iface.namespace, options);
    return (nsName ? nsName + "." : "") + iface.name;
  }

  function getOperationName(op: OperationType, options: TypeNameOptions | undefined) {
    const nsName = getNamespaceString(op.namespace, options);
    return (nsName ? nsName + "." : "") + op.name;
  }

  function checkTemplateParameterDeclaration(node: TemplateParameterDeclarationNode): Type {
    const parentNode = node.parent! as
      | ModelStatementNode
      | InterfaceStatementNode
      | OperationStatementNode
      | UnionStatementNode
      | AliasStatementNode;
    const links = getSymbolLinks(node.symbol);
    const isInstantiatingThisTemplate = instantiatingTemplate === parentNode;
    if (links.declaredType && !isInstantiatingThisTemplate) {
      return links.declaredType;
    }
    const index = parentNode.templateParameters.findIndex((v) => v === node);
    const type: TemplateParameterType = createAndFinishType({
      kind: "TemplateParameter",
      node: node,
    });

    if (!isInstantiatingThisTemplate) {
      // Cache the type to prevent circual reference stack overflows.
      links.declaredType = type;

      if (node.default) {
        type.default = checkTemplateParameterDefault(
          node.default,
          parentNode.templateParameters,
          index
        );
      }
    } else {
      return templateInstantiation[index];
    }

    return type;
  }

  function getResolvedTypeParameterDefault(
    declaredType: TemplateParameterType,
    existingValues: Record<string, Type>
  ): Type | undefined {
    if (declaredType.default === undefined) {
      return undefined;
    }
    if (isErrorType(declaredType.default)) {
      return declaredType.default;
    }
    if (declaredType.default.kind === "TemplateParameter") {
      return existingValues[declaredType.default.node.id.sv];
    } else {
      return declaredType.default;
    }
  }

  function checkTemplateParameterDefault(
    nodeDefault: Expression,
    templateParameters: readonly TemplateParameterDeclarationNode[],
    index: number
  ) {
    function visit(node: Node) {
      const type = getTypeForNode(node);
      let hasError = false;
      if (type.kind === "TemplateParameter") {
        for (let i = index; i < templateParameters.length; i++) {
          if (type.node.symbol === templateParameters[i].symbol) {
            program.reportDiagnostic(
              createDiagnostic({ code: "invalid-template-default", target: node })
            );
            return undefined;
          }
        }
        return type;
      }

      visitChildren(node, (x) => {
        const visited = visit(x);
        if (visited === undefined) {
          hasError = true;
        }
      });

      return hasError ? undefined : type;
    }
    return visit(nodeDefault) ?? errorType;
  }

  function checkTypeReference(
    node: TypeReferenceNode | MemberExpressionNode | IdentifierNode
  ): Type {
    const sym = resolveTypeReference(node);
    if (!sym) {
      return errorType;
    }

    const type = checkTypeReferenceSymbol(sym, node);
    checkDeprecated(type, node);
    return type;
  }

  function checkDeprecated(type: Type, target: DiagnosticTarget) {
    const deprecated = getDeprecated(program, type);
    if (deprecated) {
      reportDeprecated(program, deprecated, target);
    }
  }

  function checkTypeReferenceArgs(
    node: TypeReferenceNode | MemberExpressionNode | IdentifierNode
  ): Type[] {
    const args: Type[] = [];
    if (node.kind !== SyntaxKind.TypeReference) {
      return args;
    }

    for (const arg of node.arguments) {
      const value = getTypeForNode(arg);
      args.push(value);
    }
    return args;
  }

  function checkTemplateInstantiationArgs(
    node: Node,
    args: Type[],
    declarations: readonly TemplateParameterDeclarationNode[]
  ): Type[] {
    if (args.length > declarations.length) {
      program.reportDiagnostic(
        createDiagnostic({ code: "invalid-template-args", messageId: "tooMany", target: node })
      );
    }

    const values: Type[] = [];
    const valueMap: Record<string, Type> = {};
    let tooFew = false;
    for (let i = 0; i < declarations.length; i++) {
      const declaration = declarations[i];

      if (i < args.length) {
        values.push(args[i]);
        valueMap[declaration.id.sv] = args[i];
      } else {
        const declaredType = getTypeForNode(declaration)! as TemplateParameterType;
        const defaultValue = getResolvedTypeParameterDefault(declaredType, valueMap);
        if (defaultValue) {
          values.push(defaultValue);
          valueMap[declaration.id.sv] = defaultValue;
        } else {
          tooFew = true;
          values.push(errorType);
        }
      }
    }

    if (tooFew) {
      program.reportDiagnostic(
        createDiagnostic({
          code: "invalid-template-args",
          messageId: "tooFew",
          target: node,
        })
      );
    }

    return values;
  }

  function checkTypeReferenceSymbol(
    sym: Sym,
    node: TypeReferenceNode | MemberExpressionNode | IdentifierNode
  ): Type {
    if (sym.flags & SymbolFlags.Decorator) {
      program.reportDiagnostic(
        createDiagnostic({ code: "invalid-type-ref", messageId: "decorator", target: sym })
      );

      return errorType;
    }

    if (sym.flags & SymbolFlags.Function) {
      program.reportDiagnostic(
        createDiagnostic({ code: "invalid-type-ref", messageId: "function", target: sym })
      );

      return errorType;
    }

    if (sym.flags & SymbolFlags.LateBound) {
      compilerAssert(sym.type, "Expected late bound symbol to have type");
      return sym.type;
    }

    const symbolLinks = getSymbolLinks(sym);
    let baseType;
    const args = checkTypeReferenceArgs(node);
    if (
      sym.flags &
      (SymbolFlags.Model |
        SymbolFlags.Alias |
        SymbolFlags.Interface |
        SymbolFlags.Operation |
        SymbolFlags.Union)
    ) {
      const decl = sym.declarations[0] as
        | ModelStatementNode
        | AliasStatementNode
        | InterfaceStatementNode
        | OperationStatementNode
        | UnionStatementNode;
      if (decl.templateParameters.length === 0) {
        if (args.length > 0) {
          program.reportDiagnostic(
            createDiagnostic({
              code: "invalid-template-args",
              messageId: "notTemplate",
              target: node,
            })
          );
        }

        if (symbolLinks.declaredType) {
          baseType = symbolLinks.declaredType;
        } else {
          baseType =
            sym.flags & SymbolFlags.Model
              ? checkModelStatement(decl as ModelStatementNode)
              : sym.flags & SymbolFlags.Alias
              ? checkAlias(decl as AliasStatementNode)
              : sym.flags & SymbolFlags.Interface
              ? checkInterface(decl as InterfaceStatementNode)
              : sym.flags & SymbolFlags.Operation
              ? checkOperation(decl as OperationStatementNode)
              : checkUnion(decl as UnionStatementNode);
        }
      } else {
        // declaration is templated, lets instantiate.

        if (!symbolLinks.declaredType) {
          // we haven't checked the declared type yet, so do so.
          sym.flags & SymbolFlags.Model
            ? checkModelStatement(decl as ModelStatementNode)
            : sym.flags & SymbolFlags.Alias
            ? checkAlias(decl as AliasStatementNode)
            : sym.flags & SymbolFlags.Interface
            ? checkInterface(decl as InterfaceStatementNode)
            : sym.flags & SymbolFlags.Operation
            ? checkOperation(decl as OperationStatementNode)
            : checkUnion(decl as UnionStatementNode);
        }

        const templateParameters = decl.templateParameters;
        const instantiationArgs = checkTemplateInstantiationArgs(node, args, templateParameters);
        baseType = instantiateTemplate(decl, instantiationArgs);
      }
    } else {
      // some other kind of reference

      if (args.length > 0) {
        program.reportDiagnostic(
          createDiagnostic({
            code: "invalid-template-args",
            messageId: "notTemplate",
            target: node,
          })
        );
      }
      if (sym.flags & SymbolFlags.TemplateParameter) {
        baseType = checkTemplateParameterDeclaration(
          sym.declarations[0] as TemplateParameterDeclarationNode
        );
      } else if (symbolLinks.type) {
        // Have a cached type for non-declarations
        baseType = symbolLinks.type;
      } else {
        // don't have a cached type for this symbol, so go grab it and cache it
        baseType = getTypeForNode(sym.declarations[0]);
        symbolLinks.type = baseType;
      }
    }

    return baseType;
  }

  /**
   * Builds a model type from a template and its template arguments.
   * Adds the template node to a set we can check when we bind template
   * parameters to access type type arguments.
   *
   * This will fall over if the same template is ever being instantiated
   * twice at the same time, or if template parameters from more than one template
   * are ever in scope at once.
   */
  function instantiateTemplate(
    templateNode:
      | ModelStatementNode
      | AliasStatementNode
      | InterfaceStatementNode
      | OperationStatementNode
      | UnionStatementNode,
    args: Type[]
  ): Type {
    const symbolLinks = getSymbolLinks(templateNode.symbol);
    if (symbolLinks.instantiations === undefined) {
      const type = getTypeForNode(templateNode);
      if (isErrorType(type)) {
        return errorType;
      } else {
        compilerAssert(
          false,
          `Unexpected checker error. symbolLinks.instantiations was not defined for ${
            SyntaxKind[templateNode.kind]
          }`
        );
      }
    }
    const cached = symbolLinks.instantiations.get(args) as ModelType;
    if (cached) {
      return cached;
    }

    const oldTis = templateInstantiation;
    const oldTemplate = instantiatingTemplate;
    templateInstantiation = args;
    instantiatingTemplate = templateNode;

    const type =
      symbolLinks.declaredType && oldTemplate === templateNode
        ? symbolLinks.declaredType
        : getTypeForNode(templateNode);

    symbolLinks.instantiations!.set(args, type);
    if (type.kind === "Model") {
      type.templateNode = templateNode;
    }
    templateInstantiation = oldTis;
    instantiatingTemplate = oldTemplate;
    return type;
  }

  function checkUnionExpression(node: UnionExpressionNode): UnionType {
    const variants: [string | symbol, UnionTypeVariant][] = node.options.flatMap((o) => {
      const type = getTypeForNode(o);

      // The type `A | never` is just `A`
      if (type === neverType) {
        return [];
      }
      if (type.kind === "Union" && type.expression) {
        return Array.from(type.variants.entries());
      }
      const variant: UnionTypeVariant = createType({
        kind: "UnionVariant",
        type,
        name: Symbol("name"),
        decorators: [],
        node: undefined,
      });

      return [[variant.name, variant]];
    });

    const type: UnionType = createAndFinishType({
      kind: "Union",
      node,
      get options() {
        return Array.from(this.variants.values()).map((v) => v.type);
      },
      expression: true,
      variants: new Map(variants),
      decorators: [],
    });

    return type;
  }

  /**
   * Intersection produces a model type from the properties of its operands.
   * So this doesn't work if we don't have a known set of properties (e.g.
   * with unions). The resulting model is anonymous.
   */
  function checkIntersectionExpression(node: IntersectionExpressionNode) {
    const options = node.options.map((o): [Expression, Type] => [o, getTypeForNode(o)]);
    return mergeModelTypes(node, options);
  }

  function mergeModelTypes(
    node:
      | ModelStatementNode
      | ModelExpressionNode
      | IntersectionExpressionNode
      | ProjectionModelExpressionNode,
    options: [Node, Type][]
  ) {
    const properties = new Map<string, ModelTypeProperty>();

    const intersection: ModelType = createType({
      kind: "Model",
      node,
      name: "",
      properties: properties,
      decorators: [],
      derivedModels: [],
    });

    const indexers: ModelKeyIndexer[] = [];
    for (const [optionNode, option] of options) {
      if (option.kind === "TemplateParameter") {
        continue;
      }
      if (option.kind !== "Model") {
        program.reportDiagnostic(
          createDiagnostic({ code: "intersect-non-model", target: optionNode })
        );
        continue;
      }

      if (option.indexer) {
        if (isNeverIndexer(option.indexer)) {
          reportDiagnostic(program, {
            code: "intersect-invalid-index",
            messageId: "never",
            target: optionNode,
          });
        } else if (option.indexer.key.name === "integer") {
          program.reportDiagnostic(
            createDiagnostic({
              code: "intersect-invalid-index",
              messageId: "array",
              target: optionNode,
            })
          );
        } else {
          indexers.push(option.indexer);
        }
      }
      if (indexers.length === 1) {
        intersection.indexer = indexers[0];
      } else if (indexers.length > 1) {
        intersection.indexer = {
          key: indexers[0].key,
          value: mergeModelTypes(
            node,
            indexers.map((x) => [x.value.node!, x.value])
          ),
        };
      }

      const allProps = walkPropertiesInherited(option);
      for (const prop of allProps) {
        if (properties.has(prop.name)) {
          program.reportDiagnostic(
            createDiagnostic({
              code: "intersect-duplicate-property",
              format: { propName: prop.name },
              target: node,
            })
          );
          continue;
        }

        const newPropType = cloneType(prop, {
          sourceProperty: prop,
          model: intersection,
        });
        properties.set(prop.name, newPropType);
      }
    }

    return finishType(intersection);
  }

  function checkArrayExpression(node: ArrayExpressionNode): ModelType {
    const type = getTypeForNode(node.elementType);
    return instantiateTemplate(getStdType("Array").node as any, [type]) as ModelType;
  }

  function checkNamespace(node: NamespaceStatementNode) {
    const links = getSymbolLinks(getMergedSymbol(node.symbol));
    let type = links.type as NamespaceType;
    if (!type) {
      type = initializeTypeForNamespace(node);
    }

    if (isArray(node.statements)) {
      node.statements.forEach(getTypeForNode);
    } else if (node.statements) {
      const subNs = checkNamespace(node.statements);
      type.namespaces.set(subNs.name, subNs);
    }
    return type;
  }

  function initializeTypeForNamespace(node: NamespaceStatementNode) {
    compilerAssert(node.symbol, "Namespace is unbound.", node);
    const mergedSymbol = getMergedSymbol(node.symbol)!;
    const symbolLinks = getSymbolLinks(mergedSymbol);
    if (!symbolLinks.type) {
      // haven't seen this namespace before
      const namespace = getParentNamespaceType(node);
      const name = node.id.sv;
      const type: NamespaceType = createType({
        kind: "Namespace",
        name,
        namespace,
        node,
        models: new Map(),
        operations: new Map(),
        namespaces: new Map(),
        interfaces: new Map(),
        unions: new Map(),
        enums: new Map(),
        decorators: [],
      });

      symbolLinks.type = type;
      for (const sourceNode of mergedSymbol.declarations) {
        // namespaces created from cadl scripts don't have decorators
        if (sourceNode.kind !== SyntaxKind.NamespaceStatement) continue;
        type.decorators = type.decorators.concat(checkDecorators(sourceNode));
      }
      finishType(type);

      namespace?.namespaces.set(name, type);
    }

    return symbolLinks.type as NamespaceType;
  }

  function getParentNamespaceType(
    node:
      | ModelStatementNode
      | NamespaceStatementNode
      | OperationStatementNode
      | EnumStatementNode
      | InterfaceStatementNode
      | UnionStatementNode
      | ModelExpressionNode
  ): NamespaceType | undefined {
    if (node === globalNamespaceType.node) return undefined;

    if (node.kind === SyntaxKind.ModelExpression) {
      let parent: Node | undefined = node.parent;
      while (parent !== undefined) {
        if (
          parent.kind === SyntaxKind.ModelStatement ||
          parent.kind === SyntaxKind.OperationStatement ||
          parent.kind === SyntaxKind.EnumStatement ||
          parent.kind === SyntaxKind.InterfaceStatement ||
          parent.kind === SyntaxKind.UnionStatement ||
          parent.kind === SyntaxKind.ModelExpression
        ) {
          return getParentNamespaceType(parent);
        } else {
          parent = parent.parent;
        }
      }
      return undefined;
    }

    if (
      node.kind === SyntaxKind.OperationStatement &&
      node.parent &&
      node.parent.kind === SyntaxKind.InterfaceStatement
    ) {
      return getParentNamespaceType(node.parent);
    }

    if (!node.symbol.parent) {
      return globalNamespaceType;
    }

    if (
      node.symbol.parent.declarations[0].kind === SyntaxKind.CadlScript ||
      node.symbol.parent.declarations[0].kind === SyntaxKind.JsSourceFile
    ) {
      return globalNamespaceType;
    }

    const mergedSymbol = getMergedSymbol(node.symbol.parent)!;
    const symbolLinks = getSymbolLinks(mergedSymbol);
    if (!symbolLinks.type) {
      // in general namespaces should be typed before anything calls this function.
      // However, one case where this is not true is when a decorator on a namespace
      // refers to a model in another namespace. In this case, we need to evaluate
      // the namespace here.
      const namespaceNode = mergedSymbol.declarations.find(
        (x): x is NamespaceStatementNode => x.kind === SyntaxKind.NamespaceStatement
      );
      compilerAssert(namespaceNode, "Can't find namespace declaration node.", node);
      symbolLinks.type = initializeTypeForNamespace(namespaceNode);
    }

    return symbolLinks.type as NamespaceType;
  }

  function checkOperation(
    node: OperationStatementNode,
    parentInterface?: InterfaceType
  ): OperationType | ErrorType {
    // Operations defined in interfaces aren't bound to symbols
    const links = !parentInterface ? getSymbolLinks(node.symbol) : undefined;
    const instantiatingThisTemplate = instantiatingTemplate === node;
    if (links) {
      if (links.declaredType && !instantiatingThisTemplate) {
        // we're not instantiating this operation and we've already checked it
        return links.declaredType as OperationType;
      }
    }

    const namespace = getParentNamespaceType(node);
    const name = node.id.sv;
    let decorators = checkDecorators(node);

    // Is this a definition or reference?
    let parameters: ModelType, returnType: Type;
    if (node.signature.kind === SyntaxKind.OperationSignatureReference) {
      // Attempt to resolve the operation
      const baseOperation = checkOperationIs(node, node.signature.baseOperation);
      if (!baseOperation) {
        return errorType;
      }

      // Reference the same return type and create the parameters type
      parameters = cloneType(baseOperation.parameters);
      parameters.node = parameters.node ? { ...parameters.node, parent: node } : undefined;
      returnType = baseOperation.returnType;

      // Copy decorators from the base operation, inserting the base decorators first
      decorators = [...baseOperation.decorators, ...decorators];
    } else {
      parameters = getTypeForNode(node.signature.parameters) as ModelType;
      returnType = getTypeForNode(node.signature.returnType);
    }

    const operationType: OperationType = createType({
      kind: "Operation",
      name,
      namespace,
      node,
      parameters,
      returnType,
      decorators,
      interface: parentInterface,
    });

    operationType.parameters.namespace = namespace;

    if (node.parent!.kind === SyntaxKind.InterfaceStatement) {
      if (shouldCreateTypeForTemplate(node.parent!) && shouldCreateTypeForTemplate(node)) {
        finishType(operationType);
      }
    } else {
      if (shouldCreateTypeForTemplate(node)) {
        finishType(operationType);
      }

      namespace?.operations.set(name, operationType);
    }

    if (links && !instantiatingThisTemplate) {
      links.declaredType = operationType;
      links.instantiations = new TypeInstantiationMap();
    }

    return operationType;
  }

  function checkOperationIs(
    operation: OperationStatementNode,
    opReference: TypeReferenceNode | undefined
  ): OperationType | undefined {
    if (!opReference) return undefined;

    // Ensure that we don't end up with a circular reference to the same operation
    const opSymId = operation.symbol ? getNodeSymId(operation) : undefined;
    if (opSymId) {
      pendingResolutions.add(opSymId);
    }

    const target = resolveTypeReference(opReference);
    if (target === undefined) {
      return undefined;
    }

    // Did we encounter a circular operation reference?
    if (pendingResolutions.has(getNodeSymId(target.declarations[0] as any))) {
      if (!isInstantiatingTemplateType()) {
        reportDiagnostic(program, {
          code: "circular-base-type",
          format: { typeName: (target.declarations[0] as any).id.sv },
          target: target,
        });
      }

      return undefined;
    }

    // Resolve the base operation type
    const baseOperation = checkTypeReferenceSymbol(target, opReference);
    if (opSymId) {
      pendingResolutions.delete(opSymId);
    }

    // Was the wrong type referenced?
    if (baseOperation.kind !== "Operation") {
      program.reportDiagnostic(createDiagnostic({ code: "is-operation", target: opReference }));
      return;
    }

    return baseOperation;
  }

  function getGlobalNamespaceType() {
    return globalNamespaceType;
  }

  function getGlobalNamespaceNode() {
    return globalNamespaceNode;
  }

  function checkTupleExpression(node: TupleExpressionNode): TupleType {
    return createAndFinishType({
      kind: "Tuple",
      node: node,
      values: node.values.map((v) => getTypeForNode(v)),
    });
  }

  function getSymbolLinks(s: Sym): SymbolLinks {
    const id = getSymbolId(s);

    if (symbolLinks.has(id)) {
      return symbolLinks.get(id)!;
    }

    const links = {};
    symbolLinks.set(id, links);

    return links;
  }

  function getSymbolId(s: Sym) {
    if (s.id === undefined) {
      s.id = currentSymbolId++;
    }

    return s.id;
  }

  function resolveIdentifierInTable(
    node: IdentifierNode,
    table: SymbolTable | undefined,
    resolveDecorator = false
  ): Sym | undefined {
    if (!table) {
      return undefined;
    }
    let sym;
    if (resolveDecorator) {
      sym = table.get("@" + node.sv);
    } else {
      sym = table.get(node.sv);
    }

    if (!sym) return sym;

    if (sym.flags & SymbolFlags.DuplicateUsing) {
      reportAmbiguousIdentifier(node, [...((table.duplicates.get(sym) as any) ?? [])]);
      return sym;
    }
    return getMergedSymbol(sym);
  }

  function reportAmbiguousIdentifier(node: IdentifierNode, symbols: Sym[]) {
    const duplicateNames = symbols
      .map((x) => {
        const namespace =
          x.symbolSource!.flags & (SymbolFlags.Decorator | SymbolFlags.Function)
            ? (x.symbolSource!.value as any).namespace
            : getNamespaceString(
                (getTypeForNode(x.symbolSource!.declarations[0]) as any).namespace
              );
        return `${namespace}.${node.sv}`;
      })
      .join(", ");
    program.reportDiagnostic(
      createDiagnostic({
        code: "ambiguous-symbol",
        format: { name: node.sv, duplicateNames },
        target: node,
      })
    );
  }

  function resolveIdentifier(id: IdentifierNode): Sym | undefined {
    let sym: Sym | undefined;
    const { node, kind } = getIdentifierContext(id);

    switch (kind) {
      case IdentifierKind.Declaration:
        if (node.symbol) {
          sym = getMergedSymbol(node.symbol);
          break;
        }

        compilerAssert(node.parent, "Parent expected.");
        const containerType = getTypeForNode(node.parent);
        if (isAnonymous(containerType)) {
          return undefined; // member of anonymous type cannot be referenced.
        }

        lateBindMemberContainer(containerType);
        let container = node.parent.symbol;
        if (!container && "symbol" in containerType && containerType.symbol) {
          container = containerType.symbol;
        }

        if (!container) {
          return undefined;
        }

        lateBindMembers(containerType, container);
        sym = resolveIdentifierInTable(id, container.exports ?? container.members);
        break;

      case IdentifierKind.Other:
        return undefined;

      case IdentifierKind.Decorator:
      case IdentifierKind.Using:
      case IdentifierKind.TypeReference:
        let ref: MemberExpressionNode | IdentifierNode = id;
        let resolveDecorator = kind === IdentifierKind.Decorator;
        if (id.parent?.kind === SyntaxKind.MemberExpression) {
          if (id.parent.id === id) {
            // If the identifier is Y in X.Y, then resolve (X.Y).
            ref = id.parent;
          } else {
            // If the identifier is X in X.Y then we are resolving a
            // namespace, which is never a decorator.
            resolveDecorator = false;
          }
        }
        sym = resolveTypeReference(ref, resolveDecorator);
        break;

      default:
        const _assertNever: never = kind;
        compilerAssert(false, "Unreachable");
    }

    return sym?.symbolSource ?? sym;
  }

  function resolveCompletions(identifier: IdentifierNode): Map<string, CadlCompletionItem> {
    const completions = new Map<string, CadlCompletionItem>();
    const { kind } = getIdentifierContext(identifier);

    switch (kind) {
      case IdentifierKind.Using:
      case IdentifierKind.Decorator:
      case IdentifierKind.TypeReference:
        break; // supported
      case IdentifierKind.Other:
        return completions; // not implemented
      case IdentifierKind.Declaration:
        return completions; // cannot complete, name can be chosen arbitrarily
      default:
        const _assertNever: never = kind;
        compilerAssert(false, "Unreachable");
    }

    if (identifier.parent && identifier.parent.kind === SyntaxKind.MemberExpression) {
      const base = resolveTypeReference(identifier.parent.base, false);
      if (base) {
        const type = getTypeForNode(base.declarations[0]);
        lateBindMemberContainer(type);
        lateBindMembers(type, base);
        addCompletions(base.exports ?? base.members);
      }
    } else {
      let scope: Node | undefined = identifier.parent;
      while (scope && scope.kind !== SyntaxKind.CadlScript) {
        if (scope.symbol && scope.symbol.exports) {
          const mergedSymbol = getMergedSymbol(scope.symbol)!;
          addCompletions(mergedSymbol.exports);
        }
        if ("locals" in scope) {
          addCompletions(scope.locals);
        }
        scope = scope.parent;
      }

      if (scope && scope.kind === SyntaxKind.CadlScript) {
        // check any blockless namespace decls
        for (const ns of scope.inScopeNamespaces) {
          const mergedSymbol = getMergedSymbol(ns.symbol)!;
          addCompletions(mergedSymbol.exports);
        }

        // check "global scope" declarations
        addCompletions(globalNamespaceNode.symbol.exports);

        // check "global scope" usings
        addCompletions(scope.locals);
      }
    }

    return completions;

    function addCompletions(table: SymbolTable | undefined) {
      if (!table) {
        return;
      }
      for (const [key, sym] of table) {
        if (sym.flags & SymbolFlags.DuplicateUsing) {
          const duplicates = table.duplicates.get(sym)!;
          for (const duplicate of duplicates) {
            if (duplicate.flags & SymbolFlags.Using) {
              const fqn = getFullyQualifiedSymbolName(duplicate.symbolSource);
              addCompletion(fqn, duplicate);
            }
          }
        } else {
          addCompletion(key, sym);
        }
      }
    }

    function addCompletion(key: string, sym: Sym) {
      if (sym.symbolSource) {
        sym = sym.symbolSource;
      }
      if (!shouldAddCompletion(sym)) {
        return;
      }
      if (key.startsWith("@")) {
        key = key.slice(1);
      }
      if (!completions.has(key)) {
        completions.set(key, { sym });
      }
    }

    function shouldAddCompletion(sym: Sym): boolean {
      switch (kind) {
        case IdentifierKind.Decorator:
          // Only return decorators and namespaces when completing decorator
          return !!(sym.flags & (SymbolFlags.Decorator | SymbolFlags.Namespace));
        case IdentifierKind.Using:
          // Only return namespaces when completing using
          return !!(sym.flags & SymbolFlags.Namespace);
        case IdentifierKind.TypeReference:
          // Do not return functions or decorators when completing types
          return !(sym.flags & (SymbolFlags.Function | SymbolFlags.Decorator));
        default:
          compilerAssert(false, "We should have bailed up-front on other kinds.");
      }
    }
  }

  function resolveIdentifierInScope(
    node: IdentifierNode,
    resolveDecorator = false
  ): Sym | undefined {
    compilerAssert(
      node.parent?.kind !== SyntaxKind.MemberExpression || node.parent.id !== node,
      "This function should not be used to resolve Y in member expression X.Y. Use resolveIdentifier() to resolve an arbitrary identifier."
    );

    if (hasParseError(node)) {
      // Don't report synthetic identifiers used for parser error recovery.
      // The parse error is the root cause and will already have been logged.
      return undefined;
    }

    let scope: Node | undefined = node.parent;
    let binding;

    while (scope && scope.kind !== SyntaxKind.CadlScript) {
      if (scope.symbol && "exports" in scope.symbol) {
        const mergedSymbol = getMergedSymbol(scope.symbol);
        binding = resolveIdentifierInTable(node, mergedSymbol.exports, resolveDecorator);

        if (binding) return binding;
      }

      if ("locals" in scope) {
        if ("duplicates" in scope.locals!) {
          binding = resolveIdentifierInTable(node, scope.locals, resolveDecorator);
        } else {
          binding = resolveIdentifierInTable(node, scope.locals, resolveDecorator);
        }

        if (binding) return binding;
      }

      scope = scope.parent;
    }

    if (!binding && scope && scope.kind === SyntaxKind.CadlScript) {
      // check any blockless namespace decls
      for (const ns of scope.inScopeNamespaces) {
        const mergedSymbol = getMergedSymbol(ns.symbol);
        binding = resolveIdentifierInTable(node, mergedSymbol.exports, resolveDecorator);

        if (binding) return binding;
      }

      // check "global scope" declarations
      binding = resolveIdentifierInTable(
        node,
        globalNamespaceNode.symbol.exports,
        resolveDecorator
      );

      if (binding) return binding;

      // check using types
      binding = resolveIdentifierInTable(node, scope.locals, resolveDecorator);
      if (binding) return binding.flags & SymbolFlags.DuplicateUsing ? undefined : binding;
    }

    if (!isInstantiatingTemplateType()) {
      program.reportDiagnostic(
        createDiagnostic({ code: "unknown-identifier", format: { id: node.sv }, target: node })
      );
    }
    return undefined;
  }

  function resolveTypeReference(
    node: TypeReferenceNode | MemberExpressionNode | IdentifierNode,
    resolveDecorator = false
  ): Sym | undefined {
    if (hasParseError(node)) {
      // Don't report synthetic identifiers used for parser error recovery.
      // The parse error is the root cause and will already have been logged.
      return undefined;
    }

    if (node.kind === SyntaxKind.TypeReference) {
      return resolveTypeReference(node.target, resolveDecorator);
    }

    if (node.kind === SyntaxKind.MemberExpression) {
      let base = resolveTypeReference(node.base);

      if (!base) {
        return undefined;
      }

      // when resolving a type reference based on an alias, unwrap the alias.
      if (base.flags & SymbolFlags.Alias) {
        base = getAliasedSymbol(base);
      }

      if (base.flags & SymbolFlags.Namespace) {
        const symbol = resolveIdentifierInTable(node.id, base.exports, resolveDecorator);
        if (!symbol) {
          program.reportDiagnostic(
            createDiagnostic({
              code: "invalid-ref",
              messageId: "underNamespace",
              format: {
                namespace: getFullyQualifiedSymbolName(base),
                id: node.id.sv,
              },
              target: node,
            })
          );
          return undefined;
        }
        return symbol;
      } else if (base.flags & SymbolFlags.Decorator) {
        program.reportDiagnostic(
          createDiagnostic({
            code: "invalid-ref",
            messageId: "inDecorator",
            format: { id: node.id.sv },
            target: node,
          })
        );
        return undefined;
      } else if (base.flags & SymbolFlags.Function) {
        program.reportDiagnostic(
          createDiagnostic({
            code: "invalid-ref",
            messageId: "node",
            format: { id: node.id.sv, nodeName: "function" },
            target: node,
          })
        );

        return undefined;
      } else if (base.flags & SymbolFlags.MemberContainer) {
        const type =
          base.flags & SymbolFlags.LateBound ? base.type! : getTypeForNode(base.declarations[0]);
        if (
          type.kind !== "Model" &&
          type.kind !== "Enum" &&
          type.kind !== "Interface" &&
          type.kind !== "Union"
        ) {
          program.reportDiagnostic(
            createDiagnostic({
              code: "invalid-ref",
              messageId: "underContainer",
              format: { kind: type.kind, id: node.id.sv },
              target: node,
            })
          );
          return undefined;
        }

        lateBindMembers(type, base);
        const sym = resolveIdentifierInTable(node.id, base.members!, resolveDecorator);
        if (!sym) {
          program.reportDiagnostic(
            createDiagnostic({
              code: "invalid-ref",
              messageId: "underContainer",
              format: { kind: type.kind, id: node.id.sv },
              target: node,
            })
          );
          return undefined;
        }
        return sym;
      } else {
        program.reportDiagnostic(
          createDiagnostic({
            code: "invalid-ref",
            messageId: "node",
            format: {
              id: node.id.sv,
              nodeName: base.declarations[0]
                ? SyntaxKind[base.declarations[0].kind]
                : "Unknown node",
            },
            target: node,
          })
        );

        return undefined;
      }
    }

    if (node.kind === SyntaxKind.Identifier) {
      const sym = resolveIdentifierInScope(node, resolveDecorator);
      if (!sym) return undefined;

      return sym.flags & SymbolFlags.Using ? sym.symbolSource : sym;
    }

    compilerAssert(false, "Unknown type reference kind", node);
  }

  /**
   * Return the symbol that is aliased by this alias declaration. If no such symbol is aliased,
   * return the symbol for the alias instead. For member containers which need to be late bound
   * (i.e. they contain symbols we don't know until we've instantiated the type and the type is an
   * instantiation) we late bind the container which creates the symbol that will hold its members.
   */
  function getAliasedSymbol(aliasSymbol: Sym): Sym {
    const aliasType = checkAlias(aliasSymbol.declarations[0] as AliasStatementNode);
    switch (aliasType.kind) {
      case "Model":
      case "Interface":
      case "Union":
        if (aliasType.templateArguments) {
          // this is an alias for some instantiation, so late-bind the instantiation
          lateBindMemberContainer(aliasType);
          return aliasType.symbol!;
        }
      // fallthrough
      default:
        // get the symbol from the node aliased type's node, or just return the base
        // if it doesn't have a symbol (which will likely result in an error later on)
        return aliasType.node!.symbol ?? aliasSymbol;
    }
  }
  function checkStringLiteral(str: StringLiteralNode): StringLiteralType {
    return getLiteralType(str);
  }

  function checkNumericLiteral(num: NumericLiteralNode): NumericLiteralType {
    return getLiteralType(num);
  }

  function checkBooleanLiteral(bool: BooleanLiteralNode): BooleanLiteralType {
    return getLiteralType(bool);
  }

  function checkProgram() {
    program.reportDuplicateSymbols(globalNamespaceNode.symbol.exports);
    for (const file of program.sourceFiles.values()) {
      for (const ns of file.namespaces) {
        program.reportDuplicateSymbols(ns.symbol.exports);
        initializeTypeForNamespace(ns);
      }
    }

    for (const file of program.sourceFiles.values()) {
      checkSourceFile(file);
    }
  }

  function checkSourceFile(file: CadlScriptNode) {
    for (const statement of file.statements) {
      getTypeForNode(statement);
    }
  }

  function checkModel(node: ModelExpressionNode | ModelStatementNode) {
    if (node.kind === SyntaxKind.ModelStatement) {
      return checkModelStatement(node);
    } else {
      return checkModelExpression(node);
    }
  }

  function checkModelStatement(node: ModelStatementNode) {
    const links = getSymbolLinks(node.symbol);
    const instantiatingThisTemplate = instantiatingTemplate === node;

    if (links.declaredType && !instantiatingThisTemplate) {
      // we're not instantiating this model and we've already checked it
      return links.declaredType;
    }
    const decorators: DecoratorApplication[] = [];

    const type: ModelType = createType({
      kind: "Model",
      name: node.id.sv,
      node: node,
      properties: new Map<string, ModelTypeProperty>(),
      namespace: getParentNamespaceType(node),
      decorators,
      derivedModels: [],
    });
    if (!instantiatingThisTemplate) {
      links.declaredType = type;
    }
    const isBase = checkModelIs(node, node.is);

    if (isBase) {
      checkDeprecated(isBase, node.is!);
      // copy decorators
      decorators.push(...isBase.decorators);
      if (isBase.indexer) {
        type.indexer = isBase.indexer;
      }
    }
    decorators.push(...checkDecorators(node));

    if (isBase) {
      for (const prop of isBase.properties.values()) {
        type.properties.set(
          prop.name,
          finishType({
            ...prop,
          })
        );
      }
    }

    if (isBase) {
      type.baseModel = isBase.baseModel;
    } else if (node.extends) {
      type.baseModel = checkClassHeritage(node, node.extends);
      if (type.baseModel) {
        checkDeprecated(type.baseModel, node.extends);
      }
    }

    if (type.baseModel) {
      type.baseModel.derivedModels.push(type);
    }

    // Hold on to the model type that's being defined so that it
    // can be referenced
    if (!instantiatingThisTemplate) {
      links.declaredType = type;
      links.instantiations = new TypeInstantiationMap();
      type.namespace?.models.set(type.name, type);
    }

    const inheritedPropNames = new Set(
      Array.from(walkPropertiesInherited(type)).map((v) => v.name)
    );

    // Evaluate the properties after
    checkModelProperties(node, type.properties, type, inheritedPropNames);

    if (shouldCreateTypeForTemplate(node)) {
      finishType(type);
    }

    const indexer = getIndexer(program, type);
    if (type.name === "Array" && isInCadlNamespace(type)) {
      stdTypes.Array = type;
    } else if (type.name === "Record" && isInCadlNamespace(type)) {
      stdTypes.Record = type;
    }
    if (indexer) {
      type.indexer = indexer;
    } else {
      const intrinsicModelName = getIntrinsicModelName(program, type);
      if (intrinsicModelName) {
        type.indexer = { key: neverType, value: undefined };
      }
    }
    return type;
  }

  function shouldCreateTypeForTemplate(node: TemplateDeclarationNode) {
    const instantiatingThisTemplate = instantiatingTemplate === node;
    return (
      (instantiatingThisTemplate &&
        templateInstantiation.every((t) => t.kind !== "TemplateParameter")) ||
      node.templateParameters.length === 0
    );
  }

  function checkModelExpression(node: ModelExpressionNode) {
    const properties = new Map();
    const type: ModelType = createType({
      kind: "Model",
      name: "",
      node: node,
      properties,
      indexer: undefined,
      namespace: getParentNamespaceType(node),
      decorators: [],
      derivedModels: [],
    });
    checkModelProperties(node, properties, type);
    return finishType(type);
  }

  function checkPropertyCompatibleWithIndexer(
    parentModel: ModelType,
    property: ModelTypeProperty,
    diagnosticTarget: ModelPropertyNode | ModelSpreadPropertyNode
  ) {
    if (parentModel.indexer === undefined) {
      return;
    }

    if (isNeverIndexer(parentModel.indexer)) {
      reportDiagnostic(program, {
        code: "no-prop",
        format: { propName: property.name },
        target: diagnosticTarget,
      });
    } else {
      const [valid, diagnostics] = isTypeAssignableTo(
        property.type,
        parentModel.indexer.value!,
        diagnosticTarget.kind === SyntaxKind.ModelSpreadProperty
          ? diagnosticTarget
          : diagnosticTarget.value
      );
      if (!valid) program.reportDiagnostics(diagnostics);
    }
  }

  function checkModelProperties(
    node: ModelExpressionNode | ModelStatementNode,
    properties: Map<string, ModelTypeProperty>,
    parentModel: ModelType,
    inheritedPropertyNames?: Set<string>
  ) {
    for (const prop of node.properties!) {
      if ("id" in prop) {
        const newProp = checkModelProperty(prop, parentModel);
        checkPropertyCompatibleWithIndexer(parentModel, newProp, prop);
        defineProperty(properties, newProp, inheritedPropertyNames);
      } else {
        // spread property
        const newProperties = checkSpreadProperty(prop.target, parentModel);

        for (const newProp of newProperties) {
          checkPropertyCompatibleWithIndexer(parentModel, newProp, prop);
          defineProperty(properties, newProp, inheritedPropertyNames, prop);
        }
      }
    }
  }

  function defineProperty(
    properties: Map<string, ModelTypeProperty>,
    newProp: ModelTypeProperty,
    inheritedPropertyNames?: Set<string>,
    diagnosticTarget?: DiagnosticTarget
  ) {
    if (properties.has(newProp.name)) {
      program.reportDiagnostic(
        createDiagnostic({
          code: "duplicate-property",
          format: { propName: newProp.name },
          target: diagnosticTarget ?? newProp,
        })
      );
      return;
    }

    if (inheritedPropertyNames?.has(newProp.name)) {
      program.reportDiagnostic(
        createDiagnostic({
          code: "override-property",
          format: { propName: newProp.name },
          target: diagnosticTarget ?? newProp,
        })
      );

      return;
    }

    properties.set(newProp.name, newProp);
  }

  /**
   * Initializes a late bound symbol for the type. This is generally necessary when attempting to
   * access a symbol for a type that is created during the check phase.
   */
  function lateBindMemberContainer(type: Type) {
    if ((type as any).symbol) return;
    switch (type.kind) {
      case "Model":
        type.symbol = createSymbol(type.node, type.name, SymbolFlags.Model | SymbolFlags.LateBound);
        type.symbol.type = type;
        break;
      case "Interface":
        type.symbol = createSymbol(
          type.node,
          type.name,
          SymbolFlags.Interface | SymbolFlags.LateBound
        );
        type.symbol.type = type;
        break;
      case "Union":
        if (!type.name) return; // don't make a symbol for anonymous unions
        type.symbol = createSymbol(type.node, type.name, SymbolFlags.Union | SymbolFlags.LateBound);
        type.symbol.type = type;
        break;
    }
  }

  function lateBindMembers(type: Type, containerSym: Sym) {
    switch (type.kind) {
      case "Model":
        for (const prop of walkPropertiesInherited(type)) {
          const sym = createSymbol(
            prop.node,
            prop.name,
            SymbolFlags.ModelProperty | SymbolFlags.LateBound
          );
          sym.type = prop;
          containerSym.members!.set(prop.name, sym);
        }
        break;
      case "Enum":
        for (const member of type.members) {
          const sym = createSymbol(
            member.node,
            member.name,
            SymbolFlags.EnumMember | SymbolFlags.LateBound
          );
          sym.type = member;
          containerSym.members!.set(member.name, sym);
        }

        break;
      case "Interface":
        for (const member of type.operations.values()) {
          const sym = createSymbol(
            member.node,
            member.name,
            SymbolFlags.InterfaceMember | SymbolFlags.LateBound
          );
          sym.type = member;
          containerSym.members!.set(member.name, sym);
        }
        break;
      case "Union":
        for (const variant of type.variants.values()) {
          // don't bind anything for union expressions
          if (!variant.node || typeof variant.name === "symbol") continue;
          const sym = createSymbol(
            variant.node,
            variant.name,
            SymbolFlags.UnionVariant | SymbolFlags.LateBound
          );
          sym.type = variant;
          containerSym.members!.set(variant.name, sym);
        }
    }
  }

  function checkClassHeritage(
    model: ModelStatementNode,
    heritageRef: Expression
  ): ModelType | undefined {
    if (heritageRef.kind !== SyntaxKind.TypeReference) {
      reportDiagnostic(program, {
        code: "extend-model",
        target: heritageRef,
      });
      return undefined;
    }
    const modelSymId = getNodeSymId(model);
    pendingResolutions.add(modelSymId);

    const target = resolveTypeReference(heritageRef);
    if (target === undefined) {
      return undefined;
    }

    if (pendingResolutions.has(getNodeSymId(target.declarations[0] as any))) {
      if (!isInstantiatingTemplateType()) {
        reportDiagnostic(program, {
          code: "circular-base-type",
          format: { typeName: (target.declarations[0] as any).id.sv },
          target: target,
        });
      }
      return undefined;
    }
    const heritageType = checkTypeReferenceSymbol(target, heritageRef);
    pendingResolutions.delete(modelSymId);
    if (isErrorType(heritageType)) {
      compilerAssert(program.hasError(), "Should already have reported an error.", heritageRef);
      return undefined;
    }

    if (heritageType.kind !== "Model") {
      program.reportDiagnostic(createDiagnostic({ code: "extend-model", target: heritageRef }));
      return undefined;
    }

    if (isIntrinsic(program, heritageType)) {
      program.reportDiagnostic(
        createDiagnostic({
          code: "extend-primitive",
          target: heritageRef,
          format: {
            modelName: model.id.sv,
            baseModelName: heritageType.name,
          },
        })
      );
    }

    return heritageType;
  }

  function checkModelIs(
    model: ModelStatementNode,
    isExpr: Expression | undefined
  ): ModelType | undefined {
    if (!isExpr) return undefined;

    const modelSymId = getNodeSymId(model);
    pendingResolutions.add(modelSymId);
    let isType;
    if (isExpr.kind === SyntaxKind.ArrayExpression) {
      isType = checkArrayExpression(isExpr);
    } else if (isExpr.kind === SyntaxKind.TypeReference) {
      const target = resolveTypeReference(isExpr);
      if (target === undefined) {
        return undefined;
      }
      if (pendingResolutions.has(getNodeSymId(target.declarations[0] as any))) {
        if (!isInstantiatingTemplateType()) {
          reportDiagnostic(program, {
            code: "circular-base-type",
            format: { typeName: (target.declarations[0] as any).id.sv },
            target: target,
          });
        }
        return undefined;
      }
      isType = checkTypeReferenceSymbol(target, isExpr);
    } else {
      reportDiagnostic(program, { code: "is-model", target: isExpr });
      return undefined;
    }

    pendingResolutions.delete(modelSymId);

    if (isType.kind !== "Model") {
      program.reportDiagnostic(createDiagnostic({ code: "is-model", target: isExpr }));
      return;
    }

    return isType;
  }

  function checkSpreadProperty(
    targetNode: TypeReferenceNode,
    parentModel: ModelType
  ): ModelTypeProperty[] {
    const targetType = getTypeForNode(targetNode);

    if (targetType.kind === "TemplateParameter" || isErrorType(targetType)) {
      return [];
    }
    if (targetType.kind !== "Model") {
      program.reportDiagnostic(createDiagnostic({ code: "spread-model", target: targetNode }));
      return [];
    }

    if (targetType.indexer && isNeverIndexer(targetType.indexer)) {
      program.reportDiagnostic(
        createDiagnostic({ code: "spread-model", messageId: "neverIndex", target: targetNode })
      );
      return [];
    }

    const props: ModelTypeProperty[] = [];
    // copy each property
    for (const prop of walkPropertiesInherited(targetType)) {
      const newProp = cloneType(prop, {
        sourceProperty: prop,
        model: parentModel,
      });
      props.push(newProp);
    }
    return props;
  }

  function* walkPropertiesInherited(model: ModelType) {
    let current: ModelType | undefined = model;

    while (current) {
      yield* current.properties.values();
      current = current.baseModel;
    }
  }

  function countPropertiesInherited(
    model: ModelType,
    filter?: (property: ModelTypeProperty) => boolean
  ) {
    let count = 0;
    for (const each of walkPropertiesInherited(model)) {
      if (!filter || filter(each)) {
        count++;
      }
    }
    return count;
  }

  function checkModelProperty(prop: ModelPropertyNode, parentModel?: ModelType): ModelTypeProperty {
    const decorators = checkDecorators(prop);
    const valueType = getTypeForNode(prop.value);
    const defaultValue = prop.default && checkDefault(prop.default, valueType);
    const name = prop.id.kind === SyntaxKind.Identifier ? prop.id.sv : prop.id.value;

    const type: ModelTypeProperty = createType({
      kind: "ModelProperty",
      name,
      node: prop,
      optional: prop.optional,
      type: valueType,
      decorators,
      default: defaultValue,
      model: parentModel,
    });

    const parentModelNode = prop.parent! as
      | ModelStatementNode
      | ModelExpressionNode
      | OperationStatementNode;
    if (
      parentModelNode.kind !== SyntaxKind.ModelStatement ||
      shouldCreateTypeForTemplate(parentModelNode)
    ) {
      finishType(type);
    }

    return type;
  }

  function isValueType(type: Type): boolean {
    const valueTypes = new Set(["String", "Number", "Boolean", "EnumMember", "Tuple"]);
    return valueTypes.has(type.kind);
  }

  function checkDefault(defaultNode: Node, type: Type): Type {
    const defaultType = getTypeForNode(defaultNode);
    if (isErrorType(type)) {
      return errorType;
    }
    if (!isValueType(defaultType)) {
      program.reportDiagnostic(
        createDiagnostic({
          code: "unsupported-default",
          format: { type: type.kind },
          target: defaultType,
        })
      );
      return errorType;
    }
    const [related, diagnostics] = isTypeAssignableTo(defaultType, type, defaultNode);
    if (!related) {
      program.reportDiagnostics(diagnostics);
      return errorType;
    } else {
      return defaultType;
    }
  }

  function checkDecorators(node: { decorators: readonly DecoratorExpressionNode[] }) {
    const decorators: DecoratorApplication[] = [];
    for (const decNode of node.decorators) {
      const sym = resolveTypeReference(decNode.target, true);
      if (!sym) {
        program.reportDiagnostic(
          createDiagnostic({
            code: "unknown-decorator",
            target: decNode,
          })
        );
        continue;
      }
      if (!(sym.flags & SymbolFlags.Decorator)) {
        program.reportDiagnostic(
          createDiagnostic({
            code: "invalid-decorator",
            format: { id: sym.name },
            target: decNode,
          })
        );
        continue;
      }

      decorators.unshift({
        decorator: sym.value!,
        node: decNode,
        args: checkDecoratorArguments(decNode),
      });
    }

    return decorators;
  }

  function checkDecoratorArguments(decorator: DecoratorExpressionNode): DecoratorArgument[] {
    return decorator.arguments.map((argNode) => {
      const type = getTypeForNode(argNode);
      const value =
        type.kind === "Number" || type.kind === "String" || type.kind === "Boolean"
          ? type.value
          : type;
      return {
        value,
        node: argNode,
      };
    });
  }

  function checkAlias(node: AliasStatementNode): Type {
    const links = getSymbolLinks(node.symbol);
    const instantiatingThisTemplate = instantiatingTemplate === node;

    if (links.declaredType && !instantiatingThisTemplate) {
      return links.declaredType;
    }

    const aliasSymId = getNodeSymId(node);
    if (pendingResolutions.has(aliasSymId)) {
      if (!isInstantiatingTemplateType()) {
        reportDiagnostic(program, {
          code: "circular-alias-type",
          format: { typeName: node.id.sv },
          target: node,
        });
      }
      links.declaredType = errorType;
      return errorType;
    }

    pendingResolutions.add(aliasSymId);
    const type = getTypeForNode(node.value);
    if (!instantiatingThisTemplate) {
      links.declaredType = type;
      links.instantiations = new TypeInstantiationMap();
    }
    pendingResolutions.delete(aliasSymId);

    return type;
  }

  function checkEnum(node: EnumStatementNode): Type {
    const links = getSymbolLinks(node.symbol);
    if (!links.type) {
      const enumType: EnumType = (links.type = createType({
        kind: "Enum",
        name: node.id.sv,
        node,
        members: [],
        decorators: [],
      }));

      const memberNames = new Set<string>();

      for (const member of node.members) {
        if (member.kind === SyntaxKind.EnumMember) {
          const memberType = checkEnumMember(enumType, member, memberNames);
          if (memberType) {
            enumType.members.push(memberType);
          }
        } else {
          const members = checkEnumSpreadMember(enumType, member.target, memberNames);
          for (const memberType of members) {
            enumType.members.push(memberType);
          }
        }
      }

      const namespace = getParentNamespaceType(node);
      enumType.namespace = namespace;
      enumType.namespace?.enums.set(enumType.name!, enumType);
      enumType.decorators = checkDecorators(node);

      finishType(enumType);
    }

    return links.type;
  }

  function checkInterface(node: InterfaceStatementNode): InterfaceType {
    const links = getSymbolLinks(node.symbol);
    const instantiatingThisTemplate = instantiatingTemplate === node;

    if (links.declaredType && !instantiatingThisTemplate) {
      // we're not instantiating this interface and we've already checked it
      return links.declaredType as InterfaceType;
    }

    const decorators = checkDecorators(node);

    const interfaceType: InterfaceType = createType({
      kind: "Interface",
      decorators,
      node,
      namespace: getParentNamespaceType(node),
      operations: new Map(),
      name: node.id.sv,
    });

    for (const extendsNode of node.extends) {
      const extendsType = getTypeForNode(extendsNode);
      if (extendsType.kind !== "Interface") {
        program.reportDiagnostic(
          createDiagnostic({ code: "extends-interface", target: extendsNode })
        );
        continue;
      }

      for (const newMember of extendsType.operations.values()) {
        if (interfaceType.operations.has(newMember.name)) {
          program.reportDiagnostic(
            createDiagnostic({
              code: "extends-interface-duplicate",
              format: { name: newMember.name },
              target: extendsNode,
            })
          );
        }

        interfaceType.operations.set(
          newMember.name,
          cloneType(newMember, { interface: interfaceType })
        );
      }
    }

    const ownMembers = new Map<string, OperationType>();

    checkInterfaceMembers(node, ownMembers, interfaceType);

    for (const [k, v] of ownMembers) {
      // don't do a duplicate check here because interface members can override
      // an member coming from a mixin.
      interfaceType.operations.set(k, v);
    }

    if (shouldCreateTypeForTemplate(node)) {
      finishType(interfaceType);
    }

    if (!instantiatingThisTemplate) {
      links.declaredType = interfaceType;
      links.instantiations = new TypeInstantiationMap();
      interfaceType.namespace?.interfaces.set(interfaceType.name, interfaceType);
    }

    return interfaceType;
  }

  function checkInterfaceMembers(
    node: InterfaceStatementNode,
    members: Map<string, OperationType>,
    interfaceType: InterfaceType
  ) {
    for (const opNode of node.operations) {
      const opType = checkOperation(opNode, interfaceType);
      if (opType.kind === "Operation") {
        if (members.has(opType.name)) {
          program.reportDiagnostic(
            createDiagnostic({
              code: "interface-duplicate",
              format: { name: opType.name },
              target: opNode,
            })
          );
          continue;
        }
        members.set(opType.name, opType);
      }
    }
  }

  function checkUnion(node: UnionStatementNode) {
    const links = getSymbolLinks(node.symbol);
    const instantiatingThisTemplate = instantiatingTemplate === node;

    if (links.declaredType && !instantiatingThisTemplate) {
      // we're not instantiating this union and we've already checked it
      return links.declaredType as UnionType;
    }

    const decorators = checkDecorators(node);
    const variants = new Map<string, UnionTypeVariant>();
    checkUnionVariants(node, variants);
    const unionType: UnionType = createType({
      kind: "Union",
      decorators,
      node,
      namespace: getParentNamespaceType(node),
      name: node.id.sv,
      variants,
      get options() {
        return Array.from(this.variants.values()).map((v) => v.type);
      },
      expression: false,
    });

    if (shouldCreateTypeForTemplate(node)) {
      finishType(unionType);
    }

    if (!instantiatingThisTemplate) {
      links.declaredType = unionType;
      links.instantiations = new TypeInstantiationMap();
      unionType.namespace?.unions.set(unionType.name!, unionType);
    }

    return unionType;
  }

  function checkUnionVariants(union: UnionStatementNode, variants: Map<string, UnionTypeVariant>) {
    for (const variantNode of union.options) {
      const variantType = checkUnionVariant(union, variantNode);
      if (variants.has(variantType.name as string)) {
        program.reportDiagnostic(
          createDiagnostic({
            code: "union-duplicate",
            format: { name: variantType.name.toString() },
            target: variantNode,
          })
        );
        continue;
      }
      variants.set(variantType.name as string, variantType);
    }
  }

  function checkUnionVariant(
    union: UnionStatementNode,
    variantNode: UnionVariantNode
  ): UnionTypeVariant {
    const name =
      variantNode.id.kind === SyntaxKind.Identifier ? variantNode.id.sv : variantNode.id.value;
    const decorators = checkDecorators(variantNode);
    const type = getTypeForNode(variantNode.value);
    const variantType: UnionTypeVariant = createType({
      kind: "UnionVariant",
      name,
      node: variantNode,
      decorators,
      type,
    });

    if (shouldCreateTypeForTemplate(union)) {
      finishType(variantType);
    }

    return variantType;
  }

  function checkEnumMember(
    parentEnum: EnumType,
    node: EnumMemberNode,
    existingMemberNames: Set<string>
  ): EnumMemberType | undefined {
    const name = node.id.kind === SyntaxKind.Identifier ? node.id.sv : node.id.value;
    const value = node.value ? node.value.value : undefined;
    const decorators = checkDecorators(node);
    if (existingMemberNames.has(name)) {
      program.reportDiagnostic(
        createDiagnostic({
          code: "enum-member-duplicate",
          format: { name: name },
          target: node,
        })
      );
      return;
    }
    existingMemberNames.add(name);
    return createAndFinishType({
      kind: "EnumMember",
      enum: parentEnum,
      name,
      node,
      value,
      decorators,
    });
  }

  function checkEnumSpreadMember(
    parentEnum: EnumType,
    targetNode: TypeReferenceNode,
    existingMemberNames: Set<string>
  ): EnumMemberType[] {
    const members: EnumMemberType[] = [];
    const targetType = getTypeForNode(targetNode);

    if (!isErrorType(targetType)) {
      if (targetType.kind !== "Enum") {
        program.reportDiagnostic(createDiagnostic({ code: "spread-enum", target: targetNode }));
        return members;
      }

      for (const member of targetType.members) {
        if (existingMemberNames.has(member.name)) {
          program.reportDiagnostic(
            createDiagnostic({
              code: "enum-member-duplicate",
              format: { name: member.name },
              target: targetNode,
            })
          );
        } else {
          existingMemberNames.add(member.name);
          const clonedMember = cloneType(member, {
            enum: parentEnum,
            sourceMember: member,
          });
          if (clonedMember) {
            members.push(clonedMember);
          }
        }
      }
    }

    return members;
  }

  // the types here aren't ideal and could probably be refactored.

  function createAndFinishType<
    U extends Type extends any ? Omit<Type, keyof typeof typePrototype> : never
  >(typeDef: U): U & typeof typePrototype {
    createType(typeDef);
    return finishType(typeDef as any) as any;
  }

  /**
   * Given the own-properties of a type, returns a fully-initialized type.
   * So far, that amounts to setting the prototype to typePrototype which
   * contains the `projections` getter.
   */
  function createType<T>(typeDef: T): T & TypePrototype {
    Object.setPrototypeOf(typeDef, typePrototype);
    return typeDef as any;
  }

  function finishType<T extends Type>(typeDef: T): T {
    (typeDef as any).templateArguments = templateInstantiation;

    if ("decorators" in typeDef) {
      for (const decApp of typeDef.decorators) {
        applyDecoratorToType(decApp, typeDef);
      }
    }

    Object.setPrototypeOf(typeDef, typePrototype);

    return typeDef;
  }

  function applyDecoratorToType(decApp: DecoratorApplication, target: Type) {
    compilerAssert(
      "decorators" in target,
      "Cannot apply decorator to non-decoratable type",
      target
    );

    for (const arg of decApp.args) {
      if (typeof arg.value === "object") {
        if (isErrorType(arg.value)) {
          // If one of the decorator argument is an error don't run it.
          return;
        }
      }
    }

    // peel `fn` off to avoid setting `this`.
    try {
      const fn = decApp.decorator;
      const context = createDecoratorContext(program, decApp);
      fn(context, target, ...decApp.args.map((x) => x.value));
    } catch (error: any) {
      // do not fail the language server for exceptions in decorators
      if (program.compilerOptions.designTimeBuild) {
        program.reportDiagnostic(
          createDiagnostic({
            code: "decorator-fail",
            format: { decoratorName: decApp.decorator.name, error: error.stack },
            target: decApp.node ?? target,
          })
        );
      } else {
        throw error;
      }
    }
  }

  function createDecoratorContext(
    program: Program,
    decApp: DecoratorApplication
  ): DecoratorContext {
    function createPassThruContext(
      program: Program,
      decApp: DecoratorApplication
    ): DecoratorContext {
      return {
        program,
        decoratorTarget: decApp.node!,
        getArgumentTarget: () => decApp.node!,
        call: (decorator, target, ...args) => {
          return decorator(createPassThruContext(program, decApp), target, ...args);
        },
      };
    }

    return {
      program,
      decoratorTarget: decApp.node!,
      getArgumentTarget: (index: number) => {
        return decApp.args[index]?.node;
      },
      call: (decorator, target, ...args) => {
        return decorator(createPassThruContext(program, decApp), target, ...args);
      },
    };
  }

  function getLiteralType(node: StringLiteralNode): StringLiteralType;
  function getLiteralType(node: NumericLiteralNode): NumericLiteralType;
  function getLiteralType(node: BooleanLiteralNode): BooleanLiteralType;
  function getLiteralType(node: LiteralNode): LiteralType;
  function getLiteralType(node: LiteralNode): LiteralType {
    return createLiteralType(node.value, node);
  }

  function mergeSymbolTable(source: SymbolTable, target: SymbolTable) {
    for (const [sym, duplicates] of source.duplicates) {
      const targetSet = target.duplicates.get(sym);
      if (targetSet === undefined) {
        target.duplicates.set(sym, new Set([...duplicates]));
      } else {
        for (const duplicate of duplicates) {
          targetSet.add(duplicate);
        }
      }
    }

    for (const [key, sourceBinding] of source) {
      if (sourceBinding.flags & SymbolFlags.Namespace) {
        // we are merging a namespace symbol. See if is an existing namespace symbol
        // to merge with.
        let existingBinding = target.get(key);

        if (!existingBinding) {
          existingBinding = {
            ...sourceBinding,
          };
          target.set(key, existingBinding);
          mergedSymbols.set(sourceBinding, existingBinding);
        } else if (existingBinding.flags & SymbolFlags.Namespace) {
          existingBinding.declarations.push(...sourceBinding.declarations);
          mergedSymbols.set(sourceBinding, existingBinding);
          mergeSymbolTable(sourceBinding.exports!, existingBinding.exports!);
        } else {
          // this will set a duplicate error
          target.set(key, sourceBinding);
        }
      } else {
        target.set(key, sourceBinding);
      }
    }
  }

  function getMergedSymbol(sym: Sym): Sym {
    if (!sym) return sym;
    return mergedSymbols.get(sym) || sym;
  }

  function createGlobalNamespaceNode(): NamespaceStatementNode {
    const nsId: IdentifierNode = {
      kind: SyntaxKind.Identifier,
      pos: 0,
      end: 0,
      sv: "__GLOBAL_NS",
      symbol: undefined as any,
      flags: NodeFlags.Synthetic,
    };

    const nsNode: Writable<NamespaceStatementNode> = {
      kind: SyntaxKind.NamespaceStatement,
      decorators: [],
      pos: 0,
      end: 0,
      id: nsId,
      symbol: undefined as any,
      locals: createSymbolTable(),
      flags: NodeFlags.Synthetic,
    };
    nsNode.symbol = createSymbol(nsNode, "__GLOBAL_NS", SymbolFlags.Namespace);
    return nsNode;
  }

  function createGlobalNamespaceType() {
    return createAndFinishType({
      kind: "Namespace",
      name: "",
      node: globalNamespaceNode,
      models: new Map(),
      operations: new Map(),
      namespaces: new Map(),
      interfaces: new Map(),
      unions: new Map(),
      enums: new Map(),
      decorators: [],
    });
  }

  /**
   * Clone a type, resulting in an identical type with all the same decorators
   * applied. Decorators are re-run on the clone to achieve this.
   *
   * Care is taken to clone nested data structures that are part of the type.
   * Any type with e.g. a map or an array property must recreate the map or array
   * so that clones don't share the same object.
   *
   * For types which have sub-types that are part of it, e.g. enums with members,
   * unions with variants, or models with properties, the sub-types are cloned
   * as well.
   *
   * If the entire type graph needs to be cloned, then cloneType must be called
   * recursively by the caller.
   */
  function cloneType<T extends Type>(type: T, additionalProps: { [P in keyof T]?: T[P] } = {}): T {
    // Create a new decorator list with the same decorators so that edits to the
    // new decorators list doesn't affect the cloned type
    const decorators = "decorators" in type ? [...type.decorators] : undefined;

    // TODO: this needs to handle other types
    let clone;
    switch (type.kind) {
      case "Model":
        clone = finishType({
          ...type,
          decorators,
          properties: Object.prototype.hasOwnProperty.call(additionalProps, "properties")
            ? undefined
            : new Map(
                Array.from(type.properties.entries()).map(([key, prop]) => [key, cloneType(prop)])
              ),
          ...additionalProps,
        });
        break;
      case "Union":
        clone = finishType({
          ...type,
          decorators,
          variants: new Map<string | symbol, UnionTypeVariant>(
            Array.from(type.variants.entries()).map(([key, prop]) => [
              key,
              prop.kind === "UnionVariant" ? cloneType(prop) : prop,
            ])
          ),
          get options() {
            return Array.from(this.variants.values()).map((v: any) => v.type);
          },
          ...additionalProps,
        });
        break;
      case "Interface":
        clone = finishType({
          ...type,
          decorators,
          operations: new Map(type.operations.entries()),
          ...additionalProps,
        });
        break;
      case "Enum":
        clone = finishType({
          ...type,
          decorators,
          members: type.members.map((v) => cloneType(v)),
          ...additionalProps,
        });
        break;
      default:
        clone = finishType({
          ...type,
          ...(decorators ? { decorators } : {}),
          ...additionalProps,
        });
    }

    const projection = projectionsByType.get(type);
    if (projection) {
      projectionsByType.set(clone, projection);
    }

    return clone;
  }

  function checkProjectionDeclaration(node: ProjectionStatementNode): Type {
    // todo: check for duplicate projection decls on individual types
    // right now you can declare the same projection on a specific type
    // this could maybe go in the binder? But right now we don't know
    // what an identifier resolves to until check time.
    const links = getSymbolLinks(node.symbol);
    if (processedProjections.has(node)) {
      return links.declaredType!;
    }
    processedProjections.add(node);
    program.reportDiagnostic(
      createDiagnostic({ code: "projections-are-experimental", target: node })
    );

    let type;

    if (links.declaredType) {
      type = links.declaredType as ProjectionType;
    } else {
      type = links.declaredType = createType({
        kind: "Projection",
        node: undefined,
        nodeByKind: new Map(),
        nodeByType: new Map(),
      });
    }

    switch (node.selector.kind) {
      case SyntaxKind.ProjectionModelSelector:
        projectionsByTypeKind.get("Model")!.push(node);
        type.nodeByKind.set("Model", node);
        break;
      case SyntaxKind.ProjectionOperationSelector:
        projectionsByTypeKind.get("Operation")!.push(node);
        type.nodeByKind.set("Operation", node);
        break;
      case SyntaxKind.ProjectionUnionSelector:
        projectionsByTypeKind.get("Union")!.push(node);
        type.nodeByKind.set("Union", node);
        break;
      case SyntaxKind.ProjectionInterfaceSelector:
        projectionsByTypeKind.get("Interface")!.push(node);
        type.nodeByKind.set("Interface", node);
        break;
      case SyntaxKind.ProjectionEnumSelector:
        projectionsByTypeKind.get("Enum")!.push(node);
        type.nodeByKind.set("Enum", node);
        break;
      default:
        const projected = checkTypeReference(node.selector);
        let current = projectionsByType.get(projected);
        if (!current) {
          current = [];
          projectionsByType.set(projected, current);
        }
        current.push(node);
        type.nodeByType.set(projected, node);
        break;
    }

    return type;
  }

  function evalProjectionNode(
    node: ProjectionExpression | ProjectionStatementItem
  ): TypeOrReturnRecord {
    switch (node.kind) {
      case SyntaxKind.ProjectionExpressionStatement:
        return evalProjectionExpressionStatement(node);
      case SyntaxKind.ProjectionCallExpression:
        return evalProjectionCallExpression(node);
      case SyntaxKind.ProjectionMemberExpression:
        return evalProjectionMemberExpression(node);
      case SyntaxKind.ProjectionDecoratorReferenceExpression:
        return evalProjectionDecoratorReference(node);
      case SyntaxKind.Identifier:
        return evalProjectionIdentifier(node);
      case SyntaxKind.ProjectionLambdaExpression:
        return evalProjectionLambdaExpression(node);
      case SyntaxKind.StringLiteral:
        return evalStringLiteral(node);
      case SyntaxKind.NumericLiteral:
        return evalNumericLiteral(node);
      case SyntaxKind.BooleanLiteral:
        return evalBooleanLiteral(node);
      case SyntaxKind.ProjectionBlockExpression:
        return evalProjectionBlockExpression(node);
      case SyntaxKind.ProjectionArithmeticExpression:
        return evalProjectionArithmeticExpression(node);
      case SyntaxKind.ProjectionIfExpression:
        return evalProjectionIfExpression(node);
      case SyntaxKind.ProjectionEqualityExpression:
        return evalProjectionEqualityExpression(node);
      case SyntaxKind.ProjectionUnaryExpression:
        return evalProjectionUnaryExpression(node);
      case SyntaxKind.ProjectionRelationalExpression:
        return evalProjectionRelationalExpression(node);
      case SyntaxKind.ProjectionModelExpression:
        return evalProjectionModelExpression(node);
      case SyntaxKind.VoidKeyword:
        return voidType;
      case SyntaxKind.NeverKeyword:
        return neverType;
      case SyntaxKind.UnknownKeyword:
        return unknownType;
      case SyntaxKind.Return:
        return evalReturnKeyword(node);
      default:
        compilerAssert(false, `Can't eval the node ${SyntaxKind[node.kind]}`);
    }
  }

  interface EvalContext {
    node: Node;
    locals: Map<string, Type>;
    parent?: EvalContext;
  }

  function evalReturnKeyword(node: ReturnExpressionNode): ReturnRecord {
    const value = evalProjectionNode(node.value);
    if (value.kind === "Return") {
      return value;
    }

    return {
      kind: "Return",
      value,
    };
  }

  function evalProjectionModelExpression(node: ProjectionModelExpressionNode): TypeOrReturnRecord {
    const modelType: ModelType = createType({
      kind: "Model",
      name: "",
      node: node,
      decorators: [],
      properties: new Map(),
      derivedModels: [],
    });

    for (const propNode of node.properties) {
      if (propNode.kind === SyntaxKind.ProjectionModelProperty) {
        const prop = evalProjectionModelProperty(propNode, modelType);
        if (prop.kind === "Return") {
          return prop;
        }
        modelType.properties.set(prop.name, prop);
      } else {
        const props = evalProjectionModelSpreadProperty(propNode);
        if (!Array.isArray(props)) {
          // return record
          return props;
        }

        for (const newProp of props) {
          modelType.properties.set(newProp.name, newProp);
        }
      }
    }

    return modelType;
  }

  function evalProjectionModelProperty(
    node: ProjectionModelPropertyNode,
    model: ModelType
  ): ModelTypeProperty | ReturnRecord {
    const type = evalProjectionNode(node.value);
    if (type.kind === "Return") {
      return type;
    }

    return createType({
      kind: "ModelProperty",
      name: node.id.kind === SyntaxKind.Identifier ? node.id.sv : node.id.value,
      node: node,
      decorators: [],
      optional: node.optional,
      type,
      model,
    });
  }

  function evalProjectionModelSpreadProperty(
    node: ProjectionModelSpreadPropertyNode
  ): ModelTypeProperty[] | ReturnRecord {
    const target = evalProjectionNode(node.target);
    if (target.kind === "Return") {
      return target;
    }

    if (target.kind !== "Model") {
      throw new ProjectionError(`Can only spread models`);
    }
    const props = [];
    // copy each property
    for (const prop of walkPropertiesInherited(target)) {
      const newProp = cloneType(prop, { sourceProperty: prop });
      props.push(newProp);
    }

    return props;
  }

  function evalProjectionRelationalExpression(
    node: ProjectionRelationalExpressionNode
  ): TypeOrReturnRecord {
    const left = evalProjectionNode(node.left);
    if (left.kind === "Return") {
      return left;
    } else if (left.kind !== "Number" && left.kind !== "String") {
      throw new ProjectionError("Can only compare numbers or strings");
    }

    const right = evalProjectionNode(node.right);
    if (right.kind === "Return") {
      return right;
    } else if (right.kind !== "Number" && right.kind !== "String") {
      throw new ProjectionError("Can only compare numbers or strings");
    }

    if (left.kind !== right.kind) {
      throw new ProjectionError("Can't compare numbers and strings");
    }

    switch (node.op) {
      case "<":
        return createLiteralType(left.value < right.value);
      case "<=":
        return createLiteralType(left.value <= right.value);
      case ">":
        return createLiteralType(left.value > right.value);
      case ">=":
        return createLiteralType(left.value >= right.value);
    }
  }

  function evalProjectionUnaryExpression(node: ProjectionUnaryExpressionNode): TypeOrReturnRecord {
    const target = evalProjectionNode(node.target);
    if (target.kind !== "Boolean") {
      throw new ProjectionError("Can't negate a non-boolean");
    }

    switch (node.op) {
      case "!":
        return createLiteralType(!target.value);
    }
  }
  function evalProjectionEqualityExpression(
    node: ProjectionEqualityExpressionNode
  ): TypeOrReturnRecord {
    const left = evalProjectionNode(node.left);
    if (left.kind === "Return") {
      return left;
    } else if (left.kind !== "Number" && left.kind !== "String") {
      throw new ProjectionError("Comparisons must be strings or numbers");
    }

    const right = evalProjectionNode(node.right);
    if (right.kind === "Return") {
      return right;
    } else if (right.kind !== "Number" && right.kind !== "String") {
      throw new ProjectionError("Comparisons must be strings or numbers");
    }

    if (right.kind !== left.kind) {
      throw new ProjectionError("Can't compare number and string");
    }

    switch (node.op) {
      case "==":
        return createLiteralType(left.value === right.value);
      case "!=":
        return createLiteralType(left.value !== right.value);
    }
  }

  function evalProjectionIfExpression(node: ProjectionIfExpressionNode): TypeOrReturnRecord {
    let ifExpr: ProjectionIfExpressionNode | undefined = node;
    while (ifExpr) {
      const test = evalProjectionNode(ifExpr.test);
      if (test.kind === "Return") {
        return test;
      }

      if (typeIsTruthy(test)) {
        return evalProjectionBlockExpression(ifExpr.consequent);
      } else if (
        ifExpr.alternate &&
        ifExpr.alternate.kind === SyntaxKind.ProjectionBlockExpression
      ) {
        return evalProjectionBlockExpression(ifExpr.alternate);
      } else {
        ifExpr = ifExpr.alternate;
      }
    }

    return voidType;
  }

  function typeIsTruthy(t: Type) {
    switch (t.kind) {
      case "Boolean":
        return t.value;
      case "Number":
        return !!t.value;
      case "String":
        return !!t.value;
      default:
        return true;
    }
  }

  function createEvalContext(node: Node, parent?: EvalContext): EvalContext {
    return {
      node,
      locals: new Map(),
      parent,
    };
  }

  function evalProjectionBlockExpression(node: ProjectionBlockExpressionNode): TypeOrReturnRecord {
    let lastVal: Type = voidType;
    for (const stmt of node.statements) {
      const stmtValue = evalProjectionNode(stmt);
      if (stmtValue.kind === "Return") {
        return stmtValue;
      }
      lastVal = stmtValue;
    }

    return lastVal;
  }

  function evalProjectionArithmeticExpression(
    node: ProjectionArithmeticExpressionNode
  ): StringLiteralType | NumericLiteralType | ReturnRecord {
    const lhs = evalProjectionNode(node.left);
    if (lhs.kind === "Return") {
      return lhs;
    }

    if (lhs.kind !== "Number" && lhs.kind !== "String") {
      throw new ProjectionError(`Operator ${node.op} can only apply to strings or numbers`);
    }
    const rhs = evalProjectionNode(node.right);
    if (rhs.kind === "Return") {
      return rhs;
    }
    if (rhs.kind !== "Number" && rhs.kind !== "String") {
      throw new ProjectionError(`Operator ${node.op} can only apply to strings or numbers`);
    }

    if (rhs.kind !== lhs.kind) {
      throw new ProjectionError(`Operator ${node.op}'s operands need to be the same type`);
    }

    if (lhs.kind === "String") {
      return createLiteralType((lhs as StringLiteralType).value + (rhs as StringLiteralType).value);
    } else {
      return createLiteralType(
        (lhs as NumericLiteralType).value + (rhs as NumericLiteralType).value
      );
    }
  }

  function evalProjectionStatement(node: ProjectionNode, target: Type, args: Type[]): Type {
    let topLevelProjection = false;
    if (!currentProjectionDirection) {
      topLevelProjection = true;
      currentProjectionDirection = node.direction;
    }
    if (currentProjectionDirection === "from" && !target.projectionSource) {
      // this model wasn't projected, so we'll just return the target
      return target;
    }

    const originalContext = evalContext;
    evalContext = createEvalContext(node);
    for (const [i, param] of node.parameters.entries()) {
      if (!args[i]) {
        throw new ProjectionError(
          "need argument for parameter " + SyntaxKind[node.parameters[i].kind]
        );
      }

      const argVal = args[i];
      let typeVal;

      if (typeof argVal === "number" || typeof argVal === "string" || typeof argVal === "boolean") {
        typeVal = createLiteralType(argVal);
      } else {
        typeVal = argVal;
      }

      evalContext.locals.set(param.id.sv, typeVal);
    }

    evalContext.locals.set("self", target);
    let lastVal: TypeOrReturnRecord = voidType;
    for (const item of node.body) {
      lastVal = evalProjectionNode(item);
      if (lastVal.kind === "Return") {
        break;
      }
    }

    if (topLevelProjection) {
      currentProjectionDirection = undefined;
    }
    const selfResult = evalContext.locals.get("self")!;
    evalContext = originalContext;

    if (lastVal.kind === "Return") {
      return lastVal.value;
    } else {
      return selfResult;
    }
  }

  function evalProjectionExpressionStatement(node: ProjectionExpressionStatement) {
    return evalProjectionNode(node.expr);
  }

  function evalProjectionCallExpression(node: ProjectionCallExpressionNode) {
    const target = evalProjectionNode(node.target);

    if (!target) throw new ProjectionError("target undefined");
    const args = [];
    for (const arg of node.arguments) {
      args.push(evalProjectionNode(arg));
    }

    if (target.kind !== "Function") {
      throw new ProjectionError("Can't call non-function, got type " + target.kind);
    }

    return target.call(...args);
  }

  function evalProjectionMemberExpression(
    node: ProjectionMemberExpressionNode
  ): TypeOrReturnRecord {
    const base = evalProjectionNode(node.base);
    if (base.kind === "Return") {
      return base;
    }
    const member = node.id.sv;
    const selector = node.selector;

    if (selector === ".") {
      switch (base.kind) {
        case "Namespace":
          const sym = base.node.symbol.exports!.get(member);
          if (sym) {
            const links = getSymbolLinks(sym);
            return links.declaredType || links.type || errorType;
          } else {
            throw new ProjectionError(`Namespace doesn't have member ${member}`);
          }
        case "Model":
          const prop = base.properties.get(member);
          if (!prop) {
            throw new ProjectionError(`Model doesn't have property ${member}`);
          }
          return prop;
        case "Enum":
          const enumMember = base.members.find((v) => v.name === member);
          if (!enumMember) {
            throw new ProjectionError(`Enum doesn't have member ${member}`);
          }
          return enumMember;
        case "Union":
          const variant = base.variants.get(member);
          if (!variant) {
            throw new ProjectionError(`Union doesn't have variant ${member}`);
          }
          return variant;
        default:
          throw new ProjectionError(
            `Can't get member "${member}" of type ${base.kind} because it has no members. Did you mean to use "::" instead of "."?`
          );
      }
    }

    switch (base.kind) {
      case "Object":
        return base.properties[member] || errorType;
      default:
        const typeOps = projectionMembers[base.kind];
        if (!typeOps) {
          throw new ProjectionError(
            `${base.kind} doesn't have an object model member named ${member}`
          );
        }
        // any cast needed to ensure we don't get a too complex union error on the call
        // to op further down.
        const op: any = typeOps[member];
        if (!op) {
          throw new ProjectionError(
            `${base.kind} doesn't have an object model member named ${member}`
          );
        }

        return op(base);
    }
  }

  /**
   * @returns true if checker is currently instantiating a template type.
   */
  function isInstantiatingTemplateType(): boolean {
    return instantiatingTemplate !== undefined;
  }

  function createFunctionType(fn: (...args: Type[]) => Type): FunctionType {
    return createType({
      kind: "Function",
      call: fn,
    } as const);
  }

  function literalTypeToValue(type: StringLiteralType): string;
  function literalTypeToValue(type: NumericLiteralType): number;
  function literalTypeToValue(type: BooleanLiteralType): boolean;
  function literalTypeToValue(
    type: StringLiteralType | NumericLiteralType | BooleanLiteralType
  ): boolean;
  function literalTypeToValue(
    type: StringLiteralType | NumericLiteralType | BooleanLiteralType
  ): string | number | boolean {
    return type.value;
  }

  function createLiteralType(value: string, node?: StringLiteralNode): StringLiteralType;
  function createLiteralType(value: number, node?: NumericLiteralNode): NumericLiteralType;
  function createLiteralType(value: boolean, node?: BooleanLiteralNode): BooleanLiteralType;
  function createLiteralType(
    value: string | number | boolean,
    node?: StringLiteralNode | NumericLiteralNode | BooleanLiteralNode
  ): StringLiteralType | NumericLiteralType | BooleanLiteralType;
  function createLiteralType(
    value: string | number | boolean,
    node?: StringLiteralNode | NumericLiteralNode | BooleanLiteralNode
  ): StringLiteralType | NumericLiteralType | BooleanLiteralType {
    if (program.literalTypes.has(value)) {
      return program.literalTypes.get(value)!;
    }
    let type: StringLiteralType | NumericLiteralType | BooleanLiteralType;

    switch (typeof value) {
      case "string":
        type = createType({ kind: "String", value });
        break;
      case "boolean":
        type = createType({ kind: "Boolean", value });
        break;
      case "number":
        type = createType({
          kind: "Number",
          value,
        });
        break;
    }
    program.literalTypes.set(value, type);
    return type;
  }

  function evalProjectionDecoratorReference(
    node: ProjectionDecoratorReferenceExpressionNode
  ): Type {
    const ref = resolveTypeReference(node.target, true);
    if (!ref) throw new ProjectionError("Can't find decorator.");
    compilerAssert(ref.flags & SymbolFlags.Decorator, "should only resolve decorator symbols");
    return createType({
      kind: "Function",
      call(...args: Type[]): Type {
        ref.value!({ program }, ...marshalProjectionArguments(args));
        return voidType;
      },
    } as const);
  }

  function evalProjectionIdentifier(node: IdentifierNode): Type {
    // first check the eval context

    let currentContext = evalContext;
    while (currentContext) {
      if (currentContext.locals.has(node.sv)) {
        return currentContext.locals.get(node.sv)!;
      }
      currentContext = currentContext.parent;
    }

    // next, resolve outside
    const ref = resolveTypeReference(node);
    if (!ref) throw new ProjectionError("Unknown identifier " + node.sv);

    if (ref.flags & SymbolFlags.Decorator) {
      // shouldn't ever resolve a decorator symbol here (without passing
      // true to resolveTypeReference)
      return errorType;
    } else if (ref.flags & SymbolFlags.Function) {
      // TODO: store this in a symbol link probably?
      const t: FunctionType = createType({
        kind: "Function",
        call(...args: Type[]): Type {
          const retval = ref.value!(program, ...marshalProjectionArguments(args));
          return marshalProjectionReturn(retval);
        },
      } as const);
      return t;
    } else {
      const links = getSymbolLinks(ref);
      compilerAssert(links.declaredType, "Should have checked all types by now");

      return links.declaredType;
    }
  }

  function marshalProjectionArguments(args: Type[]): (Type | number | boolean | string | object)[] {
    return args.map((arg) => {
      if (arg.kind === "Boolean" || arg.kind === "String" || arg.kind === "Number") {
        return literalTypeToValue(arg);
      }
      return arg;
    });
  }

  function marshalProjectionReturn(value: unknown): Type {
    if (typeof value === "boolean" || typeof value === "string" || typeof value === "number") {
      return createLiteralType(value);
    }

    if (typeof value === "object" && value !== null) {
      if ("kind" in value) {
        return value as Type;
      } else {
        // this could probably be more robust
        return createType({
          kind: "Object",
          properties: value as any,
        });
      }
    }

    throw new ProjectionError("Can't marshal value returned from JS function into cadl");
  }

  function evalProjectionLambdaExpression(node: ProjectionLambdaExpressionNode): FunctionType {
    const type = createType({
      kind: "Function",
      call(...args: Type[]): Type {
        return callLambdaExpression(node, args);
      },
    } as const);

    return type;
  }

  function callLambdaExpression(node: ProjectionLambdaExpressionNode, args: Type[]): Type {
    const originalContext = evalContext;
    evalContext = createEvalContext(node, originalContext);
    for (const [i, param] of node.parameters.entries()) {
      evalContext.locals.set(param.id.sv, args[i]);
    }
    const retval = evalProjectionBlockExpression(node.body);
    evalContext = originalContext;
    if (retval.kind === "Return") {
      return retval.value;
    }
    return retval;
  }

  function evalStringLiteral(node: StringLiteralNode): StringLiteralType {
    return createLiteralType(node.value, node);
  }

  function evalNumericLiteral(node: NumericLiteralNode): NumericLiteralType {
    return createLiteralType(node.value, node);
  }

  function evalBooleanLiteral(node: BooleanLiteralNode): BooleanLiteralType {
    return createLiteralType(node.value, node);
  }

  function project(
    target: Type,
    projection: ProjectionNode,
    args: (Type | boolean | string | number)[] = []
  ) {
    return evalProjectionStatement(projection, target, args.map(marshalProjectionReturn));
  }

  function memberExpressionToString(expr: IdentifierNode | MemberExpressionNode) {
    let current = expr;
    const parts = [];

    while (current.kind === SyntaxKind.MemberExpression) {
      parts.push(current.id.sv);
      current = current.base;
    }

    parts.push(current.sv);

    return parts.reverse().join(".");
  }

  /**
   * Check if the source type can be assigned to the target type.
   * @param source Source type
   * @param target Target type
   * @param diagnosticTarget Target for the diagnostic, unless something better can be inffered.
   */
  function isTypeAssignableTo(
    source: Type,
    target: Type,
    diagnosticTarget: DiagnosticTarget
  ): [boolean, Diagnostic[]] {
    if (source === target) return [true, []];

    const isSimpleTypeRelated = isSimpleTypeAssignableTo(source, target);

    if (isSimpleTypeRelated === true) {
      return [true, []];
    } else if (isSimpleTypeRelated === false) {
      return [false, [createUnassignableDiagnostic(source, target, diagnosticTarget)]];
    }

    if (target.kind === "Model" && target.indexer !== undefined && source.kind === "Model") {
      return isIndexerValid(
        source,
        target as ModelType & { indexer: ModelIndexer },
        diagnosticTarget
      );
    } else if (target.kind === "Model" && source.kind === "Model") {
      return isModelRelatedTo(source, target, diagnosticTarget);
    } else if (target.kind === "Model" && target.indexer && source.kind === "Tuple") {
      for (const item of source.values) {
        const [related, diagnostics] = isTypeAssignableTo(
          item,
          target.indexer.value!,
          diagnosticTarget
        );
        if (!related) {
          return [false, diagnostics];
        }
      }
      return [true, []];
    } else if (target.kind === "Tuple" && source.kind === "Tuple") {
      return isTupleAssignableToTuple(source, target, diagnosticTarget);
    } else if (target.kind === "Union") {
      return isAssignableToUnion(source, target, diagnosticTarget);
    } else if (target.kind === "Enum") {
      return isAssignableToEnum(source, target, diagnosticTarget);
    }

    return [false, [createUnassignableDiagnostic(source, target, diagnosticTarget)]];
  }

  function isSimpleTypeAssignableTo(source: Type, target: Type): boolean | undefined {
    if (isVoidType(target) || isNeverType(target)) return false;
    if (isUnknownType(target)) return true;
    const sourceIntrinsicName = getIntrinsicModelName(program, source);
    const targetIntrinsicName = getIntrinsicModelName(program, target);
    if (targetIntrinsicName) {
      switch (source.kind) {
        case "Number":
          return (
            IntrinsicTypeRelations.isAssignable(targetIntrinsicName, "numeric") &&
            isNumericLiteralRelatedTo(source, targetIntrinsicName as any)
          );
        case "String":
          return IntrinsicTypeRelations.isAssignable("string", targetIntrinsicName);
        case "Boolean":
          return IntrinsicTypeRelations.isAssignable("boolean", targetIntrinsicName);
        case "Model":
          if (!sourceIntrinsicName) {
            return false;
          }
      }

      if (!sourceIntrinsicName) {
        return false;
      }
      return IntrinsicTypeRelations.isAssignable(sourceIntrinsicName, targetIntrinsicName);
    }

    if (sourceIntrinsicName && target.kind === "Model") {
      return false;
    }
    if (target.kind === "String") {
      return source.kind === "String" && target.value === source.value;
    }
    if (target.kind === "Number") {
      return source.kind === "Number" && target.value === source.value;
    }
    return undefined;
  }

  function isNumericLiteralRelatedTo(
    source: NumericLiteralType,
    targetInstrinsicType:
      | "int64"
      | "int32"
      | "int16"
      | "int8"
      | "uint64"
      | "uint32"
      | "uint16"
      | "uint8"
      | "safeint"
      | "float32"
      | "float64"
      | "numeric"
      | "integer"
      | "float"
  ) {
    if (targetInstrinsicType === "numeric") return true;
    const isInt = Number.isInteger(source.value);
    if (targetInstrinsicType === "integer") return isInt;
    if (targetInstrinsicType === "float") return true;

    const [low, high, options] = numericRanges[targetInstrinsicType];
    return source.value >= low && source.value <= high && (!options.int || isInt);
  }

  function isModelRelatedTo(
    source: ModelType,
    target: ModelType,
    diagnosticTarget: DiagnosticTarget
  ): [boolean, Diagnostic[]] {
    const diagnostics: Diagnostic[] = [];
    for (const prop of walkPropertiesInherited(target)) {
      const sourceProperty = getProperty(source, prop.name);
      if (sourceProperty === undefined) {
        diagnostics.push(
          createDiagnostic({
            code: "missing-property",
            format: {
              propertyName: prop.name,
              sourceType: getTypeName(source),
              targetType: getTypeName(target),
            },
            target: source,
          })
        );
      } else {
        const [related, propDiagnostics] = isTypeAssignableTo(
          sourceProperty.type,
          prop.type,
          diagnosticTarget
        );
        if (!related) {
          diagnostics.push(...propDiagnostics);
        }
      }
    }
    return [diagnostics.length === 0, diagnostics];
  }

  function getProperty(model: ModelType, name: string): ModelTypeProperty | undefined {
    return (
      model.properties.get(name) ??
      (model.baseModel !== undefined ? getProperty(model.baseModel, name) : undefined)
    );
  }

  function isIndexerValid(
    source: ModelType,
    target: ModelType & { indexer: ModelIndexer },
    diagnosticTarget: DiagnosticTarget
  ): [boolean, Diagnostic[]] {
    if (isNeverIndexer(target.indexer)) {
      // TODO better error here saying that you cannot assign to
      return [false, [createUnassignableDiagnostic(source, target, diagnosticTarget)]];
    }

    // Model expressions should be able to be assigned.
    if (source.name === "") {
      return isIndexConstraintValid(target.indexer.value, source, diagnosticTarget);
    } else {
      if (source.indexer === undefined || source.indexer.key !== target.indexer.key) {
        return [
          false,
          [
            createDiagnostic({
              code: "missing-index",
              format: {
                indexType: getTypeName(target.indexer.key),
                sourceType: getTypeName(source),
              },
              target,
            }),
          ],
        ];
      }
      return isTypeAssignableTo(source.indexer.value!, target.indexer.value, diagnosticTarget);
    }
  }
  /**
   * @param constraintType Type of the constraints(All properties must have this type).
   * @param type Type of the model that should be respecting the constraint.
   * @param diagnosticTarget Diagnostic target unless something better can be inffered.
   */
  function isIndexConstraintValid(
    constraintType: Type,
    type: ModelType,
    diagnosticTarget: DiagnosticTarget
  ): [boolean, Diagnostic[]] {
    for (const prop of type.properties.values()) {
      const [related, diagnostics] = isTypeAssignableTo(
        prop.type,
        constraintType,
        diagnosticTarget
      );
      if (!related) {
        return [false, diagnostics];
      }
    }

    if (type.baseModel) {
      const [related, diagnostics] = isIndexConstraintValid(
        constraintType,
        type.baseModel,
        diagnosticTarget
      );
      if (!related) {
        return [false, diagnostics];
      }
    }
    return [true, []];
  }

  function isTupleAssignableToTuple(
    source: TupleType,
    target: TupleType,
    diagnosticTarget: DiagnosticTarget
  ): [boolean, Diagnostic[]] {
    if (source.values.length !== target.values.length) {
      return [
        false,
        [
          createDiagnostic({
            code: "unassignable",
            messageId: "withDetails",
            format: {
              sourceType: getTypeName(source),
              targetType: getTypeName(target),
              details: `Source has ${source.values.length} element(s) but target requires ${target.values.length}.`,
            },
            target: diagnosticTarget,
          }),
        ],
      ];
    }
    for (const [index, sourceItem] of source.values.entries()) {
      const targetItem = target.values[index];
      const [related, diagnostics] = isTypeAssignableTo(sourceItem, targetItem, diagnosticTarget);
      if (!related) {
        return [false, diagnostics];
      }
    }
    return [true, []];
  }

  function isAssignableToUnion(
    source: Type,
    target: UnionType,
    diagnosticTarget: DiagnosticTarget
  ): [boolean, Diagnostic[]] {
    for (const option of target.options) {
      const [related] = isTypeAssignableTo(source, option, diagnosticTarget);
      if (related) {
        return [true, []];
      }
    }
    return [false, [createUnassignableDiagnostic(source, target, diagnosticTarget)]];
  }

  function isAssignableToEnum(
    source: Type,
    target: EnumType,
    diagnosticTarget: DiagnosticTarget
  ): [boolean, Diagnostic[]] {
    switch (source.kind) {
      case "Enum":
        if (source === target) {
          return [true, []];
        } else {
          return [false, [createUnassignableDiagnostic(source, target, diagnosticTarget)]];
        }
      case "EnumMember":
        if (source.enum === target) {
          return [true, []];
        } else {
          return [false, [createUnassignableDiagnostic(source, target, diagnosticTarget)]];
        }
      default:
        return [false, [createUnassignableDiagnostic(source, target, diagnosticTarget)]];
    }
  }

  function createUnassignableDiagnostic(
    source: Type,
    target: Type,
    diagnosticTarget: DiagnosticTarget
  ) {
    return createDiagnostic({
      code: "unassignable",
      format: { targetType: getTypeName(target), value: getTypeName(source) },
      target: diagnosticTarget,
    });
  }

  function isStdType(type: Type, stdType?: StdTypeName): boolean {
    if (type.kind !== "Model") return false;
    const intrinsicModelName = getIntrinsicModelName(program, type);
    if (intrinsicModelName) return stdType === undefined || stdType === intrinsicModelName;
    if (stdType === "Array" && type === stdTypes["Array"]) return true;
    if (stdType === "Record" && type === stdTypes["Record"]) return true;
    return false;
  }

  function getEffectiveModelType(
    model: ModelType,
    filter?: (property: ModelTypeProperty) => boolean
  ): ModelType {
    if (filter) {
      model = filterModelProperties(model, filter);
    }
    while (true) {
      if (model.name) {
        // named model
        return model;
      }

      // We would need to change the algorithm if this doesn't hold. We
      // assume model has no inherited properties below.
      compilerAssert(!model.baseModel, "Anonymous model with base model.");

      if (model.properties.size === 0) {
        // empty model
        return model;
      }

      let source: ModelType | undefined;

      for (const property of model.properties.values()) {
        const propertySource = getRootSourceModel(property);
        if (!propertySource) {
          // unsourced property
          return model;
        }

        if (!source) {
          // initialize common source from first sourced property.
          source = propertySource;
          continue;
        }

        if (isDerivedFrom(source, propertySource)) {
          // OK
        } else if (isDerivedFrom(propertySource, source)) {
          // OK, but refine common source to derived type.
          source = propertySource;
        } else {
          // different source
          return model;
        }
      }

      compilerAssert(source, "Should have found a common source to reach here.");

      if (model.properties.size !== countPropertiesInherited(source, filter)) {
        // source has additional properties.
        return model;
      }

      // keep going until we reach a model that cannot be further reduced.
      model = source;
    }
  }

  function filterModelProperties(
    model: ModelType,
    filter: (property: ModelTypeProperty) => boolean
  ): ModelType {
    let filtered = false;
    for (const property of walkPropertiesInherited(model)) {
      if (!filter(property)) {
        filtered = true;
        break;
      }
    }

    if (!filtered) {
      return model;
    }

    const properties = new Map<string, ModelTypeProperty>();
    const newModel: ModelType = createType({
      kind: "Model",
      node: undefined,
      name: "",
      indexer: undefined,
      properties,
      decorators: [],
      derivedModels: [],
    });

    for (const property of walkPropertiesInherited(model)) {
      if (filter(property)) {
        const newProperty = cloneType(property, {
          sourceProperty: property,
          model: newModel,
        });
        properties.set(property.name, newProperty);
      }
    }

    return finishType(newModel);
  }
}

function isAnonymous(type: Type) {
  return !("name" in type) || typeof type.name !== "string" || !type.name;
}

function isErrorType(type: Type): type is ErrorType {
  return type.kind === "Intrinsic" && type.name === "ErrorType";
}

function createUsingSymbol(symbolSource: Sym): Sym {
  return { flags: SymbolFlags.Using, declarations: [], name: symbolSource.name, symbolSource };
}

const numericRanges = {
  int64: [BigInt("-9223372036854775807"), BigInt("9223372036854775808"), { int: true }],
  int32: [-2147483648, 2147483647, { int: true }],
  int16: [-32768, 32767, { int: true }],
  int8: [-128, 127, { int: true }],
  uint64: [0, BigInt("18446744073709551615"), { int: true }],
  uint32: [0, 4294967295, { int: true }],
  uint16: [0, 65535, { int: true }],
  uint8: [0, 255, { int: true }],
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, { int: true }],
  float32: [-3.4e38, 3.4e38, { int: false }],
  float64: [Number.MIN_VALUE, Number.MAX_VALUE, { int: false }],
} as const;

class IntrinsicTypeRelationTree<
  T extends Record<IntrinsicModelName, IntrinsicModelName | IntrinsicModelName[] | "unknown">
> {
  private map = new Map<IntrinsicModelName, Set<IntrinsicModelName | "unknown">>();
  public constructor(data: T) {
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) {
        continue;
      }

      const parents = Array.isArray(value) ? value : [value];
      const set = new Set<IntrinsicModelName | "unknown">([
        key as IntrinsicModelName,
        ...parents,
        ...parents.flatMap((parent) => [...(this.map.get(parent as any) ?? [])]),
      ]);
      this.map.set(key as IntrinsicModelName, set);
    }
  }

  public isAssignable(source: IntrinsicModelName, target: IntrinsicModelName) {
    return this.map.get(source)?.has(target);
  }
}

const IntrinsicTypeRelations = new IntrinsicTypeRelationTree({
  Record: "unknown",
  bytes: "unknown",
  numeric: "unknown",
  integer: "numeric",
  float: "numeric",
  int64: "integer",
  safeint: "int64",
  int32: "safeint",
  int16: "int32",
  int8: "int16",
  uint64: "integer",
  uint32: "uint64",
  uint16: "uint32",
  uint8: "uint16",
  float64: "float",
  float32: "float64",
  string: "unknown",
  plainDate: "unknown",
  plainTime: "unknown",
  zonedDateTime: "unknown",
  duration: "unknown",
  boolean: "unknown",
  null: "unknown",
  Map: "unknown",
});
function isDerivedFrom(derived: ModelType, base: ModelType) {
  while (derived !== base && derived.baseModel) {
    derived = derived.baseModel;
  }
  return derived === base;
}

function getRootSourceModel(property: ModelTypeProperty): ModelType | undefined {
  if (!property.sourceProperty) {
    return undefined;
  }
  while (property.sourceProperty) {
    property = property.sourceProperty;
  }
  return property?.model;
}

export function isNeverIndexer(indexer: ModelIndexer): indexer is NeverIndexer {
  return isNeverType(indexer.key);
}
