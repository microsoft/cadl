# Change Log - @cadl-lang/compiler

This log was last generated on Fri, 06 May 2022 17:19:57 GMT and should not be manually modified.

## 0.31.0
Fri, 06 May 2022 17:19:57 GMT

### Minor changes

- Prompt on cadl vs install if multiple versions of VS are installed
- Improve module resolution logic to allow compiling a cadl library
- Add code preview and coloring for diagnostics.
- Add ability to import library or emitter defined in parent folder. Adds the ability to use the actual emitter name in a samples folder of that emitter
- Formatter has ability to ignore patterns
- Formatter: remove quotes in model properties when not needed
- Add library loading debug logging
- Include manifest with version and commit
- Rename `mixes` to `extends` for interfaces
- Include reference from parent model to all children
- Cli: Add `--no-emit` flag configuring the `noEmit` compilerOption
- Add `warn-as-error` flag to cli that will return non zero exit code when there is a warning
- Add find references and rename support to language server
- Add goto definition of namespaces, usings, and decorators to language server
- Export `isTemplate` helper method
- Add namespace to model expressions
- Make Program.checker required
- Added formatting to a few more missing syntax(`array`, `tuple`, `template parameters`)
- Add OmitProperties type and @withoutOmittedProperties decorator
- Remove node 14 support
- Log PID and timestamps in language server
- Update to Unicode 14.0 and disallow U+FFFD
- Add option to Checker.getTypeName to filter namespaces

### Patches

- Improve tests for doc decorator
- Add workaround for npx bug causing issue with backslash in cli on windows
- Do not validate default assignment when property type is an error type. Prevent additional unrelated error to the original problem with the property type.
- Fix projection bug setting the namespace of operation with the interface
- Fix logger levels
- Fix issue with using model in template default
- Give a helpful error when code is missing from path
- Don't complete decorator names in type reference position
- Preserve namespace nesting in versioning projections

## 0.30.0
Thu, 31 Mar 2022 17:10:49 GMT

### Minor changes

- Add new helper `cadlTypeToJson` to convert cadl type to a Json serializable type
- Add helper methods to detect `void` and `never` types
- Prevent decorators from running if arguments are errors.
- Handle unknown identfier/error types used in spread operator.
- Add parent .model to ModelTypeProperty
- Add validation that template params cannot use latter params as default

### Patches

- support format in bytes type
- Fix: stack overflow when defining template argument where default reference argument itself. `Foo<T = T>`
- Fix formatting of comment between decorator and statement
- Fix resolving location for diagnostic in js files
- Fix formatting of comment between decorator and property
- Fix using `&` with tempalte parameters
- Support browser builds
- Fix issues with mishandled promises
- Fix cascade of error when having unexpected token in directive

## 0.29.0
Wed, 09 Mar 2022 17:42:09 GMT

### Minor changes

- Move @key decorator to core
- Replace findChildModels with mapChildModels
- **Exports** `NodeHost` for programmatic usage of Cadl 
- **Added** `@knownValues` decorator providing set of known options for a string type
- Using `extends` with intrinsic types will emit diagnostic.
- Allow `op` in interfaces
- Complete using statements and qualified decorators.
- Add back `@inspectType` and `@inspectTypeName` decorators
- Redirect console.log to stderr in language server

### Patches

- Improve list parsing error recovery
- Use the proper symbol to use cadl exports in eval
- Fix issue with missing namespace name in certain cases
- Fix issue using `is` with intrinsic types.
- Fix decorator completion on namespaces
- refactor symbols and other improvements

## 0.28.0
Tue, 15 Feb 2022 22:35:02 GMT

### Minor changes

- Internals: Module resolver not dependent on `CompilerHost`
- Provide reusable decorator validation for target

### Patches

- Fix parser issue with missing error flag when using `interface extends` instead of `interface mixes`.
- Fix parser issue with incorrect `op` in various projection expressions, and wrong node type for `/` and `*`.
- Add support for separate `@summary` from `@doc`

## 0.27.0
Mon, 14 Feb 2022 03:01:07 GMT

### Minor changes

- Provide helper for library to validate parameter
- Update api for decorator taking `DecoratorContext` instead of `Program`

### Patches

- Fix bugs involving merged decorators
- Give nice error for using extends keyword in interfaces
- Implement template parameter defaults
- Bump dependency versions

## 0.26.0
Fri, 04 Feb 2022 18:00:18 GMT

### Minor changes

- Validate for `@doc` decorator argument is a string
- Add @error decorator in core
- **Added** --emit flag to configure the emitter(s) to use and seperate library imports from emitters
- Add directory manipulation to CompilerHost
- Update to syntax tree to be readonly
- Formatter: Separate Enum members with decorator with new lines
- Implement projections and versioning

### Patches

- Adding @format decorator to compiler and openapi3 emitter
- Add `sourceObject` parameter to `@doc` decorator to aid in producing messages using a context object
- `@list` decorator will now ignore `TemplateParameter` objects
- Init include compiler as dependency in generated package.json
- Allow CLI array options to come before positional arguments
- **Fix** Diagnostic location for invalid use of templated models
- Fix path normalization issue that caused diagnostics from language server to be dropped.
- Fix error with file ending with mutline comment
- **Fix** issue when loading cadl using a different casing than the actual casing in a case insenstivie file system
- Add @friendlyName decorator to customize model names for emitters
- Fix issue where identifiers could be confused with keywords when they had common endings.
- Renaming @format decorator to @pattern.
- Stop offering `true` and `false` completions after `.`
- Fix completion icon for symbols pulled in via using

## 0.25.0
Thu, 16 Dec 2021 08:02:20 GMT

### Minor changes

- **Update** reference resolution with `using` to fix duplicate symbols issues
- **Added** keyword autocomplete and icons
- **Added** support for union default values
- **Formatter** Add support for spread model formatting
- add mkdirp to compilerHost

### Patches

- Add findChildModels and getProperty utility functions
- **Fix** Circular reference in `is` or `extends` now emit a diagnostic instead of crashing
- **Fix** Circular reference in `alias` now emit a diagnostic instead of crashing
- **Fix** Circular reference between template model and non template model causing unresolved types issues.
- **Formatter** fix issues with empty model and interface with comments being moved outside.
- **Formatter** fix crash when having a comment in anynoymous empty model.
- **Formatter** fix crash when using multi-line comment without each line starting with `*`.
- **Formatter** Tweak formatting of interface mixes that overflow.
- **Formatter** Keep single value decroator inline.
- **Formatter** Keep empty line seperation in interface similar to namespace (Only keeps 1 max between operation).
- Add support for `interface` as a `@tag` decorator target
- Reintroduce @list decorator to assist with collection operations
- Improve getTypeName support for Unions and UnionVariants

## 0.24.1
Wed, 01 Dec 2021 22:56:11 GMT

### Patches

- Fix issue where formatter would try to format a document with irrecoverable parse errors in certain cases
- **Fix** Wrong library import for the rest template
- Fix crash in language server
- Fix formatting bug with operations returning anonymous models
- Fix language server crashes in certain error cases
- Update README

## 0.24.0
Thu, 18 Nov 2021 13:58:15 GMT

### Minor changes

- **Added** `cadl install` command which shell out to `npm install`
- Remove @list decorator
- Show `@doc` info along with completions

### Patches

- **Fix** Logging of warning counts, showing error count
- Ensure interface is assigned for checked operations
- Add setDecoratorNamespace helper function

## 0.23.0
Thu, 11 Nov 2021 21:46:21 GMT

### Minor changes

- **Added** `duration` intrinsic type
- **Added** `--check` option to `cadl format` command to verify files are formatted
- **Added** log of the error and warning count at the end in case `cadl compile` failed.
- **Added** Support for models with mutual references
- Add completion ("IntelliSense") support to language server
- `cadl init` generate `package.json` with `private: true`

### Patches

- Add Prettier formatting support for interface mixes
- Add new --import CLI parameter to add a global import via the command line

## 0.22.0
Thu, 28 Oct 2021 21:17:50 GMT

### Minor changes

- **Added** logger functionality to log information
- Add `OmitDefaults` model to remove default values of a model

### Patches

- Return non-zero exit code when compilation has errors
- Diagnostics are strongly defined and all have a code
- **Fix** `using` formatting
- **Tweak** formatter model properties with decorators
- **Improve** decorator formatting

## 0.21.0
Fri, 15 Oct 2021 21:33:37 GMT

### Minor changes

- Add an API to clone a type
- Reverse decorator evaluation order
- **Added** Support for server default
- **Added** New library helper for strong diagnostics definitions
- **Added** New syntax to compiler for directive
- **Added** support for suppressing warning via #suppress directive
- Implement `interface`
- Add walker, colorization, printer for interfaces
- Surface decorator and emitter errors in IDE
- Add union declarations

### Patches

- Defensive code to prevent errors in decorators and onBuild from exiting the language server
- Fix options comment
- Update samples
- Fix binding JS file namespaces and namespace decorators referencing types in a later namespace.
- fix using a namespace merged after current namespace
- Fix namespace synthesis in certain contexts
- Make nextLink optional in pageable response
- Stop running decorators and emitters in language server again, fix language server crash. 
- regenerate samples

## 0.20.0
Fri, 17 Sep 2021 00:49:37 GMT

### Minor changes

- Added `cadl init` command to scaffold new cadl project
- Added semantic walker
- Add IDE go-to definition support
- Implement cadl namespace, don't merge namespaces until checking
- Remove support for multiple inheritance
- Definition for `bytes` and new number types

### Patches

- Fix issues with specs
- Update samples
- Ensure syntax nodes report correct and consistent source positions
- Fix bug that broke analyzing untitled documents in IDE
- Fix bug preventing using latest changes to document in IDE
- Update sample generation

## 0.19.0
Sat, 21 Aug 2021 00:04:02 GMT

### Minor changes

- Introduce naming convention `$name` for JavaScript-defined Cadl functions and decorators

### Patches

- Update test output

## 0.18.0
Fri, 13 Aug 2021 19:10:21 GMT

### Minor changes

- Remove `cadl generate` command

### Patches

- Add support for discovering updatabale properties using visibility
- Fix error in `cadl vs uninstall` command

## 0.17.0
Tue, 10 Aug 2021 20:23:04 GMT

### Minor changes

- Rename package to @cadl-lang/compiler

## 0.16.0
Mon, 09 Aug 2021 21:14:12 GMT

### Minor changes

- Add `compile --watch` option to watch files for changes and recompile
- Implement model is

### Patches

- **Update** to yargs 17 and update args parsing to use handlers logic to have full type safety
- Report errors for duplicate model and enum members

## 0.15.0
Mon, 02 Aug 2021 18:17:00 GMT

### Minor changes

- Rename ADL to Cadl

## 0.14.0
Wed, 28 Jul 2021 19:40:06 GMT

### Minor changes

- Decorators can be put into namespaces using a .namespace property or a namespace export

### Patches

- Add service code generator module
- Allow more non-ascii characters in identifiers and normalize identifiers
- Use newer version of autorest from `adl generate`

## 0.13.0
Fri, 09 Jul 2021 20:21:06 GMT

### Minor changes

- Add OptionalProperties<T> and withOptionalProperties decorator for creating model variations with all properties set to optional
- Add semantic analysis to language server

### Patches

- **Update** Diagnostics code to be a string
- Formatter can recover from parsing error that don't affect the validity of the tree
- Use LSP to log messages from client to server

## 0.12.0
Thu, 24 Jun 2021 03:57:43 GMT

### Minor changes

- Require main.adl or adlMain in package.json
- Add mutator library which enables the programmatic addition of model properties, operation parameters, and operation return types
- Add semantic error recovery

### Patches

- **Added** ADL Configuration file loading
- Added typechecker type navigation
- Add isStringType helper function
- Fix some edge cases in config file loading
- Add support for Visual Studio 2022

## 0.11.0
Tue, 18 May 2021 23:43:31 GMT

### Minor changes

- **Added** format command to automatically format adl files

### Patches

- **Fix** Throw diagnostic when main ADL file doesn't exists
- Fix TypeError after `adl vs` command
- **Fix** formatter handling string and number literal should keep as it is.
- **Fix** Formatter not rendering template parameters of models.
- **Fix** Don't format a file with parsing errors
- Work around npm 7+ Mac OS bug in `adl code install`
- Prefer local install of adl package when running global `adl`

## 0.10.0
Thu, 06 May 2021 14:56:02 GMT

### Minor changes

- Implement alias and enum, remove model =
- Implement basic parser error recovery
- Add API to check if a node or any descendants have parse errors

### Patches

- Small parsing speed improvement when expecting one of N tokens.
- Fix blockless namespaces not accumulating decls
- Allow leading +/- in numeric literals and require fractional digits
- Fix bugs with non-ascii identifiers
- Improve CLI experience for generate command
- Replace several internal compiler errors with diagnostics
- Do not allow multi-line non-triple-quoted string literals
- Fix parsing edge cases and optimize parsing slightly

## 0.9.0
Tue, 20 Apr 2021 15:23:29 GMT

### Minor changes

- Fix parse errors from trailing commas; implement optional prefix | and &

### Patches

- Fix issue where dynamic namespaces were not evaluated
- Virtualize writting to filesytem to enable programtic usage of adl

## 0.8.0
Tue, 06 Apr 2021 01:23:07 GMT

### Minor changes

- Implement npm libraries
- Implement library import with npm, abstract out rest, openapi, rpaas

### Patches

- Add commands to install and uninstall Visual Studio extension
- Enable security and securityDefinitions metadata to be applied to emitted OpenAPI documents; add default ARM security details
- Add api-version parameter to all ARM operations
- Add operations endpoint for ARM services
- Enable creation of $refs to ARM common model and parameter definitions
- Add common ARM parameter definitions for resource operations
- remove parenless decorators

## 0.7.0
Wed, 31 Mar 2021 22:00:43 GMT

### Minor changes

- Implement usings statements
- Implement imports
- Improved OpenAPI output for ARM services, including pluralized operation groups and operation tags

### Patches

- Add service-level metadata decorators: @serviceTitle, @serviceVersion, @produces, @consumes, and @armNamespace
- Add support for OpenAPI operation overloads using x-ms-paths

## 0.6.0
Fri, 26 Mar 2021 17:06:33 GMT

### Minor changes

- Implement namespace merging, blockless namespaces, and dotted namespaces

### Patches

- Emit `readOnly: true` for model properties marked with `@visibility("read")`
- The `visibility` decorator now accepts multiple values; the Swagger emitter will write these out as an `x-ms-mutability` field.
- Adding sample generated controller for _____ service
- Add back post operation
- Add standard ARM operation and error model types
- Fix id lookup bug
- Initial check-in of adl spec and generated swagger for _____
- Update _____ spec with user comments.
- Fixing formatting to match repo prettier config
- Add `@minValue` and `@maxValue` decorators for specifying the value range of numeric types
- Allow the use of recursive type references in model definitions
- Enable metadata and extensions to be applied to $ref'd schemas
- Add missing metadata for ARM library types

## 0.5.0
Tue, 23 Mar 2021 01:06:29 GMT

### Minor changes

- Add `time` intrinsic type
- Rename all date and time intrinsics: zonedDateTime, plainDate, and plainTime
- Add commands to install/uninstall VS Code extension

### Patches

- Automatically mark named enum types with `x-ms-enum` and `modelAsString: true`

## 0.4.0
Tue, 16 Mar 2021 23:13:42 GMT

### Minor changes

- Introduce language server and add live parse errors to VS Code

## 0.3.0
Thu, 11 Mar 2021 19:14:29 GMT

### Minor changes

- Add byte primitive type
- Add datetime primitive type
- Enable HTTP verb decorators to specify a subpath from the parent resource path
- Add float32 primitive type
- Replace `interface` syntax with `namespace` and `op` syntax
- Add new decorator @tags
- Add support for nested namespace definitions and scopes
- Add null intrinsic type, allow unions with it for x-nullable support in OpenAPI emitter
- Add response model types for many standard HTTP responses in rest.adl
- Renamed Ok<T> to OkResponse<T>
- Add syntax highlighting

### Patches

- Fix model Foo<T> extends T { }
- Fix resolution of declared parameters in resource sub-paths
- Always output a response description field to ensure valid swagger
- Added new gRPC to ADL examples
- Add back line and column tracking
- Support arrays of arrays and parenthesized expressions
- Remove hardcoded @autorest/core version
- Include source file path in parse error log
- Add body-boolean testserver sample
- Fix bug preventing empty string literals
- Refactor scanner to use less state
- Log source locations with all errors
- Support multiple content types for request bodies

## 0.2.1
Thu, 28 Jan 2021 21:30:01 GMT

### Patches

- Fixed standard library decorator module resolution

## 0.2.0
Wed, 27 Jan 2021 21:48:34 GMT

### Minor changes

- Initial ADL compiler preview release

