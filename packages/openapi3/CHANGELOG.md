# Change Log - @cadl-lang/openapi3

This log was last generated on Fri, 06 May 2022 17:19:57 GMT and should not be manually modified.

## 0.11.0
Fri, 06 May 2022 17:19:57 GMT

### Minor changes

- Uptake change in compiler with children references
- Move decorators to `OpenAPI` namespace
- Uptake change to versioning library
- Remove node 14 support

### Patches

- Fix issue not excluding template models from derived models causing crash
- Fix duplicate `description` in parameters
- Rearrange some aspects of operation output in the OpenAPI emitter
- URI-encode refs

## 0.10.0
Thu, 31 Mar 2022 17:10:49 GMT

### Minor changes

- Include discriminator property in base schema with a boilerplace description
- Add support for `void` type
- Moved http response interpretation to @cadl-lang/rest library.
- implement multiple response content types
- Uptake change to allow versioned dependency with unversioned service

### Patches

- Fix bug with number enums that reference `0`.
- Use parent .model of ModelTypeProperty
- Support browser builds

## 0.9.0
Wed, 09 Mar 2022 17:42:09 GMT

### Minor changes

- @doc and @summary will set the description and summary on extended primitive types
- Emit child models to OpenAPI when parent is emitted
- **Added** support for `@externalDocs` decorator
- Added support for `@knownValues` decorator
- @doc on service namespace set openapi description
- Uptake change to intrinsic types
- Fix issue where a model name the same as Cadl Intrinsic type would be treated the same.

### Patches

- Fix duplicate parameter type definitions in OpenAPI 3 output

## 0.8.0
Tue, 15 Feb 2022 22:35:02 GMT

### Minor changes

- Add validation to oneOf decorator

### Patches

- Add support for separate `@summary` from `@doc`

## 0.7.0
Mon, 14 Feb 2022 03:01:07 GMT

### Minor changes

- refactor status code handling to http library
- Take change in openapi upstream library
- Update decorators to take in api change

### Patches

- Bump dependency versions

## 0.6.0
Fri, 04 Feb 2022 18:00:18 GMT

### Minor changes

- Support union values for status-code and content-type in responses
- Openapi3 support for discriminated unions
- openapi3 emitter support for @error decorator
- Configure for new emitter syntax
- Internals: switch to internal path manipulation
- Extracted decorators into own library `@cadl-lang/openapi`
- Uptake changes in @cadl-lang/rest library improving operation parameter handling
- Update cadl depdendencies to peerDependencies
- Add support for versioned services
- Add statusCode decorator for http status code

### Patches

- Adding @format decorator support for openapi3 to emit "format" for string types
- **Fix** Added support for nullable array `xzy[] | null`
- **Fix** issue with @body body: bytes producing `type: string, format: bytes` instead of `type: string, format: binary` for requests and responses
- Use assigned @friendlyName on model types when emitting schema definitions and refs
- Refactor and improve openapi3 return type tests
- Fix status code validation and other minor cleanup
- Support nullable in openapi3 emitter
- Renaming @format decorator to @pattern.

## 0.5.0
Thu, 16 Dec 2021 08:02:20 GMT

### Minor changes

- Generate anyOf or oneOf schemas for Cadl unions in openapi3

### Patches

- Update openapi3 emitter to consume new Cadl.Rest route generation API

## 0.4.2
Wed, 01 Dec 2021 22:56:11 GMT

### Patches

- Add support for extension decorator on parameters and tests
- Add openapi3 support for Cadl safeint
- Add README

## 0.4.1
Thu, 18 Nov 2021 13:58:15 GMT

### Patches

- Enable operation generation from interfaces

## 0.4.0
Thu, 11 Nov 2021 21:46:21 GMT

### Minor changes

- **Added** Support for duration type

## 0.3.1
Thu, 28 Oct 2021 21:17:50 GMT

### Patches

- Use strict diagnostics
- Fix crash on empty enum in openapi3 emitter
- Set shared param definitions in components.parameters
- Fix param default to be in schema
- Fix handling of decorators on parameters in openapi3
- Fix generation of openapi3 response headers
- Define response body for primitive response type
- Remove management.azure.com service host default

## 0.3.0
Fri, 15 Oct 2021 21:33:37 GMT

### Minor changes

- **Added** Support for server default

## 0.2.0
Fri, 17 Sep 2021 00:49:37 GMT

### Minor changes

- Add emitter for OpenAPI 3.0
- Remove support for multiple inheritance

### Patches

- Adding changelog for openapi3 package
- Updates for cadl namespace addition
- This is a test
- Support for emitting `bytes` and new number types

