import {
  createDecoratorDefinition,
  DecoratorContext,
  ModelType,
  ModelTypeProperty,
  NamespaceType,
  Program,
  setCadlNamespace,
  Type,
  validateDecoratorParamCount,
  validateDecoratorParamType,
  validateDecoratorTarget,
} from "@cadl-lang/compiler";
import { reportDiagnostic } from "../diagnostics.js";
import { extractParamsFromPath } from "../utils.js";

export const namespace = "Cadl.Http";

const headerDecorator = createDecoratorDefinition({
  name: "@header",
  target: "ModelProperty",
  args: [{ kind: "String", optional: true }],
} as const);
const headerFieldsKey = Symbol("header");
export function $header(context: DecoratorContext, entity: ModelTypeProperty, headerName?: string) {
  if (!headerDecorator.validate(context, entity, [headerName])) {
    return;
  }

  if (!headerName) {
    headerName = entity.name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  }
  context.program.stateMap(headerFieldsKey).set(entity, headerName);
}

export function getHeaderFieldName(program: Program, entity: Type): string {
  return program.stateMap(headerFieldsKey).get(entity);
}

export function isHeader(program: Program, entity: Type) {
  return program.stateMap(headerFieldsKey).has(entity);
}

const queryFieldsKey = Symbol("query");
export function $query(context: DecoratorContext, entity: Type, queryKey?: string) {
  if (!validateDecoratorTarget(context, entity, "@query", "ModelProperty")) {
    return;
  }

  if (queryKey && !validateDecoratorParamType(context.program, entity, queryKey, "String")) {
    return;
  }

  if (!queryKey && entity.kind === "ModelProperty") {
    queryKey = entity.name;
  }
  context.program.stateMap(queryFieldsKey).set(entity, queryKey);
}

export function getQueryParamName(program: Program, entity: Type): string {
  return program.stateMap(queryFieldsKey).get(entity);
}

export function isQueryParam(program: Program, entity: Type) {
  return program.stateMap(queryFieldsKey).has(entity);
}

const pathFieldsKey = Symbol("path");
export function $path(context: DecoratorContext, entity: Type, paramName?: string) {
  if (!validateDecoratorTarget(context, entity, "@path", "ModelProperty")) {
    return;
  }

  if (paramName && !validateDecoratorParamType(context.program, entity, paramName, "String")) {
    return;
  }

  if (!paramName && entity.kind === "ModelProperty") {
    paramName = entity.name;
  }
  context.program.stateMap(pathFieldsKey).set(entity, paramName);
}

export function getPathParamName(program: Program, entity: Type): string {
  return program.stateMap(pathFieldsKey).get(entity);
}

export function isPathParam(program: Program, entity: Type) {
  return program.stateMap(pathFieldsKey).has(entity);
}

const bodyFieldsKey = Symbol("body");
export function $body(context: DecoratorContext, entity: Type) {
  if (!validateDecoratorTarget(context, entity, "@body", "ModelProperty")) {
    return;
  }
  context.program.stateSet(bodyFieldsKey).add(entity);
}

export function isBody(program: Program, entity: Type): boolean {
  return program.stateSet(bodyFieldsKey).has(entity);
}

const statusCodeKey = Symbol("statusCode");
export function $statusCode(context: DecoratorContext, entity: Type) {
  if (!validateDecoratorTarget(context, entity, "@statusCode", "ModelProperty")) {
    return;
  }
  context.program.stateSet(statusCodeKey).add(entity);

  const codes: string[] = [];
  if (entity.type.kind === "String") {
    if (validStatusCode(context.program, entity.type.value, entity)) {
      codes.push(entity.type.value);
    }
  } else if (entity.type.kind === "Number") {
    if (validStatusCode(context.program, String(entity.type.value), entity)) {
      codes.push(String(entity.type.value));
    }
  } else if (entity.type.kind === "Union") {
    for (const option of entity.type.options) {
      if (option.kind === "String") {
        if (validStatusCode(context.program, option.value, option)) {
          codes.push(option.value);
        }
      } else if (option.kind === "Number") {
        if (validStatusCode(context.program, String(option.value), option)) {
          codes.push(String(option.value));
        }
      } else {
        reportDiagnostic(context.program, {
          code: "status-code-invalid",
          target: entity,
        });
      }
    }
  } else if (entity.type.kind === "TemplateParameter") {
    // Ignore template parameters
  } else {
    reportDiagnostic(context.program, {
      code: "status-code-invalid",
      target: entity,
    });
  }
  setStatusCode(context.program, entity, codes);
}

export function setStatusCode(
  program: Program,
  entity: ModelType | ModelTypeProperty,
  codes: string[]
) {
  program.stateMap(statusCodeKey).set(entity, codes);
}

// Check status code value: 3 digits with first digit in [1-5]
// Issue a diagnostic if not valid
function validStatusCode(program: Program, code: string, entity: Type): boolean {
  const statusCodePatten = /[1-5][0-9][0-9]/;
  if (code.match(statusCodePatten)) {
    return true;
  }
  reportDiagnostic(program, {
    code: "status-code-invalid",
    target: entity,
    messageId: "value",
  });
  return false;
}

export function isStatusCode(program: Program, entity: Type) {
  return program.stateMap(statusCodeKey).has(entity);
}

export function getStatusCodes(program: Program, entity: Type): string[] {
  return program.stateMap(statusCodeKey).get(entity) ?? [];
}

// Note: these descriptions come from https://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html
export function getStatusCodeDescription(statusCode: string) {
  switch (statusCode) {
    case "200":
      return "Ok";
    case "201":
      return "Created";
    case "202":
      return "Accepted";
    case "204":
      return "No Content";
    case "301":
      return "Moved Permanently";
    case "304":
      return "Not Modified";
    case "400":
      return "Bad Request";
    case "401":
      return "Unauthorized";
    case "403":
      return "Forbidden";
    case "404":
      return "Not Found";
    case "409":
      return "Conflict";
    case "412":
      return "Precondition Failed";
    case "503":
      return "Service Unavailable";
  }

  switch (statusCode.charAt(0)) {
    case "1":
      return "Informational";
    case "2":
      return "Successful";
    case "3":
      return "Redirection";
    case "4":
      return "Client Error";
    case "5":
      return "Server Error";
  }

  // Any valid HTTP status code is covered above.
  return undefined;
}

export type HttpVerb = "get" | "put" | "post" | "patch" | "delete" | "head";

const operationVerbsKey = Symbol("verbs");

function setOperationVerb(program: Program, entity: Type, verb: HttpVerb): void {
  if (entity.kind === "Operation") {
    if (!program.stateMap(operationVerbsKey).has(entity)) {
      program.stateMap(operationVerbsKey).set(entity, verb);
    } else {
      reportDiagnostic(program, {
        code: "http-verb-duplicate",
        format: { entityName: entity.name },
        target: entity,
      });
    }
  } else {
    reportDiagnostic(program, {
      code: "http-verb-wrong-type",
      format: { verb, entityKind: entity.kind },
      target: entity,
    });
  }
}

export function getOperationVerb(program: Program, entity: Type): HttpVerb | undefined {
  return program.stateMap(operationVerbsKey).get(entity);
}

export function $get(context: DecoratorContext, entity: Type, ...args: unknown[]) {
  validateVerbNoArgs(context, args);
  setOperationVerb(context.program, entity, "get");
}

export function $put(context: DecoratorContext, entity: Type, ...args: unknown[]) {
  validateVerbNoArgs(context, args);
  setOperationVerb(context.program, entity, "put");
}

export function $post(context: DecoratorContext, entity: Type, ...args: unknown[]) {
  validateVerbNoArgs(context, args);
  setOperationVerb(context.program, entity, "post");
}

export function $patch(context: DecoratorContext, entity: Type, ...args: unknown[]) {
  validateVerbNoArgs(context, args);
  setOperationVerb(context.program, entity, "patch");
}

export function $delete(context: DecoratorContext, entity: Type, ...args: unknown[]) {
  validateVerbNoArgs(context, args);
  setOperationVerb(context.program, entity, "delete");
}

export function $head(context: DecoratorContext, entity: Type, ...args: unknown[]) {
  validateVerbNoArgs(context, args);
  setOperationVerb(context.program, entity, "head");
}

// TODO: replace with built-in decorator validation https://github.com/Azure/cadl-azure/issues/1022
function validateVerbNoArgs(context: DecoratorContext, args: unknown[]) {
  validateDecoratorParamCount(context, 0, 0, args);
}

export interface HttpServer {
  url: string;
  description: string;
  parameters: Map<string, ModelTypeProperty>;
}

const serverDecoratorDefinition = createDecoratorDefinition({
  name: "@server",
  target: "Namespace",
  args: [{ kind: "String" }, { kind: "String" }, { kind: "Model", optional: true }],
} as const);
const serversKey = Symbol("servers");
/**
 * Configure the server url for the service.
 * @param context Decorator context
 * @param target Decorator target(Must be a namespace)
 * @param description Description for this server.
 * @param parameters @optional Parameters to interpolate in the server url.
 */
export function $server(
  context: DecoratorContext,
  target: NamespaceType,
  url: string,
  description: string,
  parameters?: ModelType
): void {
  if (!serverDecoratorDefinition.validate(context, target, [url, description, parameters])) {
    return;
  }

  const params = extractParamsFromPath(url);
  const parameterMap = new Map(parameters?.properties ?? []);
  for (const declaredParam of params) {
    const param = parameterMap.get(declaredParam);
    if (!param) {
      reportDiagnostic(context.program, {
        code: "missing-server-param",
        format: { param: declaredParam },
        target: context.getArgumentTarget(0)!,
      });
      parameterMap.delete(declaredParam);
    }
  }

  let servers: HttpServer[] = context.program.stateMap(serversKey).get(target);
  if (servers === undefined) {
    servers = [];
    context.program.stateMap(serversKey).set(target, servers);
  }
  servers.push({
    url,
    description,
    parameters: parameterMap,
  });
}

export function getServers(program: Program, type: NamespaceType): HttpServer[] | undefined {
  return program.stateMap(serversKey).get(type);
}

export function $plainData(context: DecoratorContext, entity: Type) {
  if (!validateDecoratorTarget(context, entity, "@plainData", "Model")) {
    return;
  }
  const { program } = context;

  const decoratorsToRemove = ["$header", "$body", "$query", "$path", "$statusCode"];
  const [headers, bodies, queries, paths, statusCodes] = [
    program.stateMap(headerFieldsKey),
    program.stateSet(bodyFieldsKey),
    program.stateMap(queryFieldsKey),
    program.stateMap(pathFieldsKey),
    program.stateMap(statusCodeKey),
  ];

  for (const property of entity.properties.values()) {
    // Remove the decorators so that they do not run in the future, for example,
    // if this model is later spread into another.
    property.decorators = property.decorators.filter(
      (d) => !decoratorsToRemove.includes(d.decorator.name)
    );

    // Remove the impact the decorators already had on this model.
    headers.delete(property);
    bodies.delete(property);
    queries.delete(property);
    paths.delete(property);
    statusCodes.delete(property);
  }
}

setCadlNamespace("Private", $plainData);
