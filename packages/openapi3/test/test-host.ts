import { createTestHost, createTestWrapper, resolveVirtualPath } from "@cadl-lang/compiler/testing";
import { OpenAPITestLibrary } from "@cadl-lang/openapi/testing";
import { RestTestLibrary } from "@cadl-lang/rest/testing";
import { VersioningTestLibrary } from "@cadl-lang/versioning/testing";
import { OpenAPI3TestLibrary } from "../src/testing/index.js";

export async function createOpenAPITestHost() {
  return createTestHost({
    libraries: [RestTestLibrary, VersioningTestLibrary, OpenAPITestLibrary, OpenAPI3TestLibrary],
  });
}

export async function createOpenAPITestRunner() {
  const host = await createOpenAPITestHost();
  return createTestWrapper(
    host,
    (code) =>
      `import "@cadl-lang/rest"; import "@cadl-lang/openapi"; import "@cadl-lang/openapi3"; using Cadl.Rest; using Cadl.Http; using OpenAPI; ${code}`,
    { emitters: ["@cadl-lang/openapi3"] }
  );
}

function versionedOutput(path: string, version: string) {
  return path.replace(".json", "." + version + ".json");
}

export async function diagnoseOpenApiFor(code: string) {
  const runner = await createOpenAPITestRunner();
  return await runner.diagnose(code);
}

export async function openApiFor(code: string, versions?: string[]) {
  const host = await createOpenAPITestHost();
  const outPath = resolveVirtualPath("openapi.json");
  host.addCadlFile(
    "./main.cadl",
    `import "@cadl-lang/rest"; import "@cadl-lang/openapi"; import "@cadl-lang/openapi3"; ${
      versions ? `import "@cadl-lang/versioning"; ` : ""
    }using Cadl.Rest;using Cadl.Http;using OpenAPI;${code}`
  );
  await host.compile("./main.cadl", {
    noEmit: false,
    swaggerOutputFile: outPath,
    emitters: ["@cadl-lang/openapi3"],
  });

  if (!versions) {
    return JSON.parse(host.fs.get(outPath)!);
  } else {
    const output: any = {};
    for (const version of versions) {
      output[version] = JSON.parse(host.fs.get(versionedOutput(outPath, version))!);
    }
    return output;
  }
}

export async function checkFor(code: string) {
  const host = await createOpenAPITestRunner();
  return await host.diagnose(code);
}

export async function oapiForModel(name: string, modelDef: string) {
  const oapi = await openApiFor(`
    ${modelDef};
    @route("/")
    namespace root {
      op read(): { @body body: ${name} };
    }
  `);

  const useSchema = oapi.paths["/"].get.responses[200].content["application/json"].schema;

  return {
    isRef: !!useSchema.$ref,
    useSchema,
    schemas: oapi.components.schemas || {},
  };
}
