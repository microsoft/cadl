import { resolve } from "path";
import type { Plugin, ResolvedConfig } from "vite";
import { CadlBundle, createCadlBundle, watchCadlBundle } from "./bundler.js";

export interface CadlBundlePluginOptions {
  folderName: string;

  /**
   * Name of libraries to bundle.
   */
  libraries: string[];
}

export function cadlBundlePlugin(options: CadlBundlePluginOptions): Plugin {
  let config: ResolvedConfig;

  return {
    name: "cadl-bundle",
    enforce: "pre",
    async configResolved(c) {
      config = c;
    },
    async configureServer(server) {
      const bundles: Record<string, CadlBundle> = {};
      for (const library of options.libraries) {
        await watchBundleLibrary(config.root, library, (bundle) => {
          bundles[library] = bundle;
          server.ws.send({ type: "full-reload" });
        });
      }

      server.middlewares.use((req, res, next) => {
        const id = req.url;
        if (id === undefined) {
          next();
          return;
        }
        const start = `/${options.folderName}/`;
        if (id.startsWith(start) && id.endsWith(".js")) {
          const pkgId = id.slice(start.length, -".js".length);
          if (bundles[pkgId]) {
            res.writeHead(200, "Ok", { "Content-Type": "application/javascript" });
            res.write(bundles[pkgId].content);
            res.end();
            return;
          }
        }
        next();
      });
    },

    async generateBundle() {
      for (const name of options.libraries) {
        const bundle = await bundleLibrary(config.root, name);
        this.emitFile({
          type: "asset",
          fileName: `${options.folderName}/${name}.js`,
          source: bundle.content,
        });
      }
    },
  };
}

async function bundleLibrary(projectRoot: string, name: string) {
  return await createCadlBundle(resolve(projectRoot, "node_modules", name));
}
async function watchBundleLibrary(
  projectRoot: string,
  name: string,
  onChange: (bundle: CadlBundle) => void
) {
  return await watchCadlBundle(resolve(projectRoot, "node_modules", name), onChange);
}
