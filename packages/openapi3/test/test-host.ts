import { createTestHost, resolveVirtualPath } from "@cadl-lang/compiler/testing";
import { OpenAPITestLibrary } from "@cadl-lang/openapi/testing";
import { RestTestLibrary } from "@cadl-lang/rest/testing";
import { VersioningTestLibrary } from "@cadl-lang/versioning/testing";
import { OpenAPI3TestLibrary } from "../src/testing/index.js";

export async function createOpenAPITestHost() {
  return createTestHost({
    libraries: [RestTestLibrary, VersioningTestLibrary, OpenAPITestLibrary, OpenAPI3TestLibrary],
  });
}

function versionedOutput(path: string, version: string) {
  return path.replace(".json", "." + version + ".json");
}
export async function openApiFor(code: string, versions?: string[]) {
  const host = await createOpenAPITestHost();
  const outPath = resolveVirtualPath("openapi.json");
  host.addCadlFile(
    "./main.cadl",
    `import "@cadl-lang/rest"; import "@cadl-lang/openapi"; import "@cadl-lang/openapi3"; ${
      versions ? `import "@cadl-lang/versioning"; ` : ""
    }using Cadl.Rest;using Cadl.Http;${code}`
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
  const host = await createOpenAPITestHost();
  host.addCadlFile(
    "./main.cadl",
    `import "@cadl-lang/rest"; import "@cadl-lang/openapi"; import "@cadl-lang/openapi3"; using Cadl.Rest; using Cadl.Http;${code}`
  );
  const result = await host.diagnose("./main.cadl", {
    noEmit: false,
    emitters: ["@cadl-lang/openapi3"],
  });
  return result;
}