import { camelCase, paramCase, pascalCase, snakeCase } from "change-case";
import { Checker } from "./checker.js";
import { assertType, ProjectionError } from "./diagnostics.js";
import { ObjectType, Type, UnionTypeVariant } from "./types.js";

export function createProjectionMembers(checker: Checker): {
  [TKind in Type["kind"]]?: Record<string, (base: Type & { kind: TKind }) => Type>;
} {
  const { voidType, neverType, createType, createFunctionType, createLiteralType, cloneType } =
    checker;

  return {
    Array: {
      elementType(base) {
        return base.elementType;
      },
    },
    Model: {
      name(base) {
        return createLiteralType(base.name);
      },
      projectionSource(base) {
        return base.projectionSource || voidType;
      },
      projectionBase(base) {
        return base.projectionBase || voidType;
      },
      properties(base) {
        return createType({
          kind: "Object",
          properties: {
            forEach: createFunctionType((block: Type) => {
              assertType("block", block, "Function");
              const props = Array.from(base.properties.values());
              props.forEach((p) => block.call(p));
              return voidType;
            }),
          },
        }) as ObjectType;
      },
      renameProperty(base) {
        return createFunctionType((oldNameT: Type, newNameT: Type) => {
          assertType("current property name", oldNameT, "String");
          assertType("new property name", newNameT, "String");
          const oldName = oldNameT.value;
          const newName = newNameT.value;

          const prop = base.properties.get(oldName);
          if (!prop) {
            throw new ProjectionError(`Property ${oldName} not found`);
          }

          prop.name = newName;
          base.properties.delete(oldName);
          base.properties.set(newName, prop);

          return voidType;
        });
      },
      addProperty(base) {
        return createFunctionType((nameT: Type, type: Type, defaultT: Type) => {
          assertType("property", nameT, "String");
          const name = nameT.value;
          const prop = base.properties.get(name);
          if (prop) {
            throw new ProjectionError(`Property ${name} already exists`);
          }

          base.properties.set(
            name,
            createType({
              kind: "ModelProperty",
              name,
              optional: false,
              decorators: [],
              node: undefined as any,
              default: defaultT,
              type,
            })
          );

          return voidType;
        });
      },

      deleteProperty(base) {
        return createFunctionType((nameT: Type) => {
          assertType("property", nameT, "String");
          const name = nameT.value;
          const prop = base.properties.get(name);
          if (!prop) {
            return voidType;
          }
          base.properties.delete(name);
          return voidType;
        });
      },
    },
    ModelProperty: {
      name(base) {
        return createLiteralType(base.name);
      },
      type(base) {
        return base.type;
      },
      setType(base) {
        return createFunctionType((t: Type) => {
          base.type = t;
          return voidType;
        });
      },
      setOptional(base) {
        return createFunctionType((optional: Type) => {
          assertType("Optional", optional, "Boolean");
          base.optional = optional.value;
          return voidType;
        });
      },
    },
    Union: {
      projectionSource(base) {
        return base.projectionSource || voidType;
      },
      projectionBase(base) {
        return base.projectionBase || voidType;
      },
      variants(base) {
        return createType({
          kind: "Object",
          properties: {
            forEach: createFunctionType((block: Type) => {
              assertType("block", block, "Function");
              const variants = Array.from(base.variants.values());
              variants.forEach((p) => block.call(p));
              return voidType;
            }),
          },
        }) as ObjectType;
      },
      renameVariant(base) {
        return createFunctionType((oldNameT: Type, newNameT: Type) => {
          assertType("old variant name", oldNameT, "String");
          assertType("new vaariant name", newNameT, "String");
          const oldName = oldNameT.value;
          const newName = newNameT.value;

          const variant = base.variants.get(oldName);
          if (!variant) {
            throw new ProjectionError(`Couldn't find variant ${variant}`);
          }
          base.variants.delete(oldName);
          base.variants.set(newName, variant);
          if (variant.kind === "UnionVariant") {
            variant.name = newName;
          }

          return voidType;
        });
      },
      addVariant(base) {
        return createFunctionType((nameT: Type, type: Type) => {
          assertType("Variant name", nameT, "String");
          const name = nameT.value;
          const variantType: UnionTypeVariant = createType({
            kind: "UnionVariant",
            decorators: [],
            name,
            node: undefined,
            type,
          });
          base.variants.set(name, variantType);
          return voidType;
        });
      },
      deleteVariant(base) {
        return createFunctionType((nameT: Type) => {
          assertType("Name", nameT, "String");
          const name = nameT.value;
          base.variants.delete(name);
          return voidType;
        });
      },
    },
    UnionVariant: {
      name(base) {
        if (typeof base.name === "string") {
          return createLiteralType(base.name);
        } else {
          throw new ProjectionError("Can't refer to name of anonymous union variant");
        }
      },
      setType(base) {
        return createFunctionType((type: Type) => {
          base.type = type;
          return voidType;
        });
      },
      type(base) {
        return base.type;
      },
    },
    Operation: {
      projectionSource(base) {
        return base.projectionSource || voidType;
      },
      projectionBase(base) {
        return base.projectionBase || voidType;
      },
      name(base) {
        return createLiteralType(base.name);
      },
      parameters(base) {
        return base.parameters;
      },
      returnType(base) {
        return base.returnType;
      },
    },
    Interface: {
      projectionSource(base) {
        return base.projectionSource || voidType;
      },
      projectionBase(base) {
        return base.projectionBase || voidType;
      },
      operations(base) {
        return createType({
          kind: "Object",
          properties: {
            forEach: createFunctionType((block: Type) => {
              assertType("block", block, "Function");
              const props = Array.from(base.operations.values());
              props.forEach((p) => block.call(p));
              return voidType;
            }),
          },
        });
      },
      renameOperation(base) {
        return createFunctionType((oldNameT: Type, newNameT: Type) => {
          assertType("operation name", oldNameT, "String");
          assertType("operation name", newNameT, "String");
          const oldName = oldNameT.value;
          const newName = newNameT.value;
          const op = base.operations.get(oldName);
          if (!op) {
            throw new ProjectionError(`Couldn't find operation named ${oldName}`);
          }
          const clone = cloneType(op);
          clone.name = newName;
          base.operations.delete(oldName);
          base.operations.set(newName, clone);

          return voidType;
        });
      },
      addOperation(base) {
        return createFunctionType((nameT: Type, parameters: Type, returnType: Type) => {
          assertType("operation name", nameT, "String");
          assertType("parameters", parameters, "Model");
          const name = nameT.value;
          const prop = base.operations.get(name);
          if (prop) {
            throw new ProjectionError(`Operation named ${name} already exists`);
          }

          base.operations.set(
            name,
            createType({
              kind: "Operation",
              name,
              node: undefined as any,
              parameters,
              returnType,
              decorators: [],
            })
          );
          return voidType;
        });
      },
      deleteOperation(base) {
        return createFunctionType((nameT: Type) => {
          assertType("operation name", nameT, "String");
          const name = nameT.value;

          const prop = base.operations.get(name);
          if (!prop) {
            return voidType;
          }
          base.operations.delete(name);

          return voidType;
        });
      },
    },
    Enum: {
      projectionSource(base) {
        return base.projectionSource ?? voidType;
      },
      projectionBase(base) {
        return base.projectionBase || voidType;
      },
      members(base) {
        return createType({
          kind: "Object",
          properties: {
            forEach: createFunctionType((block: Type) => {
              assertType("parameter", block, "Function");
              const props = Array.from(base.members);
              props.forEach((p) => block.call(p));
              return voidType;
            }),
          },
        });
      },
      name(base) {
        return createLiteralType(base.name);
      },
      addMember(base) {
        return createFunctionType((nameT: Type, type?: Type) => {
          assertType("enum member", nameT, "String");
          type && assertType("enum type", type, "String", "Number");

          const name = nameT.value;
          const member = base.members.find((member) => member.name === name);
          if (member) {
            throw new ProjectionError(`Enum already has a member named ${name}`);
          }

          if (type !== undefined && type.kind !== "Number" && type.kind !== "String") {
            throw new ProjectionError(`Enum member types must be string or number`);
          }

          base.members.push(
            createType({
              kind: "EnumMember",
              enum: base,
              name,
              decorators: [],
              node: undefined as any,
              value: type ? type.value : undefined,
            })
          );

          return voidType;
        });
      },
      deleteMember(base) {
        return createFunctionType((nameT: Type) => {
          assertType("enum member", nameT, "String");

          const name = nameT.value;

          const member = base.members.findIndex((member) => member.name === name);
          if (member === -1) return voidType;

          base.members.splice(member, 1);

          return voidType;
        });
      },
      renameMember(base) {
        return createFunctionType((nameT: Type, newNameT: Type) => {
          assertType("enum member", nameT, "String");
          assertType("enum member", newNameT, "String");

          const name = nameT.value;
          const newName = newNameT.value;

          const member = base.members.find((member) => member.name === name);
          if (!member) {
            throw new ProjectionError(`Enum doesn't have member ${name}`);
          }
          member.name = newName;
          return voidType;
        });
      },
    },
    EnumMember: {
      name(base) {
        return createLiteralType(base.name);
      },
      type(base) {
        return base.value ? createLiteralType(base.value) : neverType;
      },
    },
    String: {
      toCamelCase(base) {
        return createFunctionType(() => {
          return createLiteralType(camelCase(base.value));
        });
      },
      toPascalCase(base) {
        return createFunctionType(() => {
          return createLiteralType(pascalCase(base.value));
        });
      },
      toSnakeCase(base) {
        return createFunctionType(() => {
          return createLiteralType(snakeCase(base.value));
        });
      },
      toKebabCase(base) {
        return createFunctionType(() => {
          return createLiteralType(paramCase(base.value));
        });
      },
    },
  };
}
