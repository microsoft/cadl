import {
  DecoratorContext,
  isErrorModel,
  Type,
  validateDecoratorParamType,
} from "@cadl-lang/compiler";
import { reportDiagnostic } from "./diagnostics.js";
import { getResourceTypeKey } from "./resource.js";

const validatedMissingKey = Symbol("validatedMissing");
// Workaround for the lack of template constraints https://github.com/microsoft/cadl/issues/377
export function $validateHasKey(context: DecoratorContext, target: Type, value: Type) {
  if (!validateDecoratorParamType(context.program, target, value, "Model")) {
    return;
  }
  if (context.program.stateSet(validatedMissingKey).has(value)) {
    return;
  }
  const resourceKey = getResourceTypeKey(context.program, value);
  if (resourceKey === undefined) {
    reportDiagnostic(context.program, {
      code: "resource-missing-key",
      format: { modelName: value.name },
      target: value,
    });
    context.program.stateSet(validatedMissingKey).add(value);
  }
}

const validatedErrorKey = Symbol("validatedError");
// Workaround for the lack of template constraints https://github.com/microsoft/cadl/issues/377
export function $validateIsError(context: DecoratorContext, target: Type, value: Type) {
  if (!validateDecoratorParamType(context.program, target, value, "Model")) {
    return;
  }
  if (context.program.stateSet(validatedErrorKey).has(value)) {
    return;
  }
  const isError = isErrorModel(context.program, value);
  if (!isError) {
    reportDiagnostic(context.program, {
      code: "resource-missing-error",
      format: { modelName: value.name },
      target: value,
    });
    context.program.stateSet(validatedErrorKey).add(value);
  }
}
