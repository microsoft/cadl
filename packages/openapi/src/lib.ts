import { createCadlLibrary, paramMessage } from "@cadl-lang/compiler";

export const libDef = {
  name: "@cadl-lang/openapi",
  diagnostics: {
    "invalid-extension-key": {
      severity: "error",
      messages: {
        default: paramMessage`OpenAPI extension must start with 'x-' but was '${"value"}'`,
      },
    },
    "duplicate-type-name": {
      severity: "error",
      messages: {
        default: paramMessage`Duplicate type name: '${"value"}'. Check @friendlyName decorators and overlap with types in Cadl or service namespace.`,
        parameter: paramMessage`Duplicate parameter key: '${"value"}'. Check @friendlyName decorators and overlap with types in Cadl or service namespace.`,
      },
    },
  },
} as const;
export const { reportDiagnostic } = createCadlLibrary(libDef);
