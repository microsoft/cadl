import {
  validateDecoratorParamType,
  validateDecoratorTarget,
  validateDecoratorTargetIntrinsic,
} from "../core/decorator-utils.js";
import { createDiagnostic, reportDiagnostic } from "../core/messages.js";
import { Program } from "../core/program.js";
import {
  DecoratorContext,
  EnumMemberType,
  EnumType,
  InterfaceType,
  IntrinsicModelName,
  ModelType,
  ModelTypeProperty,
  NamespaceType,
  NeverType,
  OperationType,
  Type,
  VoidType,
} from "../core/types.js";
export * from "./service.js";

export const namespace = "Cadl";

function replaceTemplatedStringFromProperties(formatString: string, sourceObject: Type) {
  // Template parameters are not valid source objects, just skip them
  if (sourceObject.kind === "TemplateParameter") {
    return formatString;
  }

  return formatString.replace(/{(\w+)}/g, (_, propName) => {
    return (sourceObject as any)[propName];
  });
}

function setTemplatedStringProperty(
  key: symbol,
  program: Program,
  target: Type,
  text: string,
  sourceObject: Type
) {
  // TODO: replace with built-in decorator validation https://github.com/Azure/cadl-azure/issues/1022

  if (!validateDecoratorParamType(program, target, text, "String")) {
    return;
  }

  // If an object was passed in, use it to format the documentation string
  if (sourceObject) {
    text = replaceTemplatedStringFromProperties(text, sourceObject);
  }

  program.stateMap(key).set(target, text);
}

const summaryKey = Symbol("summary");
/**
 * @summary attaches a documentation string. It is typically used to give a short, single-line
 * description, and can be used in combination with or instead of @doc.
 *
 * The first argument to @summary is a string, which may contain template parameters, enclosed in braces,
 * which are replaced with an attribute for the type (commonly "name") passed as the second (optional) argument.
 *
 * @summary can be specified on any language element -- a model, an operation, a namespace, etc.
 */
export function $summary(
  context: DecoratorContext,
  target: Type,
  text: string,
  sourceObject: Type
) {
  setTemplatedStringProperty(summaryKey, context.program, target, text, sourceObject);
}

export function getSummary(program: Program, type: Type): string | undefined {
  return program.stateMap(summaryKey).get(type);
}

const docsKey = Symbol("docs");
/**
 * @doc attaches a documentation string. Works great with multi-line string literals.
 *
 * The first argument to @doc is a string, which may contain template parameters, enclosed in braces,
 * which are replaced with an attribute for the type (commonly "name") passed as the second (optional) argument.
 *
 * @doc can be specified on any language element -- a model, an operation, a namespace, etc.
 */
export function $doc(context: DecoratorContext, target: Type, text: string, sourceObject: Type) {
  setTemplatedStringProperty(docsKey, context.program, target, text, sourceObject);
}

export function getDoc(program: Program, target: Type): string | undefined {
  return program.stateMap(docsKey).get(target);
}

export function $inspectType(program: Program, target: Type, text: string) {
  // eslint-disable-next-line no-console
  if (text) console.log(text);
  // eslint-disable-next-line no-console
  console.dir(target, { depth: 3 });
}

export function $inspectTypeName(program: Program, target: Type, text: string) {
  // eslint-disable-next-line no-console
  if (text) console.log(text);
  // eslint-disable-next-line no-console
  console.log(program.checker.getTypeName(target));
}

const intrinsicsKey = Symbol("intrinsics");
export function $intrinsic(context: DecoratorContext, target: Type, name: IntrinsicModelName) {
  context.program.stateMap(intrinsicsKey).set(target, name);
}

export function isIntrinsic(program: Program, target: Type | undefined): boolean {
  if (!target) {
    return false;
  }
  return program.stateMap(intrinsicsKey).has(target);
}

/**
 * The top level name of the intrinsic model.
 *
 * string => "string"
 * model CustomString is string => "string"
 */
export function getIntrinsicModelName(program: Program, target: Type): IntrinsicModelName {
  return program.stateMap(intrinsicsKey).get(target);
}

export function isStringType(program: Program, target: Type): boolean {
  const intrinsicType = getIntrinsicModelName(program, target);
  return intrinsicType !== undefined && intrinsicType === "string";
}

export function isErrorType(type: Type): boolean {
  return type.kind === "Intrinsic" && type.name === "ErrorType";
}

export function isVoidType(type: Type): type is VoidType {
  return type.kind === "Intrinsic" && type.name === "void";
}

export function isNeverType(type: Type): type is NeverType {
  return type.kind === "Intrinsic" && type.name === "never";
}

const numericTypesKey = Symbol("numeric");
export function $numeric(context: DecoratorContext, target: Type) {
  const { program } = context;
  if (!isIntrinsic(program, target)) {
    program.reportDiagnostic(
      createDiagnostic({
        code: "decorator-wrong-target",
        format: { decorator: "@numeric", to: "non-instrinsic type" },
        target,
      })
    );
    return;
  }
  if (!validateDecoratorTarget(context, target, "@numeric", "Model")) {
    return;
  }
  program.stateSet(numericTypesKey).add(target);
}

/**
 * Return the type of the property or the model itself.
 */
export function getPropertyType(target: ModelType | ModelTypeProperty): Type {
  if (target.kind === "ModelProperty") {
    return target.type;
  } else {
    return target;
  }
}

export function isNumericType(program: Program, target: Type): boolean {
  return isIntrinsic(program, target) && program.stateSet(numericTypesKey).has(target);
}

// -- @error decorator ----------------------

const errorKey = Symbol("error");

export function $error(context: DecoratorContext, target: Type) {
  if (!validateDecoratorTarget(context, target, "@error", "Model")) {
    return;
  }

  context.program.stateSet(errorKey).add(target);
}

export function isErrorModel(program: Program, target: Type): boolean {
  return program.stateSet(errorKey).has(target);
}

// -- @format decorator ---------------------

const formatValuesKey = Symbol("formatValues");

/**
 * `@format` - specify the data format hint for a string type
 *
 * The first argument is a string that identifies the format that the string type expects.  Any string
 * can be entered here, but a Cadl emitter must know how to interpret
 *
 * For Cadl specs that will be used with an OpenAPI emitter, the OpenAPI specification describes possible
 * valid values for a string type's format:
 *
 * https://swagger.io/specification/#data-types
 *
 * `@format` can be specified on a type that extends from `string` or a `string`-typed model property.
 */
export function $format(context: DecoratorContext, target: Type, format: string) {
  if (
    !validateDecoratorTarget(context, target, "@format", ["Model", "ModelProperty"]) ||
    !validateDecoratorTargetIntrinsic(context, target, "@format", ["string", "bytes"])
  ) {
    return;
  }

  context.program.stateMap(formatValuesKey).set(target, format);
}

export function getFormat(program: Program, target: Type): string | undefined {
  return program.stateMap(formatValuesKey).get(target);
}

// -- @pattern decorator ---------------------

const patternValuesKey = Symbol("patternValues");

export function $pattern(context: DecoratorContext, target: Type, pattern: string) {
  if (
    !validateDecoratorTarget(context, target, "@pattern", ["Model", "ModelProperty"]) ||
    !validateDecoratorTargetIntrinsic(context, target, "@pattern", "string")
  ) {
    return;
  }

  context.program.stateMap(patternValuesKey).set(target, pattern);
}

export function getPattern(program: Program, target: Type): string | undefined {
  return program.stateMap(patternValuesKey).get(target);
}

// -- @minLength decorator ---------------------

const minLengthValuesKey = Symbol("minLengthValues");

export function $minLength(context: DecoratorContext, target: Type, minLength: number) {
  if (
    !validateDecoratorTarget(context, target, "@minLength", ["Model", "ModelProperty"]) ||
    !validateDecoratorTargetIntrinsic(context, target, "@minLength", "string")
  ) {
    return;
  }

  context.program.stateMap(minLengthValuesKey).set(target, minLength);
}

export function getMinLength(program: Program, target: Type): number | undefined {
  return program.stateMap(minLengthValuesKey).get(target);
}

// -- @maxLength decorator ---------------------

const maxLengthValuesKey = Symbol("maxLengthValues");

export function $maxLength(context: DecoratorContext, target: Type, maxLength: number) {
  if (
    !validateDecoratorTarget(context, target, "@maxLength", ["Model", "ModelProperty"]) ||
    !validateDecoratorTargetIntrinsic(context, target, "@maxLength", "string")
  ) {
    return;
  }

  context.program.stateMap(maxLengthValuesKey).set(target, maxLength);
}

export function getMaxLength(program: Program, target: Type): number | undefined {
  return program.stateMap(maxLengthValuesKey).get(target);
}

// -- @minValue decorator ---------------------

const minValuesKey = Symbol("minValues");

export function $minValue(context: DecoratorContext, target: Type, minValue: number) {
  if (!validateDecoratorTarget(context, target, "@minValue", ["Model", "ModelProperty"])) {
    return;
  }
  const { program } = context;

  if (!isNumericType(program, getPropertyType(target))) {
    program.reportDiagnostic(
      createDiagnostic({
        code: "decorator-wrong-target",
        format: { decorator: "@minValue", to: "non-numeric type" },
        target,
      })
    );
    return;
  }
  program.stateMap(minValuesKey).set(target, minValue);
}

export function getMinValue(program: Program, target: Type): number | undefined {
  return program.stateMap(minValuesKey).get(target);
}

// -- @maxValue decorator ---------------------

const maxValuesKey = Symbol("maxValues");

export function $maxValue(context: DecoratorContext, target: Type, maxValue: number) {
  if (!validateDecoratorTarget(context, target, "@maxValue", ["Model", "ModelProperty"])) {
    return;
  }

  const { program } = context;
  if (!isNumericType(program, getPropertyType(target))) {
    program.reportDiagnostic(
      createDiagnostic({
        code: "decorator-wrong-target",
        format: { decorator: "@minValue", to: "non-numeric type" },
        target,
      })
    );
    return;
  }
  program.stateMap(maxValuesKey).set(target, maxValue);
}

export function getMaxValue(program: Program, target: Type): number | undefined {
  return program.stateMap(maxValuesKey).get(target);
}

// -- @secret decorator ---------------------

const secretTypesKey = Symbol("secretTypes");

export function $secret(context: DecoratorContext, target: Type) {
  if (
    !validateDecoratorTarget(context, target, "@secret", "Model") ||
    !validateDecoratorTargetIntrinsic(context, target, "@pattern", "string")
  ) {
    return;
  }

  context.program.stateMap(secretTypesKey).set(target, true);
}

export function isSecret(program: Program, target: Type): boolean | undefined {
  return program.stateMap(secretTypesKey).get(target);
}

// -- @visibility decorator ---------------------

const visibilitySettingsKey = Symbol("visibilitySettings");

export function $visibility(context: DecoratorContext, target: Type, ...visibilities: string[]) {
  if (!validateDecoratorTarget(context, target, "@visibility", ["ModelProperty"])) {
    return;
  }

  context.program.stateMap(visibilitySettingsKey).set(target, visibilities);
}

export function getVisibility(program: Program, target: Type): string[] | undefined {
  return program.stateMap(visibilitySettingsKey).get(target);
}

export function clearVisibility(program: Program, target: Type): void {
  program.stateMap(visibilitySettingsKey).delete(target);
}

export function $withVisibility(
  context: DecoratorContext,
  target: Type,
  ...visibilities: string[]
) {
  if (!validateDecoratorTarget(context, target, "@withVisibility", "Model")) {
    return;
  }

  filterModelPropertiesInPlace(target, (p) => isVisible(context.program, p, visibilities));
}

export function isVisible(
  program: Program,
  property: ModelTypeProperty,
  visibilities: readonly string[]
) {
  const propertyVisibilities = getVisibility(program, property);
  return !propertyVisibilities || propertyVisibilities.some((v) => visibilities.includes(v));
}

function filterModelPropertiesInPlace(
  model: ModelType,
  filter: (prop: ModelTypeProperty) => boolean
) {
  for (const [key, prop] of model.properties) {
    if (!filter(prop)) {
      model.properties.delete(key);
    }
  }
}

// -- @withOptionalProperties decorator ---------------------

export function $withOptionalProperties(context: DecoratorContext, target: Type) {
  if (!validateDecoratorTarget(context, target, "@withOptionalProperties", "Model")) {
    return;
  }

  // Make all properties of the target type optional
  target.properties.forEach((p) => (p.optional = true));
}

// -- @withUpdatableProperties decorator ----------------------

export function $withUpdateableProperties(context: DecoratorContext, target: Type) {
  if (!validateDecoratorTarget(context, target, "@withUpdateableProperties", "Model")) {
    return;
  }

  filterModelPropertiesInPlace(target, (p) => isVisible(context.program, p, ["update"]));
}

// -- @withoutOmittedProperties decorator ----------------------

export function $withoutOmittedProperties(
  context: DecoratorContext,
  target: Type,
  omitProperties: Type
) {
  if (omitProperties.kind == "TemplateParameter") {
    // Silently return because this is a templated type
    return;
  }

  if (!validateDecoratorTarget(context, target, "@withoutOmittedProperties", "Model")) {
    return;
  }

  if (!validateDecoratorParamType(context.program, target, omitProperties, ["String", "Union"])) {
    return;
  }

  // Get the property or properties to omit
  const omitNames = new Set<string>();
  if (omitProperties.kind === "Union") {
    for (const value of omitProperties.options) {
      if (value.kind === "String") {
        omitNames.add(value.value);
      }
    }
  } else {
    omitNames.add(omitProperties);
  }

  // Remove all properties to be omitted
  filterModelPropertiesInPlace(target, (prop) => !omitNames.has(prop.name));
}

// -- @withoutDefaultValues decorator ----------------------

export function $withoutDefaultValues(context: DecoratorContext, target: Type) {
  if (!validateDecoratorTarget(context, target, "@withoutDefaultValues", "Model")) {
    return;
  }

  // remove all read-only properties from the target type
  target.properties.forEach((p) => delete p.default);
}

// -- @list decorator ---------------------

const listPropertiesKey = Symbol("listProperties");

export function $list(context: DecoratorContext, target: Type, listedType?: Type) {
  if (!validateDecoratorTarget(context, target, "@list", "Operation")) {
    return;
  }

  if (listedType && listedType.kind == "TemplateParameter") {
    // Silently return because this is probably being used in a templated interface
    return;
  }

  if (listedType && listedType.kind !== "Model") {
    reportDiagnostic(context.program, {
      code: "list-type-not-model",
      target: context.getArgumentTarget(0)!,
    });
    return;
  }

  context.program.stateMap(listPropertiesKey).set(target, listedType);
}

export function getListOperationType(program: Program, target: Type): ModelType | undefined {
  return program.stateMap(listPropertiesKey).get(target);
}

export function isListOperation(program: Program, target: OperationType): boolean {
  // The type stored for the operation
  return program.stateMap(listPropertiesKey).has(target);
}

// -- @tag decorator ---------------------
const tagPropertiesKey = Symbol("tagProperties");

// Set a tag on an operation or namespace.  There can be multiple tags on either an
// operation or namespace.
export function $tag(context: DecoratorContext, target: Type, tag: string) {
  if (!validateDecoratorTarget(context, target, "@tag", ["Operation", "Namespace", "Interface"])) {
    return;
  }
  const tags = context.program.stateMap(tagPropertiesKey).get(target);
  if (tags) {
    tags.push(tag);
  } else {
    context.program.stateMap(tagPropertiesKey).set(target, [tag]);
  }
}

// Return the tags set on an operation or namespace
export function getTags(program: Program, target: Type): string[] {
  return program.stateMap(tagPropertiesKey).get(target) || [];
}

// Merge the tags for a operation with the tags that are on the namespace or
// interface it resides within.
export function getAllTags(
  program: Program,
  target: NamespaceType | InterfaceType | OperationType
): string[] | undefined {
  const tags = new Set<string>();

  let current: NamespaceType | InterfaceType | OperationType | undefined = target;
  while (current !== undefined) {
    for (const t of getTags(program, current)) {
      tags.add(t);
    }

    // Move up to the parent
    if (current.kind === "Operation") {
      current = current.interface ?? current.namespace;
    } else {
      // Type is a namespace or interface
      current = current.namespace;
    }
  }

  return tags.size > 0 ? Array.from(tags).reverse() : undefined;
}

// -- @friendlyName decorator ---------------------

const friendlyNamesKey = Symbol("friendlyNames");

export function $friendlyName(
  context: DecoratorContext,
  target: Type,
  friendlyName: string,
  sourceObject: Type | undefined
) {
  // TODO: replace with built-in decorator validation https://github.com/Azure/cadl-azure/issues/1022
  if (!validateDecoratorParamType(context.program, target, friendlyName, "String")) {
    return;
  }

  if (!validateDecoratorTarget(context, target, "@friendlyName", "Model")) {
    return;
  }

  // If an object was passed in, use it to format the friendly name
  if (sourceObject) {
    friendlyName = replaceTemplatedStringFromProperties(friendlyName, sourceObject);
  }

  context.program.stateMap(friendlyNamesKey).set(target, friendlyName);
}

export function getFriendlyName(program: Program, target: Type): string {
  return program.stateMap(friendlyNamesKey).get(target);
}

const knownValuesKey = Symbol("knownValues");
/**
 * `@knownValues` marks a string type with an enum that contains all known values
 *
 * The first parameter is a reference to an enum type that describes all possible values that the
 * type accepts.
 *
 * `@knownValues` can only be applied to model types that extend `string`.
 *
 * @param target Decorator target. Must be a string. (model Foo extends string)
 * @param knownValues Must be an enum.
 */
export function $knownValues(context: DecoratorContext, target: Type, knownValues: Type) {
  if (
    !validateDecoratorTarget(context, target, "@format", ["Model", "ModelProperty"]) ||
    !validateDecoratorTargetIntrinsic(context, target, "@knownValues", [
      "string",
      "int8",
      "int16",
      "int32",
      "int64",
      "float32",
      "float64",
    ]) ||
    !validateDecoratorParamType(context.program, target, knownValues, "Enum")
  ) {
    return;
  }

  for (const member of knownValues.members) {
    const intrinsicType = getIntrinsicModelName(context.program, getPropertyType(target));
    if (!isEnumMemberAssignableToType(intrinsicType, member)) {
      reportDiagnostic(context.program, {
        code: "known-values-invalid-enum",
        format: {
          member: member.name,
          type: intrinsicType,
        },
        target,
      });
      return;
    }
  }
  context.program.stateMap(knownValuesKey).set(target, knownValues);
}

function isEnumMemberAssignableToType(typeName: IntrinsicModelName, member: EnumMemberType) {
  const memberType = member.value !== undefined ? typeof member.value : "string";
  switch (memberType) {
    case "string":
      return typeName === "string";
    case "number":
      switch (typeName) {
        case "int8":
        case "int16":
        case "int32":
        case "int64":
        case "float32":
        case "float64":
          return true;
        default:
          return false;
      }
    default:
      return false;
  }
}

export function getKnownValues(
  program: Program,
  target: ModelType | ModelTypeProperty
): EnumType | undefined {
  return program.stateMap(knownValuesKey).get(target);
}

const keyKey = Symbol("key");

/**
 * `@key` - mark a model property as the key to identify instances of that type
 *
 * The optional first argument accepts an alternate key name which may be used by emitters.
 * Otherwise, the name of the target property will be used.
 *
 * `@key` can only be applied to model properties.
 */
export function $key(context: DecoratorContext, entity: Type, altName?: string): void {
  if (!validateDecoratorTarget(context, entity, "@key", "ModelProperty")) {
    return;
  }

  if (altName && !validateDecoratorParamType(context.program, entity, altName, "String")) {
    return;
  }

  // Register the key property
  context.program.stateMap(keyKey).set(entity, altName || entity.name);
}

export function isKey(program: Program, property: ModelTypeProperty) {
  return program.stateMap(keyKey).has(property);
}

export function getKeyName(program: Program, property: ModelTypeProperty): string {
  return program.stateMap(keyKey).get(property);
}

/**
 * Mark a type as deprecated
 * @param context DecoratorContext
 * @param target Decorator target
 * @param message Deprecation target.
 *
 * @example
 * ``` @deprecated("Foo is deprecated, use Bar instead.")
 *     model Foo {}
 * ```
 */
export function $deprecated(context: DecoratorContext, target: Type, message: string) {
  return context.program.stateMap(deprecatedKey).set(target, message);
}
const deprecatedKey = Symbol("deprecated");

/**
 * Check if the given type is deprecated
 * @param program Program
 * @param type Type
 */
export function isDeprecated(program: Program, type: Type): boolean {
  return program.stateMap(deprecatedKey).has(type);
}

/**
 * Return the deprecated message or undefined if not deprecated
 * @param program Program
 * @param type Type
 */
export function getDeprecated(program: Program, type: Type): string | undefined {
  return program.stateMap(deprecatedKey).get(type);
}
