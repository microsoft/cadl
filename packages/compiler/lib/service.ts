import { setDecoratorNamespace } from "../core/library.js";
import { createDiagnostic } from "../core/messages.js";
import { Program } from "../core/program.js";
import { DecoratorContext, NamespaceType, Projector, Type } from "../core/types.js";

interface ServiceDetails {
  namespace?: NamespaceType;
  title?: string;
  version?: string;
  host?: string;
}

const programServiceDetails = new WeakMap<Program | Projector, ServiceDetails>();
function getServiceDetails(program: Program) {
  let serviceDetails = programServiceDetails.get(program.currentProjector ?? program);
  if (!serviceDetails) {
    serviceDetails = {};
    programServiceDetails.set(program.currentProjector ?? program, serviceDetails);
  }

  return serviceDetails;
}

export function setServiceNamespace(program: Program, namespace: NamespaceType): void {
  const serviceDetails = getServiceDetails(program);
  if (serviceDetails.namespace && serviceDetails.namespace !== namespace) {
    program.reportDiagnostic(
      createDiagnostic({ code: "service-namespace-duplicate", target: namespace })
    );
  }

  serviceDetails.namespace = namespace;
}

export function checkIfServiceNamespace(program: Program, namespace: NamespaceType): boolean {
  const serviceDetails = getServiceDetails(program);
  return serviceDetails.namespace === namespace;
}

setDecoratorNamespace("Cadl", $serviceTitle, $serviceHost, $serviceVersion);

export function $serviceTitle({ program }: DecoratorContext, target: Type, title: string) {
  const serviceDetails = getServiceDetails(program);
  if (serviceDetails.title) {
    program.reportDiagnostic(
      createDiagnostic({
        code: "service-decorator-duplicate",
        format: { name: "title" },
        target,
      })
    );
  }

  if (target.kind !== "Namespace") {
    program.reportDiagnostic(
      createDiagnostic({
        code: "service-decorator-namespace-only",
        format: { decorator: "@serviceTitle" },
        target,
      })
    );
    return;
  }

  setServiceNamespace(program, target);
  serviceDetails.title = title;
}

export function getServiceTitle(program: Program): string {
  const serviceDetails = getServiceDetails(program);
  return serviceDetails.title || "(title)";
}

export function $serviceHost({ program }: DecoratorContext, target: Type, host: string) {
  const serviceDetails = getServiceDetails(program);
  if (serviceDetails.version) {
    program.reportDiagnostic(
      createDiagnostic({
        code: "service-decorator-duplicate",
        format: { name: "host" },
        target,
      })
    );
  }

  if (target.kind !== "Namespace") {
    program.reportDiagnostic(
      createDiagnostic({
        code: "service-decorator-namespace-only",
        format: { decorator: "@serviceHost" },
        target,
      })
    );
    return;
  }

  setServiceNamespace(program, target);
  serviceDetails.host = host;
}

export function getServiceHost(program: Program): string | undefined {
  const serviceDetails = getServiceDetails(program);
  return serviceDetails.host;
}

export function setServiceHost(program: Program, host: string) {
  const serviceDetails = getServiceDetails(program);
  serviceDetails.host = host;
}

export function $serviceVersion({ program }: DecoratorContext, target: Type, version: string) {
  const serviceDetails = getServiceDetails(program);
  if (serviceDetails.version) {
    program.reportDiagnostic(
      createDiagnostic({
        code: "service-decorator-duplicate",
        format: { name: "version" },
        target,
      })
    );
  }

  if (target.kind !== "Namespace") {
    program.reportDiagnostic(
      createDiagnostic({
        code: "service-decorator-namespace-only",
        format: { decorator: "@serviceVersion" },
        target,
      })
    );
    return;
  }

  setServiceNamespace(program, target);
  serviceDetails.version = version;
}

export function getServiceVersion(program: Program): string {
  const serviceDetails = getServiceDetails(program);
  return serviceDetails.version || "0000-00-00";
}

export function getServiceNamespace(program: Program): NamespaceType | undefined {
  const serviceDetails = getServiceDetails(program);
  return serviceDetails.namespace ?? program.checker.getGlobalNamespaceType();
}

export function getServiceNamespaceString(program: Program): string | undefined {
  const serviceDetails = getServiceDetails(program);
  return (
    (serviceDetails.namespace && program.checker.getNamespaceString(serviceDetails.namespace)) ||
    undefined
  );
}
