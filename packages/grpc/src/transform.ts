// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  getIntrinsicModelName,
  InterfaceType,
  isIntrinsic,
  ModelType,
  ModelTypeProperty,
  NamespaceType,
  OperationType,
  Program,
  resolvePath,
  Type,
} from "@cadl-lang/compiler";
import {
  fieldIndexKey,
  GrpcEmitterOptions,
  packageKey,
  reportDiagnostic,
  serviceKey,
} from "./lib.js";
import {
  map,
  ProtoFieldDeclaration,
  ProtoFile,
  ProtoMessageDeclaration,
  ProtoMethodDeclaration,
  ProtoRef,
  ProtoScalar,
  ProtoType,
  ref,
  scalar,
  ScalarIntegralName,
  unreachable,
} from "./proto.js";
import { writeProtoFile } from "./write.js";

// Default options
const DEFAULT_OPTIONS = {
  outputDirectory: "./cadl-output/",
} as const;

/**
 * Create a worker function that converts the CADL program to Protobuf and writes it to the file system.
 */
export function createGrpcEmitter(
  program: Program
): (options?: GrpcEmitterOptions) => Promise<void> {
  return async function doEmit(options) {
    const outDir = resolvePath(options?.outputDirectory ?? DEFAULT_OPTIONS.outputDirectory);

    // Convert the program to a set of proto files.
    const files = cadlToProto(program);

    if (!program.compilerOptions.noEmit && !program.hasError()) {
      for (const file of files) {
        // If the file has a package, emit it to a path that is shaped like the package name. Otherwise emit to
        // main.proto

        // Collisions have already been detected.

        const packageSlug = file.package?.split(".") ?? ["main"];
        const filePath = resolvePath(outDir, ...packageSlug.slice(0, -1));

        await program.host.mkdirp(filePath);
        await program.host.writeFile(
          resolvePath(filePath, packageSlug[packageSlug.length - 1] + ".proto"),
          writeProtoFile(file)
        );
      }
    }
  };
}

/**
 * Create a set of proto files that represent the CADL program.
 *
 * This is the meat of the emitter.
 */
function cadlToProto(program: Program): ProtoFile[] {
  const packages = program.stateMap(packageKey) as Map<NamespaceType, string>;

  // Emit a file per package.
  const files = [...packages].map(
    ([namespace, packageName]) =>
      ({
        package: packageName,
        options: {},
        declarations: declarationsFromNamespace(namespace),
        source: namespace,
      } as ProtoFile)
  );

  checkForNamespaceCollisions(files);

  return files;

  /**
   * Recursively searches a namespace for declarations that should be reified as Protobuf.
   *
   * @param namespace - the namespace to analyze
   * @returns an array of declarations
   */
  function declarationsFromNamespace(namespace: NamespaceType): ProtoFile["declarations"] {
    const serviceInterfaces = new Set<InterfaceType>();

    // This IIFE adds all interfaces decorated with `service` that are reachable from `namespace`
    (function recursiveAddInterfaces(namespace: NamespaceType) {
      for (const memberInterface of namespace.interfaces.values()) {
        if (program.stateSet(serviceKey).has(memberInterface)) {
          serviceInterfaces.add(memberInterface);
        }
      }

      for (const nested of namespace.namespaces.values()) {
        // !! We only want to recurse on namespaces that are not, themselves, packages.
        if (!packages.has(nested)) recursiveAddInterfaces(nested);
      }
    })(namespace);

    const declarations: ProtoFile["declarations"] = [];
    const visitedTypes = new Set<ModelType>();

    /**
     * Visits a model type, converting it into a message definition and adding it if it has not already been visited.
     * @param model - the model type to consider
     */
    function visitType(model: ModelType) {
      if (!visitedTypes.has(model)) {
        visitedTypes.add(model);
        declarations.push(toMessage(model));
      }
    }

    const effectiveModelTypeCache = new Map<ModelType, ModelType | undefined>();

    // Each interface will be reified as a `service` declaration.
    for (const iface of serviceInterfaces) {
      declarations.push({
        kind: "service",
        name: iface.name,
        // The service's methods are just projections of the interface operations.
        operations: [...iface.operations.values()].map(toMethodFromOperation),
      });
    }

    return declarations;

    // #region inline helpers

    /**
     * @param operation - the operation to convert
     * @returns a corresponding method declaration
     */
    function toMethodFromOperation(operation: OperationType): ProtoMethodDeclaration {
      // TODO: add support for cross-package type references
      // https://github.com/microsoft/cadl/issues/632

      // TODO: until then, reject cross-package references
      return {
        kind: "method",
        name: capitalize(operation.name),
        input: addInputParams(operation.parameters, operation.name),
        returns: addReturnType(operation.returnType, operation.name),
      };
    }

    /**
     * Checks a parameter Model satisfies the constraints for a gRPC method input and adds it to the declarations,
     * returning a ProtoRef to the generated named message.
     *
     * @param model - the model to add
     * @returns a reference to the model's message
     */
    function addInputParams(paramsModel: ModelType, operationName: string): ProtoRef {
      const effectiveModel = getEffectiveModelType(
        paramsModel,
        capitalize(operationName) + "Request"
      );

      if (effectiveModel) {
        return ref(effectiveModel.name);
      }

      reportDiagnostic(program, {
        code: "unsupported-input-type",
        messageId: "unconvertible",
        target: paramsModel,
      });

      return unreachable("unsupported input type");
    }

    /**
     * Checks that a return type is a Model and converts it to a message, adding it to the declarations and returning
     * a reference to its name.
     *
     * @param t - the model to add
     * @param operationName - the name of the originating operation, used to compute a synthetic model name if required
     * @returns a reference to the model's message
     */
    function addReturnType(t: Type, operationName: string): ProtoRef {
      // TODO: need to support importing google/protobuf/empty.proto and others
      // https://github.com/microsoft/cadl/issues/630

      // This is also very important for handling datetime values.

      // if (t.kind === "Intrinsic" && t.name === "void") {
      //  return ref("google.protobuf.Empty");
      // }

      switch (t.kind) {
        case "Model":
          const effectiveModel = getEffectiveModelType(t, capitalize(operationName) + "Response");
          if (effectiveModel) {
            return ref(effectiveModel.name);
          }
        // eslint-disable-next-line no-fallthrough
        default:
          reportDiagnostic(program, {
            code: "unsupported-return-type",
            target: t,
          });

          return unreachable("unsupported return type");
      }
    }

    /**
     * Converts a CADL type to a Protobuf type, adding a corresponding message if necessary.
     *
     * @param t - the type to add to the ProtoFile.
     * @returns a Protobuf type corresponding to the given type
     */
    function addType(t: Type): ProtoType {
      // We will handle all intrinsics separately, including maps.
      if (isIntrinsic(program, t)) return intrinsicToProto(getIntrinsicModelName(program, t), t);

      // TODO: streams
      // https://github.com/microsoft/cadl/issues/633

      // TODO: reject anonymous models at this stage

      switch (t.kind) {
        case "Model":
          visitType(t);
          return ref(t.name);
        case "Array":
          if (t.elementType.kind === "Model") {
            visitType(t.elementType);
            return ref(t.elementType.name);
          }
        // eslint-disable-next-line no-fallthrough
        default:
          reportDiagnostic(program, {
            code: "unsupported-field-type",
            messageId: "unconvertible",
            format: {
              type: t.kind,
            },
            target: t,
          });
          return unreachable("unsupported field type");
      }
    }

    function intrinsicToProto(name: string, t: Type): ProtoType {
      // Maps are considered intrinsics, so we check if the type is an instance of Cadl.Map
      if (isMap(t)) {
        // Intrinsic map.
        const [keyType, valueType] = (t as ModelType).templateArguments ?? [];

        // A map's value cannot be another map.
        if (isMap(valueType)) {
          reportDiagnostic(program, {
            code: "unsupported-field-type",
            messageId: "recursive-map",
            target: valueType,
          });
          return unreachable("recursive map");
        }

        // This is a core compile error.
        if (!keyType || !valueType) return unreachable("nonexistent map key or value type");

        const keyProto = addType(keyType);
        const valueProto = addType(valueType) as ProtoRef | ProtoScalar;

        return map(keyProto[1] as "string" | ScalarIntegralName, valueProto);
      }

      // TODO: expose control over integer encodings.
      // https://github.com/microsoft/cadl/issues/631
      const protoType = {
        bytes: scalar("bytes"),
        boolean: scalar("bool"),
        int32: scalar("int32"),
        int64: scalar("int64"),
        uint32: scalar("uint32"),
        uint64: scalar("uint64"),
        string: scalar("string"),
        float32: scalar("float"),
        float64: scalar("double"),
      }[name];

      if (!protoType) {
        reportDiagnostic(program, {
          code: "unsupported-field-type",
          messageId: "unknown-intrinsic",
          format: {
            name: name,
          },
          target: t,
        });
        return unreachable("unknown intrinsic");
      }

      return protoType;
    }

    /**
     * @param model - the Model to convert
     * @returns a corresponding message declaration
     */
    function toMessage(model: ModelType): ProtoMessageDeclaration {
      return {
        kind: "message",
        name: model.name,
        declarations: [...model.properties.values()].map(toField),
      };
    }

    /**
     * @param property - the ModelProperty to convert
     * @returns a corresponding field declaration
     */
    function toField(property: ModelTypeProperty): ProtoFieldDeclaration {
      const field: ProtoFieldDeclaration = {
        kind: "field",
        name: property.name,
        type: addType(property.type),
        index: program.stateMap(fieldIndexKey).get(property),
      };

      if (property.type.kind === "Array") field.repeated = true;

      return field;
    }

    function getEffectiveModelType(
      model: ModelType,
      anonymousModelName: string
    ): ModelType | undefined {
      if (effectiveModelTypeCache.has(model)) return effectiveModelTypeCache.get(model);

      let effectiveModel = program.checker.getEffectiveModelType(model);

      if (effectiveModel.name === "") {
        // Name the model automatically if it is anonymous
        effectiveModel = program.checker.createAndFinishType({
          ...model,
          name: anonymousModelName,
        });
      }

      visitType(effectiveModel);

      effectiveModelTypeCache.set(model, effectiveModel);

      return effectiveModel;
    }
    // #endregion
  }

  function checkForNamespaceCollisions(files: ProtoFile[]) {
    const namespaces = new Set<string | undefined>();

    for (const file of files) {
      if (namespaces.has(file.package)) {
        reportDiagnostic(program, {
          code: "namespace-collision",
          format: {
            name: `"${file.package}"` ?? "<empty>",
          },
          target: file.source,
        });
      }
    }
  }
}

function isMap(t: Type) {
  return t.kind === "Model" && t.name === "Map" && t.namespace?.name === "Cadl";
}

/**
 * Simple utility function to capitalize a string.
 */
function capitalize<S extends string>(s: S) {
  return (s.slice(0, 1).toUpperCase() + s.slice(1)) as Capitalize<S>;
}
