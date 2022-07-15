import type { JSONSchemaType as AjvJSONSchemaType } from "ajv";
import { Program } from "./program";

/**
 * Type System types
 */

export type DecoratorArgumentValue = Type | number | string | boolean;

export interface DecoratorArgument {
  value: DecoratorArgumentValue;
  node?: Node;
}

export interface DecoratorApplication {
  decorator: DecoratorFunction;
  args: DecoratorArgument[];
  node?: DecoratorExpressionNode;
}

export interface DecoratorFunction {
  (program: DecoratorContext, target: any, ...customArgs: any[]): void;
  namespace?: string;
}

export interface BaseType {
  kind: string;
  node?: Node;
  instantiationParameters?: Type[];
  get projections(): ProjectionStatementNode[];
  projectionsByName(name: string): ProjectionStatementNode[];
  projectionSource?: Type;
  projectionBase?: Type;
  projector?: Projector;
}

export interface DecoratedType {
  decorators: DecoratorApplication[];
}

export interface TemplatedType {
  templateArguments?: Type[];
  templateNode?: Node;
}
export type Type =
  | ModelType
  | ModelTypeProperty
  | InterfaceType
  | EnumType
  | EnumMemberType
  | TemplateParameterType
  | NamespaceType
  | OperationType
  | StringLiteralType
  | NumericLiteralType
  | BooleanLiteralType
  | ArrayType
  | TupleType
  | UnionType
  | UnionTypeVariant
  | IntrinsicType
  | FunctionType
  | ObjectType
  | ProjectionType;

export type TypeOrReturnRecord = Type | ReturnRecord;

export interface FunctionType extends BaseType {
  kind: "Function";
  call(...args: any[]): Type;
}

export interface ObjectType extends BaseType {
  kind: "Object";
  properties: Record<string, Type>;
}

export interface ProjectionType extends BaseType {
  kind: "Projection";
  node: undefined;
  nodeByKind: Map<string, ProjectionStatementNode>;
  nodeByType: Map<Type, ProjectionStatementNode>;
}

export interface ProjectionApplication {
  scope?: Type;
  projectionName: string;
  arguments: DecoratorArgumentValue[];
  direction?: "from" | "to";
}

export interface Projector {
  projections: ProjectionApplication[];
  projectedTypes: Map<Type, Type>;
  projectType(type: Type): Type;
  projectedStartNode?: Type;
  projectedGlobalNamespace?: NamespaceType;
}

export interface IntrinsicType extends BaseType {
  kind: "Intrinsic";
  name: "ErrorType" | "void" | "never";
}

export interface ErrorType extends IntrinsicType {
  name: "ErrorType";
}

export interface VoidType extends IntrinsicType {
  name: "void";
}

export interface NeverType extends IntrinsicType {
  name: "never";
}

// represents a type that is being returned from the
// currently executing lambda or projection
export interface ReturnRecord {
  kind: "Return";
  value: Type;
}

export type IntrinsicModelName =
  | "bytes"
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
  | "string"
  | "plainDate"
  | "plainTime"
  | "zonedDateTime"
  | "duration"
  | "boolean"
  | "null"
  | "Map";

export type IntrinsicModel<T extends IntrinsicModelName = IntrinsicModelName> = ModelType & {
  name: T;
};

export interface ModelType extends BaseType, DecoratedType, TemplatedType {
  kind: "Model";
  name: IntrinsicModelName | string;
  node?:
    | ModelStatementNode
    | ModelExpressionNode
    | IntersectionExpressionNode
    | ProjectionModelExpressionNode;
  namespace?: NamespaceType;
  properties: Map<string, ModelTypeProperty>;

  /**
   * Model this model extends. This represent inheritance.
   */
  baseModel?: ModelType | TemplateParameterType;

  /**
   * Direct children. This is the reverse relation of @see baseModel
   */
  derivedModels: ModelType[];

  /**
   * Late-bound symbol of this model type.
   * @internal
   */
  symbol?: Sym;
}

export interface ModelTypeProperty extends BaseType, DecoratedType {
  kind: "ModelProperty";
  node:
    | ModelPropertyNode
    | ModelSpreadPropertyNode
    | ProjectionModelPropertyNode
    | ProjectionModelSpreadPropertyNode;
  name: string;
  type: Type;
  // when spread or intersection operators make new property types,
  // this tracks the property we copied from.
  sourceProperty?: ModelTypeProperty;
  optional: boolean;
  default?: Type;
  model?: ModelType;
}

export interface InterfaceType extends BaseType, DecoratedType, TemplatedType {
  kind: "Interface";
  name: string;
  node: InterfaceStatementNode;
  namespace?: NamespaceType;
  operations: Map<string, OperationType>;
  /**
   * Late-bound symbol of this interface type.
   * @internal
   */
  symbol?: Sym;
}

export interface EnumType extends BaseType, DecoratedType {
  kind: "Enum";
  name: string;
  node: EnumStatementNode;
  namespace?: NamespaceType;
  members: EnumMemberType[];
}

export interface EnumMemberType extends BaseType, DecoratedType {
  kind: "EnumMember";
  name: string;
  enum: EnumType;
  node: EnumMemberNode;
  value?: string | number;
}

export interface OperationType extends BaseType, DecoratedType, TemplatedType {
  kind: "Operation";
  node: OperationStatementNode;
  name: string;
  namespace?: NamespaceType;
  interface?: InterfaceType;
  parameters: ModelType;
  returnType: Type;
}

export interface NamespaceType extends BaseType, DecoratedType {
  kind: "Namespace";
  name: string;
  namespace?: NamespaceType;
  node: NamespaceStatementNode;
  models: Map<string, ModelType>;
  operations: Map<string, OperationType>;
  namespaces: Map<string, NamespaceType>;
  interfaces: Map<string, InterfaceType>;
  enums: Map<string, EnumType>;
  unions: Map<string, UnionType>;
}

export type LiteralType = StringLiteralType | NumericLiteralType | BooleanLiteralType;

export interface StringLiteralType extends BaseType {
  kind: "String";
  node?: StringLiteralNode;
  value: string;
}

export interface NumericLiteralType extends BaseType {
  kind: "Number";
  node?: NumericLiteralNode;
  value: number;
}

export interface BooleanLiteralType extends BaseType {
  kind: "Boolean";
  node?: BooleanLiteralNode;
  value: boolean;
}

export interface ArrayType extends BaseType {
  kind: "Array";
  node: ArrayExpressionNode;
  elementType: Type;
}

export interface TupleType extends BaseType {
  kind: "Tuple";
  node: TupleExpressionNode;
  values: Type[];
}

export interface UnionType extends BaseType, DecoratedType, TemplatedType {
  kind: "Union";
  name?: string;
  node: UnionExpressionNode | UnionStatementNode;
  namespace?: NamespaceType;
  variants: Map<string | symbol, UnionTypeVariant>;
  expression: boolean;
  readonly options: Type[];

  /**
   * Late-bound symbol of this interface type.
   * @internal
   */
  symbol?: Sym;
}

export interface UnionTypeVariant extends BaseType, DecoratedType {
  kind: "UnionVariant";
  name: string | symbol;
  node: UnionVariantNode | undefined;
  type: Type;
}

export interface TemplateParameterType extends BaseType {
  kind: "TemplateParameter";
  node: TemplateParameterDeclarationNode;
  default?: Type;
}

export interface Sym {
  flags: SymbolFlags;

  /**
   * Nodes which contribute to this declaration
   */
  declarations: Node[];

  /**
   * The name of the symbol
   */
  name: string;

  /**
   * A unique identifier for this symbol. Used to look up the symbol links.
   */
  id?: number;

  /**
   * The symbol containing this symbol, if any. E.g. for things declared in
   * a namespace, this refers to the namespace.
   */
  parent?: Sym;

  /**
   * Externally visible symbols contained inside this symbol. E.g. all declarations
   * in a namespace, or members of an enum.
   */
  exports?: SymbolTable;

  /**
   * Symbols for members of this symbol which must be referenced off the parent symbol
   * and cannot be referenced by other means (i.e. by unqualified lookup of the symbol
   * name).
   */
  members?: SymbolTable;

  /**
   * For using symbols, this is the used symbol.
   */
  symbolSource?: Sym;

  /**
   * For late-bound symbols, this is the type referenced by the symbol.
   */
  type?: Type;

  /**
   * For decorator and function symbols, this is the JS function implementation.
   */
  value?: (...args: any[]) => any;
}

export interface SymbolLinks {
  type?: Type;

  // for types which can be instantiated, we split `type` into declaredType and
  // a map of instantiations.
  declaredType?: Type;
  instantiations?: TypeInstantiationMap;
}

export interface SymbolTable extends Map<string, Sym> {
  /**
   * Duplicate
   */
  readonly duplicates: Map<Sym, Set<Sym>>;
}

// prettier-ignore
export const enum SymbolFlags {
  None                  = 0,
  Model                 = 1 << 1,
  ModelProperty         = 1 << 2,
  Operation             = 1 << 3,
  Enum                  = 1 << 4,
  EnumMember            = 1 << 5,
  Interface             = 1 << 6,
  InterfaceMember       = 1 << 7,
  Union                 = 1 << 8,
  UnionVariant          = 1 << 9,
  Alias                 = 1 << 10,
  Namespace             = 1 << 11,
  Projection            = 1 << 12,
  Decorator             = 1 << 13,
  TemplateParameter     = 1 << 14,
  ProjectionParameter   = 1 << 15,
  Function              = 1 << 16,
  FunctionParameter     = 1 << 17,
  Using                 = 1 << 18,
  DuplicateUsing        = 1 << 19,
  SourceFile            = 1 << 20,

  /**
   * A symbol which was late-bound, in which case, the type referred to
   * by this symbol is stored directly in the symbol.
   */
  LateBound = 1 << 21,

  ExportContainer = Namespace | SourceFile,
  /**
   * Symbols whose members will be late bound (and stored on the type)
   */
  MemberContainer = Model | Enum | Union | Interface,
}

/**
 * Maps type arguments to instantiated type.
 */
export interface TypeInstantiationMap {
  get(args: Type[]): Type | undefined;
  set(args: Type[], type: Type): void;
}

/**
 * AST types
 */
export enum SyntaxKind {
  CadlScript,
  JsSourceFile,
  ImportStatement,
  Identifier,
  DecoratorExpression,
  DirectiveExpression,
  MemberExpression,
  NamespaceStatement,
  UsingStatement,
  OperationStatement,
  OperationSignatureDeclaration,
  OperationSignatureReference,
  ModelStatement,
  ModelExpression,
  ModelProperty,
  ModelSpreadProperty,
  InterfaceStatement,
  UnionStatement,
  UnionVariant,
  EnumStatement,
  EnumMember,
  AliasStatement,
  UnionExpression,
  IntersectionExpression,
  TupleExpression,
  ArrayExpression,
  StringLiteral,
  NumericLiteral,
  BooleanLiteral,
  VoidKeyword,
  NeverKeyword,
  TypeReference,
  ProjectionReference,
  TemplateParameterDeclaration,
  EmptyStatement,
  InvalidStatement,
  LineComment,
  BlockComment,
  Projection,
  ProjectionParameterDeclaration,
  ProjectionModelSelector,
  ProjectionOperationSelector,
  ProjectionUnionSelector,
  ProjectionInterfaceSelector,
  ProjectionEnumSelector,
  ProjectionExpressionStatement,
  ProjectionIfExpression,
  ProjectionBlockExpression,
  ProjectionMemberExpression,
  ProjectionLogicalExpression,
  ProjectionEqualityExpression,
  ProjectionUnaryExpression,
  ProjectionRelationalExpression,
  ProjectionArithmeticExpression,
  ProjectionCallExpression,
  ProjectionLambdaExpression,
  ProjectionLambdaParameterDeclaration,
  ProjectionModelExpression,
  ProjectionModelProperty,
  ProjectionModelSpreadProperty,
  ProjectionSpreadProperty,
  ProjectionTupleExpression,
  ProjectionStatement,
  ProjectionDecoratorReferenceExpression,
  Return,
}

export const enum NodeFlags {
  None = 0,
  /**
   * If this is set, the DescendantHasError bit can be trusted. If this not set,
   * children need to be visited still to see if DescendantHasError should be
   * set.
   *
   * Use the parser's `hasParseError` API instead of using this flag directly.
   */
  DescendantErrorsExamined = 1 << 0,

  /**
   * Indicates that a parse error was associated with this specific node.
   *
   * Use the parser's `hasParseError` API instead of using this flag directly.
   */
  ThisNodeHasError = 1 << 1,

  /**
   * Indicates that a child of this node (or one of its children,
   * transitively) has a parse error.
   *
   * Use the parser's `hasParseError` API instead of using this flag directly.
   */
  DescendantHasError = 1 << 2,

  /**
   * Indicates that a node was created synthetically and therefore may not be parented.
   */
  Synthetic = 1 << 3,
}

export interface BaseNode extends TextRange {
  readonly kind: SyntaxKind;
  parent?: Node;
  readonly directives?: readonly DirectiveExpressionNode[];
  readonly flags: NodeFlags;
  /**
   * Could be undefined but making this optional creates a lot of noise. In practice,
   * you will likely only access symbol in cases where you know the node has a symbol.
   */
  readonly symbol: Sym;
}

export interface TemplateDeclarationNode {
  readonly templateParameters: readonly TemplateParameterDeclarationNode[];
  locals?: SymbolTable;
}

export type Node =
  | CadlScriptNode
  | JsSourceFileNode
  | TemplateParameterDeclarationNode
  | ProjectionParameterDeclarationNode
  | ProjectionLambdaParameterDeclarationNode
  | ModelPropertyNode
  | UnionVariantNode
  | OperationStatementNode
  | OperationSignatureDeclarationNode
  | OperationSignatureReferenceNode
  | EnumMemberNode
  | ModelSpreadPropertyNode
  | DecoratorExpressionNode
  | DirectiveExpressionNode
  | Statement
  | Expression
  | ProjectionStatementItem
  | ProjectionExpression
  | ProjectionModelSelectorNode
  | ProjectionInterfaceSelectorNode
  | ProjectionOperationSelectorNode
  | ProjectionEnumSelectorNode
  | ProjectionUnionSelectorNode
  | ProjectionModelPropertyNode
  | ProjectionModelSpreadPropertyNode
  | ProjectionStatementNode
  | ProjectionNode;

export type Comment = LineComment | BlockComment;

export interface LineComment extends TextRange {
  kind: SyntaxKind.LineComment;
}
export interface BlockComment extends TextRange {
  kind: SyntaxKind.BlockComment;
}

export interface CadlScriptNode extends DeclarationNode, BaseNode {
  readonly kind: SyntaxKind.CadlScript;
  readonly statements: readonly Statement[];
  readonly file: SourceFile;
  readonly inScopeNamespaces: readonly NamespaceStatementNode[]; // namespaces that declarations in this file belong to
  readonly namespaces: NamespaceStatementNode[]; // list of namespaces in this file (initialized during binding)
  readonly usings: readonly UsingStatementNode[];
  readonly comments: readonly Comment[];
  readonly parseDiagnostics: readonly Diagnostic[];
  readonly printable: boolean; // If this ast tree can safely be printed/formatted.
  readonly locals: SymbolTable;
}

export type Statement =
  | ImportStatementNode
  | ModelStatementNode
  | NamespaceStatementNode
  | InterfaceStatementNode
  | UnionStatementNode
  | UsingStatementNode
  | EnumStatementNode
  | AliasStatementNode
  | OperationStatementNode
  | EmptyStatementNode
  | InvalidStatementNode
  | ProjectionStatementNode;

export interface DeclarationNode {
  id: IdentifierNode;
}

export type Declaration =
  | ModelStatementNode
  | InterfaceStatementNode
  | UnionStatementNode
  | NamespaceStatementNode
  | OperationStatementNode
  | TemplateParameterDeclarationNode
  | ProjectionStatementNode
  | ProjectionParameterDeclarationNode
  | ProjectionLambdaParameterDeclarationNode
  | EnumStatementNode
  | AliasStatementNode;

export type ScopeNode =
  | NamespaceStatementNode
  | ModelStatementNode
  | InterfaceStatementNode
  | AliasStatementNode
  | CadlScriptNode
  | JsSourceFileNode
  | ProjectionLambdaExpressionNode
  | ProjectionNode;

export interface ImportStatementNode extends BaseNode {
  readonly kind: SyntaxKind.ImportStatement;
  readonly path: StringLiteralNode;
}

export interface IdentifierNode extends BaseNode {
  readonly kind: SyntaxKind.Identifier;
  readonly sv: string;
}

export interface DecoratorExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.DecoratorExpression;
  readonly target: IdentifierNode | MemberExpressionNode;
  readonly arguments: readonly Expression[];
}

export interface DirectiveExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.DirectiveExpression;
  readonly target: IdentifierNode;
  readonly arguments: readonly DirectiveArgument[];
}

export type DirectiveArgument = StringLiteralNode | IdentifierNode;

export type Expression =
  | ArrayExpressionNode
  | MemberExpressionNode
  | ModelExpressionNode
  | TupleExpressionNode
  | UnionExpressionNode
  | IntersectionExpressionNode
  | TypeReferenceNode
  | IdentifierNode
  | StringLiteralNode
  | NumericLiteralNode
  | BooleanLiteralNode
  | VoidKeywordNode
  | NeverKeywordNode;

export type ProjectionExpression =
  | ProjectionLogicalExpressionNode
  | ProjectionRelationalExpressionNode
  | ProjectionEqualityExpressionNode
  | ProjectionUnaryExpressionNode
  | ProjectionArithmeticExpressionNode
  | ProjectionCallExpressionNode
  | ProjectionMemberExpressionNode
  | ProjectionDecoratorReferenceExpressionNode
  | ProjectionTupleExpressionNode
  | ProjectionModelExpressionNode
  | ProjectionIfExpressionNode
  | ProjectionBlockExpressionNode
  | ProjectionLambdaExpressionNode
  | StringLiteralNode
  | NumericLiteralNode
  | BooleanLiteralNode
  | IdentifierNode
  | VoidKeywordNode
  | NeverKeywordNode
  | ReturnExpressionNode;

export type ReferenceExpression =
  | TypeReferenceNode
  | MemberExpressionNode
  | IdentifierNode
  | VoidKeywordNode
  | NeverKeywordNode;

export interface MemberExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.MemberExpression;
  readonly id: IdentifierNode;
  readonly base: MemberExpressionNode | IdentifierNode;
}

export interface NamespaceStatementNode extends BaseNode, DeclarationNode {
  readonly kind: SyntaxKind.NamespaceStatement;
  readonly statements?: readonly Statement[] | NamespaceStatementNode;
  readonly decorators: DecoratorExpressionNode[];
  readonly locals?: SymbolTable;
}

export interface UsingStatementNode extends BaseNode {
  readonly kind: SyntaxKind.UsingStatement;
  readonly name: IdentifierNode | MemberExpressionNode;
}

export interface OperationSignatureDeclarationNode extends BaseNode {
  readonly kind: SyntaxKind.OperationSignatureDeclaration;
  readonly parameters: ModelExpressionNode;
  readonly returnType: Expression;
}

export interface OperationSignatureReferenceNode extends BaseNode {
  readonly kind: SyntaxKind.OperationSignatureReference;
  readonly baseOperation: TypeReferenceNode;
}

export type OperationSignature =
  | OperationSignatureDeclarationNode
  | OperationSignatureReferenceNode;

export interface OperationStatementNode extends BaseNode, DeclarationNode, TemplateDeclarationNode {
  readonly kind: SyntaxKind.OperationStatement;
  readonly signature: OperationSignature;
  readonly decorators: readonly DecoratorExpressionNode[];
}

export interface ModelStatementNode extends BaseNode, DeclarationNode, TemplateDeclarationNode {
  readonly kind: SyntaxKind.ModelStatement;
  readonly properties: readonly (ModelPropertyNode | ModelSpreadPropertyNode)[];
  readonly extends?: TypeReferenceNode;
  readonly is?: TypeReferenceNode;
  readonly decorators: DecoratorExpressionNode[];
}

export interface InterfaceStatementNode extends BaseNode, DeclarationNode, TemplateDeclarationNode {
  readonly kind: SyntaxKind.InterfaceStatement;
  readonly operations: readonly OperationStatementNode[];
  readonly extends: readonly TypeReferenceNode[];
  readonly decorators: readonly DecoratorExpressionNode[];
}

export interface UnionStatementNode extends BaseNode, DeclarationNode, TemplateDeclarationNode {
  readonly kind: SyntaxKind.UnionStatement;
  readonly options: readonly UnionVariantNode[];
  readonly decorators: readonly DecoratorExpressionNode[];
}

export interface UnionVariantNode extends BaseNode {
  readonly kind: SyntaxKind.UnionVariant;
  readonly id: IdentifierNode | StringLiteralNode;
  readonly value: Expression;
  readonly decorators: readonly DecoratorExpressionNode[];
}

export interface EnumStatementNode extends BaseNode, DeclarationNode {
  readonly kind: SyntaxKind.EnumStatement;
  readonly members: readonly EnumMemberNode[];
  readonly decorators: readonly DecoratorExpressionNode[];
}

export interface EnumMemberNode extends BaseNode {
  readonly kind: SyntaxKind.EnumMember;
  readonly id: IdentifierNode | StringLiteralNode;
  readonly value?: StringLiteralNode | NumericLiteralNode;
  readonly decorators: readonly DecoratorExpressionNode[];
}

export interface AliasStatementNode extends BaseNode, DeclarationNode, TemplateDeclarationNode {
  readonly kind: SyntaxKind.AliasStatement;
  readonly value: Expression;
}

export interface InvalidStatementNode extends BaseNode {
  readonly kind: SyntaxKind.InvalidStatement;
  readonly decorators: readonly DecoratorExpressionNode[];
}

export interface EmptyStatementNode extends BaseNode {
  readonly kind: SyntaxKind.EmptyStatement;
}

export interface ModelExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.ModelExpression;
  readonly properties: (ModelPropertyNode | ModelSpreadPropertyNode)[];
}

export interface ArrayExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.ArrayExpression;
  readonly elementType: Expression;
}
export interface TupleExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.TupleExpression;
  readonly values: readonly Expression[];
}

export interface ModelPropertyNode extends BaseNode {
  readonly kind: SyntaxKind.ModelProperty;
  readonly id: IdentifierNode | StringLiteralNode;
  readonly value: Expression;
  readonly decorators: readonly DecoratorExpressionNode[];
  readonly optional: boolean;
  readonly default?: Expression;
}

export interface ModelSpreadPropertyNode extends BaseNode {
  readonly kind: SyntaxKind.ModelSpreadProperty;
  readonly target: TypeReferenceNode;
}

export type LiteralNode = StringLiteralNode | NumericLiteralNode | BooleanLiteralNode;

export interface StringLiteralNode extends BaseNode {
  readonly kind: SyntaxKind.StringLiteral;
  readonly value: string;
}

export interface NumericLiteralNode extends BaseNode {
  readonly kind: SyntaxKind.NumericLiteral;
  readonly value: number;
}

export interface BooleanLiteralNode extends BaseNode {
  readonly kind: SyntaxKind.BooleanLiteral;
  readonly value: boolean;
}

export interface VoidKeywordNode extends BaseNode {
  readonly kind: SyntaxKind.VoidKeyword;
}

export interface NeverKeywordNode extends BaseNode {
  readonly kind: SyntaxKind.NeverKeyword;
}

export interface ReturnExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.Return;
  readonly value: ProjectionExpression;
}

export interface UnionExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.UnionExpression;
  readonly options: readonly Expression[];
}

export interface IntersectionExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.IntersectionExpression;
  readonly options: readonly Expression[];
}

export interface TypeReferenceNode extends BaseNode {
  kind: SyntaxKind.TypeReference;
  target: MemberExpressionNode | IdentifierNode;
  arguments: Expression[];
}

export interface ProjectionReferenceNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionReference;
  readonly target: MemberExpressionNode | IdentifierNode;
  readonly arguments: readonly Expression[];
}

export interface TemplateParameterDeclarationNode extends DeclarationNode, BaseNode {
  readonly kind: SyntaxKind.TemplateParameterDeclaration;
  readonly default?: Expression;
}

// Projection-related Syntax

export interface ProjectionModelSelectorNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionModelSelector;
}

export interface ProjectionInterfaceSelectorNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionInterfaceSelector;
}

export interface ProjectionOperationSelectorNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionOperationSelector;
}

export interface ProjectionUnionSelectorNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionUnionSelector;
}

export interface ProjectionEnumSelectorNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionEnumSelector;
}

export type ProjectionStatementItem = ProjectionExpressionStatement;

export interface ProjectionParameterDeclarationNode extends DeclarationNode, BaseNode {
  readonly kind: SyntaxKind.ProjectionParameterDeclaration;
}

export interface ProjectionExpressionStatement extends BaseNode {
  readonly kind: SyntaxKind.ProjectionExpressionStatement;
  readonly expr: ProjectionExpression;
}

export interface ProjectionLogicalExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionLogicalExpression;
  readonly op: "||" | "&&";
  readonly left: ProjectionExpression;
  readonly right: ProjectionExpression;
}

export interface ProjectionRelationalExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionRelationalExpression;
  readonly op: "<=" | "<" | ">" | ">=";
  readonly left: ProjectionExpression;
  readonly right: ProjectionExpression;
}

export interface ProjectionEqualityExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionEqualityExpression;
  readonly op: "==" | "!=";
  readonly left: ProjectionExpression;
  readonly right: ProjectionExpression;
}

export interface ProjectionArithmeticExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionArithmeticExpression;
  readonly op: "+" | "-" | "*" | "/";
  readonly left: ProjectionExpression;
  readonly right: ProjectionExpression;
}

export interface ProjectionUnaryExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionUnaryExpression;
  readonly op: "!";
  readonly target: ProjectionExpression;
}

export interface ProjectionCallExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionCallExpression;
  readonly callKind: "method" | "template";
  readonly target: ProjectionExpression;
  readonly arguments: ProjectionExpression[];
}

export interface ProjectionMemberExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionMemberExpression;
  readonly base: ProjectionExpression;
  readonly id: IdentifierNode;
  readonly selector: "." | "::";
}

export interface ProjectionModelExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionModelExpression;
  readonly properties: (ProjectionModelPropertyNode | ProjectionModelSpreadPropertyNode)[];
}

export interface ProjectionTupleExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionTupleExpression;
  readonly values: ProjectionExpression[];
}

export interface ProjectionModelPropertyNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionModelProperty;
  readonly id: IdentifierNode | StringLiteralNode;
  readonly value: ProjectionExpression;
  readonly decorators: DecoratorExpressionNode[];
  readonly optional: boolean;
  readonly default?: ProjectionExpression;
}

export interface ProjectionModelSpreadPropertyNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionModelSpreadProperty;
  readonly target: ProjectionExpression;
}

export interface ProjectionIfExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionIfExpression;
  readonly test: ProjectionExpression;
  readonly consequent: ProjectionBlockExpressionNode;
  readonly alternate?: ProjectionBlockExpressionNode | ProjectionIfExpressionNode;
}

export interface ProjectionBlockExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionBlockExpression;
  readonly statements: ProjectionStatementItem[];
}

export interface ProjectionLambdaExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionLambdaExpression;
  readonly parameters: ProjectionLambdaParameterDeclarationNode[];
  readonly locals?: SymbolTable;
  readonly body: ProjectionBlockExpressionNode;
}

export interface ProjectionLambdaParameterDeclarationNode extends DeclarationNode, BaseNode {
  readonly kind: SyntaxKind.ProjectionLambdaParameterDeclaration;
}

export interface ProjectionNode extends BaseNode {
  readonly kind: SyntaxKind.Projection;
  readonly direction: "to" | "from";
  readonly parameters: ProjectionParameterDeclarationNode[];
  readonly body: ProjectionStatementItem[];
  readonly locals?: SymbolTable;
}

export interface ProjectionStatementNode extends BaseNode, DeclarationNode {
  readonly kind: SyntaxKind.ProjectionStatement;
  readonly selector:
    | ProjectionModelSelectorNode
    | ProjectionInterfaceSelectorNode
    | ProjectionOperationSelectorNode
    | ProjectionUnionSelectorNode
    | ProjectionEnumSelectorNode
    | MemberExpressionNode
    | IdentifierNode;
  readonly to?: ProjectionNode;
  readonly from?: ProjectionNode;
}

export interface ProjectionDecoratorReferenceExpressionNode extends BaseNode {
  readonly kind: SyntaxKind.ProjectionDecoratorReferenceExpression;
  readonly target: MemberExpressionNode | IdentifierNode;
}

export interface IdentifierContext {
  kind: IdentifierKind;
  node: Node;
}

export enum IdentifierKind {
  TypeReference,
  Decorator,
  Using,
  Declaration,
  Other,
}

/**
 * Identifies the position within a source file by line number and offset from
 * beginning of line.
 */
export interface LineAndCharacter {
  /** The line number. 0-based. */
  line: number;

  /**
   * The offset in UTF-16 code units to the character from the beginning of the
   * line. 0-based.
   *
   * NOTE: This is not necessarily the same as what a given text editor might
   * call the "column". Tabs, combining characters, surrogate pairs, and so on
   * can all cause an editor to report the column differently. Indeed, different
   * text editors report different column numbers for the same position in a
   * given document.
   */
  character: number;
}

export interface JsSourceFileNode extends DeclarationNode, BaseNode {
  readonly kind: SyntaxKind.JsSourceFile;

  /* A source file with empty contents to represent the file on disk. */
  readonly file: SourceFile;

  /* The exports object as comes from `import()` */
  readonly esmExports: any;

  /* Any namespaces declared by decorators. */
  readonly namespaceSymbols: Sym[];
}

export type EmitterOptions = { name?: string } & Record<string, any>;
export type Emitter = (program: Program, options: EmitterOptions) => void;

export interface SourceFile {
  /** The source code text. */
  readonly text: string;

  /**
   * The source file path.
   *
   * This is used only for diagnostics. The command line compiler will populate
   * it with the actual path from which the file was read, but it can actually
   * be an aribitrary name for other scenarios.
   */
  readonly path: string;

  /**
   * Array of positions in the text where each line begins. There is one entry
   * per line, in order of lines, and each entry represents the offset in UTF-16
   * code units from the start of the document to the beginning of the line.
   */
  getLineStarts(): readonly number[];

  /**
   * Converts a one-dimensional position in the document (measured in UTF-16
   * code units) to line number and offset from line start.
   */
  getLineAndCharacterOfPosition(position: number): LineAndCharacter;
}

export interface TextRange {
  /**
   * The starting position of the ranger measured in UTF-16 code units from the
   * start of the full string. Inclusive.
   */
  pos: number;

  /**
   * The ending position measured in UTF-16 code units from the start of the
   * full string. Exclusive.
   */
  end: number;
}

export interface SourceLocation extends TextRange {
  file: SourceFile;
  isSynthetic?: boolean;
}

export const NoTarget = Symbol("NoTarget");

export type DiagnosticTarget = Node | Type | Sym | SourceLocation;

export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  target: DiagnosticTarget | typeof NoTarget;
}

/**
 * Return type of accessor functions in CADL.
 * Tuple composed of:
 * - 0: Actual result of an accessor function
 * - 1: List of diagnostics that were emitted while retrieving the data.
 */
export type DiagnosticResult<T> = [T, readonly Diagnostic[]];

export interface DirectiveBase {
  node: DirectiveExpressionNode;
}

export type Directive = SuppressDirective;

export interface SuppressDirective extends DirectiveBase {
  name: "suppress";
  code: string;
  message: string;
}

export interface Dirent {
  isFile(): boolean;
  name: string;
  isDirectory(): boolean;
}

export interface RmOptions {
  /**
   * If `true`, perform a recursive directory removal. In
   * recursive mode, errors are not reported if `path` does not exist, and
   * operations are retried on failure.
   * @default false
   */
  recursive?: boolean;
}

export interface CompilerHost {
  // read a file at the given url.
  readUrl(url: string): Promise<SourceFile>;

  // read a utf-8 encoded file
  readFile(path: string): Promise<SourceFile>;

  /**
   * Write the file.
   * @param path Path to the file.
   * @param content Content of the file.
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Read directory.
   * @param path Path to the directory.
   * @returns list of file/directory in the given directory. Returns the name not the full path.
   */
  readDir(dir: string): Promise<string[]>;

  /**
   * Deletes a directory or file.
   * @param path Path to the directory or file.
   */
  rm(path: string, options?: RmOptions): Promise<void>;

  /**
   * create directory recursively.
   * @param path Path to the directory.
   */
  mkdirp(path: string): Promise<string | undefined>;

  // get the directory Cadl is executing from
  getExecutionRoot(): string;

  // get the directories we should load standard library files from
  getLibDirs(): string[];

  // get a promise for the ESM module shape of a JS module
  getJsImport(path: string): Promise<Record<string, any>>;

  // get info about a path
  stat(path: string): Promise<{ isDirectory(): boolean; isFile(): boolean }>;

  getSourceFileKind(path: string): SourceFileKind | undefined;

  // get the real path of a possibly symlinked path
  realpath(path: string): Promise<string>;

  // convert a file URL to a path in a file system
  fileURLToPath(url: string): string;

  // convert a file system path to a URL
  pathToFileURL(path: string): string;

  logSink: LogSink;
}

/**
 * Type of the source file that can be loaded via cadl
 */
export type SourceFileKind = "cadl" | "js";

type UnionToIntersection<T> = (T extends any ? (k: T) => void : never) extends (k: infer I) => void
  ? I
  : never;

type exitListener<T extends string | number | symbol> = T extends string ? `exit${T}` : T;
type ListenerForType<T extends Type> = T extends Type
  ? { [k in Uncapitalize<T["kind"]> | exitListener<T["kind"]>]?: (context: T) => void }
  : never;

type TypeListeners = UnionToIntersection<ListenerForType<Type>>;

export type SemanticNodeListener = {
  root?: (context: Program) => void;
} & TypeListeners;

export type DiagnosticReport<
  T extends { [code: string]: DiagnosticMessages },
  C extends keyof T,
  M extends keyof T[C] = "default"
> = {
  code: C;
  messageId?: M;
  target: DiagnosticTarget | typeof NoTarget;
} & DiagnosticFormat<T, C, M>;

export type DiagnosticFormat<
  T extends { [code: string]: DiagnosticMessages },
  C extends keyof T,
  M extends keyof T[C] = "default"
> = T[C][M] extends CallableMessage<infer A>
  ? { format: Record<A[number], string> }
  : Record<string, unknown>;

export interface DiagnosticDefinition<M extends DiagnosticMessages> {
  readonly severity: "warning" | "error";
  readonly messages: M;
}

export interface DiagnosticMessages {
  readonly [messageId: string]: string | CallableMessage<string[]>;
}

export interface CallableMessage<T extends string[]> {
  keys: T;
  (dict: Record<T[number], string>): string;
}

export type DiagnosticMap<T extends { [code: string]: DiagnosticMessages }> = {
  readonly [code in keyof T]: DiagnosticDefinition<T[code]>;
};

export interface DiagnosticCreator<T extends { [code: string]: DiagnosticMessages }> {
  readonly type: T;
  readonly diagnostics: DiagnosticMap<T>;
  createDiagnostic<C extends keyof T, M extends keyof T[C] = "default">(
    diag: DiagnosticReport<T, C, M>
  ): Diagnostic;
  reportDiagnostic<C extends keyof T, M extends keyof T[C] = "default">(
    program: Program,
    diag: DiagnosticReport<T, C, M>
  ): void;
}

export type TypeOfDiagnostics<T extends DiagnosticMap<any>> = T extends DiagnosticMap<infer D>
  ? D
  : never;

/**
 * Definition of a Cadl library
 */
export interface CadlLibraryDef<
  T extends { [code: string]: DiagnosticMessages },
  E extends Record<string, any> = Record<string, never>
> {
  /**
   * Name of the library. Must match the package.json name.
   */
  readonly name: string;

  /**
   * Map of potential diagnostics that can be emitted in this library where the key is the diagnostic code.
   */
  readonly diagnostics: DiagnosticMap<T>;

  /**
   * List of other library that should be imported when this is used as an emitter.
   * Compiler will emit an error if the libraries are not explicitly imported.
   */
  readonly requireImports?: readonly string[];

  /**
   * Emitter configuration if library is an emitter.
   */
  readonly emitter?: {
    options?: JSONSchemaType<E>;
  };
}

export type JSONSchemaType<T> = AjvJSONSchemaType<T>;

export interface CadlLibrary<
  T extends { [code: string]: DiagnosticMessages },
  E extends Record<string, any> = Record<string, never>
> {
  /**
   * Name of the library. Must match the package.json name.
   */
  readonly name: string;

  /**
   * Map of potential diagnostics that can be emitted in this library where the key is the diagnostic code.
   */
  readonly diagnostics: DiagnosticMap<T>;

  /**
   * List of other library that should be imported when this is used as an emitter.
   * Compiler will emit an error if the libraryes are not explicitly imported.
   */
  readonly requireImports?: readonly string[];

  /**
   * Emitter configuration if library is an emitter.
   */
  readonly emitter?: {
    options?: JSONSchemaType<E>;
  };

  reportDiagnostic<C extends keyof T, M extends keyof T[C]>(
    program: Program,
    diag: DiagnosticReport<T, C, M>
  ): void;
  createDiagnostic<C extends keyof T, M extends keyof T[C]>(
    diag: DiagnosticReport<T, C, M>
  ): Diagnostic;
}

/**
 * Get the options for the onEmit of this library.
 */
export type EmitOptionsFor<C> = C extends CadlLibrary<infer _T, infer E> ? E : never;

export interface DecoratorContext {
  program: Program;

  /**
   * Point to the decorator target
   */
  decoratorTarget: DiagnosticTarget;

  /**
   * Function that can be used to retrieve the target for a parameter at the given index.
   * @param paramIndex Parameter index in the cadl
   * @example @foo("bar", 123) -> $foo(context, target, arg0: string, arg1: number);
   *  getArgumentTarget(0) -> target for arg0
   *  getArgumentTarget(1) -> target for arg1
   */
  getArgumentTarget(paramIndex: number): DiagnosticTarget | undefined;

  /**
   * Helper to call out to another decorator
   * @param decorator Other decorator function
   * @param args Args to pass to other decorator funciton
   */
  call<T extends Type, A extends any[], R>(
    decorator: (context: DecoratorContext, target: T, ...args: A) => R,
    target: T,
    ...args: A
  ): R;
}

export type LogLevel = "debug" | "verbose" | "info" | "warning" | "error";

export interface LogInfo {
  level: LogLevel;
  message: string;
  code?: string;
  target?: DiagnosticTarget | typeof NoTarget;
}

export interface ProcessedLog {
  level: LogLevel;
  message: string;
  code?: string;
  sourceLocation?: SourceLocation;
}

export interface LogSink {
  log(log: ProcessedLog): void;
}

export interface Logger {
  debug(message: string): void;
  verbose(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  log(log: LogInfo): void;
}

/**
 * Remove the readonly properties on an object.
 */
export type Writable<T> = { -readonly [P in keyof T]: T[P] };
