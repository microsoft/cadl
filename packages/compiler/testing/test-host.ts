import assert from "assert";
import { readFile } from "fs/promises";
import { globby } from "globby";
import { fileURLToPath, pathToFileURL } from "url";
import { createSourceFile, logDiagnostics, logVerboseTestOutput } from "../core/diagnostics.js";
import { NodeHost } from "../core/node-host.js";
import { CompilerOptions } from "../core/options.js";
import { getAnyExtensionFromPath, resolvePath } from "../core/path-utils.js";
import { createProgram, Program } from "../core/program.js";
import { CompilerHost, Diagnostic, Type } from "../core/types.js";
import { expectDiagnosticEmpty } from "./expect.js";
import { BasicTestRunner, createTestWrapper } from "./test-utils.js";
import {
  CadlTestLibrary,
  TestFileSystem,
  TestHost,
  TestHostConfig,
  TestHostError,
} from "./types.js";

export function resolveVirtualPath(path: string, ...paths: string[]) {
  // NB: We should always resolve an absolute path, and there is no absolute
  // path that works across OSes. This ensures that we can still rely on API
  // like pathToFileURL in tests.
  const rootDir = process.platform === "win32" ? "Z:/test" : "/test";
  return resolvePath(rootDir, path, ...paths);
}

function createTestCompilerHost(
  virtualFs: Map<string, string>,
  jsImports: Map<string, Record<string, any>>
): CompilerHost {
  return {
    async readUrl(url: string) {
      const contents = virtualFs.get(url);
      if (contents === undefined) {
        throw new TestHostError(`File ${url} not found.`, "ENOENT");
      }
      return createSourceFile(contents, url);
    },
    async readFile(path: string) {
      path = resolveVirtualPath(path);
      const contents = virtualFs.get(path);
      if (contents === undefined) {
        throw new TestHostError(`File ${path} not found.`, "ENOENT");
      }
      return createSourceFile(contents, path);
    },

    async writeFile(path: string, content: string) {
      path = resolveVirtualPath(path);
      virtualFs.set(path, content);
    },

    async readDir(path: string) {
      path = resolveVirtualPath(path);
      return [...virtualFs.keys()]
        .filter((x) => x.startsWith(`${path}/`))
        .map((x) => x.replace(`${path}/`, ""));
    },

    async removeDir(path: string) {
      path = resolveVirtualPath(path);

      for (const key of virtualFs.keys()) {
        if (key.startsWith(`${path}/`)) {
          virtualFs.delete(key);
        }
      }
    },

    getLibDirs() {
      return [resolveVirtualPath(".cadl/lib"), resolveVirtualPath(".cadl/test-lib")];
    },

    getExecutionRoot() {
      return resolveVirtualPath(".cadl");
    },

    async getJsImport(path) {
      path = resolveVirtualPath(path);
      const module = jsImports.get(path);
      if (module === undefined) {
        throw new TestHostError(`Module ${path} not found`, "ERR_MODULE_NOT_FOUND");
      }
      return module;
    },

    async stat(path: string) {
      path = resolveVirtualPath(path);

      if (virtualFs.has(path)) {
        return {
          isDirectory() {
            return false;
          },
          isFile() {
            return true;
          },
        };
      }

      for (const fsPath of virtualFs.keys()) {
        if (fsPath.startsWith(path) && fsPath !== path) {
          return {
            isDirectory() {
              return true;
            },
            isFile() {
              return false;
            },
          };
        }
      }

      throw new TestHostError(`File ${path} not found`, "ENOENT");
    },

    // symlinks not supported in test-host
    async realpath(path) {
      return path;
    },

    logSink: NodeHost.logSink,
    mkdirp: async (path: string) => path,
    fileURLToPath,
    pathToFileURL(path: string) {
      return pathToFileURL(path).href;
    },
  };
}

export async function createTestFileSystem(): Promise<TestFileSystem> {
  const virtualFs = new Map<string, string>();
  const jsImports = new Map<string, Promise<any>>();

  const compilerHost = createTestCompilerHost(virtualFs, jsImports);
  return {
    addCadlFile,
    addJsFile,
    addRealCadlFile,
    addRealJsFile,
    addCadlLibrary,
    compilerHost,
    fs: virtualFs,
  };

  function addCadlFile(path: string, contents: string) {
    virtualFs.set(resolveVirtualPath(path), contents);
  }

  function addJsFile(path: string, contents: any) {
    const key = resolveVirtualPath(path);
    virtualFs.set(key, ""); // don't need contents
    jsImports.set(key, new Promise((r) => r(contents)));
  }

  async function addRealCadlFile(path: string, existingPath: string) {
    virtualFs.set(resolveVirtualPath(path), await readFile(existingPath, "utf8"));
  }

  async function addRealJsFile(path: string, existingPath: string) {
    const key = resolveVirtualPath(path);
    const exports = await import(pathToFileURL(existingPath).href);

    virtualFs.set(key, "");
    jsImports.set(key, exports);
  }

  async function addCadlLibrary(testLibrary: CadlTestLibrary) {
    for (const { realDir, pattern, virtualPath } of testLibrary.files) {
      const lookupDir = resolvePath(testLibrary.packageRoot, realDir);
      const entries = await findFilesFromPattern(lookupDir, pattern);
      for (const entry of entries) {
        const fileRealPath = resolvePath(lookupDir, entry);
        const fileVirtualPath = resolveVirtualPath(virtualPath, entry);
        switch (getAnyExtensionFromPath(fileRealPath)) {
          case ".cadl":
          case ".json":
            const contents = await readFile(fileRealPath, "utf-8");
            addCadlFile(fileVirtualPath, contents);
            break;
          case ".js":
          case ".mjs":
            await addRealJsFile(fileVirtualPath, fileRealPath);
            break;
        }
      }
    }
  }
}

export const StandardTestLibrary: CadlTestLibrary = {
  name: "@cadl-lang/compiler",
  packageRoot: resolvePath(fileURLToPath(import.meta.url), "../../../"),
  files: [
    { virtualPath: "./.cadl/dist/lib", realDir: "./dist/lib", pattern: "*" },
    { virtualPath: "./.cadl/lib", realDir: "./lib", pattern: "*" },
  ],
};

export async function createTestHost(config: TestHostConfig = {}): Promise<TestHost> {
  const testHost = await createTestHostInternal();
  await testHost.addCadlLibrary(StandardTestLibrary);
  if (config.libraries) {
    for (const library of config.libraries) {
      await testHost.addCadlLibrary(library);
    }
  }
  return testHost;
}

export async function createTestRunner(): Promise<BasicTestRunner> {
  const testHost = await createTestHost();
  return createTestWrapper(testHost, (code) => code);
}

async function createTestHostInternal(): Promise<TestHost> {
  let program: Program | undefined;
  const testTypes: Record<string, Type> = {};
  const fileSystem = await createTestFileSystem();

  // add test decorators
  fileSystem.addCadlFile(".cadl/test-lib/main.cadl", 'import "./test.js";');
  fileSystem.addJsFile(".cadl/test-lib/test.js", {
    $test(_: any, target: Type, name?: string) {
      if (!name) {
        if (
          target.kind === "Model" ||
          target.kind === "Namespace" ||
          target.kind === "Enum" ||
          target.kind === "Operation" ||
          target.kind === "ModelProperty" ||
          target.kind === "EnumMember" ||
          target.kind === "Interface" ||
          (target.kind === "Union" && !target.expression)
        ) {
          name = target.name!;
        } else {
          throw new Error("Need to specify a name for test type");
        }
      }

      testTypes[name] = target;
    },
  });

  return {
    ...fileSystem,
    compile,
    diagnose,
    compileAndDiagnose,
    testTypes,
    get program() {
      assert(
        program,
        "Program cannot be accessed without calling compile, diagnose, or compileAndDiagnose."
      );
      return program;
    },
  };

  async function compile(main: string, options: CompilerOptions = {}) {
    const [testTypes, diagnostics] = await compileAndDiagnose(main, options);
    expectDiagnosticEmpty(diagnostics);
    return testTypes;
  }

  async function diagnose(main: string, options: CompilerOptions = {}) {
    const [, diagnostics] = await compileAndDiagnose(main, options);
    return diagnostics;
  }

  async function compileAndDiagnose(
    mainFile: string,
    options: CompilerOptions = {}
  ): Promise<[Record<string, Type>, readonly Diagnostic[]]> {
    if (options.noEmit === undefined) {
      // default for tests is noEmit
      options = { ...options, noEmit: true };
    }
    const p = await createProgram(fileSystem.compilerHost, mainFile, options);
    program = p;
    logVerboseTestOutput((log) => logDiagnostics(p.diagnostics, p.logger));
    return [testTypes, p.diagnostics];
  }
}

export async function findFilesFromPattern(directory: string, pattern: string): Promise<string[]> {
  return globby(pattern, {
    cwd: directory,
    onlyFiles: true,
  });
}
