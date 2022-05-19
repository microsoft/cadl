import {
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
} from "@cadl-lang/compiler";
import { reportDiagnostic } from "./diagnostics.js";
import {
  getHeaderFieldName,
  getStatusCodeDescription,
  getStatusCodes,
  isBody,
  isHeader,
  isStatusCode,
} from "./http.js";

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
): HttpOperationResponse[] {
  const responseType = operation.returnType;
  const responses: Record<string | symbol, HttpOperationResponse> = {};
  if (responseType.kind === "Union") {
    for (const option of responseType.options) {
      if (isNullType(program, option)) {
        // TODO how should we treat this? https://github.com/microsoft/cadl/issues/356
        continue;
      }
      processResponseType(program, responses, option);
    }
  } else {
    processResponseType(program, responses, responseType);
  }

  return Object.values(responses);
}

function isNullType(program: Program, type: Type): boolean {
  return isIntrinsic(program, type) && getIntrinsicModelName(program, type) === "null";
}

function processResponseType(
  program: Program,
  responses: Record<string, HttpOperationResponse>,
  responseModel: Type
) {
  // Get explicity defined status codes
  const statusCodes: Array<string> = getResponseStatusCodes(program, responseModel);

  // Get explicitly defined content types
  const contentTypes = getResponseContentTypes(program, responseModel);

  // Get response headers
  const headers = getResponseHeaders(program, responseModel);

  // Get explicitly defined body
  let bodyModel = getResponseBody(program, responseModel);
  // If there is no explicit body, it should be conjured from the return type
  // if it is a primitive type or it contains more than just response metadata
  if (!bodyModel) {
    if (responseModel.kind === "Model") {
      if (isIntrinsic(program, responseModel)) {
        bodyModel = responseModel;
      } else {
        const isResponseMetadata = (p: ModelTypeProperty) =>
          isHeader(program, p) || isStatusCode(program, p);
        const allProperties = (p: ModelType): ModelTypeProperty[] => {
          return [...p.properties.values(), ...(p.baseModel ? allProperties(p.baseModel) : [])];
        };
        if (
          allProperties(responseModel).some((p) => !isResponseMetadata(p)) ||
          responseModel.derivedModels.length > 0
        ) {
          bodyModel = responseModel;
        }
      }
    } else {
      // body is array or possibly something else
      bodyModel = responseModel;
    }
  }

  // If there is no explicit status code, check if it should be 204
  if (statusCodes.length === 0) {
    if (bodyModel === undefined || isVoidType(bodyModel)) {
      bodyModel = undefined;
      statusCodes.push("204");
    } else if (isErrorModel(program, responseModel)) {
      statusCodes.push("*");
    } else {
      statusCodes.push("200");
    }
  }

  // If there is a body but no explicit content types, use application/json
  if (bodyModel && contentTypes.length === 0) {
    contentTypes.push("application/json");
  }

  // Put them into currentEndpoint.responses
  for (const statusCode of statusCodes) {
    // the first model for this statusCode/content type pair carries the
    // description for the endpoint. This could probably be improved.
    const response: HttpOperationResponse = responses[statusCode] ?? {
      statusCode: statusCode,
      type: responseModel,
      description: getResponseDescription(program, responseModel, statusCode),
      responses: [],
    };

    // check for duplicates
    for (const contentType of contentTypes) {
      if (response.responses.find((x) => x.body?.contentTypes.includes(contentType))) {
        reportDiagnostic(program, {
          code: "duplicate-response",
          format: { statusCode: statusCode.toString(), contentType },
          target: responseModel,
        });
      }
    }

    if (bodyModel !== undefined) {
      response.responses.push({ body: { contentTypes: contentTypes, type: bodyModel }, headers });
    } else if (contentTypes.length > 0) {
      reportDiagnostic(program, {
        code: "content-type-ignored",
        target: responseModel,
      });
    } else {
      response.responses.push({ headers });
    }
    responses[statusCode] = response;
  }
}

/**
 * Get explicity defined status codes from response Model
 * Return is an array of strings, possibly empty, which indicates no explicitly defined status codes.
 * We do not check for duplicates here -- that will be done by the caller.
 */
function getResponseStatusCodes(program: Program, responseModel: Type): string[] {
  const codes: string[] = [];
  if (responseModel.kind === "Model") {
    if (responseModel.baseModel) {
      codes.push(...getResponseStatusCodes(program, responseModel.baseModel));
    }
    codes.push(...getStatusCodes(program, responseModel));
    for (const prop of responseModel.properties.values()) {
      if (isStatusCode(program, prop)) {
        codes.push(...getStatusCodes(program, prop));
      }
    }
  }
  return codes;
}

/**
 * Get explicity defined content-types from response Model
 * Return is an array of strings, possibly empty, which indicates no explicitly defined content-type.
 * We do not check for duplicates here -- that will be done by the caller.
 */
function getResponseContentTypes(program: Program, responseModel: Type): string[] {
  const contentTypes: string[] = [];
  if (responseModel.kind === "Model") {
    if (responseModel.baseModel) {
      contentTypes.push(...getResponseContentTypes(program, responseModel.baseModel));
    }
    for (const prop of responseModel.properties.values()) {
      if (isHeader(program, prop) && getHeaderFieldName(program, prop) === "content-type") {
        contentTypes.push(...getContentTypes(program, prop));
      }
    }
  }
  return contentTypes;
}

export function getContentTypes(program: Program, param: ModelTypeProperty): string[] {
  if (param.type.kind === "String") {
    return [param.type.value];
  } else if (param.type.kind === "Union") {
    const contentTypes = [];
    for (const option of param.type.options) {
      if (option.kind === "String") {
        contentTypes.push(option.value);
      } else {
        reportDiagnostic(program, {
          code: "content-type-string",
          target: param,
        });
        continue;
      }
    }

    return contentTypes;
  }

  reportDiagnostic(program, { code: "content-type-string", target: param });

  return [];
}

/**
 * Get response headers from response Model
 */
function getResponseHeaders(
  program: Program,
  responseModel: Type
): Record<string, ModelTypeProperty> {
  if (responseModel.kind === "Model") {
    const responseHeaders: any = responseModel.baseModel
      ? getResponseHeaders(program, responseModel.baseModel)
      : {};
    for (const prop of responseModel.properties.values()) {
      const headerName = getHeaderFieldName(program, prop);
      if (isHeader(program, prop) && headerName !== "content-type") {
        responseHeaders[headerName] = prop;
      }
    }
    return responseHeaders;
  }
  return {};
}

function getResponseBody(program: Program, responseModel: Type): Type | undefined {
  if (responseModel.kind === "Model") {
    const getAllBodyProps = (m: ModelType): ModelTypeProperty[] => {
      const bodyProps = [...m.properties.values()].filter((t) => isBody(program, t));
      if (m.baseModel) {
        bodyProps.push(...getAllBodyProps(m.baseModel));
      }
      return bodyProps;
    };
    const bodyProps = getAllBodyProps(responseModel);
    if (bodyProps.length > 0) {
      // Report all but first body as duplicate
      for (const prop of bodyProps.slice(1)) {
        reportDiagnostic(program, { code: "duplicate-body", target: prop });
      }
      return bodyProps[0].type;
    }
  }
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
