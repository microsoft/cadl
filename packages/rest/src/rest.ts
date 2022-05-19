import {
  $list,
  DecoratorContext,
  ModelType,
  OperationType,
  Program,
  setDecoratorNamespace,
  Type,
  validateDecoratorTarget,
} from "@cadl-lang/compiler";
import { reportDiagnostic } from "./diagnostics.js";
import { getResourceTypeKey } from "./resource.js";

const producesTypesKey = Symbol("producesTypes");

export function $produces({ program }: DecoratorContext, entity: Type, ...contentTypes: string[]) {
  if (entity.kind !== "Namespace") {
    reportDiagnostic(program, { code: "produces-namespace-only", target: entity });
  }

  const values = getProduces(program, entity);
  program.stateMap(producesTypesKey).set(entity, values.concat(contentTypes));
}

export function getProduces(program: Program, entity: Type): string[] {
  return program.stateMap(producesTypesKey).get(entity) || [];
}

const consumesTypesKey = Symbol("consumesTypes");

export function $consumes({ program }: DecoratorContext, entity: Type, ...contentTypes: string[]) {
  if (entity.kind !== "Namespace") {
    reportDiagnostic(program, { code: "consumes-namespace-only", target: entity });
  }

  const values = getConsumes(program, entity);
  program.stateMap(consumesTypesKey).set(entity, values.concat(contentTypes));
}

export function getConsumes(program: Program, entity: Type): string[] {
  return program.stateMap(consumesTypesKey).get(entity) || [];
}

export interface Discriminator {
  propertyName: string;
}

const discriminatorKey = Symbol("discriminator");
export function $discriminator({ program }: DecoratorContext, entity: Type, propertyName: string) {
  if (!validateDecoratorTarget(program, entity, "@discriminator", "Model")) {
    return;
  }
  program.stateMap(discriminatorKey).set(entity, propertyName);
}

export function getDiscriminator(program: Program, entity: Type): Discriminator | undefined {
  const propertyName = program.stateMap(discriminatorKey).get(entity);
  if (propertyName) {
    return { propertyName };
  }
  return undefined;
}

const segmentsKey = Symbol("segments");

/**
 * `@segment` defines the preceding path segment for a `@path` parameter in auto-generated routes
 *
 * The first argument should be a string that will be inserted into the operation route before the
 * path parameter's name field.
 *
 * `@segment` can only be applied to model properties or operation parameters.
 */
export function $segment({ program }: DecoratorContext, entity: Type, name: string) {
  if (
    !validateDecoratorTarget(program, entity, "@segment", ["Model", "ModelProperty", "Operation"])
  ) {
    return;
  }

  program.stateMap(segmentsKey).set(entity, name);
}

export function $segmentOf(context: DecoratorContext, entity: Type, resourceType: Type) {
  if (resourceType.kind === "TemplateParameter") {
    // Skip it, this operation is in a templated interface
    return;
  }
  if (!validateDecoratorTarget(context.program, resourceType, "@segmentOf", "Model")) {
    return;
  }

  // Add path segment for resource type key (if it has one)
  const resourceKey = getResourceTypeKey(context.program, resourceType);
  if (resourceKey) {
    const keySegment = getSegment(context.program, resourceKey.keyProperty);
    if (keySegment) {
      $segment(context, entity, keySegment);
    }
  } else {
    // Does the model itself have a segment attached?
    const modelSegment = getSegment(context.program, resourceType);
    if (modelSegment) {
      $segment(context, entity, modelSegment);
    }
  }
}

export function getSegment(program: Program, entity: Type): string | undefined {
  return program.stateMap(segmentsKey).get(entity);
}

export type ResourceOperations =
  | "read"
  | "createOrUpdate"
  | "create"
  | "update"
  | "delete"
  | "list";

export interface ResourceOperation {
  operation: string;
  resourceType: ModelType;
}

const resourceOperationsKey = Symbol("resourceOperations");

export function setResourceOperation(
  program: Program,
  entity: Type,
  resourceType: Type,
  operation: ResourceOperations
) {
  if (resourceType.kind !== "Model" && resourceType.kind !== "TemplateParameter") {
    reportDiagnostic(program, {
      code: "operation-resource-wrong-type",
      format: { operation, kind: resourceType.kind },
      target: entity,
    });
    return;
  }

  // Only register operations when applied to real model types
  if (resourceType.kind === "Model") {
    program.stateMap(resourceOperationsKey).set(entity, {
      operation,
      resourceType,
    });
  }
}

export function getResourceOperation(
  program: Program,
  cadlOperation: OperationType
): ResourceOperation | undefined {
  return program.stateMap(resourceOperationsKey).get(cadlOperation);
}

export function $readsResource({ program }: DecoratorContext, entity: Type, resourceType: Type) {
  setResourceOperation(program, entity, resourceType, "read");
}

export function $createsResource(context: DecoratorContext, entity: Type, resourceType: Type) {
  // Add path segment for resource type key
  $segmentOf(context, entity, resourceType);

  setResourceOperation(context.program, entity, resourceType, "create");
}

export function $createsOrUpdatesResource(
  { program }: DecoratorContext,
  entity: Type,
  resourceType: Type
) {
  setResourceOperation(program, entity, resourceType, "createOrUpdate");
}

export function $updatesResource({ program }: DecoratorContext, entity: Type, resourceType: Type) {
  setResourceOperation(program, entity, resourceType, "update");
}

export function $deletesResource({ program }: DecoratorContext, entity: Type, resourceType: Type) {
  setResourceOperation(program, entity, resourceType, "delete");
}

export function $listsResource(context: DecoratorContext, entity: Type, resourceType: Type) {
  // Add the @list decorator too so that collection routes are generated correctly
  $list(context, entity, resourceType);

  // Add path segment for resource type key
  $segmentOf(context, entity, resourceType);

  setResourceOperation(context.program, entity, resourceType, "list");
}

function lowerCaseFirstChar(str: string): string {
  return str[0].toLocaleLowerCase() + str.substring(1);
}

const actionsKey = Symbol("actions");
export function $action(context: DecoratorContext, entity: Type, name?: string) {
  if (!validateDecoratorTarget(context.program, entity, "@action", "Operation")) {
    return;
  }

  // Generate the action name and add it as an operation path segment
  const action = lowerCaseFirstChar(name || entity.name);
  $segment(context, entity, action);

  context.program.stateMap(actionsKey).set(entity, action);
}

export function getAction(program: Program, operation: OperationType): string | null | undefined {
  return program.stateMap(actionsKey).get(operation);
}

setDecoratorNamespace(
  "Cadl.Rest",
  $produces,
  $consumes,
  $segment,
  $segmentOf,
  $readsResource,
  $createsResource,
  $createsOrUpdatesResource,
  $updatesResource,
  $deletesResource,
  $listsResource,
  $action
);
