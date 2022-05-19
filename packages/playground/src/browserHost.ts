import { CompilerHost, createSourceFile, resolvePath } from "@cadl-lang/compiler";
import { PlaygroundManifest } from "./manifest";

export interface BrowserHost extends CompilerHost {
  unlink(path: string): Promise<void>;
}

export function resolveVirtualPath(path: string, ...paths: string[]) {
  return resolvePath("/test", path, ...paths);
}

export async function createBrowserHost(): Promise<BrowserHost> {
  const virtualFs = new Map<string, string>();
  const jsImports = new Map<string, Promise<any>>();
  const libsToLoad = PlaygroundManifest.libraries;

  for (const libName of libsToLoad) {
    const { _CadlLibrary_ } = await import(/* @vite-ignore */ libName);
    for (const [key, value] of Object.entries<any>(_CadlLibrary_.cadlSourceFiles)) {
      virtualFs.set(`/test/node_modules/${libName}/${key}`, value);
    }
    for (const [key, value] of Object.entries<any>(_CadlLibrary_.jsSourceFiles)) {
      addJsImport(`/test/node_modules/${libName}/${key}`, value);
    }
  }

  function addJsImport(path: string, value: any) {
    virtualFs.set(path, "");
    jsImports.set(path, value);
  }
  return {
    async readUrl(url: string) {
      const contents = virtualFs.get(url);
      if (contents === undefined) {
        const e = new Error(`File ${url} not found.`);
        (e as any).code = "ENOENT";
        throw e;
      }
      return createSourceFile(contents, url);
    },
    async readFile(path: string) {
      path = resolveVirtualPath(path);
      const contents = virtualFs.get(path);
      if (contents === undefined) {
        const e = new Error(`File ${path} not found.`);
        (e as any).code = "ENOENT";
        throw e;
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
      return [resolveVirtualPath("/test/node_modules/@cadl-lang/compiler/lib")];
    },

    getExecutionRoot() {
      return resolveVirtualPath(".cadl");
    },

    async getJsImport(path) {
      path = resolveVirtualPath(path);
      const module = await jsImports.get(path);
      if (module === undefined) {
        const e = new Error(`Module ${path} not found`);
        (e as any).code = "MODULE_NOT_FOUND";
        throw e;
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
      const e = new Error(`File ${path} not found.`);
      (e as any).code = "ENOENT";
      throw e;
    },

    // symlinks not supported in test-host
    async realpath(path) {
      return path;
    },

    async unlink(path) {
      path = resolveVirtualPath(path);
      virtualFs.delete(path);
    },

    logSink: console,
    mkdirp: async (path: string) => path,
    fileURLToPath(path) {
      return path.replace("inmemory:/", "");
    },
    pathToFileURL(path) {
      return "inmemory:/" + resolveVirtualPath(path);
    },
  };
}
