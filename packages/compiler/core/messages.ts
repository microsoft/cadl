// Static assert: this won't compile if one of the entries above is invalid.

import { createDiagnosticCreator } from "./diagnostics.js";
import { paramMessage } from "./library.js";
import { TypeOfDiagnostics } from "./types.js";

const diagnostics = {
  /**
   * Scanner errors.
   */
  "digit-expected": {
    severity: "error",
    messages: {
      default: "Digit expected.",
    },
  },

  "hex-digit-expected": {
    severity: "error",
    messages: {
      default: "Hexadecimal digit expected.",
    },
  },

  "binary-digit-expected": {
    severity: "error",
    messages: {
      default: "Binary digit expected.",
    },
  },

  unterminated: {
    severity: "error",
    messages: {
      default: paramMessage`Unterminated ${"token"}.`,
    },
  },
  "creating-file": {
    severity: "error",
    messages: {
      default: paramMessage`Error creating single file: ${"filename"},  ${"error"}`,
    },
  },

  "invalid-escape-sequence": {
    severity: "error",
    messages: {
      default: "Invalid escape sequence.",
    },
  },

  "no-new-line-start-triple-quote": {
    severity: "error",
    messages: {
      default: "String content in triple quotes must begin on a new line.",
    },
  },

  "no-new-line-end-triple-quote": {
    severity: "error",
    messages: {
      default: "Closing triple quotes must begin on a new line.",
    },
  },

  "triple-quote-indent": {
    severity: "error",
    messages: {
      default:
        "All lines in triple-quoted string lines must have the same indentation as closing triple quotes.",
    },
  },

  "invalid-character": {
    severity: "error",
    messages: {
      default: "Invalid character.",
    },
  },

  /**
   * Utils
   */
  "file-not-found": {
    severity: "error",
    messages: {
      default: paramMessage`File ${"path"} not found.`,
    },
  },
  "file-load": {
    severity: "error",
    messages: {
      default: paramMessage`${"message"}`,
    },
  },

  /**
   * Parser errors.
   */
  "multiple-blockless-namespace": {
    severity: "error",
    messages: {
      default: "Cannot use multiple blockless namespaces.",
    },
  },
  "blockless-namespace-first": {
    severity: "error",
    messages: {
      default: "Blockless namespaces can't follow other declarations.",
      topLevel: "Blockless namespace can only be top-level.",
    },
  },
  "import-first": {
    severity: "error",
    messages: {
      default: "Imports must come prior to namespaces or other declarations.",
      topLevel: "Imports must be top-level and come prior to namespaces or other declarations.",
    },
  },
  "default-optional": {
    severity: "error",
    messages: {
      default: "Cannot use default with non optional properties",
    },
  },
  "token-expected": {
    severity: "error",
    messages: {
      default: paramMessage`${"token"} expected.`,
      unexpected: paramMessage`Unexpected token ${"token"}`,
      numericOrStringLiteral: "Expected numeric or string literal.",
      identifier: "Identifier expected.",
      projectionDirection: "from or to expected.",
      expression: "Expression expected.",
      statement: "Statement expected.",
      property: "Property expected.",
      enumMember: "Enum member expected.",
    },
  },
  "trailing-token": {
    severity: "error",
    messages: {
      default: paramMessage`Trailing ${"token"}`,
    },
  },
  "unknown-directive": {
    severity: "error",
    messages: {
      default: paramMessage`Unknown directive '#${"id"}'`,
    },
  },
  "reserved-identifier": {
    severity: "error",
    messages: {
      default: "Keyword cannot be used as identifier.",
    },
  },
  "invalid-directive-location": {
    severity: "error",
    messages: {
      default: paramMessage`Cannot place directive on ${"nodeName"}.`,
    },
  },
  "invalid-decorator-location": {
    severity: "error",
    messages: {
      default: paramMessage`Cannot decorate ${"nodeName"}.`,
    },
  },
  "invalid-projection": {
    severity: "error",
    messages: {
      default: "Invalid projection",
      wrongType: "Non-projection can't be used to project",
      noTo: "Projection missing to projection",
      projectionError: paramMessage`An error occurred when projecting this type: ${"message"}`,
    },
  },
  "default-required": {
    severity: "error",
    messages: {
      default: "Required template parameters must not follow optional template parameters",
    },
  },
  "invalid-template-default": {
    severity: "error",
    messages: {
      default:
        "Template parameter defaults can only reference previously declared type parameters.",
    },
  },
  /**
   * Checker
   */
  "using-invalid-ref": {
    severity: "error",
    messages: {
      default: "Using must refer to a namespace",
      decorator: "Can't use a decorator",
      function: "Can't use a function",
      projection: "Can't use a projection",
    },
  },
  "invalid-type-ref": {
    severity: "error",
    messages: {
      default: "Invalid type reference",
      decorator: "Can't put a decorator in a type",
      function: "Can't use a function as a type",
    },
  },
  "invalid-template-args": {
    severity: "error",
    messages: {
      default: "Invalid template arguments.",
      notTemplate: "Can't pass template arguments to non-templated type",
      tooFew: "Too few template arguments provided.",
      tooMany: "Too many template arguments provided.",
    },
  },
  "intersect-non-model": {
    severity: "error",
    messages: {
      default: "Cannot intersect non-model types (including union types).",
    },
  },
  "intersect-invalid-index": {
    severity: "error",
    messages: {
      default: "Cannot intersect incompatible models.",
      never: "Cannot intersect a model that cannot hold properties.",
      array: "Cannot intersect an array model.",
    },
  },
  "intersect-duplicate-property": {
    severity: "error",
    messages: {
      default: paramMessage`Intersection contains duplicate property definitions for ${"propName"}`,
    },
  },
  "unknown-identifier": {
    severity: "error",
    messages: {
      default: paramMessage`Unknown identifier ${"id"}`,
    },
  },
  "unknown-decorator": {
    severity: "error",
    messages: {
      default: "Unknown decorator",
    },
  },
  "invalid-decorator": {
    severity: "error",
    messages: {
      default: paramMessage`${"id"} is not a decorator`,
    },
  },
  "invalid-ref": {
    severity: "error",
    messages: {
      default: paramMessage`Cannot resolve ${"id"}`,
      inDecorator: paramMessage`Cannot resolve ${"id"} in decorator`,
      underNamespace: paramMessage`Namespace ${"namespace"} doesn't have member ${"id"}`,
      underContainer: paramMessage`${"kind"} doesn't have member ${"id"}`,
      node: paramMessage`Cannot resolve '${"id"}' in non-namespace node ${"nodeName"}`,
    },
  },
  "duplicate-property": {
    severity: "error",
    messages: {
      default: paramMessage`Model already has a property named ${"propName"}`,
    },
  },
  "override-property": {
    severity: "error",
    messages: {
      default: paramMessage`Model has an inherited property named ${"propName"} which cannot be overridden`,
    },
  },
  "extend-model": {
    severity: "error",
    messages: {
      default: "Models must extend other models.",
    },
  },
  "extend-primitive": {
    severity: "error",
    messages: {
      default: paramMessage`Cannot extend primitive types. Use 'model ${"modelName"} is ${"baseModelName"}' instead.`,
    },
  },
  "is-model": {
    severity: "error",
    messages: {
      default: "Model `is` must specify another model.",
    },
  },
  "is-operation": {
    severity: "error",
    messages: {
      default: "Operation can only reuse the signature of another operation.",
    },
  },
  "spread-model": {
    severity: "error",
    messages: {
      default: "Cannot spread properties of non-model type.",
      neverIndex: "Cannot spread type because it cannot hold properties.",
    },
  },
  "unsupported-default": {
    severity: "error",
    messages: {
      default: paramMessage`Default must be have a value type but has type '${"type"}'.`,
    },
  },
  unassignable: {
    severity: "error",
    messages: {
      default: paramMessage`Type '${"value"}' is not assignable to type '${"targetType"}'`,
      withDetails: paramMessage`Type '${"sourceType"}' is not assignable to type '${"targetType"}'\n  ${"details"}`,
    },
  },
  "no-prop": {
    severity: "error",
    messages: {
      default: paramMessage`Property '${"propName"}' cannot be defined because model cannot hold properties.`,
    },
  },
  "missing-index": {
    severity: "error",
    messages: {
      default: paramMessage`Index signature for type '${"indexType"}' is missing in type '${"sourceType"}'.`,
    },
  },
  "missing-property": {
    severity: "error",
    messages: {
      default: paramMessage`Property '${"propertyName"}' is missing on type '${"sourceType"}' but required in '${"targetType"}'`,
    },
  },
  "extends-interface": {
    severity: "error",
    messages: {
      default: "Interfaces can only mix other interfaces",
    },
  },
  "extends-interface-duplicate": {
    severity: "error",
    messages: {
      default: paramMessage`Interface extends cannot have duplicate members. The duplicate member is named ${"name"}`,
    },
  },
  "interface-duplicate": {
    severity: "error",
    messages: {
      default: paramMessage`Interface already has a member named ${"name"}`,
    },
  },
  "union-duplicate": {
    severity: "error",
    messages: {
      default: paramMessage`Union already has a variant named ${"name"}`,
    },
  },
  "enum-member-duplicate": {
    severity: "error",
    messages: {
      default: paramMessage`Enum already has a member named ${"name"}`,
    },
  },
  "spread-enum": {
    severity: "error",
    messages: {
      default: "Cannot spread members of non-enum type.",
    },
  },
  "decorator-fail": {
    severity: "error",
    messages: {
      default: paramMessage`Decorator ${"decoratorName"} failed!\n\n${"error"}`,
    },
  },

  /**
   * Program
   */
  "dynamic-import": {
    severity: "error",
    messages: {
      default: "Dynamically generated Cadl cannot have imports",
    },
  },
  "invalid-import": {
    severity: "error",
    messages: {
      default: "Import paths must reference either a directory, a .cadl file, or .js file",
    },
  },
  "invalid-main": {
    severity: "error",
    messages: {
      default: "Main file must either be a .cadl file or a .js file.",
    },
  },
  "import-not-found": {
    severity: "error",
    messages: {
      default: paramMessage`Couldn't resolve import "${"path"}"`,
    },
  },
  "library-invalid": {
    severity: "error",
    messages: {
      cadlMain: paramMessage`Library "${"path"}" has an invalid cadlMain file.`,
      default: paramMessage`Library "${"path"}" has an invalid main file.`,
    },
  },
  "compiler-version-mismatch": {
    severity: "error",
    messages: {
      default: paramMessage`Current Cadl compiler conflicts with local version of @cadl-lang/compiler referenced in ${"basedir"}. \nIf this error occurs on the command line, try running \`cadl\` with a working directory of ${"basedir"}. \nIf this error occurs in the IDE, try configuring the \`cadl-server\` path to ${"betterCadlServerPath"}.\n  Expected: ${"expected"}\n  Resolved: ${"actual"}`,
    },
  },
  "duplicate-symbol": {
    severity: "error",
    messages: {
      default: paramMessage`Duplicate name: "${"name"}"`,
    },
  },
  "projections-are-experimental": {
    severity: "warning",
    messages: {
      default:
        "Projections are experimental - your code will need to change as this feature evolves.",
    },
  },

  /**
   * Binder
   */
  "ambiguous-symbol": {
    severity: "error",
    messages: {
      default: paramMessage`"${"name"}" is an ambiguous name between ${"duplicateNames"}. Try using fully qualified name instead: ${"duplicateNames"}`,
    },
  },
  "duplicate-using": {
    severity: "error",
    messages: {
      default: paramMessage`duplicate using of "${"usingName"}" namespace`,
    },
  },

  /**
   * Library
   */
  "on-validate-fail": {
    severity: "error",
    messages: {
      default: paramMessage`onValidate failed with errors. ${"error"}`,
    },
  },
  "emitter-not-found": {
    severity: "error",
    messages: {
      default: paramMessage`Requested emitter package ${"emitterPackage"} does not provide an "onEmit" function.`,
    },
  },
  "missing-import": {
    severity: "error",
    messages: {
      default: paramMessage`Emitter '${"emitterName"}' requires '${"requiredImport"}' to be imported. Add 'import "${"requiredImport"}".`,
    },
  },

  /**
   * Decorator
   */
  "decorator-wrong-target": {
    severity: "error",
    messages: {
      default: paramMessage`Cannot apply ${"decorator"} decorator to ${"to"}`,
    },
  },
  "invalid-argument": {
    severity: "error",
    messages: {
      default: paramMessage`Argument '${"value"}' of type '${"actual"}' is not assignable to parameter of type '${"expected"}'`,
    },
  },
  "invalid-argument-count": {
    severity: "error",
    messages: {
      default: paramMessage`Expected ${"expected"} arguments, but got ${"actual"}.`,
      between: paramMessage`Expected between ${"min"} and ${"max"} arguments, but got ${"actual"}.`,
    },
  },
  "known-values-invalid-enum": {
    severity: "error",
    messages: {
      default: paramMessage`Enum cannot be used on this type. Member ${"member"} is not assignable to type ${"type"}.`,
    },
  },
  "invalid-value": {
    severity: "error",
    messages: {
      default: paramMessage`Type '${"kind"}' is not a value type.`,
      atPath: paramMessage`Type '${"kind"}' of '${"path"}' is not a value type.`,
    },
  },
  deprecated: {
    severity: "warning",
    messages: {
      default: paramMessage`Deprecated: ${"message"}`,
    },
  },

  /**
   * Service
   */
  "service-decorator-duplicate": {
    severity: "error",
    messages: {
      default: paramMessage`Service ${"name"} can only be set once per Cadl document.`,
    },
  },
  "service-namespace-duplicate": {
    severity: "error",
    messages: {
      default: "Cannot set service namespace more than once in a Cadl project.",
    },
  },
  "list-type-not-model": {
    severity: "error",
    messages: {
      default: "@list decorator's parameter must be a model type.",
    },
  },

  /**
   * Mutator
   */
  "add-response": {
    severity: "error",
    messages: {
      default: "Cannot add a response to anything except an operation statement.",
    },
  },
  "add-parameter": {
    severity: "error",
    messages: {
      default: "Cannot add a parameter to anything except an operation statement.",
    },
  },
  "add-model-property": {
    severity: "error",
    messages: {
      default: "Cannot add a model property to anything except a model statement.",
    },
  },
  "add-model-property-fail": {
    severity: "error",
    messages: {
      default: paramMessage`Could not add property/parameter "${"propertyName"}" of type "${"propertyTypeName"}"`,
    },
  },
  "add-response-type": {
    severity: "error",
    messages: {
      default: paramMessage`Could not add response type "${"responseTypeName"}" to operation ${"operationName"}"`,
    },
  },
  "circular-base-type": {
    severity: "error",
    messages: {
      default: paramMessage`Model type '${"typeName"}' recursively references itself as a base type.`,
    },
  },
  "circular-op-signature": {
    severity: "error",
    messages: {
      default: paramMessage`Operation '${"typeName"}' recursively references itself.`,
    },
  },
  "circular-alias-type": {
    severity: "error",
    messages: {
      default: paramMessage`Alias type '${"typeName"}' recursively references itself.`,
    },
  },
} as const;

export type CompilerDiagnostics = TypeOfDiagnostics<typeof diagnostics>;
export const { createDiagnostic, reportDiagnostic } = createDiagnosticCreator(diagnostics);
