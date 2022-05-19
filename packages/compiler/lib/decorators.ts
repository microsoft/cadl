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
  { program }: DecoratorContext,
  target: Type,
  text: string,
  sourceObject: Type
) {
  setTemplatedStringProperty(summaryKey, program, target, text, sourceObject);
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
export function $doc(
  { program }: DecoratorContext,
  target: Type,
  text: string,
  sourceObject: Type
) {
  setTemplatedStringProperty(docsKey, program, target, text, sourceObject);
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
export function $intrinsic({ program }: DecoratorContext, target: Type, name: IntrinsicModelName) {
  program.stateMap(intrinsicsKey).set(target, name);
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

const numericTypesKey = Symbol("numericTypes");
export function $numeric({ program }: DecoratorContext, target: Type) {
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
  if (!validateDecoratorTarget(program, target, "@numeric", "Model")) {
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

export function $error({ program }: DecoratorContext, target: Type) {
  if (!validateDecoratorTarget(program, target, "@error", "Model")) {
    return;
  }

  program.stateSet(errorKey).add(target);
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
export function $format({ program }: DecoratorContext, target: Type, format: string) {
  if (
    !validateDecoratorTarget(program, target, "@format", ["Model", "ModelProperty"]) ||
    !validateDecoratorTargetIntrinsic(program, target, "@format", ["string", "bytes"])
  ) {
    return;
  }

  program.stateMap(formatValuesKey).set(target, format);
}

export function getFormat(program: Program, target: Type): string | undefined {
  return program.stateMap(formatValuesKey).get(target);
}

// -- @pattern decorator ---------------------

const patternValuesKey = Symbol("patternValues");

export function $pattern({ program }: DecoratorContext, target: Type, pattern: string) {
  if (
    !validateDecoratorTarget(program, target, "@pattern", ["Model", "ModelProperty"]) ||
    !validateDecoratorTargetIntrinsic(program, target, "@pattern", "string")
  ) {
    return;
  }

  program.stateMap(patternValuesKey).set(target, pattern);
}

export function getPattern(program: Program, target: Type): string | undefined {
  return program.stateMap(patternValuesKey).get(target);
}

// -- @minLength decorator ---------------------

const minLengthValuesKey = Symbol("minLengthValues");

export function $minLength({ program }: DecoratorContext, target: Type, minLength: number) {
  if (
    !validateDecoratorTarget(program, target, "@minLength", ["Model", "ModelProperty"]) ||
    !validateDecoratorTargetIntrinsic(program, target, "@minLength", "string")
  ) {
    return;
  }

  program.stateMap(minLengthValuesKey).set(target, minLength);
}

export function getMinLength(program: Program, target: Type): number | undefined {
  return program.stateMap(minLengthValuesKey).get(target);
}

// -- @maxLength decorator ---------------------

const maxLengthValuesKey = Symbol("maxLengthValues");

export function $maxLength({ program }: DecoratorContext, target: Type, maxLength: number) {
  if (
    !validateDecoratorTarget(program, target, "@maxLength", ["Model", "ModelProperty"]) ||
    !validateDecoratorTargetIntrinsic(program, target, "@maxLength", "string")
  ) {
    return;
  }

  program.stateMap(maxLengthValuesKey).set(target, maxLength);
}

export function getMaxLength(program: Program, target: Type): number | undefined {
  return program.stateMap(maxLengthValuesKey).get(target);
}

// -- @minValue decorator ---------------------

const minValuesKey = Symbol("minValues");

export function $minValue({ program }: DecoratorContext, target: Type, minValue: number) {
  if (!validateDecoratorTarget(program, target, "@minValue", ["Model", "ModelProperty"])) {
    return;
  }

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

export function $maxValue({ program }: DecoratorContext, target: Type, maxValue: number) {
  if (!validateDecoratorTarget(program, target, "@maxValue", ["Model", "ModelProperty"])) {
    return;
  }

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

export function $secret({ program }: DecoratorContext, target: Type) {
  if (
    !validateDecoratorTarget(program, target, "@secret", "Model") ||
    !validateDecoratorTargetIntrinsic(program, target, "@pattern", "string")
  ) {
    return;
  }

  program.stateMap(secretTypesKey).set(target, true);
}

export function isSecret(program: Program, target: Type): boolean | undefined {
  return program.stateMap(secretTypesKey).get(target);
}

// -- @visibility decorator ---------------------

const visibilitySettingsKey = Symbol("visibilitySettings");

export function $visibility(
  { program }: DecoratorContext,
  target: Type,
  ...visibilities: string[]
) {
  if (!validateDecoratorTarget(program, target, "@visibility", ["ModelProperty"])) {
    return;
  }

  program.stateMap(visibilitySettingsKey).set(target, visibilities);
}

export function getVisibility(program: Program, target: Type): string[] | undefined {
  return program.stateMap(visibilitySettingsKey).get(target);
}

export function $withVisibility(
  { program }: DecoratorContext,
  target: Type,
  ...visibilities: string[]
) {
  if (!validateDecoratorTarget(program, target, "@withVisibility", "Model")) {
    return;
  }

  const filter = (_: any, prop: ModelTypeProperty) => {
    const vis = getVisibility(program, prop);
    return vis !== undefined && visibilities.filter((v) => !vis.includes(v)).length > 0;
  };

  mapFilterOut(target.properties, filter);
}

function mapFilterOut(
  map: Map<string, ModelTypeProperty>,
  pred: (key: string, prop: ModelTypeProperty) => boolean
) {
  for (const [key, prop] of map) {
    if (pred(key, prop)) {
      map.delete(key);
    }
  }
}

// -- @withOptionalProperties decorator ---------------------

export function $withOptionalProperties({ program }: DecoratorContext, target: Type) {
  if (!validateDecoratorTarget(program, target, "@withOptionalProperties", "Model")) {
    return;
  }

  // Make all properties of the target type optional
  target.properties.forEach((p) => (p.optional = true));
}

// -- @withUpdatableProperties decorator ----------------------

export function $withUpdateableProperties({ program }: DecoratorContext, target: Type) {
  if (!validateDecoratorTarget(program, target, "@withUpdateableProperties", "Model")) {
    return;
  }

  // remove all read-only properties from the target type
  mapFilterOut(target.properties, (key, value) => {
    const vis = getVisibility(program, value);
    return vis !== undefined && vis.length > 0 && !vis.includes("update");
  });
}

// -- @withoutOmittedProperties decorator ----------------------

export function $withoutOmittedProperties(
  { program }: DecoratorContext,
  target: Type,
  omitProperties: Type
) {
  if (omitProperties.kind == "TemplateParameter") {
    // Silently return because this is a templated type
    return;
  }

  if (!validateDecoratorTarget(program, target, "@withoutOmittedProperties", "Model")) {
    return;
  }

  if (!validateDecoratorParamType(program, target, omitProperties, ["String", "Union"])) {
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
  mapFilterOut(target.properties, (key, _) => omitNames.has(key));
}

// -- @withoutDefaultValues decorator ----------------------

export function $withoutDefaultValues({ program }: DecoratorContext, target: Type) {
  if (!validateDecoratorTarget(program, target, "@withoutDefaultValues", "Model")) {
    return;
  }

  // remove all read-only properties from the target type
  target.properties.forEach((p) => delete p.default);
}

// -- @list decorator ---------------------

const listPropertiesKey = Symbol("listProperties");

export function $list({ program }: DecoratorContext, target: Type, listedType?: Type) {
  if (!validateDecoratorTarget(program, target, "@list", "Operation")) {
    return;
  }

  if (listedType && listedType.kind == "TemplateParameter") {
    // Silently return because this is probably being used in a templated interface
    return;
  }

  if (listedType && listedType.kind !== "Model") {
    program.reportDiagnostic(
      createDiagnostic({
        code: "list-type-not-model",
        target,
      })
    );
    return;
  }

  program.stateMap(listPropertiesKey).set(target, listedType);
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
export function $tag({ program }: DecoratorContext, target: Type, tag: string) {
  if (!validateDecoratorTarget(program, target, "@tag", ["Operation", "Namespace", "Interface"])) {
    return;
  }
  const tags = program.stateMap(tagPropertiesKey).get(target);
  if (tags) {
    tags.push(tag);
  } else {
    program.stateMap(tagPropertiesKey).set(target, [tag]);
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
  { program }: DecoratorContext,
  target: Type,
  friendlyName: string,
  sourceObject: Type | undefined
) {
  // TODO: replace with built-in decorator validation https://github.com/Azure/cadl-azure/issues/1022
  if (!validateDecoratorParamType(program, target, friendlyName, "String")) {
    return;
  }

  if (!validateDecoratorTarget(program, target, "@friendlyName", "Model")) {
    return;
  }

  // If an object was passed in, use it to format the friendly name
  if (sourceObject) {
    friendlyName = replaceTemplatedStringFromProperties(friendlyName, sourceObject);
  }

  program.stateMap(friendlyNamesKey).set(target, friendlyName);
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
    !validateDecoratorTarget(context.program, target, "@format", ["Model", "ModelProperty"]) ||
    !validateDecoratorTargetIntrinsic(context.program, target, "@knownValues", [
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
export function $key({ program }: DecoratorContext, entity: Type, altName?: string): void {
  if (!validateDecoratorTarget(program, entity, "@key", "ModelProperty")) {
    return;
  }

  if (altName && !validateDecoratorParamType(program, entity, altName, "String")) {
    return;
  }

  // Register the key property
  program.stateMap(keyKey).set(entity, altName || entity.name);
}

export function isKey(program: Program, property: ModelTypeProperty) {
  return program.stateMap(keyKey).has(property);
}

export function getKeyName(program: Program, property: ModelTypeProperty): string {
  return program.stateMap(keyKey).get(property);
}
