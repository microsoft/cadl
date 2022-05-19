import { EnumType, InterfaceType, ModelType, UnionType } from "@cadl-lang/compiler";
import { ok, strictEqual } from "assert";

export function assertHasProperties(model: ModelType, props: string[]) {
  strictEqual(model.properties.size, props.length, `Model ${model.name} property count`);
  for (const propName of props) {
    ok(model.properties.has(propName), `Model ${model.name} should have property ${propName}`);
  }
}

export function assertHasVariants(union: UnionType, variants: string[]) {
  strictEqual(union.variants.size, variants.length, `Union ${union.name} variant count`);
  for (const variantName of variants) {
    ok(union.variants.has(variantName), `Union ${union.name} should have variant ${variantName}`);
  }
}
export function assertHasOperations(iface: InterfaceType, operations: string[]) {
  strictEqual(iface.operations.size, operations.length, `Interface ${iface.name} operation count`);
  for (const operationName of operations) {
    ok(
      iface.operations.has(operationName),
      `Interface ${iface.name} should have operation ${operationName}`
    );
  }
}

export function assertHasMembers(enumType: EnumType, members: string[]) {
  strictEqual(enumType.members.length, members.length, `Enum ${enumType.name} member count`);
  for (const member of members) {
    ok(
      enumType.members.findIndex((m) => m.name === member) > -1,
      `Enum ${enumType.name} should have member ${member}`
    );
  }
}
