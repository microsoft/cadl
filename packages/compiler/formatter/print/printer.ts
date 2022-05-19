import prettier, { AstPath, Doc, Printer } from "prettier";
import { createScanner, Token } from "../../core/scanner.js";
import {
  AliasStatementNode,
  ArrayExpressionNode,
  BlockComment,
  BooleanLiteralNode,
  CadlScriptNode,
  Comment,
  DecoratorExpressionNode,
  DirectiveExpressionNode,
  EnumMemberNode,
  EnumStatementNode,
  InterfaceStatementNode,
  IntersectionExpressionNode,
  LineComment,
  MemberExpressionNode,
  ModelExpressionNode,
  ModelPropertyNode,
  ModelSpreadPropertyNode,
  ModelStatementNode,
  NamespaceStatementNode,
  Node,
  NodeFlags,
  NumericLiteralNode,
  OperationStatementNode,
  Statement,
  StringLiteralNode,
  SyntaxKind,
  TemplateParameterDeclarationNode,
  TextRange,
  TupleExpressionNode,
  TypeReferenceNode,
  UnionExpressionNode,
  UnionStatementNode,
  UnionVariantNode,
} from "../../core/types.js";
import { isArray } from "../../core/util.js";
import { commentHandler } from "./comment-handler.js";
import { CadlPrettierOptions, DecorableNode, PrettierChildPrint } from "./types.js";

const { align, breakParent, group, hardline, ifBreak, indent, join, line, softline } =
  prettier.doc.builders;

const { isNextLineEmpty } = prettier.util;

export const cadlPrinter: Printer<Node> = {
  print: printCadl,
  canAttachComment: canAttachComment,
  printComment: printComment,
  handleComments: commentHandler,
};

export function printCadl(
  // Path to the AST node to print
  path: AstPath<Node>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
): prettier.Doc {
  const directives = printDirectives(path, options, print);
  const node = printNode(path, options, print);
  return [directives, node];
}

export function printNode(
  // Path to the AST node to print
  path: AstPath<Node>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
): prettier.Doc {
  const node: Node = path.getValue();
  printDirectives(path, options, print);
  switch (node.kind) {
    // Root
    case SyntaxKind.CadlScript:
      return [
        printStatementSequence(path as AstPath<CadlScriptNode>, options, print, "statements"),
        line,
      ];

    // Statements
    case SyntaxKind.ImportStatement:
      return [`import "${node.path.value}";`];
    case SyntaxKind.UsingStatement:
      return [`using `, path.call(print, "name"), `;`];
    case SyntaxKind.OperationStatement:
      return printOperationStatement(path as AstPath<OperationStatementNode>, options, print);
    case SyntaxKind.NamespaceStatement:
      return printNamespaceStatement(path as AstPath<NamespaceStatementNode>, options, print);
    case SyntaxKind.ModelStatement:
      return printModelStatement(path as AstPath<ModelStatementNode>, options, print);
    case SyntaxKind.AliasStatement:
      return printAliasStatement(path as AstPath<AliasStatementNode>, options, print);
    case SyntaxKind.EnumStatement:
      return printEnumStatement(path as AstPath<EnumStatementNode>, options, print);
    case SyntaxKind.UnionStatement:
      return printUnionStatement(path as AstPath<UnionStatementNode>, options, print);
    case SyntaxKind.InterfaceStatement:
      return printInterfaceStatement(path as AstPath<InterfaceStatementNode>, options, print);
    // Others.
    case SyntaxKind.Identifier:
      return node.sv;
    case SyntaxKind.StringLiteral:
      return printStringLiteral(path as AstPath<StringLiteralNode>, options);
    case SyntaxKind.NumericLiteral:
      return printNumberLiteral(path as AstPath<NumericLiteralNode>, options);
    case SyntaxKind.BooleanLiteral:
      return printBooleanLiteral(path as AstPath<BooleanLiteralNode>, options);
    case SyntaxKind.ModelExpression:
      return printModelExpression(path as AstPath<ModelExpressionNode>, options, print);
    case SyntaxKind.ModelProperty:
      return printModelProperty(path as AstPath<ModelPropertyNode>, options, print);
    case SyntaxKind.DecoratorExpression:
      return printDecorator(path as AstPath<DecoratorExpressionNode>, options, print);
    case SyntaxKind.DirectiveExpression:
      return printDirective(path as AstPath<DirectiveExpressionNode>, options, print);
    case SyntaxKind.UnionExpression:
      return printUnion(path as AstPath<UnionExpressionNode>, options, print);
    case SyntaxKind.IntersectionExpression:
      return printIntersection(path as AstPath<IntersectionExpressionNode>, options, print);
    case SyntaxKind.ArrayExpression:
      return printArray(path as AstPath<ArrayExpressionNode>, options, print);
    case SyntaxKind.TupleExpression:
      return printTuple(path as AstPath<TupleExpressionNode>, options, print);
    case SyntaxKind.MemberExpression:
      return printMemberExpression(path as AstPath<MemberExpressionNode>, options, print);
    case SyntaxKind.EnumMember:
      return printEnumMember(path as AstPath<EnumMemberNode>, options, print);
    case SyntaxKind.UnionVariant:
      return printUnionVariant(path as AstPath<UnionVariantNode>, options, print);
    case SyntaxKind.TypeReference:
      return printTypeReference(path as AstPath<TypeReferenceNode>, options, print);
    case SyntaxKind.TemplateParameterDeclaration:
      return printTemplateParameterDeclaration(
        path as AstPath<TemplateParameterDeclarationNode>,
        options,
        print
      );
    case SyntaxKind.ModelSpreadProperty:
      return printModelSpread(path as AstPath<ModelSpreadPropertyNode>, options, print);
    case SyntaxKind.VoidKeyword:
      return "void";
    case SyntaxKind.NeverKeyword:
      return "never";
    // TODO: projection formatting
    case SyntaxKind.Projection:
    case SyntaxKind.ProjectionParameterDeclaration:
    case SyntaxKind.ProjectionModelSelector:
    case SyntaxKind.ProjectionOperationSelector:
    case SyntaxKind.ProjectionUnionSelector:
    case SyntaxKind.ProjectionInterfaceSelector:
    case SyntaxKind.ProjectionEnumSelector:
    case SyntaxKind.ProjectionExpressionStatement:
    case SyntaxKind.ProjectionIfExpression:
    case SyntaxKind.ProjectionBlockExpression:
    case SyntaxKind.ProjectionMemberExpression:
    case SyntaxKind.ProjectionLogicalExpression:
    case SyntaxKind.ProjectionEqualityExpression:
    case SyntaxKind.ProjectionUnaryExpression:
    case SyntaxKind.ProjectionRelationalExpression:
    case SyntaxKind.ProjectionArithmeticExpression:
    case SyntaxKind.ProjectionCallExpression:
    case SyntaxKind.ProjectionLambdaExpression:
    case SyntaxKind.ProjectionLambdaParameterDeclaration:
    case SyntaxKind.ProjectionModelExpression:
    case SyntaxKind.ProjectionModelProperty:
    case SyntaxKind.ProjectionModelSpreadProperty:
    case SyntaxKind.ProjectionTupleExpression:
    case SyntaxKind.ProjectionStatement:
    case SyntaxKind.ProjectionDecoratorReferenceExpression:
    case SyntaxKind.Return:
      return getRawText(node, options);
    // END-TODO: projection formatting

    case SyntaxKind.JsSourceFile:
    case SyntaxKind.EmptyStatement:
    case SyntaxKind.InvalidStatement:
      return getRawText(node, options);
    // default:
    //   return getRawText(node, options);
    default:
      // Dummy const to ensure we handle all node types.
      // If you get an error here, add a case for the new node type
      // you added..
      const _assertNever: never = node;
      return getRawText(node, options);
  }
}

export function printAliasStatement(
  path: AstPath<AliasStatementNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
) {
  const id = path.call(print, "id");
  const template = printTemplateParameters(path, options, print, "templateParameters");
  return ["alias ", id, template, " = ", path.call(print, "value"), ";"];
}

function printTemplateParameters<T extends Node>(
  path: AstPath<T>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint,
  propertyName: keyof T
) {
  const value = path.getValue()[propertyName];
  if ((value as any).length === 0) {
    return "";
  }
  return ["<", join(", ", path.map(print, propertyName)), ">"];
}

export function canAttachComment(node: Node): boolean {
  const kind = node.kind as SyntaxKind;
  return Boolean(
    kind &&
      kind !== SyntaxKind.LineComment &&
      kind !== SyntaxKind.BlockComment &&
      !(node.flags & NodeFlags.Synthetic)
  );
}

export function printComment(
  commentPath: AstPath<Node | Comment>,
  options: CadlPrettierOptions
): Doc {
  const comment = commentPath.getValue();
  (comment as any).printed = true;

  switch (comment.kind) {
    case SyntaxKind.BlockComment:
      return printBlockComment(commentPath as AstPath<BlockComment>, options);
    case SyntaxKind.LineComment:
      return `${options.originalText.slice(comment.pos, comment.end).trimRight()}`;
    default:
      throw new Error(`Not a comment: ${JSON.stringify(comment)}`);
  }
}

function printBlockComment(commentPath: AstPath<BlockComment>, options: CadlPrettierOptions) {
  const comment = commentPath.getValue();
  const rawComment = options.originalText.slice(comment.pos + 2, comment.end - 2);

  if (isIndentableBlockComment(rawComment)) {
    const printed = printIndentableBlockComment(rawComment);
    return printed;
  }

  return ["/*", rawComment, "*/"];
}

function isIndentableBlockComment(rawComment: string): boolean {
  // If the comment has multiple lines and every line starts with a star
  // we can fix the indentation of each line. The stars in the `/*` and
  // `*/` delimiters are not included in the comment value, so add them
  // back first.
  const lines = `*${rawComment}*`.split("\n");
  return lines.length > 1 && lines.every((line) => line.trim()[0] === "*");
}

function printIndentableBlockComment(rawComment: string): Doc {
  const lines = rawComment.split("\n");

  return [
    "/*",
    join(
      hardline,
      lines.map((line, index) =>
        index === 0
          ? line.trimEnd()
          : " " + (index < lines.length - 1 ? line.trim() : line.trimStart())
      )
    ),
    "*/",
  ];
}

export function printDecorators(
  path: AstPath<DecorableNode>,
  options: object,
  print: PrettierChildPrint,
  { tryInline }: { tryInline: boolean }
): { decorators: prettier.Doc; multiline: boolean } {
  const node = path.getValue();
  if (node.decorators.length === 0) {
    return { decorators: "", multiline: false };
  }

  const shouldBreak =
    !tryInline || node.decorators.length >= 3 || hasNewlineBetweenOrAfterDecorators(node, options);
  const decorators = path.map((x) => [print(x as any), ifBreak(line, " ")], "decorators");

  return {
    decorators: group([shouldBreak ? breakParent : "", decorators]),
    multiline: shouldBreak,
  };
}

/**
 * Check if there is already new lines in between the decorators of the node.
 */
function hasNewlineBetweenOrAfterDecorators(node: DecorableNode, options: any) {
  return node.decorators.some((decorator) =>
    prettier.util.hasNewline(options.originalText, decorator.end)
  );
}

export function printDecorator(
  path: AstPath<DecoratorExpressionNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
) {
  const args = printDecoratorArgs(path, options, print);
  return ["@", path.call(print, "target"), args];
}

export function printDirectives(path: AstPath<Node>, options: object, print: PrettierChildPrint) {
  const node = path.getValue();
  if (node.directives === undefined || node.directives.length === 0) {
    return "";
  }

  const directives = path.map((x) => [print(x as any), line], "directives");

  return group([...directives, breakParent]);
}

export function printDirective(
  path: AstPath<DirectiveExpressionNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
) {
  const args = printDirectiveArgs(path, options, print);
  return ["#", path.call(print, "target"), " ", args];
}

function printDecoratorArgs(
  path: AstPath<DecoratorExpressionNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
) {
  const node = path.getValue();
  if (node.arguments.length === 0) {
    return "";
  }

  // So that decorator with single object arguments have ( and { hugging.
  // @deco({
  //   value: "foo"
  // })
  const shouldHug =
    node.arguments.length === 1 &&
    (node.arguments[0].kind === SyntaxKind.ModelExpression ||
      node.arguments[0].kind === SyntaxKind.StringLiteral);

  if (shouldHug) {
    return [
      "(",
      join(
        ", ",
        path.map((arg) => [print(arg)], "arguments")
      ),
      ")",
    ];
  }

  return [
    "(",
    group([
      indent(
        join(
          ", ",
          path.map((arg) => [softline, print(arg)], "arguments")
        )
      ),
      softline,
    ]),
    ")",
  ];
}

export function printDirectiveArgs(
  path: AstPath<DirectiveExpressionNode>,
  options: object,
  print: PrettierChildPrint
) {
  const node = path.getValue();

  if (node.arguments.length === 0) {
    return "";
  }

  return join(
    " ",
    path.map((arg) => [print(arg)], "arguments")
  );
}

export function printEnumStatement(
  path: AstPath<EnumStatementNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
) {
  const { decorators } = printDecorators(path, options, print, { tryInline: false });
  const id = path.call(print, "id");
  return [decorators, "enum ", id, " ", printEnumBlock(path, options, print)];
}

function printEnumBlock(
  path: AstPath<EnumStatementNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
) {
  const node = path.getValue();
  if (node.members.length === 0) {
    return "{}";
  }

  return group([
    "{",
    indent([
      hardline,
      join(
        hardline,
        path.map((x) => [print(x as any), ","], "members")
      ),
    ]),
    hardline,
    "}",
  ]);
}

export function printEnumMember(
  path: AstPath<EnumMemberNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
) {
  const node = path.getValue();
  const id = path.call(print, "id");
  const value = node.value ? [": ", path.call(print, "value")] : "";
  const { decorators, multiline } = printDecorators(path, options, print, { tryInline: true });
  const propertyIndex = path.stack[path.stack.length - 2];
  const isNotFirst = typeof propertyIndex === "number" && propertyIndex > 0;
  return [multiline && isNotFirst ? hardline : "", decorators, id, value];
}

export function printUnionStatement(
  path: AstPath<UnionStatementNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
) {
  const id = path.call(print, "id");
  const { decorators } = printDecorators(path, options, print, { tryInline: false });
  const generic = printTemplateParameters(path, options, print, "templateParameters");
  return [decorators, "union ", id, generic, " ", printUnionVariantsBlock(path, options, print)];
}

export function printUnionVariantsBlock(
  path: AstPath<UnionStatementNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
) {
  const node = path.getValue();
  if (node.options.length === 0) {
    return "{}";
  }

  return group([
    "{",
    indent([
      hardline,
      join(
        hardline,
        path.map((x) => [print(x as any), ","], "options")
      ),
    ]),
    hardline,
    "}",
  ]);
}

export function printUnionVariant(
  path: AstPath<UnionVariantNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
) {
  const id = path.call(print, "id");
  const value = [": ", path.call(print, "value")];
  const { decorators } = printDecorators(path, options, print, { tryInline: true });
  return [decorators, id, value];
}

export function printInterfaceStatement(
  path: AstPath<InterfaceStatementNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
) {
  const id = path.call(print, "id");
  const { decorators } = printDecorators(path, options, print, { tryInline: false });
  const generic = printTemplateParameters(path, options, print, "templateParameters");
  const extendList = printInterfaceExtends(path, options, print);

  return [
    decorators,
    "interface ",
    id,
    generic,
    extendList,
    " ",
    printInterfaceMembers(path, options, print),
  ];
}

function printInterfaceExtends(
  path: AstPath<InterfaceStatementNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
): prettier.Doc {
  const node = path.getValue();
  if (node.extends.length === 0) {
    return "";
  }

  const keyword = "extends ";
  return [group(indent([line, keyword, indent(join([",", line], path.map(print, "extends")))]))];
}

export function printInterfaceMembers(
  path: AstPath<InterfaceStatementNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
) {
  const node = path.getValue();
  const hasOperations = node.operations.length > 0;
  const nodeHasComments = hasComments(node, CommentCheckFlags.Dangling);
  if (!hasOperations && !nodeHasComments) {
    return "{}";
  }

  const lastOperation = node.operations[node.operations.length - 1];

  const parts: prettier.Doc[] = [];
  path.each((operationPath) => {
    const node = operationPath.getValue() as any as OperationStatementNode;

    const printed = print(operationPath);
    parts.push(printed);

    if (node !== lastOperation) {
      parts.push(hardline);

      if (isNextLineEmpty(options.originalText, node, options.locEnd)) {
        parts.push(hardline);
      }
    }
  }, "operations");

  const body: prettier.Doc[] = [hardline, parts];

  if (nodeHasComments) {
    body.push(printDanglingComments(path, options, { sameIndent: true }));
  }
  return group(["{", indent(body), hardline, "}"]);
}

function printDanglingComments(
  path: AstPath<any>,
  options: CadlPrettierOptions,
  { sameIndent }: { sameIndent: boolean }
) {
  const node = path.getValue();
  const parts: prettier.Doc[] = [];
  if (!node || !node.comments) {
    return "";
  }
  path.each((commentPath) => {
    const comment = commentPath.getValue();
    if (!comment.leading && !comment.trailing) {
      parts.push(printComment(path, options));
    }
  }, "comments");

  if (parts.length === 0) {
    return "";
  }

  if (sameIndent) {
    return join(hardline, parts);
  }
  return indent([hardline, join(hardline, parts)]);
}

/**
 * Handle printing an intersection node.
 * @example `Foo & Bar` or `{foo: string} & {bar: string}`
 *
 * @param path Prettier AST Path.
 * @param options Prettier options
 * @param print Prettier child print callback.
 * @returns Prettier document.
 */
export function printIntersection(
  path: AstPath<IntersectionExpressionNode>,
  options: object,
  print: PrettierChildPrint
) {
  const node = path.getValue();
  const types = path.map(print, "options");
  const result: (prettier.Doc | string)[] = [];
  let wasIndented = false;
  for (let i = 0; i < types.length; ++i) {
    if (i === 0) {
      result.push(types[i]);
    } else if (isModelNode(node.options[i - 1]) && isModelNode(node.options[i])) {
      // If both are objects, don't indent
      result.push([" & ", wasIndented ? indent(types[i]) : types[i]]);
    } else if (!isModelNode(node.options[i - 1]) && !isModelNode(node.options[i])) {
      // If no object is involved, go to the next line if it breaks
      result.push(indent([" &", line, types[i]]));
    } else {
      // If you go from object to non-object or vis-versa, then inline it
      if (i > 1) {
        wasIndented = true;
      }
      result.push(" & ", i > 1 ? indent(types[i]) : types[i]);
    }
  }
  return group(result);
}

function isModelNode(node: Node) {
  return node.kind === SyntaxKind.ModelExpression;
}

export function printArray(
  path: AstPath<ArrayExpressionNode>,
  options: object,
  print: PrettierChildPrint
): Doc {
  return [path.call(print, "elementType"), "[]"];
}

export function printTuple(
  path: AstPath<TupleExpressionNode>,
  options: object,
  print: PrettierChildPrint
): Doc {
  return group([
    "[",
    indent(
      join(
        ", ",
        path.map((arg) => [softline, print(arg)], "values")
      )
    ),
    ifBreak(","),
    softline,
    "]",
  ]);
}

export function printMemberExpression(
  path: AstPath<MemberExpressionNode>,
  options: object,
  print: PrettierChildPrint
): Doc {
  const node = path.getValue();
  return [node.base ? [path.call(print, "base"), "."] : "", path.call(print, "id")];
}

export function printModelExpression(
  path: AstPath<ModelExpressionNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
) {
  const inBlock = isModelExpressionInBlock(path);

  if (inBlock) {
    return group(printModelPropertiesBlock(path, options, print));
  } else {
    return group([
      indent(
        join(
          ", ",
          path.map((arg) => [softline, print(arg)], "properties")
        )
      ),
      softline,
    ]);
  }
}

export function printModelStatement(
  path: AstPath<ModelStatementNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
) {
  const node = path.getValue();
  const id = path.call(print, "id");
  const heritage = node.extends ? ["extends ", path.call(print, "extends"), " "] : "";
  const isBase = node.is ? ["is ", path.call(print, "is"), " "] : "";
  const generic = printTemplateParameters(path, options, print, "templateParameters");
  return [
    printDecorators(path, options, print, { tryInline: false }).decorators,
    "model ",
    id,
    generic,
    " ",
    heritage,
    isBase,
    printModelPropertiesBlock(path, options, print),
  ];
}

function printModelPropertiesBlock(
  path: AstPath<Node & { properties?: readonly (ModelPropertyNode | ModelSpreadPropertyNode)[] }>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
) {
  const node = path.getValue();
  const hasProperties = node.properties && node.properties.length > 0;
  const nodeHasComments = hasComments(node, CommentCheckFlags.Dangling);
  if (!hasProperties && !nodeHasComments) {
    return "{}";
  }

  const seperator = isModelAValue(path) ? "," : ";";

  const body: prettier.Doc = [
    hardline,
    join(
      hardline,
      path.map((x) => [print(x as any), seperator], "properties")
    ),
  ];
  if (nodeHasComments) {
    body.push(printDanglingComments(path, options, { sameIndent: true }));
  }
  return ["{", indent(body), hardline, "}"];
}

/**
 * Figure out if this model is being used as a definition or value.
 * @returns true if the model is used as a value(e.g. decorator value), false if it is used as a model definition.
 */
function isModelAValue(path: AstPath<Node>): boolean {
  let count = 0;
  let node: Node | null = path.getValue();
  do {
    switch (node.kind) {
      case SyntaxKind.ModelStatement:
      case SyntaxKind.AliasStatement:
      case SyntaxKind.OperationStatement:
        return false;
      case SyntaxKind.DecoratorExpression:
        return true;
    }
  } while ((node = path.getParentNode(count++)));
  return true;
}

export function printModelProperty(
  path: AstPath<ModelPropertyNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
) {
  const node = path.getValue();
  const propertyIndex = path.stack[path.stack.length - 2];
  const isNotFirst = typeof propertyIndex === "number" && propertyIndex > 0;
  const { decorators, multiline } = printDecorators(
    path as AstPath<DecorableNode>,
    options,
    print,
    {
      tryInline: true,
    }
  );
  let id: Doc;
  if (node.id.kind === SyntaxKind.StringLiteral && isStringSafeToUnquote(node.id, options)) {
    id = node.id.value;
  } else {
    id = path.call(print, "id");
  }
  return [
    multiline && isNotFirst ? hardline : "",
    decorators,
    id,
    node.optional ? "?: " : ": ",
    path.call(print, "value"),
    node.default ? [" = ", path.call(print, "default")] : "",
  ];
}

function isStringSafeToUnquote(id: StringLiteralNode, options: CadlPrettierOptions): boolean {
  const unquotedRawText = getRawText(id, options).slice(1, -1);
  if (id.value !== unquotedRawText) {
    return false;
  }
  let hasError = false;
  const scanner = createScanner(id.value, (d) => (hasError = true));
  if (scanner.scan() !== Token.Identifier) {
    return false;
  }

  if (scanner.scan() !== Token.EndOfFile) {
    return false;
  }

  return !hasError;
}

function isModelExpressionInBlock(path: AstPath<ModelExpressionNode>) {
  const parent: Node | null = path.getParentNode() as any;

  switch (parent?.kind) {
    case SyntaxKind.OperationStatement:
      return parent.parameters !== path.getNode();
    default:
      return true;
  }
}

export function printNamespaceStatement(
  path: AstPath<NamespaceStatementNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
) {
  const printNested = (currentPath: AstPath<NamespaceStatementNode>, parentNames: Doc[]): Doc => {
    const names = [...parentNames, currentPath.call(print, "id")];
    const currentNode = currentPath.getNode();

    if (
      !isArray(currentNode?.statements) &&
      currentNode?.statements?.kind === SyntaxKind.NamespaceStatement
    ) {
      return path.call((x) => printNested(x, names), "statements");
    }

    const suffix =
      currentNode?.statements === undefined
        ? ";"
        : [
            " {",
            indent([hardline, printStatementSequence(path, options, print, "statements")]),
            hardline,
            "}",
          ];

    const { decorators } = printDecorators(path, options, print, { tryInline: false });
    return [decorators, `namespace `, join(".", names), suffix];
  };

  return printNested(path, []);
}

export function printOperationStatement(
  path: AstPath<OperationStatementNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
) {
  const inInterface = (path.getParentNode()?.kind as any) === SyntaxKind.InterfaceStatement;
  const { decorators } = printDecorators(path as AstPath<DecorableNode>, options, print, {
    tryInline: true,
  });

  return [
    decorators,
    inInterface ? "" : "op ",
    path.call(print, "id"),
    "(",
    path.call(print, "parameters"),
    "): ",
    path.call(print, "returnType"),
    `;`,
  ];
}

export function printStatementSequence<T extends Node>(
  path: AstPath<T>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint,
  property: keyof T
) {
  const node = path.getValue();
  const parts: Doc[] = [];
  const lastStatement = getLastStatement(node[property] as any as Statement[]);

  path.each((statementPath) => {
    const node = path.getValue();

    if (node.kind === SyntaxKind.EmptyStatement) {
      return;
    }

    const printed = print(statementPath);
    parts.push(printed);

    if (node !== lastStatement) {
      parts.push(hardline);

      if (isNextLineEmpty(options.originalText, node, options.locEnd)) {
        parts.push(hardline);
      }
    }
  }, property);

  return parts;
}

function getLastStatement(statements: Statement[]): Statement | undefined {
  for (let i = statements.length - 1; i >= 0; i--) {
    const statement = statements[i];
    if (statement.kind !== SyntaxKind.EmptyStatement) {
      return statement;
    }
  }
  return undefined;
}

export function printUnion(
  path: AstPath<UnionExpressionNode>,
  options: object,
  print: PrettierChildPrint
) {
  const node = path.getValue();
  const shouldHug = shouldHugType(node);

  const types = path.map((typePath) => {
    let printedType: string | prettier.Doc = print(typePath);
    if (!shouldHug) {
      printedType = align(2, printedType);
    }
    return printedType;
  }, "options");

  if (shouldHug) {
    return join(" | ", types);
  }

  const shouldAddStartLine = true;
  const code = [ifBreak([shouldAddStartLine ? line : "", "| "], ""), join([line, "| "], types)];
  return group(indent(code));
}

function shouldHugType(node: Node) {
  if (node.kind === SyntaxKind.UnionExpression || node.kind === SyntaxKind.IntersectionExpression) {
    return node.options.length < 4;
  }
  return false;
}

export function printTypeReference(
  path: prettier.AstPath<TypeReferenceNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
): prettier.doc.builders.Doc {
  const type = path.call(print, "target");
  const template = printTemplateParameters(path, options, print, "arguments");
  return [type, template];
}

function printTemplateParameterDeclaration(
  path: AstPath<TemplateParameterDeclarationNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
): Doc {
  const node = path.getValue();
  return [path.call(print, "id"), node.default ? [" = ", path.call(print, "default")] : ""];
}

function printModelSpread(
  path: prettier.AstPath<ModelSpreadPropertyNode>,
  options: CadlPrettierOptions,
  print: PrettierChildPrint
): prettier.Doc {
  return ["...", path.call(print, "target")];
}

export function printStringLiteral(
  path: prettier.AstPath<StringLiteralNode>,
  options: CadlPrettierOptions
): prettier.doc.builders.Doc {
  const node = path.getValue();
  return getRawText(node, options);
}

export function printNumberLiteral(
  path: prettier.AstPath<NumericLiteralNode>,
  options: CadlPrettierOptions
): prettier.doc.builders.Doc {
  const node = path.getValue();
  return getRawText(node, options);
}

export function printBooleanLiteral(
  path: prettier.AstPath<BooleanLiteralNode>,
  options: CadlPrettierOptions
): prettier.doc.builders.Doc {
  const node = path.getValue();
  return node.value ? "true" : "false";
}

/**
 * @param node Node that has postition information.
 * @param options Prettier options
 * @returns Raw text in the file for the given node.
 */
function getRawText(node: TextRange, options: CadlPrettierOptions) {
  return options.originalText.slice(node.pos, node.end);
}

function hasComments(node: any, flags?: CommentCheckFlags) {
  if (!node.comments || node.comments.length === 0) {
    return false;
  }
  const test = getCommentTestFunction(flags);
  return test ? node.comments.some(test) : true;
}

enum CommentCheckFlags {
  /** Check comment is a leading comment */
  Leading = 1 << 1,
  /** Check comment is a trailing comment */
  Trailing = 1 << 2,
  /** Check comment is a dangling comment */
  Dangling = 1 << 3,
  /** Check comment is a block comment */
  Block = 1 << 4,
  /** Check comment is a line comment */
  Line = 1 << 5,
  /** Check comment is a `prettier-ignore` comment */
  PrettierIgnore = 1 << 6,
  /** Check comment is the first attached comment */
  First = 1 << 7,
  /** Check comment is the last attached comment */
  Last = 1 << 8,
}

type CommentTestFn = (comment: any, index: number, comments: any[]) => boolean;

function getCommentTestFunction(flags: CommentCheckFlags | undefined): CommentTestFn | undefined {
  if (flags) {
    return (comment: any, index: number, comments: any[]) =>
      !(
        (flags & CommentCheckFlags.Leading && !comment.leading) ||
        (flags & CommentCheckFlags.Trailing && !comment.trailing) ||
        (flags & CommentCheckFlags.Dangling && (comment.leading || comment.trailing)) ||
        (flags & CommentCheckFlags.Block && !isBlockComment(comment)) ||
        (flags & CommentCheckFlags.Line && !isLineComment(comment)) ||
        (flags & CommentCheckFlags.First && index !== 0) ||
        (flags & CommentCheckFlags.Last && index !== comments.length - 1)
      );
  }
  return undefined;
}

function isBlockComment(comment: Comment): comment is BlockComment {
  return comment.kind === SyntaxKind.BlockComment;
}

function isLineComment(comment: Comment): comment is LineComment {
  return comment.kind === SyntaxKind.BlockComment;
}
