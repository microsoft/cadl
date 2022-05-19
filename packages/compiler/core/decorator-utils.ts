import { getIntrinsicModelName, getPropertyType } from "../lib/decorators.js";
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
export type InferredCadlValue<K extends Type["kind"]> = 
  K extends "String" ? string 
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
export function validateDecoratorTarget<K extends Type["kind"]>(
  program: Program,
  target: Type,
  decoratorName: string,
  expectedType: K | K[]
): target is Type & { kind: K } {
  const isCorrectType = isCadlValueTypeOf(target, expectedType);
  if (!isCorrectType) {
    reportDiagnostic(program, {
      code: "decorator-wrong-target",
      format: {
        decorator: decoratorName,
        to: target.kind,
      },
      target,
    });
    return false;
  }

  return true;
}

export function validateDecoratorTargetIntrinsic(
  program: Program,
  target: ModelType | ModelTypeProperty,
  decoratorName: string,
  expectedType: IntrinsicModelName | IntrinsicModelName[]
): boolean {
  const actualType = getIntrinsicModelName(program, getPropertyType(target));
  const isCorrect =
    actualType &&
    (typeof expectedType === "string"
      ? actualType === expectedType
      : expectedType.includes(actualType));
  if (!isCorrect) {
    program.reportDiagnostic(
      createDiagnostic({
        code: "decorator-wrong-target",
        format: {
          decorator: decoratorName,
          to: `type it is not one of: ${
            typeof expectedType === "string" ? expectedType : expectedType.join(", ")
          }`,
        },
        target,
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
export function isCadlValueTypeOf<K extends Type["kind"]>(
  target: CadlValue,
  expectedType: K | K[]
): target is InferredCadlValue<K> {
  const kind = getTypeKind(target);
  if (kind === undefined) {
    return false;
  }

  return typeof expectedType === "string"
    ? kind === expectedType
    : expectedType.includes(kind as any);
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
 * Emit diagnostic if the number of arguments passed to decorator is more or less than the expected count.
 */
export function validateDecoratorParamCount(
  program: Program,
  target: Type,
  args: unknown[],
  expected: number
) {
  if (args.length !== expected) {
    reportDiagnostic(program, {
      code: "invalid-argument-count",
      format: {
        actual: args.length.toString(),
        expected: expected.toString(),
      },
      target,
    });
    return;
  }
}

/**
 * Validate a decorator parameter has the correct type.
 * @param program Program
 * @param target Decorator target
 * @param value Value of the parameter.
 * @param expectedType Expected type or list of expected type
 * @returns true if the value is of one of the type in the list of expected types. If not emit a diagnostic.
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
