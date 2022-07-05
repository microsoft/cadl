// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { createCadlLibrary, JSONSchemaType, paramMessage } from "@cadl-lang/compiler";

/**
 * Options that the gRPC emitter accepts.
 */
export interface GrpcEmitterOptions {
  /**
   * The directory where the emitter will write the Protobuf output tree.
   */
  outputDirectory?: string;
}

const EmitterOptionsSchema: JSONSchemaType<GrpcEmitterOptions> = {
  type: "object",
  additionalProperties: false,
  properties: {
    outputDirectory: { type: "string", nullable: true },
  },
  required: [],
};

export const CadlGrpcLibrary = createCadlLibrary({
  name: "cadl-grpc",
  diagnostics: {
    "field-index": {
      severity: "error",
      messages: {
        invalid: paramMessage`field index ${"index"} is invalid (must be an integer greater than zero)`,
        "out-of-bounds": paramMessage`field index ${"index"} is out of bounds (must be less than ${"max"})`,
        reserved: paramMessage`field index ${"index"} falls within the implementation-reserved range of 19000-19999 (try an index value of 20,000 or higher)`,
      },
    },
    "root-operation": {
      severity: "error",
      messages: {
        default: "operations in the root namespace are not supported (no associated gRPC service)",
      },
    },
    "unsupported-return-type": {
      severity: "error",
      messages: {
        default: "gRPC operations must return a named Model",
      },
    },
    "unsupported-input-type": {
      severity: "error",
      messages: {
        "wrong-number":
          "gRPC operations must accept exactly one Model input (an empty model will do)",
        "wrong-type": "gRPC operations may only accept a named Model as an input",
        unconvertible: "input parameters cannot be converted to a gRPC model",
      },
    },
    "unsupported-field-type": {
      severity: "error",
      messages: {
        unconvertible: paramMessage`cannot convert a ${"type"} to a protobuf type (only intrinsic types and models are supported)`,
        "unknown-intrinsic": paramMessage`no known protobuf scalar for intrinsic type ${"name"}`,
        "recursive-map": "a protobuf map's 'value' type may not refer to another map",
      },
    },
    "namespace-collision": {
      severity: "error",
      messages: {
        default: paramMessage`the package name ${"name"} has already been used`,
      },
    },
  },
  emitter: { options: EmitterOptionsSchema },
});

export const { reportDiagnostic } = CadlGrpcLibrary;

export type CadlGrpcLibrary = typeof CadlGrpcLibrary;

// Decorator state keys
export const fieldIndexKey = Symbol("cadl-grpc::fields");
export const serviceKey = Symbol("cadl-grpc::service");
export const packageKey = Symbol("cadl-grpc::package");
