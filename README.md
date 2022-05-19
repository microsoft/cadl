# Cadl

Cadl is a language for describing cloud service APIs and generating other API
description languages, client and service code, documentation, and other assets.
Cadl provides highly extensible core language primitives that can describe API
shapes common among REST, GraphQL, gRPC, and other protocols.

You can try a work-in-progress build of the compiler by following the steps in
the Getting Started section below. Please feel free to [file
issues](https://github.com/Microsoft/cadl/issues) for any issues you encounter while
using the preview.

## Packages

| Name                                            | Changelog                    | Latest                                                                                                                             | Next                                                                   |
| ----------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Core functionality                              |                              |                                                                                                                                    |                                                                        |
| [@cadl-lang/compiler][compiler_src]             | [Changelog][compiler_chg]    | [![](https://img.shields.io/npm/v/@cadl-lang/compiler)](https://www.npmjs.com/package/@cadl-lang/compiler)                         | ![](https://img.shields.io/npm/v/@cadl-lang/compiler/next)             |
| Cadl Libraries                                  |                              |                                                                                                                                    |                                                                        |
| [@cadl-lang/rest][rest_src]                     | [Changelog][rest_chg]        | [![](https://img.shields.io/npm/v/@cadl-lang/rest)](https://www.npmjs.com/package/@cadl-lang/rest)                                 | ![](https://img.shields.io/npm/v/@cadl-lang/rest/next)                 |
| [@cadl-lang/openapi][openapi_src]               | [Changelog][openapi_chg]     | [![](https://img.shields.io/npm/v/@cadl-lang/openapi)](https://www.npmjs.com/package/@cadl-lang/openapi)                           | ![](https://img.shields.io/npm/v/@cadl-lang/openapi/next)              |
| [@cadl-lang/openapi3][openapi3_src]             | [Changelog][openapi3_chg]    | [![](https://img.shields.io/npm/v/@cadl-lang/openapi3)](https://www.npmjs.com/package/@cadl-lang/openapi3)                         | ![](https://img.shields.io/npm/v/@cadl-lang/openapi3/next)             |
| [@cadl-lang/versioning][versioning_src]         | [Changelog][versioning_chg]  | [![](https://img.shields.io/npm/v/@cadl-lang/versioning)](https://www.npmjs.com/package/@cadl-lang/versioning)                     | ![](https://img.shields.io/npm/v/@cadl-lang/versioning/next)           |
| Cadl Tools                                      |                              |                                                                                                                                    |                                                                        |
| [@cadl-lang/prettier-plugin-cadl][prettier_src] | [Changelog][prettier_chg]    | [![](https://img.shields.io/npm/v/@cadl-lang/prettier-plugin-cadl)](https://www.npmjs.com/package/@cadl-lang/prettier-plugin-cadl) | ![](https://img.shields.io/npm/v/@cadl-lang/prettier-plugin-cadl/next) |
| [cadl-vs][cadl-vs_src]                          | [Changelog][cadl-vs_chg]     | [![](https://img.shields.io/npm/v/cadl-vs)](https://www.npmjs.com/package/cadl-vs)                                                 | ![](https://img.shields.io/npm/v/cadl-vs/next)                         |
| [cadl-vscode][cadl-vscode_src]                  | [Changelog][cadl-vscode_chg] | [![](https://img.shields.io/npm/v/cadl-vscode)](https://www.npmjs.com/package/cadl-vscode)                                         | ![](https://img.shields.io/npm/v/cadl-vscode/next)                     |
| [tmlanguage-generator][tmlanguage_src]          | [Changelog][tmlanguage_chg]  | [![](https://img.shields.io/npm/v/tmlanguage-generator)](https://www.npmjs.com/package/tmlanguage-generator)                       | ![](https://img.shields.io/npm/v/tmlanguage-generator/next)            |

[compiler_src]: packages/compiler
[compiler_chg]: packages/compiler/CHANGELOG.md
[rest_src]: packages/rest
[rest_chg]: packages/rest/CHANGELOG.md
[openapi_src]: packages/openapi
[openapi_chg]: packages/openapi/CHANGELOG.md
[openapi3_src]: packages/openapi3
[openapi3_chg]: packages/openapi3/CHANGELOG.md
[versioning_src]: packages/versioning
[versioning_chg]: packages/versioning/CHANGELOG.md
[prettier_src]: packages/prettier-plugin-cadl
[prettier_chg]: packages/prettier-plugin-cadl/CHANGELOG.md
[cadl-vs_src]: packages/cadl-vs
[cadl-vs_chg]: packages/cadl-vs/CHANGELOG.md
[cadl-vscode_src]: packages/cadl-vscode
[cadl-vscode_chg]: packages/cadl-vscode/CHANGELOG.md
[tmlanguage_src]: packages/tmlanguage-generator
[tmlanguage_chg]: packages/tmlanguage-generator/CHANGELOG.md

`@next` version of the package are the latest versions available on the `main` branch.

## Getting Started

### Using Docker

[See docker documentation](./docs/docker.md)

### Using Node & Npm

1. Install [Node.js 16 LTS](https://nodejs.org/en/download/) and ensure you are able to run the `npm` command in a command prompt:

   ```bash
   npm --version
   ```

   It is recommended to have npm 7+. To update npm run `npm install -g npm`

2. Create a folder for your new Cadl project

3. **Via init command:** Run `npx -p @cadl-lang/compiler cadl init` > Select openapi3 library template.

4. **Alternatively manually:** In a command prompt, run the following commands:

   ```
   cd path\to\cadl\project
   npm init -y
   npm install -g @cadl-lang/compiler
   npm install @cadl-lang/rest @cadl-lang/openapi3
   ```

   This will create a `package.json` file for your Cadl project and add the necessary Cadl dependencies to it.

5. Install the Cadl extension for your editor of choice:

   - [Instructions for Visual Studio](#installing-visual-studio-extension)
   - [Instructions for Visual Studio Code](#installing-vs-code-extension)

6. Open the folder in your editor and create a new file `main.cadl`

7. [Follow our tutorial](docs/tutorial.md) to get started writing Cadl!

8. Once you're ready to compile your Cadl to Swagger, save the file and type this at the command prompt in your project folder:

   ```
   npx cadl compile . --emit @cadl-lang/openapi3
   ```

   This will compile the Cadl files in the project folder into one output file: `.\cadl-output\openapi.json`.

9. Using `--emit` every time can become tedious. You can create a project file to configure the default emitter.

Create a `cadl-project.yaml` file next to the `package.json` with this content:

```yaml
emitters:
  "@cadl-lang/openapi3": true
```

After you should be able to just run `npx cadl compile .`

## Troubleshooting

[See common issues here](./troubleshooting.md)

## Usage

See full usage documentation by typing:

```
cadl --help
```

### Compiling Cadl source to an OpenAPI 3.0 specification

Here is a very small Cadl example that uses the `@cadl-lang/openapi3` library to generate OpenAPI 3.0 from Cadl.

#### sample.cadl

```cadl
import "@cadl-lang/rest";

using Cadl.Http;

@route("/example")
namespace Example {
  @get
  @route("/message")
  op getMessage(): string;
}

```

You can compile it to OpenAPI 3.0 by using the following command:

```
cadl compile sample.cadl --emit @cadl-lang/openapi3
```

Once it compiles, you can find the emitted OpenAPI document in `./cadl-output/openapi.json.

You can also pass in a directory instead of a file to `cadl compile`. That's
equivalent to passing `main.cadl` in that directory.

### Formatting Cadl files

Cadl provides an auto-formatter to keep your specs clean and organized.
`node_modules` folders are automatically excluded by default

```bash
cadl format <patterns...>

# Format all the files in the current directory with the cadl extension.
cadl format **/*.cadl

# Exclude certain patterns. Either use `!` prefix or pass it via the `--exclude` or `-x` option.
cadl format **/*.cadl "!mytestfolder/**/*"
cadl format **/*.cadl --exclude "mytestfolder/**/*"
```

### Installing VS Code Extension

```
cadl code install
```

This will download and install the latest VS Code extension. Use `cadl code uninstall` to remove it. Pass `--insiders` if you use VS Code Insiders edition.

If `cadl-server` cannot be found on PATH by VS Code in your setup, you can
configure its location in VS Code settings. Search for "Cadl" in File ->
Preferences -> Settings, and adjust `cadl.cadl-server.path` accordingly. You may
need to restart VS Code after changing this. This should be the path to the `@cadl-lang/compiler` package. (e.g. `./node_modules/@cadl-lang/compiler`)

You can also configure a project to use a local npm install of
`@cadl-lang/compiler`. See [local-cadl sample](packages/samples/local-cadl).

### Installing Visual Studio Extension

```
cadl vs install
```

This will download and install the latest Visual Studio extension. Use `cadl vs uninstall` to remove it.

If `cadl-server` cannot be found on PATH by Visual Studio in your setup, you can
configure its location by setting up the `cadl.cadl-server.path` entry in `.vs/VSWorkspaceSettings.json`. You may need to restart Visual Studio after changing this.
This should be the path to the `@cadl-lang/compiler` package. (e.g. `./node_modules/@cadl-lang/compiler`)
