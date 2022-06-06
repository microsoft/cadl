import {
  DecoratorContext,
  DiagnosticTarget,
  EnumMemberType,
  EnumType,
  NamespaceType,
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

function checkIsVersion(
  program: Program,
  enumMember: EnumMemberType,
  diagnosticTarget: DiagnosticTarget
): Version | undefined {
  const version = getVersionForEnumMember(program, enumMember);
  if (!version) {
    reportDiagnostic(program, {
      code: "version-not-found",
      target: diagnosticTarget,
      format: { version: enumMember.name },
    });
  }
  return version;
}
export function $added(context: DecoratorContext, t: Type, v: EnumMemberType) {
  const { program } = context;

  if (!validateDecoratorParamType(program, t, v, "EnumMember")) {
    return;
  }
  const version = checkIsVersion(context.program, v, context.getArgumentTarget(0)!);
  if (!version) {
    return;
  }

  program.stateMap(addedOnKey).set(t, version);
}

export function $removed(context: DecoratorContext, t: Type, v: EnumMemberType) {
  const { program } = context;

  if (!validateDecoratorParamType(program, t, v, "EnumMember")) {
    return;
  }
  const version = checkIsVersion(context.program, v, context.getArgumentTarget(0)!);
  if (!version) {
    return;
  }
  program.stateMap(removedOnKey).set(t, version);
}
export function $renamedFrom(
  context: DecoratorContext,
  t: Type,
  v: EnumMemberType,
  oldName: string
) {
  const { program } = context;
  if (!validateDecoratorParamType(program, t, v, "EnumMember")) {
    return;
  }
  const version = checkIsVersion(context.program, v, context.getArgumentTarget(0)!);
  if (!version) {
    return;
  }
  const record = { v: version, oldName: oldName };

  program.stateMap(renamedFromKey).set(t, record);
}

export function $madeOptional(context: DecoratorContext, t: Type, v: EnumMemberType) {
  const { program } = context;
  if (!validateDecoratorParamType(program, t, v, "EnumMember")) {
    return;
  }
  const version = checkIsVersion(context.program, v, context.getArgumentTarget(0)!);
  if (!version) {
    return;
  }
  program.stateMap(madeOptionalKey).set(t, version);
}

/**
 * @returns version when the given type was added if applicable.
 */
export function getRenamedFromVersion(p: Program, t: Type): Version | undefined {
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
export function getAddedOn(p: Program, t: Type): Version | undefined {
  return p.stateMap(addedOnKey).get(t);
}

/**
 * @returns version when the given type was removed if applicable.
 */
export function getRemovedOn(p: Program, t: Type): Version | undefined {
  return p.stateMap(removedOnKey).get(t);
}

/**
 * @returns version when the given type was made optional if applicable.
 */
export function getMadeOptionalOn(p: Program, t: Type): Version | undefined {
  return p.stateMap(madeOptionalKey).get(t);
}

export class VersionMap {
  private map = new Map<EnumMemberType, Version>();

  constructor(namespace: NamespaceType, enumType: EnumType) {
    for (const [index, member] of enumType.members.entries()) {
      this.map.set(member, {
        name: member.name,
        value: member.value?.toString() ?? enumType.name,
        enumMember: member,
        index,
        namespace,
      });
    }
  }

  public getVersionForEnumMember(member: EnumMemberType): Version | undefined {
    return this.map.get(member);
  }

  public getVersions(): Version[] {
    return [...this.map.values()];
  }
}

export function $versioned(context: DecoratorContext, t: Type, versions: Type) {
  if (!validateDecoratorTarget(context, t, "@versioned", "Namespace")) {
    return;
  }
  if (!validateDecoratorParamType(context.program, t, versions, "Enum")) {
    return;
  }

  context.program.stateMap(versionsKey).set(t, new VersionMap(t, versions));
}

export function getVersion(p: Program, t: NamespaceType): VersionMap | undefined {
  return p.stateMap(versionsKey).get(t);
}

export function $versionedDependency(
  context: DecoratorContext,
  referenceNamespace: Type,
  versionRecord: string | Type
) {
  const { program } = context;
  if (
    !validateDecoratorTarget(context, referenceNamespace, "@versionedDependency", "Namespace") ||
    !validateDecoratorParamType(program, referenceNamespace, versionRecord, ["Tuple", "EnumMember"])
  ) {
    return;
  }

  let state = program.stateMap(versionDependencyKey).get(referenceNamespace) as Map<
    NamespaceType,
    Version | Map<EnumMemberType, Version>
  >;

  if (!state) {
    state = new Map();
    context.program.stateMap(versionDependencyKey).set(referenceNamespace, state);
  }

  if (versionRecord.kind === "EnumMember") {
    const v = checkIsVersion(program, versionRecord, context.getArgumentTarget(0)!);
    if (v) {
      state.set(v.namespace, v);
    }
  } else {
    let targetNamespace: NamespaceType | undefined;
    const versionMap = new Map<EnumMemberType, Version>();

    for (const entry of versionRecord.values) {
      if (entry.kind !== "Tuple") {
        reportDiagnostic(context.program, { code: "versioned-dependency-tuple", target: entry });
        continue;
      }
      const [sourceMember, targetMember] = entry.values;

      if (sourceMember === undefined || sourceMember.kind !== "EnumMember") {
        reportDiagnostic(context.program, {
          code: "versioned-dependency-tuple-enum-member",
          target: sourceMember ?? entry,
        });
        continue;
      }
      if (targetMember === undefined || targetMember.kind !== "EnumMember") {
        reportDiagnostic(context.program, {
          code: "versioned-dependency-tuple-enum-member",
          target: targetMember ?? entry,
        });
        continue;
      }
      // const sourceVersion = checkIsVersion(program, sourceMember, sourceMember);
      const targetVersion = checkIsVersion(program, targetMember, targetMember);
      if (!targetVersion) {
        continue;
      }
      if (targetNamespace === undefined) {
        targetNamespace = targetVersion.namespace;
      } else if (targetNamespace !== targetVersion.namespace) {
        reportDiagnostic(context.program, {
          code: "versioned-dependency-same-namespace",
          format: {
            namespace1: program.checker.getNamespaceString(targetNamespace),
            namespace2: program.checker.getNamespaceString(targetVersion.namespace),
          },
          target: targetMember,
        });
        return;
      }

      versionMap.set(sourceMember, targetVersion);
    }
    if (targetNamespace) {
      state.set(targetNamespace, versionMap);
    }
  }
}

export function getVersionDependencies(
  p: Program,
  namespace: NamespaceType
): Map<NamespaceType, Map<EnumMemberType, Version> | Version> | undefined {
  return p.stateMap(versionDependencyKey).get(namespace);
}

export interface VersionResolution {
  /**
   * Version for the root namespace. `undefined` if not versioned.
   */
  rootVersion: Version | undefined;

  /**
   * Resolved version for all the referenced namespaces.
   */
  versions: Map<NamespaceType, Version>;
}

/**
 * Resolve the version to use for all namespace for each of the root namespace versions.
 * @param program
 * @param rootNs Root namespace.
 */
export function resolveVersions(program: Program, rootNs: NamespaceType): VersionResolution[] {
  const versions = getVersion(program, rootNs);
  const dependencies = getVersionDependencies(program, rootNs) ?? new Map();
  if (!versions) {
    if (dependencies.size === 0) {
      return [{ rootVersion: undefined, versions: new Map() }];
    } else {
      const map = new Map();
      for (const [dependencyNs, version] of dependencies) {
        if (version instanceof Map) {
          const rootNsName = program.checker.getNamespaceString(rootNs);
          const dependencyNsName = program.checker.getNamespaceString(dependencyNs);
          throw new Error(
            `Unexpected error: Namespace ${rootNsName} version dependency to ${dependencyNsName} should be a picked version.`
          );
        }
        map.set(dependencyNs, version);
      }
      return [{ rootVersion: undefined, versions: map }];
    }
  } else {
    return versions.getVersions().map((version) => {
      const resolution: VersionResolution = {
        rootVersion: version,
        versions: new Map<NamespaceType, Version>(),
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
        resolution.versions.set(dependencyNs, versionMap.get(version.enumMember));
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

const versionIndex = new Map<Version, Map<NamespaceType, Version>>();

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
        arguments: [version.enumMember],
      };
    });
    return { version: resolution.rootVersion?.value, projections };
  });
}

const versionCache = new WeakMap<Type, [NamespaceType, VersionMap] | []>();
function cacheVersion(key: Type, versions: [NamespaceType, VersionMap] | []) {
  versionCache.set(key, versions);
  return versions;
}

export function getVersionsForEnum(
  program: Program,
  version: EnumMemberType
): [NamespaceType, VersionMap] | [] {
  const namespace = version.enum.namespace;

  if (namespace === undefined) {
    return [];
  }
  const nsVersion = getVersion(program, namespace);

  if (nsVersion === undefined) {
    return [];
  }
  return [namespace, nsVersion];
}

export function getVersions(p: Program, t: Type): [NamespaceType, VersionMap] | [] {
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
      return cacheVersion(t, []);
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
export function addedAfter(p: Program, type: Type, version: EnumMemberType) {
  const appliesAt = appliesAtVersion(getAddedOn, p, type, version);
  return appliesAt === null ? false : !appliesAt;
}

export function removedOnOrBefore(p: Program, type: Type, version: EnumMemberType) {
  const appliesAt = appliesAtVersion(getRemovedOn, p, type, version);
  return appliesAt === null ? false : appliesAt;
}

export function renamedAfter(p: Program, type: Type, version: EnumMemberType) {
  const appliesAt = appliesAtVersion(getRenamedFromVersion, p, type, version);
  return appliesAt === null ? false : !appliesAt;
}

export function madeOptionalAfter(p: Program, type: Type, version: EnumMemberType) {
  const appliesAt = appliesAtVersion(getMadeOptionalOn, p, type, version);
  return appliesAt === null ? false : !appliesAt;
}

export function getVersionForEnumMember(
  program: Program,
  member: EnumMemberType
): Version | undefined {
  const [, versions] = getVersionsForEnum(program, member);
  if (versions?.getVersionForEnumMember(member) === undefined) {
    const v = [...(versions as any).map.entries()];
    console.trace(
      "Versions",
      versions,
      member.name,
      v.map((x) => x[0] === member),
      v.map((x) => x[1].enumMember === member)
    );
  }
  return versions?.getVersionForEnumMember(member);
}

/**
 * returns either null, which means unversioned, or true or false dependnig
 * on whether the change is active or not at that particular version
 */
function appliesAtVersion(
  getMetadataFn: (p: Program, t: Type) => Version | undefined,
  p: Program,
  type: Type,
  enumMemberVersion: EnumMemberType
) {
  const [namespace, versions] = getVersions(p, type);
  let version = getVersionForEnumMember(p, enumMemberVersion)!;
  if (namespace) {
    const newVersion = versionIndex.get(version)?.get(namespace);
    if (newVersion) {
      version = newVersion;
    }
  }
  if (!versions) {
    return null;
  }

  const appliedOnVersion = getMetadataFn(p, type);
  if (appliedOnVersion === undefined) {
    return null;
  }
  const appliedOnVersionIndex = appliedOnVersion.index;
  if (appliedOnVersionIndex === -1) return null;

  const testVersionIndex = version.index;
  if (testVersionIndex === -1) return null;
  return testVersionIndex >= appliedOnVersionIndex;
}

export interface Version {
  name: string;
  value: string;
  namespace: NamespaceType;
  enumMember: EnumMemberType;
  index: number;
}
