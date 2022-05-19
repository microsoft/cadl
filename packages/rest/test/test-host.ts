import { Diagnostic } from "@cadl-lang/compiler";
import {
  BasicTestRunner,
  createTestHost,
  createTestWrapper,
  expectDiagnosticEmpty,
  TestHost,
} from "@cadl-lang/compiler/testing";
import { HttpVerb } from "../src/http.js";
import {
  getAllRoutes,
  HttpOperationParameter,
  OperationDetails,
  RouteOptions,
} from "../src/route.js";
import { RestTestLibrary } from "../src/testing/index.js";

export async function createRestTestHost(): Promise<TestHost> {
  return createTestHost({
    libraries: [RestTestLibrary],
  });
}

export async function createRestTestRunner(): Promise<BasicTestRunner> {
  const host = await createRestTestHost();
  return createTestWrapper(
    host,
    (code) =>
      `import "@cadl-lang/rest"; namespace TestNamespace; using Cadl.Rest; using Cadl.Http; ${code}`
  );
}

export interface RouteDetails {
  path: string;
  verb: HttpVerb;
  params: string[];
}

export async function getRoutesFor(
  code: string,
  routeOptions?: RouteOptions
): Promise<RouteDetails[]> {
  const [routes, diagnostics] = await compileOperations(code, routeOptions);
  expectDiagnosticEmpty(diagnostics);
  return routes.map((route) => ({
    ...route,
    params: route.params.params
      .map(({ type, name }) => (type === "path" ? name : undefined))
      .filter((p) => p !== undefined) as string[],
  }));
}

export interface SimpleOperationDetails {
  verb: HttpVerb;
  path: string;
  params: {
    params: Array<{ name: string; type: HttpOperationParameter["type"] }>;
    body?: string;
  };
}

export async function compileOperations(
  code: string,
  routeOptions?: RouteOptions
): Promise<[SimpleOperationDetails[], readonly Diagnostic[]]> {
  const [routes, diagnostics] = await getOperations(code, routeOptions);

  const details = routes.map((r) => {
    return {
      verb: r.verb,
      path: r.path,
      params: {
        params: r.parameters.parameters.map(({ type, name }) => ({ type, name })),
        body: r.parameters.body?.name,
      },
    };
  });

  return [details, diagnostics];
}

export async function getOperations(
  code: string,
  routeOptions?: RouteOptions
): Promise<[OperationDetails[], readonly Diagnostic[]]> {
  const runner = await createRestTestRunner();
  await runner.compileAndDiagnose(code, { noEmit: true });
  const routes = getAllRoutes(runner.program, routeOptions);
  return [routes, runner.program.diagnostics];
}
