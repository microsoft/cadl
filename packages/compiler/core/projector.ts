import { isNeverType } from "../lib/decorators.js";
import { compilerAssert } from "./diagnostics.js";
import { Program } from "./program";
import {
  ArrayType,
  DecoratorApplication,
  DecoratorArgument,
  EnumMemberType,
  EnumType,
  InterfaceType,
  ModelType,
  ModelTypeProperty,
  NamespaceType,
  OperationType,
  ProjectionApplication,
  Projector,
  SyntaxKind,
  TupleType,
  Type,
  UnionType,
  UnionTypeVariant,
} from "./types.js";

function foo() {}
foo();

/**
 * Creates a projector which returns a projected view of either the global namespace or the
 * start node provided. Projecting a type effectively clones every type referenced underneath
 * it. This is accomplished by doing a semantic walk of each type, cloning each type we find,
 * and running projection code on the clone.
 *
 * Projectors can run multiple projections at once. In such cases, each projection is run
 * on the same clone of the unprojected type. It is up to projections and the user to ensure
 * that projections which depend on a particular shape are run when that shape is present (or
 * else to ensure that their projections are tolerant to shape changes).
 *
 * The projector maintains its own state maps and sets. If a projection is active (i.e.
 * program.currentProjector is set), then the projector's state will be returned instead
 * of the program's state. This ensures that there is no overlap between projected and
 * unprojected state. It also means that you cannot get state for nodes that are not
 * part of the active projection.
 *
 * Note that decorators are run on namespaces prior to cloning any child types to align
 * with the checker semantics, while projections are run after everything under the namespace
 * is cloned. All other run decorators and projections after all child types are cloned and
 * have their decorators run.
 */
export function createProjector(
  program: Program,
  projections: ProjectionApplication[],
  startNode?: Type
): Projector {
  const projectedTypes = new Map<Type, Type>();
  const checker = program.checker;
  const neverType = checker.neverType;
  const scope: Type[] = [];
  const projector: Projector = {
    projectedTypes,
    projections,
    projectType,
  };
  const projectedNamespaces: NamespaceType[] = [];

  program.currentProjector = projector;

  const targetGlobalNs = startNode
    ? startNode.projector
      ? startNode.projector.projectedGlobalNamespace!
      : program.checker.getGlobalNamespaceType()
    : program.checker.getGlobalNamespaceType();

  // project all the namespaces first
  projector.projectedGlobalNamespace = projectNamespace(targetGlobalNs) as NamespaceType;

  // then project all the types
  for (const ns of projectedNamespaces) {
    projectNamespaceContents(ns);
  }
  projectType(targetGlobalNs);

  projector.projectedStartNode = startNode
    ? projectedTypes.get(startNode)
    : projector.projectedGlobalNamespace;

  return projector;

  function projectType(type: Type): Type {
    if (projectedTypes.has(type)) {
      return projectedTypes.get(type)!;
    }

    scope.push(type);
    let projected;
    switch (type.kind) {
      case "Namespace":
        compilerAssert(false, "Namespace should have already been projected.");
        break;
      case "Model":
        projected = projectModel(type);
        break;
      case "ModelProperty":
        projected = projectModelProperty(type);
        break;
      case "Operation":
        projected = projectOperation(type);
        break;
      case "Interface":
        projected = projectInterface(type);
        break;
      case "Union":
        projected = projectUnion(type);
        break;
      case "UnionVariant":
        projected = projectUnionVariant(type);
        break;
      case "Array":
        projected = projectArray(type);
        break;
      case "Tuple":
        projected = projectTuple(type);
        break;
      case "Enum":
        projected = projectEnum(type);
        break;
      case "EnumMember":
        projected = projectEnumMember(type);
        break;
      default:
        projected = type;
    }

    scope.pop();

    return projected;
  }

  function projectNamespace(ns: NamespaceType): Type {
    const childNamespaces = new Map<string, NamespaceType>();
    const childModels = new Map<string, ModelType>();
    const childOperations = new Map<string, OperationType>();
    const childInterfaces = new Map<string, InterfaceType>();
    const childUnions = new Map<string, UnionType>();
    const childEnums = new Map<string, EnumType>();
    const projectedNs = shallowClone(ns, {
      namespaces: childNamespaces,
      models: childModels,
      operations: childOperations,
      interfaces: childInterfaces,
      unions: childUnions,
      enums: childEnums,
      decorators: [],
    });

    projectedNs.decorators = projectDecorators(ns.decorators);

    // ns run decorators before projecting anything inside them
    checker.finishType(projectedNs);

    for (const [key, childNs] of ns.namespaces) {
      const projected = projectNamespace(childNs);
      if (projected.kind === "Namespace") {
        // todo: check for never?
        childNamespaces.set(key, projected);
        projected.namespace = projectedNs;
      }
    }

    projectedNamespaces.push(ns);
    return applyProjection(ns, projectedNs);
  }

  /**
   * Projects the contents of a namespace, but not the namespace itself. The namespace itself
   * is projected in an earlier phase.
   */
  function projectNamespaceContents(ns: NamespaceType): Type {
    const projectedNs = projectedTypes.get(ns);
    compilerAssert(projectedNs, "Should have projected namespace by now");
    if (projectedNs.kind !== "Namespace") {
      // we projected the namespace to something else so don't do any more work.
      // this might happen if a namespace itself was added/removed/etc. and is
      // projected to never.
      return neverType;
    }

    for (const childModel of ns.models.values()) {
      const projected = projectType(childModel);
      if (projected.kind === "Model") {
        projectedNs.models.set(projected.name, projected);
      }
    }

    for (const childOperation of ns.operations.values()) {
      const projected = projectType(childOperation);
      if (projected.kind === "Operation") {
        projectedNs.operations.set(projected.name, projected);
      }
    }

    for (const childInterface of ns.interfaces.values()) {
      const projected = projectType(childInterface);
      if (projected.kind === "Interface") {
        projectedNs.interfaces.set(projected.name, projected);
      }
    }
    for (const childUnion of ns.unions.values()) {
      const projected = projectType(childUnion);
      if (projected.kind === "Union") {
        projectedNs.unions.set(projected.name!, projected);
      }
    }
    for (const childEnum of ns.enums.values()) {
      const projected = projectType(childEnum);
      if (projected.kind === "Enum") {
        projectedNs.enums.set(projected.name, projected);
      }
    }

    return projectedNs;
  }

  function projectModel(model: ModelType): Type {
    const properties = new Map<string, ModelTypeProperty>();
    let templateArguments: Type[] | undefined;

    const projectedModel = shallowClone(model, {
      properties,
      derivedModels: [],
    });

    if (model.templateArguments !== undefined) {
      templateArguments = [];
      for (const arg of model.templateArguments) {
        templateArguments.push(projectType(arg));
      }
    }

    if (model.baseModel) {
      projectedModel.baseModel = projectType(model.baseModel) as ModelType;
    }

    projectedTypes.set(model, projectedModel);

    for (const [key, prop] of model.properties) {
      const projectedProp = projectType(prop);
      if (projectedProp.kind === "ModelProperty") {
        properties.set(key, projectedProp);
      }
    }

    projectedModel.decorators = projectDecorators(model.decorators);
    if (shouldFinishType(model)) {
      checker.finishType(projectedModel);
    }
    projectedModel.templateArguments = templateArguments;
    const projectedResult = applyProjection(model, projectedModel);
    if (
      !isNeverType(projectedResult) &&
      projectedResult.kind === "Model" &&
      projectedResult.baseModel &&
      projectedResult.baseModel.kind === "Model"
    ) {
      projectedResult.baseModel.derivedModels ??= [];
      projectedResult.baseModel.derivedModels.push(projectedModel);
    }
    return projectedResult;
  }

  /**
   * Returns true if we should finish a type. The only time we don't finish is when it's
   * a template type, because we don't want to run decorators for templates.
   */
  function shouldFinishType(type: ModelType | InterfaceType | UnionType) {
    if (
      type.node?.kind !== SyntaxKind.ModelStatement &&
      type.node?.kind !== SyntaxKind.InterfaceStatement
    ) {
      return true;
    }
    if (type.node.templateParameters.length === 0) {
      return true;
    }
    // we have template arguments
    if (!type.templateArguments) {
      return false;
    }

    if (type.templateArguments.length < type.node.templateParameters.length) {
      return false;
    }

    return true;
  }

  function projectModelProperty(prop: ModelTypeProperty): Type {
    const projectedType = projectType(prop.type);
    const projectedDecs = projectDecorators(prop.decorators);

    const projectedProp = shallowClone(prop, {
      type: projectedType,
      decorators: projectedDecs,
    });

    checker.finishType(projectedProp);
    return projectedProp;
  }

  function projectOperation(op: OperationType): Type {
    const parameters = projectType(op.parameters) as ModelType;
    const returnType = projectType(op.returnType);
    const decorators = projectDecorators(op.decorators);

    const projectedOp = shallowClone(op, {
      decorators,
      parameters,
      returnType,
    });

    if (op.interface) {
      projectedOp.interface = projectedInterfaceScope();
    } else if (op.namespace) {
      projectedOp.namespace = projectedNamespaceScope();
    }

    checker.finishType(projectedOp);
    return applyProjection(op, projectedOp);
  }

  function projectInterface(iface: InterfaceType): Type {
    const operations = new Map<string, OperationType>();
    const decorators = projectDecorators(iface.decorators);
    const projectedIface = shallowClone(iface, {
      decorators,
      operations,
    });

    for (const op of iface.operations.values()) {
      const projectedOp = projectType(op);
      if (projectedOp.kind === "Operation") {
        operations.set(projectedOp.name, projectedOp);
      }
    }

    if (shouldFinishType(iface)) {
      checker.finishType(projectedIface);
    }

    return applyProjection(iface, projectedIface);
  }

  function projectUnion(union: UnionType) {
    const variants = new Map<string | symbol, UnionTypeVariant>();
    const decorators = projectDecorators(union.decorators);

    const projectedUnion = shallowClone(union, {
      decorators,
      variants,
    });

    for (const [key, variant] of union.variants) {
      const projectedVariant = projectType(variant);
      if (projectedVariant.kind === "UnionVariant" && projectedVariant.type !== neverType) {
        variants.set(key, projectedVariant);
      }
    }

    if (shouldFinishType(union)) {
      checker.finishType(projectedUnion);
    }

    return applyProjection(union, projectedUnion);
  }

  function projectUnionVariant(variant: UnionTypeVariant) {
    const projectedType = projectType(variant.type);
    const projectedDecs = projectDecorators(variant.decorators);

    const projectedVariant = shallowClone(variant, {
      type: projectedType,
      decorators: projectedDecs,
    });

    checker.finishType(projectedVariant);
    return projectedVariant;
  }

  function projectArray(array: ArrayType) {
    const projectedType = projectType(array.elementType);

    const projectedArray = shallowClone(array, {
      elementType: projectedType,
    });

    checker.finishType(projectedArray);
    return projectedArray;
  }

  function projectTuple(tuple: TupleType) {
    const values: Type[] = [];
    const projectedTuple = shallowClone(tuple, {
      values,
    });

    for (const item of tuple.values) {
      values.push(projectType(item));
    }

    return projectedTuple;
  }

  function projectEnum(e: EnumType) {
    const members: EnumMemberType[] = [];
    const decorators = projectDecorators(e.decorators);
    const projectedEnum = shallowClone(e, {
      members,
      decorators,
    });

    for (const member of e.members) {
      const projectedMember = projectType(member);
      if (projectedMember.kind === "EnumMember") {
        members.push(projectedMember);
      }
    }

    checker.finishType(projectedEnum);
    return applyProjection(e, projectedEnum);
  }

  function projectEnumMember(e: EnumMemberType) {
    const decorators = projectDecorators(e.decorators);
    const projectedMember = shallowClone(e, {
      decorators,
    });
    const parentEnum = projectType(e.enum) as EnumType;
    projectedMember.enum = parentEnum;
    checker.finishType(projectedMember);
    return projectedMember;
  }

  function projectDecorators(decs: DecoratorApplication[]) {
    const decorators: DecoratorApplication[] = [];
    for (const dec of decs) {
      const args: DecoratorArgument[] = [];
      for (const arg of dec.args) {
        // filter out primitive arguments
        if (typeof arg.value !== "object") {
          args.push(arg);
          continue;
        }

        const projected = projectType(arg.value);
        args.push({ ...arg, value: projected });
      }

      decorators.push({ ...dec, args });
    }

    return decorators;
  }

  function getInScopeProjections() {
    const candidates = new Set(projections);
    const inScope: ProjectionApplication[] = [];
    let currentScope = namespaceScope();

    outer: while (currentScope) {
      for (const candidate of candidates) {
        if (!candidate.scope || candidate.scope === currentScope) {
          candidates.delete(candidate);
          inScope.push(candidate);

          if (candidates.size === 0) {
            break outer;
          }
        }
      }
      currentScope = currentScope.namespace;
    }

    return inScope;
  }

  function namespaceScope(): NamespaceType | undefined {
    for (let i = scope.length - 1; i >= 0; i--) {
      if ((scope[i] as any).namespace !== undefined) {
        return (scope[i] as any).namespace;
      }
    }

    return undefined;
  }

  function projectedNamespaceScope(): NamespaceType | undefined {
    const ns = namespaceScope();
    if (!ns) return ns;
    return projectType(ns) as NamespaceType;
  }

  function interfaceScope(): InterfaceType | undefined {
    for (let i = scope.length - 1; i >= 0; i--) {
      if ("interface" in scope[i]) {
        return (scope[i] as any).interface;
      }
    }

    return undefined;
  }

  function projectedInterfaceScope(): InterfaceType | undefined {
    const iface = interfaceScope();
    if (!iface) return iface;
    if (!projectedTypes.has(iface)) {
      throw new Error("Interface should have been projected already");
    }
    return projectType(iface) as InterfaceType;
  }

  function applyProjection(baseType: Type, projectedType: Type): Type {
    const inScopeProjections = getInScopeProjections();
    for (const projectionApplication of inScopeProjections) {
      const projectionsByName = baseType.projectionsByName(projectionApplication.projectionName);
      if (projectionsByName.length === 0) continue;
      const targetNode =
        projectionApplication.direction === "from"
          ? projectionsByName[0].from!
          : projectionsByName[0].to!;
      const projected = checker.project(projectedType, targetNode, projectionApplication.arguments);
      if (projected !== projectedType) {
        // override the projected type cache with the returned type
        projectedTypes.set(baseType, projected);
        return projected;
      }
    }

    return projectedType;
  }

  function shallowClone<T extends Type>(type: T, additionalProps: Partial<T>) {
    const scopeProps: any = {};
    if ("namespace" in type && type.namespace !== undefined) {
      scopeProps.namespace = projectedNamespaceScope();
    }
    if ("interface" in type && type.interface !== undefined) {
      scopeProps.interface = projectedInterfaceScope();
    }

    const clone = checker.createType({
      ...type,
      ...additionalProps,
      ...scopeProps,
      projectionSource: type,
      projectionBase: type.projectionBase ?? type,
      projector,
    });

    if (type.kind === "Union") {
      // create the options getter
      Object.defineProperty(clone, "options", {
        get(this: UnionType) {
          return Array.from(this.variants.values()).map((v) => v.type);
        },
      });
    }

    projectedTypes.set(type, clone);
    return clone;
  }
}
