# Change Log - cadl-vscode

This log was last generated on Fri, 06 May 2022 17:19:57 GMT and should not be manually modified.

## 0.14.0
Fri, 06 May 2022 17:19:57 GMT

### Minor changes

- Color decorators differently than operations
- Uptake `mixes` -> `extends` rename
- Update `language-configuration.json` to newer format and generate it from cadl language server data
- Remove node 14 support
- Add command to restart language server

## 0.13.1
Thu, 31 Mar 2022 17:10:49 GMT

_Version update only_

## 0.13.0
Wed, 09 Mar 2022 17:42:09 GMT

### Minor changes

- Allow `op` interfaces
- Add punctuation and additional fine grain scopes to grammar

## 0.12.1
Mon, 14 Feb 2022 03:01:08 GMT

### Patches

- Bump dependency versions

## 0.12.0
Fri, 04 Feb 2022 18:00:18 GMT

### Minor changes

- Add cadl project file to list of files watched

## 0.11.0
Wed, 01 Dec 2021 22:56:11 GMT

### Minor changes

- Add syntax highlighting code-fenced cadl blocks in markdown

### Patches

- Fix colorization of multiple mixes
- Fix syntax highlighting of namespace-qualified decorator application
- Update README

## 0.10.0
Thu, 11 Nov 2021 21:46:21 GMT

### Minor changes

- **Change** `cadl.cadl-server.path` should point to the `@cadl-lang/compiler` package instead of `cadl-server` binary.

## 0.9.0
Fri, 15 Oct 2021 21:33:37 GMT

### Minor changes

- **Added** Language server support for directives
- Add colorization for interfaces
- Add colorization of union declarations

## 0.8.0
Tue, 10 Aug 2021 20:23:04 GMT

### Minor changes

- React to package renames

## 0.7.0
Mon, 02 Aug 2021 18:17:00 GMT

### Minor changes

- Rename ADL to Cadl

## 0.6.0
Fri, 09 Jul 2021 20:21:06 GMT

### Minor changes

- Add semantic analysis to language server

## 0.5.2
Thu, 24 Jun 2021 03:57:43 GMT

### Patches

- Handle untitled source files in VS Code

## 0.5.1
Tue, 18 May 2021 23:43:31 GMT

### Patches

- Fix issue launching adl-server on Mac OS

## 0.5.0
Thu, 06 May 2021 14:56:02 GMT

### Minor changes

- Implement alias and enum, remove model =

### Patches

- Update syntax highlighting for string literal change

## 0.4.5
Tue, 20 Apr 2021 15:23:29 GMT

### Patches

- Fix syntax highlighting for tuple expressions

## 0.4.4
Wed, 31 Mar 2021 22:00:43 GMT

### Patches

- Add syntax highlighting for import and using statements
- Add VS Code configuration option for adl-server path
- Use PList for textmate grammar

## 0.4.3
Fri, 26 Mar 2021 17:06:33 GMT

### Patches

- Fix commenting and indenting behaviors

## 0.4.2
Wed, 24 Mar 2021 18:40:21 GMT

### Patches

- Extract textmate generator to helper library

## 0.4.1
Tue, 23 Mar 2021 01:06:29 GMT

### Patches

- Remove unnecessary npm dependency

## 0.4.0
Tue, 16 Mar 2021 23:13:42 GMT

### Minor changes

- Introduce language server and add live parse errors to VS Code

### Patches

- Initial version of VS Code extension

