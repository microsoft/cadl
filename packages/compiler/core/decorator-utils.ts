import { getIntrinsicModelName, getPropertyType } from "../lib/decorators.js";
import { DecoratorContext } from "./index.js";
import { createDiagnostic, reportDiagnostic } from "./messages.js";
import { Program } from "./program.js";
import {
  Diagnostic,
  DiagnosticTarget,
  IntrinsicModelName,
  ModelType,
  ModelTypeProperty,
  Type,
} from "./types.js";

export type CadlValue = Type | string | number | boolean;

// prettier-ignore
export type InferredCadlValue<K extends TypeKind> = 
  K extends "Any" ? CadlValue
  : K extends (infer T extends Type["kind"])[] ? InferredCadlValue<T>
  : K extends "String" ? string 
  : K extends "Number" ? number 
  : K extends "Boolean" ? boolean 
  : Type & { kind: K };

/**
 * Validate the decorator target is matching the expected value.
 * @param program
 * @param target
 * @param expectedType
 * @param decoratorName
 * @returns
 */
export function validateDecoratorTarget<K extends TypeKind>(
  context: DecoratorContext,
  target: Type,
  decoratorName: string,
  expectedType: K | readonly K[]
): target is K extends "Any" ? Type : Type & { kind: K } {
  const isCorrectType = isCadlValueTypeOf(target, expectedType);
  if (!isCorrectType) {
    reportDiagnostic(context.program, {
      code: "decorator-wrong-target",
      format: {
        decorator: decoratorName,
        to: target.kind,
      },
      target: context.decoratorTarget,
    });
    return false;
  }

  return true;
}

export function validateDecoratorTargetIntrinsic(
  context: DecoratorContext,
  target: ModelType | ModelTypeProperty,
  decoratorName: string,
  expectedType: IntrinsicModelName | IntrinsicModelName[]
): boolean {
  const actualType = getIntrinsicModelName(context.program, getPropertyType(target));
  const isCorrect =
    actualType &&
    (typeof expectedType === "string"
      ? actualType === expectedType
      : expectedType.includes(actualType));
  if (!isCorrect) {
    context.program.reportDiagnostic(
      createDiagnostic({
        code: "decorator-wrong-target",
        format: {
          decorator: decoratorName,
          to: `type it is not one of: ${
            typeof expectedType === "string" ? expectedType : expectedType.join(", ")
          }`,
        },
        target: context.decoratorTarget,
      })
    );
    return false;
  }
  return true;
}
/**
 * Check if the given target is of any of the cadl types.
 * @param target Target to validate.
 * @param expectedType One or multiple allowed cadl types.
 * @returns boolean if the target is of one of the allowed types.
 */
export function isCadlValueTypeOf<K extends TypeKind>(
  target: CadlValue,
  expectedType: K | readonly K[]
): target is InferredCadlValue<K> {
  const kind = getTypeKind(target);
  if (kind === undefined) {
    return false;
  }
  if (expectedType === undefined) {
    return true;
  }
  return typeof expectedType === "string"
    ? expectedType === "Any" || kind === expectedType
    : expectedType.includes("Any" as any) || expectedType.includes(kind as any);
}

function getTypeKind(target: CadlValue): Type["kind"] | undefined {
  switch (typeof target) {
    case "object":
      return target.kind;
    case "string":
      return "String";
    case "number":
      return "Number";
    case "boolean":
      return "Boolean";
    default:
      return undefined;
  }
}

/**
 * Validate a decorator parameter has the correct type.
 * @param program Program
 * @param target Decorator target
 * @param value Value of the parameter.
 * @param expectedType Expected type or list of expected type
 * @returns true if the value is of one of the type in the list of expected types. If not emit a diagnostic.
 * @deprecated use @see createDecoratorDefinition#validate instead.
 */
export function validateDecoratorParamType<K extends Type["kind"]>(
  program: Program,
  target: Type,
  value: CadlValue,
  expectedType: K | K[]
): value is InferredCadlValue<K> {
  if (!isCadlValueTypeOf(value, expectedType)) {
    reportDiagnostic(program, {
      code: "invalid-argument",
      format: {
        value: prettyValue(program, value),
        actual: getTypeKind(value)!,
        expected: typeof expectedType === "string" ? expectedType : expectedType.join(", "),
      },
      target,
    });
    return false;
  }
  return true;
}

export interface DecoratorDefinition<
  T extends TypeKind,
  P extends readonly DecoratorParamDefinition<TypeKind>[],
  S extends DecoratorParamDefinition<TypeKind> | undefined = undefined
> {
  /**
   * Name of the decorator.
   */
  readonly name: string;

  /**
   * Decorator target.
   */
  readonly target: T | readonly T[];

  /**
   * List of positional arguments in the function.
   */
  readonly args: P;

  /**
   * @optional Type of the spread args at the end of the function if applicable.
   */
  readonly spreadArgs?: S;
}

export interface DecoratorParamDefinition<K extends TypeKind> {
  /**
   * Kind of the parameter
   */
  readonly kind: K | readonly K[];

  /**
   * Is the parameter optional.
   */
  readonly optional?: boolean;
}

type InferParameters<
  P extends readonly DecoratorParamDefinition<TypeKind>[],
  S extends DecoratorParamDefinition<TypeKind> | undefined
> = S extends undefined
  ? InferPosParameters<P>
  : [...InferPosParameters<P>, ...InferSpreadParameter<S>];

type InferSpreadParameter<S extends DecoratorParamDefinition<TypeKind> | undefined> =
  S extends DecoratorParamDefinition<Type["kind"]> ? InferParameter<S>[] : never;

type InferPosParameters<P extends readonly DecoratorParamDefinition<TypeKind>[]> = {
  [K in keyof P]: InferParameter<P[K]>;
};

type InferParameter<P extends DecoratorParamDefinition<TypeKind>> = P["optional"] extends true
  ? InferParameterKind<P["kind"]> | undefined
  : InferParameterKind<P["kind"]>;

// prettier-ignore
type InferParameterKind<P extends TypeKind | readonly TypeKind[]> =
  P extends readonly (infer T extends TypeKind)[] ? InferredCadlValue<T> 
  : P extends TypeKind ? InferredCadlValue<P> : never

export interface DecoratorValidator<
  T extends TypeKind,
  P extends readonly DecoratorParamDefinition<TypeKind>[],
  S extends DecoratorParamDefinition<TypeKind> | undefined = undefined
> {
  validate(
    context: DecoratorContext,
    target: InferredCadlValue<T>,
    parameters: InferParameters<P, S>
  ): boolean;
}

export type TypeKind = Type["kind"] | "Any";

export function createDecoratorDefinition<
  T extends TypeKind,
  P extends readonly DecoratorParamDefinition<TypeKind>[],
  S extends DecoratorParamDefinition<TypeKind> | undefined
>(definition: DecoratorDefinition<T, P, S>): DecoratorValidator<T, P, S> {
  const minParams = definition.args.filter((x) => !x.optional).length;
  const maxParams = definition.spreadArgs ? undefined : definition.args.length;

  function validate(context: DecoratorContext, target: Type, args: CadlValue[]) {
    if (
      !validateDecoratorTarget(context, target, definition.name, definition.target) ||
      !validateDecoratorParamCount(context, minParams, maxParams, args)
    ) {
      return false;
    }

    for (const [index, arg] of args.entries()) {
      const paramDefinition = definition.args[index] ?? definition.spreadArgs;
      if (arg === undefined) {
        if (!paramDefinition.optional) {
          reportDiagnostic(context.program, {
            code: "invalid-argument",
            format: {
              value: "undefined",
              actual: "undefined",
              expected: expectedTypeList(paramDefinition.kind as any),
            },
            target: context.getArgumentTarget(index)!,
          });
          return false;
        }
      } else if (!isCadlValueTypeOf(arg, paramDefinition.kind)) {
        reportDiagnostic(context.program, {
          code: "invalid-argument",
          format: {
            value: prettyValue(context.program, arg),
            actual: getTypeKind(arg)!,
            expected: expectedTypeList(paramDefinition.kind as any),
          },
          target: context.getArgumentTarget(index)!,
        });
        return false;
      }
    }

    return true;
  }

  return {
    validate(context: DecoratorContext, target, parameters) {
      return validate(context, target as any, parameters as any);
    },
  };
}

function expectedTypeList(expectedType: Type["kind"] | Type["kind"][]) {
  return typeof expectedType === "string" ? expectedType : expectedType.join(", ");
}

export function validateDecoratorParamCount(
  context: DecoratorContext,
  min: number,
  max: number | undefined,
  parameters: unknown[]
): boolean {
  let missing = 0;
  for (let i = parameters.length - 1; i >= 0; i--) {
    if (parameters[i] === undefined) {
      missing++;
    } else {
      break;
    }
  }
  const parameterCount = parameters.length - missing;
  if (parameterCount < min || (max !== undefined && parameterCount > max)) {
    if (min === max) {
      reportDiagnostic(context.program, {
        code: "invalid-argument-count",
        format: {
          actual: parameterCount.toString(),
          expected: min.toString(),
        },
        target: context.decoratorTarget,
      });
    } else {
      reportDiagnostic(context.program, {
        code: "invalid-argument-count",
        messageId: "between",
        format: {
          actual: parameterCount.toString(),
          min: min.toString(),
          max: max === undefined ? "infinity" : max.toString(),
        },
        target: context.decoratorTarget,
      });
    }
    return false;
  }
  return true;
}

function prettyValue(program: Program, value: any) {
  if (typeof value === "object" && value !== null && "kind" in value) {
    return program.checker.getTypeName(value);
  }
  return value;
}

/**
 * Convert a cadl type to a serializable Json object.
 * Emits diagnostics if the given type is invalid
 * @param cadlType The type to convert to Json data
 * @param target The diagnostic target in case of errors.
 */
export function cadlTypeToJson<T>(
  cadlType: CadlValue,
  target: DiagnosticTarget
): [T | undefined, Diagnostic[]] {
  if (typeof cadlType !== "object") {
    return [cadlType as any, []];
  }
  return cadlTypeToJsonInternal(cadlType, target, []);
}

function cadlTypeToJsonInternal(
  cadlType: Type,
  target: DiagnosticTarget,
  path: string[]
): [any | undefined, Diagnostic[]] {
  switch (cadlType.kind) {
    case "String":
    case "Boolean":
    case "Number":
      return [cadlType.value, []];
    case "Tuple": {
      const result = [];
      for (const [index, type] of cadlType.values.entries()) {
        const [item, diagnostics] = cadlTypeToJsonInternal(type, target, [
          ...path,
          index.toString(),
        ]);
        if (diagnostics.length > 0) {
          return [undefined, diagnostics];
        }
        result.push(item);
      }
      return [result, []];
    }
    case "Model": {
      const result: Record<string, any> = {};
      for (const [name, type] of cadlType.properties.entries()) {
        const [item, diagnostics] = cadlTypeToJsonInternal(type.type, target, [
          ...path,
          name.toString(),
        ]);
        if (diagnostics.length > 0) {
          return [undefined, diagnostics];
        }
        result[name] = item;
      }
      return [result, []];
    }
    default:
      const diagnostic =
        path.length === 0
          ? createDiagnostic({
              code: "invalid-value",
              format: {
                kind: cadlType.kind,
              },
              target,
            })
          : createDiagnostic({
              code: "invalid-value",
              messageId: "atPath",
              format: {
                kind: cadlType.kind,
                path: path.join("."),
              },
              target,
            });
      return [undefined, [diagnostic]];
  }
}
