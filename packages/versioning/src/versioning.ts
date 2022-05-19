import {
  DecoratorContext,
  NamespaceType,
  navigateProgram,
  NoTarget,
  Program,
  ProjectionApplication,
  Type,
  validateDecoratorParamType,
  validateDecoratorTarget,
} from "@cadl-lang/compiler";
import { reportDiagnostic } from "./lib.js";

const addedOnKey = Symbol("addedOn");
const removedOnKey = Symbol("removedOn");
const versionsKey = Symbol("versions");
const versionDependencyKey = Symbol("versionDependency");
const renamedFromKey = Symbol("renamedFrom");
const madeOptionalKey = Symbol("madeOptional");

export function $added({ program }: DecoratorContext, t: Type, v: string) {
  if (typeof v !== "string") {
    reportDiagnostic(program, { code: "version-must-be-string", target: t });
    return;
  }
  if (
    ["EnumMember", "ModelProperty", "UnionVariant"].indexOf(t.kind) === -1 &&
    !hasVersion(program, t, v)
  ) {
    reportDiagnostic(program, { code: "version-not-found", target: t, format: { version: v } });
    return;
  }

  program.stateMap(addedOnKey).set(t, v);
}
export function $removed({ program }: DecoratorContext, t: Type, v: string) {
  if (typeof v !== "string") {
    reportDiagnostic(program, { code: "version-must-be-string", target: t });
    return;
  }
  // this validation doesn't work for model properties because we can't walk up to
  // get the container type.
  if (
    ["EnumMember", "ModelProperty", "UnionVariant"].indexOf(t.kind) === -1 &&
    !hasVersion(program, t, v)
  ) {
    reportDiagnostic(program, { code: "version-not-found", target: t, format: { version: v } });
    return;
  }
  program.stateMap(removedOnKey).set(t, v);
}
export function $renamedFrom({ program }: DecoratorContext, t: Type, v: string, oldName: string) {
  if (typeof v !== "string") {
    reportDiagnostic(program, { code: "version-must-be-string", target: t });
    return;
  }
  if (
    ["EnumMember", "ModelProperty", "UnionVariant"].indexOf(t.kind) === -1 &&
    !hasVersion(program, t, v)
  ) {
    reportDiagnostic(program, { code: "version-not-found", target: t, format: { version: v } });
    return;
  }
  const record = { v: v, oldName: oldName };
  program.stateMap(renamedFromKey).set(t, record);
}

export function $madeOptional({ program }: DecoratorContext, t: Type, v: string) {
  if (typeof v !== "string") {
    reportDiagnostic(program, { code: "version-must-be-string", target: t });
    return;
  }
  if (
    ["EnumMember", "ModelProperty", "UnionVariant"].indexOf(t.kind) === -1 &&
    !hasVersion(program, t, v)
  ) {
    reportDiagnostic(program, { code: "version-not-found", target: t, format: { version: v } });
    return;
  }

  program.stateMap(madeOptionalKey).set(t, v);
}

/**
 * @returns version when the given type was added if applicable.
 */
export function getRenamedFromVersion(p: Program, t: Type): string | undefined {
  return p.stateMap(renamedFromKey).get(t)?.v;
}

/**
 * @returns get old renamed name if applicable.
 */
export function getRenamedFromOldName(p: Program, t: Type): string {
  return p.stateMap(renamedFromKey).get(t)?.oldName ?? "";
}

/**
 * @returns version when the given type was added if applicable.
 */
export function getAddedOn(p: Program, t: Type): string | undefined {
  return p.stateMap(addedOnKey).get(t);
}

/**
 * @returns version when the given type was removed if applicable.
 */
export function getRemovedOn(p: Program, t: Type): string | undefined {
  return p.stateMap(removedOnKey).get(t);
}

/**
 * @returns version when the given type was made optional if applicable.
 */
export function getMadeOptionalOn(p: Program, t: Type): string | undefined {
  return p.stateMap(madeOptionalKey).get(t);
}

export function $versioned({ program }: DecoratorContext, t: Type, v: Type) {
  if (t.kind !== "Namespace") {
    reportDiagnostic(program, { code: "versioned-not-on-namespace", target: t });
    return;
  }
  const versions = [];

  switch (v.kind) {
    case "String":
    case "Number":
      versions.push(v.value);
      break;
    case "Union":
      for (const variant of v.options) {
        if (variant.kind === "String" || variant.kind === "Number") {
          versions.push(variant.value);
        }
      }
      break;
    case undefined:
      if (typeof v === "number" || typeof v === "string") {
        versions.push(v);
      }
  }

  program.stateMap(versionsKey).set(t, versions);
}

function getVersion(p: Program, t: Type): string[] {
  return p.stateMap(versionsKey).get(t);
}

export function $versionedDependency(
  { program }: DecoratorContext,
  referenceNamespace: Type,
  targetNamespace: Type,
  versionRecord: string | Type
) {
  if (
    !validateDecoratorTarget(program, referenceNamespace, "@versionedDependency", "Namespace") ||
    !validateDecoratorParamType(program, referenceNamespace, targetNamespace, "Namespace") ||
    !validateDecoratorParamType(program, referenceNamespace, versionRecord, ["Model", "String"])
  ) {
    return;
  }

  let state = program.stateMap(versionDependencyKey).get(referenceNamespace) as Map<
    NamespaceType,
    string | Map<string, string>
  >;

  if (!state) {
    state = new Map();
    program.stateMap(versionDependencyKey).set(referenceNamespace, state);
  }

  if (typeof versionRecord === "string") {
    state.set(targetNamespace, versionRecord);
  } else {
    let versionMap = state.get(targetNamespace);
    if (!versionMap || !(versionMap instanceof Map)) {
      versionMap = new Map();
      state.set(targetNamespace, versionMap);
    }

    for (const [name, prop] of versionRecord.properties) {
      if (prop.type.kind !== "String") {
        continue;
      }
      versionMap.set(name, prop.type.value);
    }
  }
}

export function getVersionDependencies(
  p: Program,
  namespace: NamespaceType
): Map<NamespaceType, Map<string, string> | string> | undefined {
  return p.stateMap(versionDependencyKey).get(namespace);
}

export function $onValidate(program: Program) {
  const namespaceDependencies = new Map();
  function addDependency(source: NamespaceType | undefined, target: Type | undefined) {
    if (target === undefined || !("namespace" in target) || target.namespace === undefined) {
      return;
    }
    let set = namespaceDependencies.get(source);
    if (set === undefined) {
      set = new Set();
      namespaceDependencies.set(source, set);
    }
    if (target.namespace !== source) {
      set.add(target.namespace);
    }
  }

  navigateProgram(program, {
    model: (model) => {
      // If this is an instantiated type we don't want to keep the mapping.
      if (model.templateArguments && model.templateArguments.length > 0) {
        return;
      }
      addDependency(model.namespace, model.baseModel);
      for (const prop of model.properties.values()) {
        addDependency(model.namespace, prop.type);
      }
    },
    union: (union) => {
      if (union.namespace === undefined) {
        return;
      }
      for (const option of union.options.values()) {
        addDependency(union.namespace, option);
      }
    },
    operation: (op) => {
      const namespace = op.namespace ?? op.interface?.namespace;
      addDependency(namespace, op.parameters);
      addDependency(namespace, op.returnType);
    },
    namespace: (namespace) => {
      const version = getVersion(program, namespace);
      const dependencies = getVersionDependencies(program, namespace);
      if (dependencies === undefined) {
        return;
      }

      for (const [dependencyNs, value] of dependencies.entries()) {
        if (version && version.length > 0) {
          if (!(value instanceof Map)) {
            reportDiagnostic(program, {
              code: "versioned-dependency-record-not-model",
              format: { dependency: program.checker.getNamespaceString(dependencyNs) },
              target: namespace,
            });
          }
        } else {
          if (typeof value !== "string") {
            reportDiagnostic(program, {
              code: "versioned-dependency-not-string",
              format: { dependency: program.checker.getNamespaceString(dependencyNs) },
              target: namespace,
            });
          }
        }
      }
    },
  });
  validateVersionedNamespaceUsage(program, namespaceDependencies);
}

function validateVersionedNamespaceUsage(
  program: Program,
  namespaceDependencies: Map<NamespaceType | undefined, Set<NamespaceType>>
) {
  for (const [source, targets] of namespaceDependencies.entries()) {
    const dependencies = source && getVersionDependencies(program, source);
    for (const target of targets) {
      const targetVersions = getVersion(program, target);

      if (targetVersions !== undefined && dependencies?.get(target) === undefined) {
        reportDiagnostic(program, {
          code: "using-versioned-library",
          format: {
            sourceNs: program.checker.getNamespaceString(source),
            targetNs: program.checker.getNamespaceString(target),
          },
          target: source ?? NoTarget,
        });
      }
    }
  }
}

export interface VersionResolution {
  /**
   * Version for the root namespace. `undefined` if not versioned.
   */
  rootVersion: string | undefined;

  /**
   * Resolved version for all the referenced namespaces.
   */
  versions: Map<NamespaceType, string>;
}

/**
 * Resolve the version to use for all namespace for each of the root namespace versions.
 * @param program
 * @param rootNs Root namespace.
 */
export function resolveVersions(program: Program, rootNs: NamespaceType): VersionResolution[] {
  const [, versions] = getVersions(program, rootNs);
  const dependencies = getVersionDependencies(program, rootNs) ?? new Map();
  if (!versions || versions.length === 0) {
    if (dependencies.size === 0) {
      return [{ rootVersion: undefined, versions: new Map() }];
    } else {
      const map = new Map();
      for (const [dependencyNs, version] of dependencies) {
        if (typeof version !== "string") {
          const rootNsName = program.checker.getNamespaceString(rootNs);
          const dependencyNsName = program.checker.getNamespaceString(dependencyNs);
          throw new Error(
            `Unexpected error: Namespace ${rootNsName} version dependency to ${dependencyNsName} should be a string.`
          );
        }
        map.set(dependencyNs, version);
      }
      return [{ rootVersion: undefined, versions: map }];
    }
  } else {
    return versions.map((version) => {
      const resolution: VersionResolution = {
        rootVersion: version,
        versions: new Map<NamespaceType, string>(),
      };
      resolution.versions.set(rootNs, version);

      for (const [dependencyNs, versionMap] of dependencies) {
        if (!(versionMap instanceof Map)) {
          const rootNsName = program.checker.getNamespaceString(rootNs);
          const dependencyNsName = program.checker.getNamespaceString(dependencyNs);
          throw new Error(
            `Unexpected error: Namespace ${rootNsName} version dependency to ${dependencyNsName} should be a mapping of version.`
          );
        }
        resolution.versions.set(dependencyNs, versionMap.get(version));
      }

      return resolution;
    });
  }
}

/**
 * Represent the set of projections used to project to that version.
 */
interface VersionProjections {
  version: string | undefined;
  projections: ProjectionApplication[];
}

const versionIndex = new Map<string, Map<NamespaceType, string>>();

function indexVersions(resolutions: VersionResolution[]) {
  versionIndex.clear();
  for (const resolution of resolutions) {
    for (const version of resolution.versions.values()) {
      versionIndex.set(version, resolution.versions);
    }
  }
}

export function buildVersionProjections(
  program: Program,
  rootNs: NamespaceType
): VersionProjections[] {
  const resolutions = resolveVersions(program, rootNs);
  indexVersions(resolutions);
  return resolutions.map((resolution) => {
    const projections = [...resolution.versions.entries()].map(([ns, version]) => {
      return {
        scope: ns,
        projectionName: "v",
        arguments: [version],
      };
    });
    return { version: resolution.rootVersion, projections };
  });
}

const versionCache = new WeakMap<Type, [NamespaceType, string[]] | []>();
function cacheVersion(key: Type, versions: [NamespaceType, string[]] | []) {
  versionCache.set(key, versions);
  return versions;
}

export function getVersions(p: Program, t: Type): [NamespaceType, string[]] | [] {
  if (versionCache.has(t)) {
    return versionCache.get(t)!;
  }

  if (t.kind === "Namespace") {
    const nsVersion = getVersion(p, t);

    if (nsVersion !== undefined) {
      return cacheVersion(t, [t, nsVersion]);
    } else if (t.namespace) {
      return cacheVersion(t, getVersions(p, t.namespace));
    } else {
      return cacheVersion(t, [t, []]);
    }
  } else if (
    t.kind === "Operation" ||
    t.kind === "Interface" ||
    t.kind === "Model" ||
    t.kind === "Union" ||
    t.kind === "Enum"
  ) {
    if (t.namespace) {
      return cacheVersion(t, getVersions(p, t.namespace) || []);
    } else if (t.kind === "Operation" && t.interface) {
      return cacheVersion(t, getVersions(p, t.interface) || []);
    } else {
      return cacheVersion(t, []);
    }
  } else if (t.kind === "ModelProperty") {
    if (t.sourceProperty) {
      return getVersions(p, t.sourceProperty);
    } else if (t.model) {
      return getVersions(p, t.model);
    } else {
      return cacheVersion(t, []);
    }
  } else {
    return cacheVersion(t, []);
  }
}

// these decorators take a `versionSource` parameter because not all types can walk up to
// the containing namespace. Model properties, for example.
export function addedAfter(p: Program, type: Type, version: string, versionSource?: Type) {
  const appliesAt = appliesAtVersion(getAddedOn, p, type, version, versionSource);
  return appliesAt === null ? false : !appliesAt;
}

export function removedOnOrBefore(p: Program, type: Type, version: string, versionSource?: Type) {
  const appliesAt = appliesAtVersion(getRemovedOn, p, type, version, versionSource);
  return appliesAt === null ? false : appliesAt;
}

export function renamedAfter(p: Program, type: Type, version: string, versionSource?: Type) {
  const appliesAt = appliesAtVersion(getRenamedFromVersion, p, type, version, versionSource);
  return appliesAt === null ? false : !appliesAt;
}

export function madeOptionalAfter(p: Program, type: Type, version: string, versionSource?: Type) {
  const appliesAt = appliesAtVersion(getMadeOptionalOn, p, type, version, versionSource);
  return appliesAt === null ? false : !appliesAt;
}

/**
 * returns either null, which means unversioned, or true or false dependnig
 * on whether the change is active or not at that particular version
 */
function appliesAtVersion(
  getMetadataFn: (p: Program, t: Type) => string | undefined,
  p: Program,
  type: Type,
  version: string,
  versionSource?: Type
) {
  const [namespace, versions] = getVersions(p, versionSource ?? type);
  if (namespace) {
    const newVersion = versionIndex.get(version)?.get(namespace);
    if (newVersion) {
      version = newVersion;
    }
  }
  if (!versions || versions.length === 0) {
    return null;
  }

  const appliedOnVersion = getMetadataFn(p, type);
  if (appliedOnVersion === undefined) {
    return null;
  }
  const appliedOnVersionIndex = versions.indexOf(appliedOnVersion);
  if (appliedOnVersionIndex === -1) return null;

  const testVersionIndex = versions.indexOf(version);
  if (testVersionIndex === -1) return null;
  return testVersionIndex >= appliedOnVersionIndex;
}

export function versionCompare(p: Program, versionSource: Type, v1: string, v2: string): number {
  const [, versions] = getVersions(p, versionSource);
  if (!versions || versions.length === 0) {
    return 0;
  }
  const v1Index = versions.indexOf(v1);
  if (v1Index === -1) return 0;
  const v2Index = versions.indexOf(v2);
  if (v2Index === -1) return 0;

  return v1Index - v2Index;
}

export function hasVersion(p: Program, t: Type, v: string) {
  const [, versions] = getVersions(p, t);
  if (!versions) return false;
  return versions.includes(v);
}
