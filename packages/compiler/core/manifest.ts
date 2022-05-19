// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import manifest from "../manifest.js";

export const cadlVersion = manifest.version;

export interface CadlManifest {
  /**
   * Version of the cadl compiler.
   */
  version: string;

  /**
   * Full commit sha.
   */
  commit: string;

  /**
   * Number of the pull request, if the build was from a pull request.
   */
  pr?: number;
}

export const MANIFEST: CadlManifest = manifest;
