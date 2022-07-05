// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  createDecoratorDefinition,
  DecoratorContext,
  EmitOptionsFor,
  ModelTypeProperty,
  NamespaceType,
  Program,
  Type,
  validateDecoratorTarget,
} from "@cadl-lang/compiler";

import { CadlGrpcLibrary, fieldIndexKey, packageKey, reportDiagnostic, serviceKey } from "./lib.js";
import { createGrpcEmitter } from "./transform.js";

/**
 * # cadl-grpc : gRPC/Protobuf Emitter and Decorators for CADL
 *
 * This module defines an emitter and decorator library for CADL that enables specifying gRPC services and Protobuf
 * models.
 */

/**
 * The maximum field index allowed by Protocol Buffers.
 */
const MAX_FIELD_INDEX = 2 ** 29 - 1;

/**
 * The field range between 19000 and 19999 is reserved for Protobuf client implementations.
 */
const IMPLEMENTATION_RESERVED_RANGE = [19000, 19999] as const;

const packageDecorator = createDecoratorDefinition({
  name: "@package",
  args: [{ kind: "String", optional: true }],
  target: "Namespace",
} as const);

/**
 * Decorate a namespace as a package, indicating that it represents a single Protobuf unit (a single file with a
 * `package` declaration).
 *
 * @param ctx - decorator context
 * @param target - the decorated namespace
 * @param name - the package's name (not optional)
 */
export function $package(ctx: DecoratorContext, target: NamespaceType, name: string) {
  if (!packageDecorator.validate(ctx, target, [name])) {
    return;
  }

  // TODO: validate package name is acceptable

  ctx.program.stateMap(packageKey).set(target, name);
}

/**
 * Decorate an interface as a service, indicating that it represents a gRPC `service` declaration.
 *
 * @param ctx - decorator context
 * @param target - the decorated interface
 */
export function $service(ctx: DecoratorContext, target: Type) {
  if (!validateDecoratorTarget(ctx, target, "@service", "Interface")) {
    return;
  }

  // TODO: do we allow service interfaces to extend/compose other interfaces?

  for (const _operation of target.operations.values()) {
    // TODO: validate operations here, don't defer to $onEmit, so that we have a good editor experience.
  }

  ctx.program.stateSet(serviceKey).add(target);
}

const fieldDecorator = createDecoratorDefinition({
  name: "@field",
  args: [{ kind: "Number", optional: false }],
  target: "ModelProperty",
} as const);

/**
 * Decorate a model property with a field index. Field indices are required for all fields of emitted messages.
 *
 * @param param0
 * @param target
 * @param fieldIndex
 * @returns
 */
export function $field(ctx: DecoratorContext, target: ModelTypeProperty, fieldIndex: number) {
  if (!fieldDecorator.validate(ctx, target, [fieldIndex])) {
    return;
  }

  if (!Number.isInteger(fieldIndex) || fieldIndex <= 0) {
    reportDiagnostic(ctx.program, {
      code: "field-index",
      messageId: "invalid",
      format: {
        index: String(fieldIndex),
      },
      target,
    });
    return;
  } else if (fieldIndex > MAX_FIELD_INDEX) {
    reportDiagnostic(ctx.program, {
      code: "field-index",
      messageId: "out-of-bounds",
      format: {
        index: String(fieldIndex),
        max: String(MAX_FIELD_INDEX),
      },
      target,
    });
    return;
  } else if (
    fieldIndex >= IMPLEMENTATION_RESERVED_RANGE[0] &&
    fieldIndex <= IMPLEMENTATION_RESERVED_RANGE[1]
  ) {
    reportDiagnostic(ctx.program, {
      code: "field-index",
      messageId: "reserved",
      format: {
        index: String(fieldIndex),
      },
      target,
    });
  }

  ctx.program.stateMap(fieldIndexKey).set(target, fieldIndex);
}

/**
 * Emitter main function.
 *
 * @param program - the program to emit
 */
export async function $onEmit(program: Program, options?: EmitOptionsFor<CadlGrpcLibrary>) {
  const emitter = createGrpcEmitter(program);

  await emitter({
    outputDirectory: options?.outputDirectory,
  });
}

export const namespace = "Cadl.Grpc";

export { CadlGrpcLibrary as $lib };
