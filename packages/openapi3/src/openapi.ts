import {
  ArrayType,
  checkIfServiceNamespace,
  DecoratorContext,
  EmitOptionsFor,
  EnumMemberType,
  EnumType,
  getAllTags,
  getDoc,
  getFormat,
  getFriendlyName,
  getIntrinsicModelName,
  getKnownValues,
  getMaxLength,
  getMaxValue,
  getMinLength,
  getMinValue,
  getPattern,
  getProperty,
  getPropertyType,
  getServiceHost,
  getServiceNamespace,
  getServiceNamespaceString,
  getServiceTitle,
  getServiceVersion,
  getSummary,
  getVisibility,
  isErrorModel,
  isErrorType,
  isIntrinsic,
  isNumericType,
  isSecret,
  isStringType,
  isVoidType,
  mapChildModels,
  ModelType,
  ModelTypeProperty,
  NamespaceType,
  OperationType,
  Program,
  resolvePath,
  Type,
  UnionType,
  UnionTypeVariant,
  validateDecoratorTarget,
} from "@cadl-lang/compiler";
import {
  getExtensions,
  getExternalDocs,
  getOperationId,
  isDefaultResponse,
} from "@cadl-lang/openapi";
import {
  Discriminator,
  getAllRoutes,
  getDiscriminator,
  http,
  HttpOperationParameter,
  HttpOperationParameters,
  OperationDetails,
} from "@cadl-lang/rest";
import { getVersionRecords } from "@cadl-lang/versioning";
import { OpenAPILibrary, reportDiagnostic } from "./lib.js";
import { OpenAPI3Discriminator, OpenAPI3Schema } from "./types.js";

const {
  getHeaderFieldName,
  getPathParamName,
  getQueryParamName,
  isBody,
  isHeader,
  isStatusCode,
  getStatusCodes,
  getStatusCodeDescription,
} = http;

export async function $onEmit(p: Program, emitterOptions?: EmitOptionsFor<OpenAPILibrary>) {
  const options: OpenAPIEmitterOptions = {
    outputFile: p.compilerOptions.swaggerOutputFile || resolvePath("./openapi.json"),
  };

  const emitter = createOAPIEmitter(p, options);
  await emitter.emitOpenAPI();
}

const refTargetsKey = Symbol();

export function $useRef({ program }: DecoratorContext, entity: Type, refUrl: string): void {
  if (!validateDecoratorTarget(program, entity, "@useRef", ["Model", "ModelProperty"])) {
    return;
  }

  program.stateMap(refTargetsKey).set(entity, refUrl);
}

function getRef(program: Program, entity: Type): string | undefined {
  return program.stateMap(refTargetsKey).get(entity);
}

const oneOfKey = Symbol();
export function $oneOf({ program }: DecoratorContext, entity: Type) {
  if (!validateDecoratorTarget(program, entity, "@oneOf", "Union")) {
    return;
  }
  program.stateMap(oneOfKey).set(entity, true);
}

function getOneOf(program: Program, entity: Type): boolean {
  return program.stateMap(oneOfKey).get(entity);
}

// NOTE: These functions aren't meant to be used directly as decorators but as a
// helper functions for other decorators.  The security information given here
// will be inserted into the `security` and `securityDefinitions` sections of
// the emitted OpenAPI document.

const securityDetailsKey = Symbol();
interface SecurityDetails {
  definitions: any;
  requirements: any[];
}

function getSecurityDetails(program: Program, serviceNamespace: NamespaceType): SecurityDetails {
  const definitions = program.stateMap(securityDetailsKey);
  if (definitions.has(serviceNamespace)) {
    return definitions.get(serviceNamespace)!;
  } else {
    const details = { definitions: {}, requirements: [] };
    definitions.set(serviceNamespace, details);
    return details;
  }
}

function getSecurityRequirements(program: Program, serviceNamespace: NamespaceType) {
  return getSecurityDetails(program, serviceNamespace).requirements;
}

function getSecurityDefinitions(program: Program, serviceNamespace: NamespaceType) {
  return getSecurityDetails(program, serviceNamespace).definitions;
}

export function addSecurityRequirement(
  program: Program,
  namespace: NamespaceType,
  name: string,
  scopes: string[]
): void {
  if (!checkIfServiceNamespace(program, namespace)) {
    reportDiagnostic(program, {
      code: "security-service-namespace",
      target: namespace,
    });
  }

  const req: any = {};
  req[name] = scopes;
  const requirements = getSecurityRequirements(program, namespace);
  requirements.push(req);
}

export function addSecurityDefinition(
  program: Program,
  namespace: NamespaceType,
  name: string,
  details: any
): void {
  if (!checkIfServiceNamespace(program, namespace)) {
    reportDiagnostic(program, {
      code: "security-service-namespace",
      target: namespace,
    });
    return;
  }

  const definitions = getSecurityDefinitions(program, namespace);
  definitions[name] = details;
}

export interface OpenAPIEmitterOptions {
  outputFile: string;
}

function createOAPIEmitter(program: Program, options: OpenAPIEmitterOptions) {
  let root: any;
  let host: string | undefined;

  // Get the service namespace string for use in name shortening
  let serviceNamespace: string | undefined;
  let currentPath: any;
  let currentEndpoint: any;

  // Keep a list of all Types encountered that need schema definitions
  let schemas = new Set<Type>();

  // Map model properties that represent shared parameters to their parameter
  // definition that will go in #/components/parameters. Inlined parameters do not go in
  // this map.
  let params: Map<ModelTypeProperty, any>;

  // De-dupe the per-endpoint tags that will be added into the #/tags
  let tags: Set<string>;

  let childModelMap: ReadonlyMap<ModelType, readonly ModelType[]>;

  return { emitOpenAPI };

  function initializeEmitter(serviceNamespaceType: NamespaceType, version?: string) {
    root = {
      openapi: "3.0.0",
      info: {
        title: getServiceTitle(program),
        version: version ?? getServiceVersion(program),
        description: getDoc(program, serviceNamespaceType),
      },
      externalDocs: getExternalDocs(program, serviceNamespaceType),
      tags: [],
      paths: {},
      components: {
        parameters: {},
        requestBodies: {},
        responses: {},
        schemas: {},
        examples: {},
        securitySchemes: {},
      },
    };
    host = getServiceHost(program);
    if (host) {
      root.servers = [
        {
          url: "https://" + host,
        },
      ];
    }

    serviceNamespace = getServiceNamespaceString(program);
    currentPath = root.paths;
    currentEndpoint = undefined;
    schemas = new Set();
    params = new Map();
    tags = new Set();
    childModelMap = new Map();
  }

  async function emitOpenAPI() {
    const serviceNs = getServiceNamespace(program);
    if (!serviceNs) {
      return;
    }
    const versions = getVersionRecords(program, serviceNs);
    for (const record of versions) {
      record.projections.push({
        projectionName: "toTypescript",
        arguments: [],
      });
      if (record.version) {
        record.projections.push({
          projectionName: "atVersion",
          arguments: [record.version],
        });
      }

      if (record.version !== undefined) {
        program.enableProjections(record.projections);
      }

      await emitOpenAPIFromVersion(serviceNs, record.version);
    }
  }

  async function emitOpenAPIFromVersion(serviceNamespace: NamespaceType, version?: string) {
    initializeEmitter(serviceNamespace, version);
    try {
      childModelMap = mapChildModels(program);
      getAllRoutes(program).forEach(emitOperation);
      emitReferences();
      emitTags();

      // Clean up empty entries
      for (const elem of Object.keys(root.components)) {
        if (Object.keys(root.components[elem]).length === 0) {
          delete root.components[elem];
        }
      }

      if (!program.compilerOptions.noEmit && !program.hasError()) {
        // Write out the OpenAPI document to the output path
        const outPath = version
          ? resolvePath(options.outputFile.replace(".json", `.${version}.json`))
          : resolvePath(options.outputFile);

        await program.host.writeFile(outPath, prettierOutput(JSON.stringify(root, null, 2)));
      }
    } catch (err) {
      if (err instanceof ErrorTypeFoundError) {
        // Return early, there must be a parse error if an ErrorType was
        // inserted into the Cadl output
        return;
      } else {
        throw err;
      }
    }
  }

  function emitOperation(operation: OperationDetails): void {
    const { path: fullPath, operation: op, groupName, verb, parameters } = operation;

    // If path contains a query string, issue msg and don't emit this endpoint
    if (fullPath.indexOf("?") > 0) {
      reportDiagnostic(program, { code: "path-query", target: op });
      return;
    }

    if (!root.paths[fullPath]) {
      root.paths[fullPath] = {};
    }

    currentPath = root.paths[fullPath];
    if (!currentPath[verb]) {
      currentPath[verb] = {};
    }
    currentEndpoint = currentPath[verb];

    const operationId = getOperationId(program, op);
    if (operationId) {
      currentEndpoint.operationId = operationId;
    } else {
      // Synthesize an operation ID
      currentEndpoint.operationId = (groupName.length > 0 ? `${groupName}_` : "") + op.name;
    }
    applyExternalDocs(op, currentEndpoint);

    // allow operation extensions
    attachExtensions(program, op, currentEndpoint);
    currentEndpoint.summary = getSummary(program, op);
    currentEndpoint.description = getDoc(program, op);
    currentEndpoint.parameters = [];
    currentEndpoint.responses = {};

    const currentTags = getAllTags(program, op);
    if (currentTags) {
      currentEndpoint.tags = currentTags;
      for (const tag of currentTags) {
        // Add to root tags if not already there
        tags.add(tag);
      }
    }

    emitEndpointParameters(op, op.parameters, parameters.parameters);
    emitRequestBody(op, op.parameters, parameters);
    emitResponses(op.returnType);
  }

  function emitResponses(responseType: Type) {
    if (responseType.kind === "Union") {
      for (const option of responseType.options) {
        emitResponseObject(option);
      }
    } else {
      emitResponseObject(responseType);
    }
  }

  function isBinaryPayload(body: Type, contentType: string) {
    return (
      body.kind === "Model" &&
      body.name === "bytes" &&
      contentType !== "application/json" &&
      contentType !== "text/plain"
    );
  }

  function emitResponseObject(responseModel: Type) {
    // Get explicity defined status codes
    const statusCodes = getResponseStatusCodes(responseModel);

    // Get explicitly defined content types
    const contentTypes = getResponseContentTypes(responseModel);

    // Get response headers
    const headers = getResponseHeaders(responseModel);

    // Get explicitly defined body
    let bodyModel = getResponseBody(responseModel);
    // If there is no explicit body, it should be conjured from the return type
    // if it is a primitive type or it contains more than just response metadata
    if (!bodyModel) {
      if (responseModel.kind === "Model") {
        if (mapCadlTypeToOpenAPI(responseModel)) {
          bodyModel = responseModel;
        } else {
          const isResponseMetadata = (p: ModelTypeProperty) =>
            isHeader(program, p) || isStatusCode(program, p);
          const allProperties = (p: ModelType): ModelTypeProperty[] => {
            return [...p.properties.values(), ...(p.baseModel ? allProperties(p.baseModel) : [])];
          };
          if (allProperties(responseModel).some((p) => !isResponseMetadata(p))) {
            bodyModel = responseModel;
          }
        }
      } else {
        // body is array or possibly something else
        bodyModel = responseModel;
      }
    }

    // If there is no explicit status code, set the default
    if (statusCodes.length === 0) {
      statusCodes.push(getDefaultStatusCode(responseModel, bodyModel));
    }

    // If there is a body but no explicit content types, use application/json
    if (bodyModel && !isVoidType(bodyModel) && contentTypes.length === 0) {
      contentTypes.push("application/json");
    }

    if (!bodyModel && contentTypes.length > 0) {
      reportDiagnostic(program, {
        code: "content-type-ignored",
        target: responseModel,
      });
    }

    // Assertion: bodyModel <=> contentTypes.length > 0

    // Put them into currentEndpoint.responses

    for (const statusCode of statusCodes) {
      // the first model for this statusCode/content type pair carries the
      // description for the endpoint. This could probably be improved.
      const response = currentEndpoint.responses[statusCode] ?? {
        description: getResponseDescription(responseModel, statusCode),
      };

      // check for duplicates
      if (response.content) {
        for (const contentType of contentTypes) {
          if (response.content[contentType]) {
            reportDiagnostic(program, {
              code: "duplicate-response",
              format: { statusCode, contentType },
              target: responseModel,
            });
          }
        }
      }

      if (Object.keys(headers).length > 0) {
        response.headers ??= {};

        // OpenAPI can't represent different headers per content type.
        // So we merge headers here, and report any duplicates.
        // It may be possible in principle to not error for identically declared
        // headers.
        for (const [key, value] of Object.entries(headers)) {
          if (response.headers[key]) {
            reportDiagnostic(program, {
              code: "duplicate-header",
              format: { header: key },
              target: responseModel,
            });
            continue;
          }

          response.headers[key] = value;
        }
      }

      for (const contentType of contentTypes) {
        response.content ??= {};
        const isBinary = isBinaryPayload(bodyModel!, contentType);
        const schema = isBinary ? { type: "string", format: "binary" } : getSchemaOrRef(bodyModel!);
        response.content[contentType] = { schema };
      }
      currentEndpoint.responses[statusCode] = response;
    }
  }

  /**
   * Return the default status code for the given response/body
   * @param model representing the body
   */
  function getDefaultStatusCode(responseModel: Type, bodyModel: Type | undefined) {
    if (bodyModel === undefined || isVoidType(bodyModel)) {
      return "204";
    } else {
      return isErrorModel(program, responseModel) ? "default" : "200";
    }
  }

  // Get explicity defined status codes from response Model
  // Return is an array of strings, possibly empty, which indicates no explicitly defined status codes.
  // We do not check for duplicates here -- that will be done by the caller.
  function getResponseStatusCodes(responseModel: Type): string[] {
    const codes: string[] = [];
    if (responseModel.kind === "Model") {
      if (responseModel.baseModel) {
        codes.push(...getResponseStatusCodes(responseModel.baseModel));
      }
      for (const prop of responseModel.properties.values()) {
        if (isStatusCode(program, prop)) {
          codes.push(...getStatusCodes(program, prop));
        }
      }
    }
    if (isDefaultResponse(program, responseModel)) {
      if (codes.length > 0) {
        reportDiagnostic(program, {
          code: "status-code-in-default-response",
          target: responseModel,
        });
      } else {
        codes.push("default");
      }
    }
    return codes;
  }

  function getResponseDescription(responseModel: Type, statusCode: string) {
    const desc = getDoc(program, responseModel);
    if (desc) {
      return desc;
    }

    if (statusCode === "default") {
      return "An unexpected error response";
    }
    return getStatusCodeDescription(statusCode) ?? "unknown";
  }

  // Get explicity defined content-types from response Model
  // Return is an array of strings, possibly empty, which indicates no explicitly defined content-type.
  // We do not check for duplicates here -- that will be done by the caller.
  function getResponseContentTypes(responseModel: Type): string[] {
    const contentTypes: string[] = [];
    if (responseModel.kind === "Model") {
      if (responseModel.baseModel) {
        contentTypes.push(...getResponseContentTypes(responseModel.baseModel));
      }
      for (const prop of responseModel.properties.values()) {
        if (isHeader(program, prop) && getHeaderFieldName(program, prop) === "content-type") {
          contentTypes.push(...getContentTypes(prop));
        }
      }
    }
    return contentTypes;
  }

  // Get response headers from response Model
  function getResponseHeaders(responseModel: Type) {
    if (responseModel.kind === "Model") {
      const responseHeaders: any = responseModel.baseModel
        ? getResponseHeaders(responseModel.baseModel)
        : {};
      for (const prop of responseModel.properties.values()) {
        const headerName = getHeaderFieldName(program, prop);
        if (isHeader(program, prop) && headerName !== "content-type") {
          responseHeaders[headerName] = getResponseHeader(prop);
        }
      }
      return responseHeaders;
    }
    return {};
  }

  // Get explicity defined response body from response Model
  // Search inheritance chain and error on any duplicates found
  function getResponseBody(responseModel: Type): Type | undefined {
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

  function getResponseHeader(prop: ModelTypeProperty) {
    const header: any = {};
    populateParameter(header, prop, undefined);
    delete header.in;
    delete header.name;
    delete header.required;
    return header;
  }

  function getSchemaOrRef(type: Type): any {
    const refUrl = getRef(program, type);
    if (refUrl) {
      return {
        $ref: refUrl,
      };
    }

    if (type.kind === "Model" && type.name === getIntrinsicModelName(program, type)) {
      // if the model is one of the Cadl Intrinsic type.
      // it's a base Cadl "primitive" that corresponds directly to an OpenAPI
      // primitive. In such cases, we don't want to emit a ref and instead just
      // emit the base type directly.
      const builtIn = mapCadlIntrinsicModelToOpenAPI(type);
      if (builtIn !== undefined) {
        return builtIn;
      }
    }

    if (type.kind === "String" || type.kind === "Number" || type.kind === "Boolean") {
      // For literal types, we just want to emit them directly as well.
      return mapCadlTypeToOpenAPI(type);
    }
    const name = getTypeNameForSchemaProperties(type);
    if (!isRefSafeName(name)) {
      // Schema's name is not reference-able in OpenAPI so we inline it.
      // This will usually happen with instantiated/anonymous types, but could also
      // happen if Cadl identifier uses characters that are problematic for OpenAPI.
      // Users will have to rename / alias type to have it get ref'ed.
      const schema = getSchemaForType(type);

      if (schema === undefined && isErrorType(type)) {
        // Exit early so that syntax errors are exposed.  This error will
        // be caught and handled in emitOpenAPI.
        throw new ErrorTypeFoundError();
      }

      // helps to read output and correlate to Cadl
      if (schema) {
        schema["x-cadl-name"] = name;
      }
      return schema;
    } else {
      const placeholder = {
        $ref: "#/components/schemas/" + name,
      };
      schemas.add(type);
      return placeholder;
    }
  }

  function getParamPlaceholder(parent: ModelType | undefined, property: ModelTypeProperty) {
    let spreadParam = false;

    if (property.sourceProperty) {
      // chase our sources all the way back to the first place this property
      // was defined.
      spreadParam = true;
      property = property.sourceProperty;
      while (property.sourceProperty) {
        property = property.sourceProperty;
      }
    }

    const refUrl = getRef(program, property);
    if (refUrl) {
      return {
        $ref: refUrl,
      };
    }

    if (params.has(property)) {
      return params.get(property);
    }

    const placeholder = {};
    // only parameters inherited by spreading or from interface are shared in #/parameters
    // bt: not sure about the interface part of this comment?

    if (spreadParam) {
      params.set(property, placeholder);
    }

    return placeholder;
  }

  function emitEndpointParameters(
    op: OperationType,
    parent: ModelType | undefined,
    parameters: HttpOperationParameter[]
  ) {
    for (const { type, name, param } of parameters) {
      // If param is a global parameter, just skip it
      if (params.has(param)) {
        currentEndpoint.parameters.push(params.get(param));
        continue;
      }

      switch (type) {
        case "path":
          emitParameter(parent, param, "path");
          break;
        case "query":
          emitParameter(parent, param, "query");
          break;
        case "header":
          if (name !== "content-type") {
            emitParameter(parent, param, "header");
          }
          break;
      }
    }
  }

  function emitRequestBody(
    op: OperationType,
    parent: ModelType | undefined,
    parameters: HttpOperationParameters
  ) {
    if (parameters.body === undefined) {
      return;
    }

    const bodyParam = parameters.body;
    const bodyType = bodyParam.type;

    const requestBody: any = {
      description: getDoc(program, bodyParam),
      content: {},
    };

    const contentTypeParam = parameters.parameters.find(
      (p) => p.type === "header" && p.name === "content-type"
    );
    const contentTypes = contentTypeParam
      ? getContentTypes(contentTypeParam.param)
      : ["application/json"];
    for (const contentType of contentTypes) {
      const isBinary = isBinaryPayload(bodyType, contentType);
      const bodySchema = isBinary ? { type: "string", format: "binary" } : getSchemaOrRef(bodyType);
      const contentEntry: any = {
        schema: bodySchema,
      };
      requestBody.content[contentType] = contentEntry;
    }

    currentEndpoint.requestBody = requestBody;
  }

  function getContentTypes(param: ModelTypeProperty): string[] {
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

  function emitParameter(parent: ModelType | undefined, param: ModelTypeProperty, kind: string) {
    const ph = getParamPlaceholder(parent, param);
    currentEndpoint.parameters.push(ph);

    // If the parameter already has a $ref, don't bother populating it
    if (!("$ref" in ph)) {
      populateParameter(ph, param, kind);
    }
  }

  function populateParameter(ph: any, param: ModelTypeProperty, kind: string | undefined) {
    ph.name = param.name;
    ph.in = kind;
    ph.required = !param.optional;
    ph.description = getDoc(program, param);

    // Apply decorators to the schema for the parameter.
    const schema = applyIntrinsicDecorators(param, getSchemaForType(param.type));
    if (param.type.kind === "Array") {
      schema.items = getSchemaForType(param.type.elementType);
    }
    if (param.default) {
      schema.default = getDefaultValue(param.default);
    }
    attachExtensions(program, param, ph);
    ph.schema = schema;
  }

  function emitReferences() {
    for (const [property, param] of params) {
      const key = getParameterKey(property, param);

      root.components.parameters[key] = { ...param };

      for (const key of Object.keys(param)) {
        delete param[key];
      }

      param["$ref"] = "#/components/parameters/" + key;
    }

    for (const type of schemas) {
      const name = getTypeNameForSchemaProperties(type);
      const schemaForType = getSchemaForType(type);
      if (schemaForType) {
        root.components.schemas[name] = schemaForType;
      }
    }
  }

  function emitTags() {
    for (const tag of tags) {
      root.tags.push({ name: tag });
    }
  }

  function getParameterKey(property: ModelTypeProperty, param: any) {
    const parent = program.checker!.getTypeForNode(property.node.parent!) as ModelType;
    let key = program.checker!.getTypeName(parent);
    let isQualifiedParamName = false;

    if (parent.properties.size > 1) {
      key += `.${property.name}`;
      isQualifiedParamName = true;
    }

    // Try to shorten the type name to exclude the top-level service namespace
    let baseKey = getRefSafeName(key);
    if (serviceNamespace && key.startsWith(serviceNamespace)) {
      baseKey = key.substring(serviceNamespace.length + 1);

      // If no parameter exists with the shortened name, use it, otherwise use the fully-qualified name
      if (!root.components.parameters[baseKey] || isQualifiedParamName) {
        key = baseKey;
      }
    }

    return key;
  }

  function getSchemaForType(type: Type) {
    const builtinType = mapCadlTypeToOpenAPI(type);
    if (builtinType !== undefined) return builtinType;

    if (type.kind === "Array") {
      return getSchemaForArray(type);
    } else if (type.kind === "Model") {
      return getSchemaForModel(type);
    } else if (type.kind === "Union") {
      return getSchemaForUnion(type);
    } else if (type.kind === "UnionVariant") {
      return getSchemaForUnionVariant(type);
    } else if (type.kind === "Enum") {
      return getSchemaForEnum(type);
    }

    reportDiagnostic(program, {
      code: "invalid-schema",
      format: { type: type.kind },
      target: type,
    });
    return undefined;
  }

  function getSchemaForEnum(e: EnumType) {
    const values = [];
    if (e.members.length == 0) {
      reportUnsupportedUnion("empty");
      return undefined;
    }
    const type = enumMemberType(e.members[0]);
    for (const option of e.members) {
      if (type !== enumMemberType(option)) {
        reportUnsupportedUnion();
        continue;
      }

      values.push(option.value ?? option.name);
    }

    const schema: any = { type, description: getDoc(program, e) };
    if (values.length > 0) {
      schema.enum = values;
    }

    return schema;
    function enumMemberType(member: EnumMemberType) {
      if (typeof member.value === "number") {
        return "number";
      }
      return "string";
    }

    function reportUnsupportedUnion(messageId: "default" | "empty" = "default") {
      reportDiagnostic(program, { code: "union-unsupported", messageId, target: e });
    }
  }

  function getSchemaForUnion(union: UnionType) {
    let type: string;
    const nonNullOptions = union.options.filter((t) => !isNullType(t));
    const nullable = union.options.length != nonNullOptions.length;
    if (nonNullOptions.length === 0) {
      reportDiagnostic(program, { code: "union-null", target: union });
      return {};
    }

    const kind = nonNullOptions[0].kind;
    switch (kind) {
      case "String":
        type = "string";
        break;
      case "Number":
        type = "number";
        break;
      case "Boolean":
        type = "boolean";
        break;
      case "Model":
        type = "model";
        break;
      case "UnionVariant":
        type = "model";
        break;
      case "Array":
        type = "array";
        break;
      default:
        reportUnsupportedUnionType(nonNullOptions[0]);
        return {};
    }

    if (type === "model" || type === "array") {
      if (nonNullOptions.length === 1) {
        // Get the schema for the model type
        const schema: any = getSchemaForType(nonNullOptions[0]);
        if (nullable) {
          schema["nullable"] = true;
        }

        return schema;
      } else {
        const ofType = getOneOf(program, union) ? "oneOf" : "anyOf";
        const schema: any = { [ofType]: nonNullOptions.map((s) => getSchemaOrRef(s)) };
        return schema;
      }
    }

    const values = [];
    for (const option of nonNullOptions) {
      if (option.kind != kind) {
        reportUnsupportedUnion();
      }

      // We already know it's not a model type
      values.push((option as any).value);
    }

    const schema: any = { type };
    if (values.length > 0) {
      schema.enum = values;
    }
    if (nullable) {
      schema["nullable"] = true;
    }

    return schema;

    function reportUnsupportedUnionType(type: Type) {
      reportDiagnostic(program, {
        code: "union-unsupported",
        messageId: "type",
        format: { kind: type.kind },
        target: type,
      });
    }

    function reportUnsupportedUnion() {
      reportDiagnostic(program, { code: "union-unsupported", target: union });
    }
  }

  function getSchemaForUnionVariant(variant: UnionTypeVariant) {
    const schema: any = getSchemaForType(variant.type);
    return schema;
  }

  function getSchemaForArray(array: ArrayType) {
    const target = array.elementType;

    return {
      type: "array",
      items: getSchemaOrRef(target),
    };
  }

  function isNullType(type: Type): boolean {
    return isIntrinsic(program, type) && getIntrinsicModelName(program, type) === "null";
  }

  function getDefaultValue(type: Type): any {
    switch (type.kind) {
      case "String":
        return type.value;
      case "Number":
        return type.value;
      case "Boolean":
        return type.value;
      case "Tuple":
        return type.values.map(getDefaultValue);
      default:
        reportDiagnostic(program, {
          code: "invalid-default",
          format: { type: type.kind },
          target: type,
        });
    }
  }

  function getSchemaForModel(model: ModelType) {
    let modelSchema: OpenAPI3Schema & Required<Pick<OpenAPI3Schema, "properties">> = {
      type: "object",
      properties: {},
      description: getDoc(program, model),
    };
    const childModels = childModelMap.get(model) ?? [];

    // getSchemaOrRef on all children to push them into components.schemas
    for (const child of childModels) {
      getSchemaOrRef(child);
    }

    const discriminator = getDiscriminator(program, model);
    if (discriminator) {
      if (!validateDiscriminator(discriminator, childModels)) {
        // appropriate diagnostic is generated with the validate function
        return {};
      }

      const openApiDiscriminator: OpenAPI3Discriminator = { ...discriminator };
      const mapping = getDiscriminatorMapping(discriminator, childModels);
      if (mapping) {
        openApiDiscriminator.mapping = mapping;
      }

      modelSchema.discriminator = openApiDiscriminator;
      modelSchema.properties[discriminator.propertyName] = {
        type: "string",
        description: `Discriminator property for ${model.name}.`,
      };
    }

    applyExternalDocs(model, modelSchema);

    for (const [name, prop] of model.properties) {
      if (!isSchemaProperty(prop)) {
        continue;
      }

      const description = getDoc(program, prop);
      if (!prop.optional) {
        if (!modelSchema.required) {
          modelSchema.required = [];
        }
        modelSchema.required.push(name);
      }

      // Apply decorators on the property to the type's schema
      modelSchema.properties[name] = applyIntrinsicDecorators(prop, getSchemaOrRef(prop.type));
      if (description) {
        modelSchema.properties[name].description = description;
      }

      if (prop.default) {
        modelSchema.properties[name].default = getDefaultValue(prop.default);
      }

      // Should the property be marked as readOnly?
      const vis = getVisibility(program, prop);
      if (vis && vis.includes("read") && vis.length == 1) {
        modelSchema.properties[name].readOnly = true;
      }

      // Attach any additional OpenAPI extensions
      attachExtensions(program, prop, modelSchema.properties[name]);
    }

    // Special case: if a model type extends a single *templated* base type and
    // has no properties of its own, absorb the definition of the base model
    // into this schema definition.  The assumption here is that any model type
    // defined like this is just meant to rename the underlying instance of a
    // templated type.
    if (
      model.baseModel &&
      model.baseModel.templateArguments &&
      model.baseModel.templateArguments.length > 0 &&
      Object.keys(modelSchema.properties).length === 0
    ) {
      // Take the base model schema but carry across the documentation property
      // that we set before
      const baseSchema = getSchemaForType(model.baseModel);
      modelSchema = {
        ...baseSchema,
        description: modelSchema.description,
      };
    } else if (model.baseModel) {
      modelSchema.allOf = [getSchemaOrRef(model.baseModel)];
    }

    // Attach any OpenAPI extensions
    attachExtensions(program, model, modelSchema);
    return modelSchema;
  }

  function attachExtensions(program: Program, type: Type, emitObject: any) {
    // Attach any OpenAPI extensions
    const extensions = getExtensions(program, type);
    if (extensions) {
      for (const key of extensions.keys()) {
        emitObject[key] = extensions.get(key);
      }
    }
  }

  function validateDiscriminator(
    discriminator: Discriminator,
    childModels: readonly ModelType[]
  ): boolean {
    const { propertyName } = discriminator;
    const retVals = childModels.map((t) => {
      const prop = getProperty(t, propertyName);
      if (!prop) {
        reportDiagnostic(program, { code: "discriminator", messageId: "missing", target: t });
        return false;
      }
      let retval = true;
      if (!isOasString(prop.type)) {
        reportDiagnostic(program, { code: "discriminator", messageId: "type", target: prop });
        retval = false;
      }
      if (prop.optional) {
        reportDiagnostic(program, { code: "discriminator", messageId: "required", target: prop });
        retval = false;
      }
      return retval;
    });
    // Map of discriminator value to the model in which it is declared
    const discriminatorValues = new Map<string, string>();
    for (const t of childModels) {
      // Get the discriminator property directly in the child model
      const prop = t.properties?.get(propertyName);
      // Issue warning diagnostic if discriminator property missing or is not a string literal
      if (!prop || !isStringLiteral(prop.type)) {
        reportDiagnostic(program, {
          code: "discriminator-value",
          messageId: "literal",
          target: prop || t,
        });
      }
      if (prop) {
        const vals = getStringValues(prop.type);
        vals.forEach((val) => {
          if (discriminatorValues.has(val)) {
            reportDiagnostic(program, {
              code: "discriminator",
              messageId: "duplicate",
              format: { val: val, model1: discriminatorValues.get(val)!, model2: t.name },
              target: prop,
            });
            retVals.push(false);
          } else {
            discriminatorValues.set(val, t.name);
          }
        });
      }
    }
    return retVals.every((v) => v);
  }

  function getDiscriminatorMapping(
    discriminator: any,
    childModels: readonly ModelType[]
  ): Record<string, string> | undefined {
    const { propertyName } = discriminator;
    const getMapping = (t: ModelType): any => {
      const prop = t.properties?.get(propertyName);
      if (prop) {
        return getStringValues(prop.type).flatMap((v) => [{ [v]: getSchemaOrRef(t).$ref }]);
      }
      return undefined;
    };
    const mappings = childModels.flatMap(getMapping).filter((v) => v); // only defined values
    return mappings.length > 0 ? mappings.reduce((a, s) => ({ ...a, ...s }), {}) : undefined;
  }

  // An openapi "string" can be defined in several different ways in Cadl
  function isOasString(type: Type): boolean {
    if (type.kind === "String") {
      // A string literal
      return true;
    } else if (type.kind === "Model" && type.name === "string") {
      // string type
      return true;
    } else if (type.kind === "Union") {
      // A union where all variants are an OasString
      return type.options.every((o) => isOasString(o));
    }
    return false;
  }

  function isStringLiteral(type: Type): boolean {
    return (
      type.kind === "String" ||
      (type.kind === "Union" && type.options.every((o) => o.kind === "String"))
    );
  }

  // Return any string literal values for type
  function getStringValues(type: Type): string[] {
    if (type.kind === "String") {
      return [type.value];
    } else if (type.kind === "Union") {
      return type.options.flatMap(getStringValues).filter((v) => v);
    }
    return [];
  }

  /**
   * A "schema property" here is a property that is emitted to OpenAPI schema.
   *
   * Headers, parameters, status codes are not schema properties even they are
   * represented as properties in Cadl.
   */
  function isSchemaProperty(property: ModelTypeProperty) {
    const headerInfo = getHeaderFieldName(program, property);
    const queryInfo = getQueryParamName(program, property);
    const pathInfo = getPathParamName(program, property);
    const statusCodeinfo = isStatusCode(program, property);
    return !(headerInfo || queryInfo || pathInfo || statusCodeinfo);
  }

  function getTypeNameForSchemaProperties(type: Type) {
    // If there's a friendly name for the type, use that instead
    let typeName = getFriendlyName(program, type);
    if (typeName) {
      return typeName;
    }

    // Try to shorten the type name to exclude the top-level service namespace
    typeName = program!.checker!.getTypeName(type).replace(/<([\w.]+)>/, "_$1");

    if (isRefSafeName(typeName)) {
      if (serviceNamespace) {
        typeName = typeName.replace(RegExp(serviceNamespace + "\\.", "g"), "");
      }
      // exclude the Cadl namespace in type names
      typeName = typeName.replace(/($|_)(Cadl\.)/g, "$1");
    }

    return typeName;
  }

  function applyIntrinsicDecorators(cadlType: ModelType | ModelTypeProperty, target: any): any {
    const newTarget = { ...target };

    const docStr = getDoc(program, cadlType);
    const isString = isStringType(program, getPropertyType(cadlType));
    const isNumeric = isNumericType(program, getPropertyType(cadlType));

    if (isString && !target.documentation && docStr) {
      newTarget.description = docStr;
    }

    const summaryStr = getSummary(program, cadlType);
    if (isString && !target.summary && summaryStr) {
      newTarget.summary = summaryStr;
    }

    const formatStr = getFormat(program, cadlType);
    if (isString && !target.format && formatStr) {
      newTarget.format = formatStr;
    }

    const pattern = getPattern(program, cadlType);
    if (isString && !target.pattern && pattern) {
      newTarget.pattern = pattern;
    }

    const minLength = getMinLength(program, cadlType);
    if (isString && !target.minLength && minLength !== undefined) {
      newTarget.minLength = minLength;
    }

    const maxLength = getMaxLength(program, cadlType);
    if (isString && !target.maxLength && maxLength !== undefined) {
      newTarget.maxLength = maxLength;
    }

    const minValue = getMinValue(program, cadlType);
    if (isNumeric && !target.minimum && minValue !== undefined) {
      newTarget.minimum = minValue;
    }

    const maxValue = getMaxValue(program, cadlType);
    if (isNumeric && !target.maximum && maxValue !== undefined) {
      newTarget.maximum = maxValue;
    }

    if (isSecret(program, cadlType)) {
      newTarget.format = "password";
    }

    if (isString) {
      const values = getKnownValues(program, cadlType);
      if (values) {
        return {
          oneOf: [newTarget, getSchemaForEnum(values)],
        };
      }
    }

    return newTarget;
  }

  function applyExternalDocs(cadlType: Type, target: Record<string, unknown>) {
    const externalDocs = getExternalDocs(program, cadlType);
    if (externalDocs) {
      target.externalDocs = externalDocs;
    }
  }

  // Map an Cadl type to an OA schema. Returns undefined when the resulting
  // OA schema is just a regular object schema.
  function mapCadlTypeToOpenAPI(cadlType: Type): any {
    switch (cadlType.kind) {
      case "Number":
        return { type: "number", enum: [cadlType.value] };
      case "String":
        return { type: "string", enum: [cadlType.value] };
      case "Boolean":
        return { type: "boolean", enum: [cadlType.value] };
      case "Model":
        return mapCadlIntrinsicModelToOpenAPI(cadlType);
    }
    // // The base model doesn't correspond to a primitive OA type, but it could
    // // derive from one. Let's check.
    // if (cadlType.kind === "Model" && cadlType.baseModel) {
    //   const baseSchema = mapCadlTypeToOpenAPI(cadlType.baseModel);
    //   if (baseSchema) {
    //     return applyIntrinsicDecorators(cadlType, baseSchema);
    //   }
    // }
  }

  /**
   * Map Cadl intrinsic models to open api definitions
   */
  function mapCadlIntrinsicModelToOpenAPI(cadlType: ModelType): any | undefined {
    if (!isIntrinsic(program, cadlType)) {
      return undefined;
    }
    const name = getIntrinsicModelName(program, cadlType);
    switch (name) {
      case "bytes":
        return { type: "string", format: "byte" };
      case "int8":
        return applyIntrinsicDecorators(cadlType, { type: "integer", format: "int8" });
      case "int16":
        return applyIntrinsicDecorators(cadlType, { type: "integer", format: "int16" });
      case "int32":
        return applyIntrinsicDecorators(cadlType, { type: "integer", format: "int32" });
      case "int64":
        return applyIntrinsicDecorators(cadlType, { type: "integer", format: "int64" });
      case "safeint":
        return applyIntrinsicDecorators(cadlType, { type: "integer", format: "int64" });
      case "uint8":
        return applyIntrinsicDecorators(cadlType, { type: "integer", format: "uint8" });
      case "uint16":
        return applyIntrinsicDecorators(cadlType, { type: "integer", format: "uint16" });
      case "uint32":
        return applyIntrinsicDecorators(cadlType, { type: "integer", format: "uint32" });
      case "uint64":
        return applyIntrinsicDecorators(cadlType, { type: "integer", format: "uint64" });
      case "float64":
        return applyIntrinsicDecorators(cadlType, { type: "number", format: "double" });
      case "float32":
        return applyIntrinsicDecorators(cadlType, { type: "number", format: "float" });
      case "string":
        return applyIntrinsicDecorators(cadlType, { type: "string" });
      case "boolean":
        return { type: "boolean" };
      case "plainDate":
        return { type: "string", format: "date" };
      case "zonedDateTime":
        return { type: "string", format: "date-time" };
      case "plainTime":
        return { type: "string", format: "time" };
      case "duration":
        return { type: "string", format: "duration" };
      case "Map":
        // We assert on valType because Map types always have a type
        const valType = cadlType.properties.get("v");
        return {
          type: "object",
          additionalProperties: getSchemaOrRef(valType!.type),
        };
    }
  }
}

function isRefSafeName(name: string) {
  return /^[A-Za-z0-9-_.]+$/.test(name);
}

function getRefSafeName(name: string) {
  return name.replace(/^[A-Za-z0-9-_.]/g, "_");
}

function prettierOutput(output: string) {
  return output + "\n";
}

class ErrorTypeFoundError extends Error {
  constructor() {
    super("Error type found in evaluated Cadl output");
  }
}
