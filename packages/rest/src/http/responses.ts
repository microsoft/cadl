import {
  createDiagnosticCollector,
  Diagnostic,
  DiagnosticCollector,
  getDoc,
  getIntrinsicModelName,
  isErrorModel,
  isIntrinsic,
  isVoidType,
  ModelType,
  ModelTypeProperty,
  OperationType,
  Program,
  Type,
  walkPropertiesInherited,
} from "@cadl-lang/compiler";
import { createDiagnostic } from "../diagnostics.js";
import {
  getHeaderFieldName,
  getStatusCodeDescription,
  getStatusCodes,
  isBody,
  isHeader,
  isStatusCode,
} from "./decorators.js";
import { gatherMetadata, isApplicableMetadata, Visibility } from "./route.js";

export type StatusCode = `${number}` | "*";
export interface HttpOperationResponse {
  statusCode: StatusCode;
  type: Type;
  description?: string;
  responses: HttpOperationResponseContent[];
}

export interface HttpOperationResponseContent {
  headers?: Record<string, ModelTypeProperty>;
  body?: HttpOperationBody;
}

export interface HttpOperationBody {
  contentTypes: string[];
  type: Type;
}

/**
 * Get the responses for a given operation.
 */
export function getResponsesForOperation(
  program: Program,
  operation: OperationType
): [HttpOperationResponse[], readonly Diagnostic[]] {
  const diagnostics = createDiagnosticCollector();
  const responseType = operation.returnType;
  const responses: Record<string | symbol, HttpOperationResponse> = {};
  if (responseType.kind === "Union") {
    for (const option of responseType.options) {
      if (isNullType(program, option)) {
        // TODO how should we treat this? https://github.com/microsoft/cadl/issues/356
        continue;
      }
      processResponseType(program, diagnostics, responses, option);
    }
  } else {
    processResponseType(program, diagnostics, responses, responseType);
  }

  return diagnostics.wrap(Object.values(responses));
}

function isNullType(program: Program, type: Type): boolean {
  return isIntrinsic(program, type) && getIntrinsicModelName(program, type) === "null";
}

function processResponseType(
  program: Program,
  diagnostics: DiagnosticCollector,
  responses: Record<string, HttpOperationResponse>,
  responseType: Type
) {
  const metadata = gatherMetadata(program, diagnostics, responseType, Visibility.Read);

  // Get explicity defined status codes
  const statusCodes: Array<string> = getResponseStatusCodes(program, responseType, metadata);

  // Get explicitly defined content types
  const contentTypes = getResponseContentTypes(program, diagnostics, metadata);

  // Get response headers
  const headers = getResponseHeaders(program, metadata);

  // Get body
  let bodyType = getResponseBody(program, diagnostics, responseType, metadata);

  // If there is no explicit status code, check if it should be 204
  if (statusCodes.length === 0) {
    if (bodyType === undefined || isVoidType(bodyType)) {
      bodyType = undefined;
      statusCodes.push("204");
    } else if (isErrorModel(program, responseType)) {
      statusCodes.push("*");
    } else {
      statusCodes.push("200");
    }
  }

  // If there is a body but no explicit content types, use application/json
  if (bodyType && contentTypes.length === 0) {
    contentTypes.push("application/json");
  }

  // Put them into currentEndpoint.responses
  for (const statusCode of statusCodes) {
    // the first model for this statusCode/content type pair carries the
    // description for the endpoint. This could probably be improved.
    const response: HttpOperationResponse = responses[statusCode] ?? {
      statusCode,
      type: responseType,
      description: getResponseDescription(program, responseType, statusCode),
      responses: [],
    };

    // check for duplicates
    for (const contentType of contentTypes) {
      if (response.responses.find((x) => x.body?.contentTypes.includes(contentType))) {
        diagnostics.add(
          createDiagnostic({
            code: "duplicate-response",
            format: { statusCode: statusCode.toString(), contentType },
            target: responseType,
          })
        );
      }
    }

    if (bodyType !== undefined) {
      response.responses.push({ body: { contentTypes: contentTypes, type: bodyType }, headers });
    } else if (contentTypes.length > 0) {
      diagnostics.add(
        createDiagnostic({
          code: "content-type-ignored",
          target: responseType,
        })
      );
    } else {
      response.responses.push({ headers });
    }
    responses[statusCode] = response;
  }
}

/**
 * Get explicity defined status codes from response type and metadata
 * Return is an array of strings, possibly empty, which indicates no explicitly defined status codes.
 * We do not check for duplicates here -- that will be done by the caller.
 */
function getResponseStatusCodes(
  program: Program,
  responseType: Type,
  metadata: Set<ModelTypeProperty>
): string[] {
  const codes: string[] = [];

  for (const prop of metadata) {
    if (isStatusCode(program, prop)) {
      codes.push(...getStatusCodes(program, prop));
    }
  }

  if (responseType.kind === "Model") {
    for (let t: ModelType | undefined = responseType; t; t = t.baseModel) {
      codes.push(...getStatusCodes(program, t));
    }
  }

  return codes;
}

/**
 * Get explicity defined content-types from response metadata
 * Return is an array of strings, possibly empty, which indicates no explicitly defined content-type.
 * We do not check for duplicates here -- that will be done by the caller.
 */
function getResponseContentTypes(
  program: Program,
  diagnostics: DiagnosticCollector,
  metadata: Set<ModelTypeProperty>
): string[] {
  const contentTypes: string[] = [];
  for (const prop of metadata) {
    if (isHeader(program, prop)) {
      const headerName = getHeaderFieldName(program, prop);
      if (headerName && headerName.toLowerCase() === "content-type") {
        contentTypes.push(...diagnostics.pipe(getContentTypes(prop)));
      }
    }
  }
  return contentTypes;
}

/**
 * Resolve the content types from a model property by looking at the value.
 * @property property Model property
 * @returns List of contnet types and any diagnostics if there was an issue.
 */
export function getContentTypes(property: ModelTypeProperty): [string[], readonly Diagnostic[]] {
  const diagnostics = createDiagnosticCollector();
  if (property.type.kind === "String") {
    return [[property.type.value], []];
  } else if (property.type.kind === "Union") {
    const contentTypes = [];
    for (const option of property.type.options) {
      if (option.kind === "String") {
        contentTypes.push(option.value);
      } else {
        diagnostics.add(
          createDiagnostic({
            code: "content-type-string",
            target: property,
          })
        );
        continue;
      }
    }

    return diagnostics.wrap(contentTypes);
  }

  return [[], [createDiagnostic({ code: "content-type-string", target: property })]];
}

/**
 * Get response headers from response metadata
 */
function getResponseHeaders(
  program: Program,
  metadata: Set<ModelTypeProperty>
): Record<string, ModelTypeProperty> {
  const responseHeaders: Record<string, ModelTypeProperty> = {};
  for (const prop of metadata) {
    const headerName = getHeaderFieldName(program, prop);
    if (isHeader(program, prop) && headerName !== "content-type") {
      responseHeaders[headerName] = prop;
    }
  }
  return responseHeaders;
}

function getResponseBody(
  program: Program,
  diagnostics: DiagnosticCollector,
  responseType: Type,
  metadata: Set<ModelTypeProperty>
): Type | undefined {
  // non-model or intrinsic model -> response body is response type
  if (responseType.kind !== "Model" || isIntrinsic(program, responseType)) {
    return responseType;
  }

  // look for explicit body
  let bodyProperty: ModelTypeProperty | undefined;
  for (const property of metadata) {
    if (isBody(program, property)) {
      if (bodyProperty) {
        diagnostics.add(createDiagnostic({ code: "duplicate-body", target: property }));
      } else {
        bodyProperty = property;
      }
    }
  }
  if (bodyProperty) {
    return bodyProperty.type;
  }

  // Without an explicit body, response type is response model itself if
  // there it has at least one non-metadata property, or if it has derived
  // models
  if (responseType.derivedModels.length > 0) {
    return responseType;
  }
  for (const property of walkPropertiesInherited(responseType)) {
    if (!isApplicableMetadata(program, property, Visibility.Read)) {
      return responseType;
    }
  }

  // Otherwise, there is no body
  return undefined;
}

function getResponseDescription(
  program: Program,
  responseModel: Type,
  statusCode: string
): string | undefined {
  const desc = getDoc(program, responseModel);
  if (desc) {
    return desc;
  }

  return getStatusCodeDescription(statusCode);
}
