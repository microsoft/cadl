import { readdir, readFile, stat, writeFile } from "fs/promises";
import { basename, dirname, join, resolve } from "path";

const skipDirs = new Set(["node_modules", "dist-dev"]);

export async function generateThirdPartyNotice() {
  const root = resolve("./");
  const rootName = basename(root);
  const packages = await findThirdPartyPackages();
  const packageRoots = [...packages.keys()].sort((a, b) =>
    packages.get(a).name.localeCompare(packages.get(b).name)
  );
  let text = `${rootName}

THIRD-PARTY SOFTWARE NOTICES AND INFORMATION
Do Not Translate or Localize

This project incorporates components from the projects listed below. The
original copyright notices and the licenses under which Microsoft received such
components are set forth below. Microsoft reserves all rights not expressly
granted herein, whether by implication, estoppel or otherwise.
`;

  let i = 1;
  for (const packageRoot of packageRoots) {
    const pkg = packages.get(packageRoot);
    const url = getUrl(pkg);
    text += `\n${i++}. ${pkg.name} version ${pkg.version} (${url})`;
  }

  for (const packageRoot of packageRoots) {
    const pkg = packages.get(packageRoot);
    const license = await getLicense(packageRoot);
    text += `\n\n
%% ${pkg.name} NOTICES AND INFORMATION BEGIN HERE
=====================================================
${license}
=====================================================");
END OF ${pkg.name} NOTICES AND INFORMATION`;
  }

  await writeFile("ThirdPartyNotices.txt", text);
}

async function findThirdPartyPackages() {
  const root = resolve("./");
  const rootName = basename(root);
  const packages = new Map();

  for await (const map of projectSourcemaps(root)) {
    const contents = JSON.parse(await readFile(map, "utf-8"));
    const sources = contents.sources;
    for (const source of sources) {
      const sourcePath = join(dirname(map), source);
      const packageRoot = await getPackageRoot(sourcePath);
      const pkg = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf-8"));

      if (pkg.name === rootName || /microsoft/i.test(JSON.stringify(pkg.author))) {
        continue;
      }

      if (!packages.has(packageRoot)) {
        packages.set(packageRoot, pkg);
      }
    }
  }

  return packages;
}

async function* projectSourcemaps(rootPath: string): any {
  const files = await readdir(rootPath, { withFileTypes: true });
  for (const file of files) {
    const filepath = join(rootPath, file.name);

    if (file.isDirectory()) {
      if (skipDirs.has(file.name)) {
        continue;
      }

      yield* projectSourcemaps(filepath);
    } else {
      if (file.name.endsWith(".js.map")) {
        yield filepath;
      }
    }
  }
}

async function getPackageRoot(filename: string): Promise<any> {
  const dir = dirname(filename);
  try {
    const pkgPath = join(dir, "package.json");
    await stat(pkgPath);
    return dir;
  } catch (e: any) {
    if (e.code === "ENOENT") {
      return getPackageRoot(dir);
    }
    throw e;
  }
}

function getUrl(pkg: any) {
  let url = pkg.repository;
  if (typeof url !== "string") {
    url = pkg.repository?.url;
  }
  if (!url) {
    throw new Error(`Cannot find URL for ${pkg}`);
  }
  url = url.replace(/^git\+/, "");
  url = url.replace(/\.git$/, "");
  url = url.replace(/^git:\/\//, "https://");
  return url;
}

async function getLicense(packageRoot: string) {
  for (const licenseName of ["LICENSE", "LICENSE.txt", "LICENSE.md", "LICENSE-MIT"]) {
    const licensePath = join(packageRoot, licenseName);
    try {
      let text = await readFile(licensePath, "utf-8");
      text = text.replace("&lt;", "<");
      text = text.replace("&gt;", ">");
      return text;
    } catch (err: any) {
      if (err.code === "ENOENT") {
        continue;
      }
      throw err;
    }
  }

  throw new Error(`Cannot get license for ${packageRoot}, license file not found.`);
}
