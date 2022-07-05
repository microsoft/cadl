# Cadl gRPC library and emitter

This package provides support for defining gRPC services in [Cadl](https://github.com/microsoft/cadl) and an emitter that generates Protobuf output from Cadl sources.

## Install

In your project root:

```bash
npm install @cadl-lang/grpc
```

## Using the gRPC emitter

1. Using the `cadl` CLI:

```bash
cadl compile . --emit @cadl-lang/grpc
```

2. Using the Cadl project configuration file:

Add the following to your `cadl-project.yaml` file.

```yaml
emitters:
  @cadl-lang/grpc: true
```
