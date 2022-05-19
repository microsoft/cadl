import {
  getFriendlyName as getAssignedFriendlyName,
  ModelType,
  ModelTypeProperty,
  Program,
  Type,
  TypeNameOptions,
} from "@cadl-lang/compiler";
import { reportDiagnostic } from "./lib.js";

/**
 * Determines whether a type will be inlined in OpenAPI rather than defined
 * as a schema and referenced.
 *
 * All anonymous types (anonymous models, arrays, tuples, etc.) are inlined.
 *
 * Template instantiations are inlined unless they have a friendly name.
 *
 * A friendly name can be provided by the user using `@friendlyName`
 * decorator, or chosen by default in simple cases.
 */
export function shouldInline(program: Program, type: Type): boolean {
  if (hasFriendlyName(program, type)) {
    return false;
  }

  switch (type.kind) {
    case "Model":
      return !type.name || hasTemplateArguments(type);
    case "Enum":
    case "Union":
      return !type.name;
    default:
      return true;
  }
}

/**
 * Gets the name of a type to be used in OpenAPI.
 *
 * For inlined types: this is the Cadl-native name written to `x-cadl-name`.
 *
 * For non-inlined types: this is either the friendly name or the Cadl-native name.
 *
 * Cadl-native names are shortened to exclude root `Cadl` namespace and service
 * namespace using the provided `TypeNameOptions`.
 */
export function getTypeName(
  program: Program,
  type: Type,
  options: TypeNameOptions,
  existing?: Record<string, any>
): string {
  const name =
    getFriendlyName(program, type, options) ?? program.checker.getTypeName(type, options);

  if (existing && existing[name]) {
    reportDiagnostic(program, {
      code: "duplicate-type-name",
      format: {
        value: name,
      },
      target: type,
    });
  }

  return name;
}

/**
 * Gets the key that is used to define a parameter in OpenAPI.
 */
export function getParameterKey(
  program: Program,
  propery: ModelTypeProperty,
  newParam: unknown,
  existingParams: Record<string, unknown>,
  options: TypeNameOptions
): string {
  const parent = propery.model!;
  let key = getTypeName(program, parent, options);

  if (parent.properties.size > 1) {
    key += `.${propery.name}`;
  }

  // JSON check is workaround for https://github.com/microsoft/cadl/issues/462
  if (existingParams[key] && JSON.stringify(newParam) !== JSON.stringify(existingParams[key])) {
    reportDiagnostic(program, {
      code: "duplicate-type-name",
      messageId: "parameter",
      format: {
        value: key,
      },
      target: propery,
    });
  }

  return key;
}

function hasTemplateArguments(type: Type): type is ModelType & { templateArguments: Type[] } {
  return type.kind === "Model" && !!type.templateArguments && type.templateArguments.length > 0;
}

function hasFriendlyName(program: Program, type: Type): boolean {
  return !!getAssignedFriendlyName(program, type) || hasDefaultFriendlyName(program, type);
}

function getFriendlyName(program: Program, type: Type, options: TypeNameOptions): string {
  return getAssignedFriendlyName(program, type) ?? getDefaultFriendlyName(program, type, options);
}

/**
 * A template instantiation has a default friendly name if none if its type
 * arguments are nested template instantiations or inlined types.
 */
function hasDefaultFriendlyName(
  program: Program,
  type: Type
): type is ModelType & { name: string; templateArguments: Type[] } {
  return (
    type.kind === "Model" &&
    !!type.name &&
    hasTemplateArguments(type) &&
    !type.templateArguments.some((arg) => hasTemplateArguments(arg) || shouldInline(program, arg))
  );
}

/**
 * Gets the default friendly name of the form Type_Arg1_..._ArgN when applicable as described
 * by `hasDefaultFriendlyName`. Returns undefined when not applicable.
 */
function getDefaultFriendlyName(
  program: Program,
  type: Type,
  options: TypeNameOptions
): string | undefined {
  if (!hasDefaultFriendlyName(program, type)) {
    return undefined;
  }
  const ns = program.checker.getNamespaceString(type.namespace, options);
  const model = (ns ? ns + "." : "") + type.name;
  const args = type.templateArguments.map((arg) => getTypeName(program, arg, options));
  return `${model}_${args.join("_")}`;
}
