import {
  DecoratorContext,
  getServiceNamespace,
  InterfaceType,
  ModelTypeProperty,
  NamespaceType,
  OperationType,
  Program,
  setDecoratorNamespace,
  Type,
  validateDecoratorTarget,
} from "@cadl-lang/compiler";
import { reportDiagnostic } from "./diagnostics.js";
import {
  getHeaderFieldName,
  getOperationVerb,
  getPathParamName,
  getQueryParamName,
  HttpVerb,
  isBody,
} from "./http.js";
import { getResponsesForOperation, HttpOperationResponse } from "./responses.js";
import { getAction, getResourceOperation, getSegment } from "./rest.js";

export type OperationContainer = NamespaceType | InterfaceType;

export interface FilteredRouteParam {
  routeParamString?: string;
  excludeFromOperationParams?: boolean;
}

export interface AutoRouteOptions {
  routeParamFilter?: (
    op: OperationType,
    param: ModelTypeProperty
  ) => FilteredRouteParam | undefined;
}

export interface RouteOptions {
  autoRouteOptions?: AutoRouteOptions;
}

export interface HttpOperationParameter {
  type: "query" | "path" | "header";
  name: string;
  param: ModelTypeProperty;
}

export interface HttpOperationParameters {
  parameters: HttpOperationParameter[];
  body?: ModelTypeProperty;
}

export interface OperationDetails {
  path: string;
  pathFragment?: string;
  verb: HttpVerb;
  groupName: string;
  container: OperationContainer;
  parameters: HttpOperationParameters;
  responses: HttpOperationResponse[];
  operation: OperationType;
}

export interface RoutePath {
  path: string;
  isReset: boolean;
}

/**
 * `@route` defines the relative route URI for the target operation
 *
 * The first argument should be a URI fragment that may contain one or more path parameter fields.
 * If the namespace or interface that contains the operation is also marked with a `@route` decorator,
 * it will be used as a prefix to the route URI of the operation.
 *
 * `@route` can only be applied to operations, namespaces, and interfaces.
 */
export function $route({ program }: DecoratorContext, entity: Type, path: string) {
  setRoute(program, entity, {
    path,
    isReset: false,
  });
}

export function $routeReset({ program }: DecoratorContext, entity: Type, path: string) {
  setRoute(program, entity, {
    path,
    isReset: true,
  });
}

const routeOptionsKey = Symbol("routeOptions");
export function setRouteOptionsForNamespace(
  program: Program,
  namespace: NamespaceType,
  options: RouteOptions
) {
  program.stateMap(routeOptionsKey).set(namespace, options);
}

function getRouteOptionsForNamespace(
  program: Program,
  namespace: NamespaceType
): RouteOptions | undefined {
  return program.stateMap(routeOptionsKey).get(namespace);
}

const routeContainerKey = Symbol("routeContainer");
function addRouteContainer(program: Program, entity: Type): void {
  const container = entity.kind === "Operation" ? entity.interface || entity.namespace : entity;
  if (!container) {
    // Somehow the entity doesn't have a container.  This should only happen
    // when a type was created manually and not by the checker.
    throw new Error(`${entity.kind} is not or does not have a container`);
  }

  if (isUninstantiatedTemplateInterface(container)) {
    // Don't register uninstantiated template interfaces
    return;
  }

  program.stateSet(routeContainerKey).add(container);
}

const routesKey = Symbol("routes");
function setRoute(program: Program, entity: Type, details: RoutePath) {
  if (
    !validateDecoratorTarget(program, entity, "@route", ["Namespace", "Interface", "Operation"])
  ) {
    return;
  }

  // Register the container of the operation as one that holds routed operations
  addRouteContainer(program, entity);

  const state = program.stateMap(routesKey);

  if (state.has(entity)) {
    if (entity.kind === "Operation" || entity.kind === "Interface") {
      reportDiagnostic(program, {
        code: "duplicate-route-decorator",
        messageId: entity.kind === "Operation" ? "operation" : "interface",
        target: entity,
      });
    } else {
      const existingValue: RoutePath = state.get(entity);
      if (existingValue.path !== details.path) {
        reportDiagnostic(program, {
          code: "duplicate-route-decorator",
          messageId: "namespace",
          target: entity,
        });
      }
    }
  } else {
    state.set(entity, details);
  }
}

export function getRoutePath(
  program: Program,
  entity: NamespaceType | InterfaceType | OperationType
): RoutePath | undefined {
  return program.stateMap(routesKey).get(entity);
}

function buildPath(pathFragments: string[]) {
  // Join all fragments with leading and trailing slashes trimmed
  const path = pathFragments
    .map((r) => r.replace(/(^\/|\/$)/g, ""))
    .filter((x) => x !== "")
    .join("/");
  return `/${path}`;
}

function addSegmentFragment(program: Program, target: Type, pathFragments: string[]) {
  // Don't add the segment prefix if it is meant to be excluded
  // (empty string means exclude the segment)
  const segment = getSegment(program, target);
  if (segment && segment !== "") {
    pathFragments.push(`/${segment}`);
  }
}

export function getOperationParameters(
  program: Program,
  operation: OperationType
): HttpOperationParameters {
  const result: HttpOperationParameters = {
    parameters: [],
  };
  let unAnnotatedParam: ModelTypeProperty | undefined;

  for (const param of operation.parameters.properties.values()) {
    const queryParam = getQueryParamName(program, param);
    const pathParam = getPathParamName(program, param);
    const headerParam = getHeaderFieldName(program, param);
    const bodyParm = isBody(program, param);

    const defined = [
      ["query", queryParam],
      ["path", pathParam],
      ["header", headerParam],
      ["body", bodyParm],
    ].filter((x) => !!x[1]);
    if (defined.length >= 2) {
      reportDiagnostic(program, {
        code: "operation-param-duplicate-type",
        format: { paramName: param.name, types: defined.map((x) => x[0]).join(", ") },
        target: param,
      });
    }

    if (queryParam) {
      result.parameters.push({ type: "query", name: queryParam, param });
    } else if (pathParam) {
      result.parameters.push({ type: "path", name: pathParam, param });
    } else if (headerParam) {
      result.parameters.push({ type: "header", name: headerParam, param });
    } else if (bodyParm) {
      if (result.body === undefined) {
        result.body = param;
      } else {
        reportDiagnostic(program, { code: "duplicate-body", target: param });
      }
    } else {
      if (unAnnotatedParam === undefined) {
        unAnnotatedParam = param;
      } else {
        reportDiagnostic(program, {
          code: "duplicate-body",
          messageId: "duplicateUnannotated",
          target: param,
        });
      }
    }
  }

  if (unAnnotatedParam !== undefined) {
    if (result.body === undefined) {
      result.body = unAnnotatedParam;
    } else {
      reportDiagnostic(program, {
        code: "duplicate-body",
        messageId: "bodyAndUnannotated",
        target: unAnnotatedParam,
      });
    }
  }
  return result;
}

function generatePathFromParameters(
  program: Program,
  operation: OperationType,
  pathFragments: string[],
  parameters: HttpOperationParameters,
  options: RouteOptions
) {
  const filteredParameters: HttpOperationParameter[] = [];
  for (const httpParam of parameters.parameters) {
    const { type, param } = httpParam;
    if (type === "path") {
      addSegmentFragment(program, param, pathFragments);

      const filteredParam = options.autoRouteOptions?.routeParamFilter?.(operation, param);
      if (filteredParam?.routeParamString) {
        pathFragments.push(`/${filteredParam.routeParamString}`);

        if (filteredParam?.excludeFromOperationParams === true) {
          // Skip the rest of the loop so that we don't add the parameter to the final list
          continue;
        }
      } else {
        // Add the path variable for the parameter
        if (param.type.kind === "String") {
          pathFragments.push(`/${param.type.value}`);
          continue; // Skip adding to the parameter list
        } else {
          pathFragments.push(`/{${param.name}}`);
        }
      }
    }

    // Push all usable parameters to the filtered list
    filteredParameters.push(httpParam);
  }

  // Replace the original parameters with filtered set
  parameters.parameters = filteredParameters;

  // Add the operation's own segment if present
  addSegmentFragment(program, operation, pathFragments);
}

function getPathForOperation(
  program: Program,
  operation: OperationType,
  routeFragments: string[],
  options: RouteOptions
): { path: string; pathFragment?: string; parameters: HttpOperationParameters } {
  const parameters: HttpOperationParameters = getOperationParameters(program, operation);

  const pathFragments = [...routeFragments];
  const routePath = getRoutePath(program, operation);
  if (isAutoRoute(program, operation)) {
    // The operation exists within an @autoRoute scope, generate the path.  This
    // mutates the pathFragments and parameters lists that are passed in!
    generatePathFromParameters(program, operation, pathFragments, parameters, options);
  } else {
    // Prepend any explicit route path
    if (routePath) {
      pathFragments.push(routePath.path);
    }

    // Pull out path parameters to verify what's in the path string
    const paramByName = new Map(
      parameters.parameters
        .filter(({ type }) => type === "path")
        .map(({ param }) => [param.name, param])
    );

    // Find path parameter names used in all route fragments
    const declaredPathParams = pathFragments.flatMap(
      (f) => f.match(/\{\w+\}/g)?.map((s) => s.slice(1, -1)) ?? []
    );

    // For each param in the declared path parameters (e.g. /foo/{id} has one, id),
    // delete it because it doesn't need to be added to the path.
    for (const declaredParam of declaredPathParams) {
      const param = paramByName.get(declaredParam);
      if (!param) {
        reportDiagnostic(program, {
          code: "missing-path-param",
          format: { param: declaredParam },
          target: operation,
        });
        continue;
      }

      paramByName.delete(declaredParam);
    }

    // Add any remaining declared path params
    for (const param of paramByName.keys()) {
      pathFragments.push(`{${param}}`);
    }
  }

  return {
    path: buildPath(pathFragments),
    pathFragment: routePath?.path,
    parameters,
  };
}

function getVerbForOperation(
  program: Program,
  operation: OperationType,
  parameters: HttpOperationParameters
): HttpVerb {
  const resourceOperation = getResourceOperation(program, operation);
  const verb =
    (resourceOperation && resourceOperationToVerb[resourceOperation.operation]) ??
    getOperationVerb(program, operation) ??
    // TODO: Enable this verb choice to be customized!
    (getAction(program, operation) ? "post" : undefined);

  if (verb !== undefined) {
    return verb;
  }

  if (parameters.body) {
    reportDiagnostic(program, {
      code: "http-verb-missing-with-body",
      format: { operationName: operation.name },
      target: operation,
    });
  }

  return "get";
}

function buildRoutes(
  program: Program,
  container: OperationContainer,
  routeFragments: string[],
  visitedOperations: Set<OperationType>,
  options: RouteOptions
): OperationDetails[] {
  // Get the route info for this container, if any
  const baseRoute = getRoutePath(program, container);
  const parentFragments = [...routeFragments, ...(baseRoute ? [baseRoute.path] : [])];

  // TODO: Allow overriding the existing resource operation of the same kind

  const operations: OperationDetails[] = [];
  for (const [_, op] of container.operations) {
    // Skip previously-visited operations
    if (visitedOperations.has(op)) {
      continue;
    }

    const route = getPathForOperation(program, op, parentFragments, options);
    const verb = getVerbForOperation(program, op, route.parameters);
    const responses = getResponsesForOperation(program, op);
    operations.push({
      path: route.path,
      pathFragment: route.pathFragment,
      verb,
      container,
      groupName: container.name,
      parameters: route.parameters,
      operation: op,
      responses,
    });
  }

  // Build all child routes and append them to the list, but don't recurse in
  // the global scope because that could pull in unwanted operations
  if (container.kind === "Namespace" && container.name !== "") {
    const children: OperationContainer[] = [
      ...container.namespaces.values(),
      ...container.interfaces.values(),
    ];

    const childRoutes = children.flatMap((child) =>
      buildRoutes(program, child, parentFragments, visitedOperations, options)
    );
    for (const child of childRoutes) [operations.push(child)];
  }

  return operations;
}

export function getRoutesForContainer(
  program: Program,
  container: OperationContainer,
  visitedOperations: Set<OperationType>,
  options?: RouteOptions
): OperationDetails[] {
  const routeOptions =
    options ??
    (container.kind === "Namespace" ? getRouteOptionsForNamespace(program, container) : {}) ??
    {};

  return buildRoutes(program, container, [], visitedOperations, routeOptions);
}

function isUninstantiatedTemplateInterface(maybeInterface: Type): boolean {
  return (
    maybeInterface.kind === "Interface" &&
    maybeInterface.node.templateParameters &&
    maybeInterface.node.templateParameters.length > 0 &&
    (!maybeInterface.templateArguments || maybeInterface.templateArguments.length === 0)
  );
}

export function getAllRoutes(program: Program, options?: RouteOptions): OperationDetails[] {
  let operations: OperationDetails[] = [];

  const serviceNamespace = getServiceNamespace(program);
  const containers: Type[] = [
    ...(serviceNamespace ? [serviceNamespace] : []),
    ...Array.from(program.stateSet(routeContainerKey)),
  ];

  const visitedOperations = new Set<OperationType>();
  for (const container of containers) {
    // Is this container a templated interface that hasn't been instantiated?
    if (isUninstantiatedTemplateInterface(container)) {
      // Skip template interface operations
      continue;
    }

    const newOps = getRoutesForContainer(
      program,
      container as OperationContainer,
      visitedOperations,
      options
    );

    // Make sure we don't visit the same operations again
    newOps.forEach((o) => visitedOperations.add(o.operation));

    // Accumulate the new operations
    operations = [...operations, ...newOps];
  }

  validateRouteUnique(program, operations);
  return operations;
}

function validateRouteUnique(program: Program, operations: OperationDetails[]) {
  const grouped = new Map<string, Map<HttpVerb, OperationDetails[]>>();

  for (const operation of operations) {
    const { verb, path } = operation;
    let map = grouped.get(path);
    if (map === undefined) {
      map = new Map<HttpVerb, OperationDetails[]>();
      grouped.set(path, map);
    }

    let list = map.get(verb);
    if (list === undefined) {
      list = [];
      map.set(verb, list);
    }

    list.push(operation);
  }

  for (const [path, map] of grouped) {
    for (const [verb, routes] of map) {
      if (routes.length >= 2) {
        for (const route of routes) {
          reportDiagnostic(program, {
            code: "duplicate-operation",
            format: { path, verb, operationName: route.operation.name },
            target: route.operation,
          });
        }
      }
    }
  }
}

// TODO: Make this overridable by libraries
const resourceOperationToVerb: any = {
  read: "get",
  create: "post",
  createOrUpdate: "put",
  update: "patch",
  delete: "delete",
  list: "get",
};

const autoRouteKey = Symbol("autoRoute");

/**
 * `@autoRoute` enables automatic route generation for an operation, namespace, or interface.
 *
 * When applied to an operation, it automatically generates the operation's route based on path parameter
 * metadata.  When applied to a namespace or interface, it causes all operations under that scope to have
 * auto-generated routes.
 */
export function $autoRoute({ program }: DecoratorContext, entity: Type) {
  if (
    !validateDecoratorTarget(program, entity, "@autoRoute", ["Namespace", "Interface", "Operation"])
  ) {
    return;
  }

  // Register the container of the operation as one that holds routed operations
  addRouteContainer(program, entity);

  program.stateSet(autoRouteKey).add(entity);
}

export function isAutoRoute(
  program: Program,
  target: NamespaceType | InterfaceType | OperationType
): boolean {
  // Loop up through parent scopes (interface, namespace) to see if
  // @autoRoute was used anywhere
  let current: NamespaceType | InterfaceType | OperationType | undefined = target;
  while (current !== undefined) {
    if (program.stateSet(autoRouteKey).has(current)) {
      return true;
    }

    // Navigate up to the parent scope
    if (current.kind === "Namespace" || current.kind === "Interface") {
      current = current.namespace;
    } else if (current.kind === "Operation") {
      current = current.interface || current.namespace;
    }
  }

  return false;
}

setDecoratorNamespace("Cadl.Http", $route, $routeReset, $autoRoute);
