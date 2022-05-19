# Cadl OpenAPI Library

This package provide [Cadl](https://github.com/microsoft/cadl) decorators to specify some OpenAPI specific concepts.

## Install

In your cadl project root

```bash
npm install @cadl-lang/openapi
```

## Usage

```cadl
import "@cadl-lang/openapi";

using OpenAPI;

```

## References

Decorators:

- [`@defaultResponse`](#defaultResponse)
- [`@extension`](#extension)
- [`@externalDocs`](#externalDocs)
- [`@operationId`](#operationId)

### `@defaultResponse`

**IMPORTANT This is to be used on `NON-ERROR` responses that cover all the other status codes. If you are looking to represent an error use [`@error`](https://github.com/microsoft/cadl/blob/main/docs/tutorial.md#error)**

Decorator that can be used on a response model to specify the `default` status code that OpenAPI allow.

```cadl
@defaultResponse
model MyNonErrorResponse {}

op foo(): MyNonErrorResponse;

```

### `@extension`

This decorator lets you sepecify custom key(starting with `x-`) value pair that will be added to the OpenAPI document.
[OpenAPI reference on extensions](https://swagger.io/docs/specification/openapi-extensions/)

Arguments:

| Name    | foo          | Description                                                      |
| ------- | ------------ | ---------------------------------------------------------------- |
| `key`   | **Required** | Extension key. **MUST** start with `x-`                          |
| `value` | **Required** | Value of the extension. Can be an primitive, a tuple or a model. |

```cadl
@extension("x-custom", "MyCustomValue")
model Foo {}

// Value can be an model.
@extension(
  "x-custom",
  {
    some: "value",
  }
)
model Foo {}

```

### `@externalDocs`

Decorator that can be used to provide the `externalDocs` property on OpenAPI elements.
[OpenAPI spec for extenalDocs](https://swagger.io/specification/#external-documentation-object)

Arguments:

| Name          | foo          | Description                      |
| ------------- | ------------ | -------------------------------- |
| `url`         | **Required** | Url for the external docs        |
| `description` | **Optional** | Description of the documentation |

```cadl
@externalDocs("https://example.com", "More info there")
model Foo {}

```

### `@operationId`

Decorator that can be used on an operation to specify the `operationId` field in OpenAPI. If this is not provided the `operationId` will be the cadl operation name.

Arguments:

| Name   | foo          | Description         |
| ------ | ------------ | ------------------- |
| `opId` | **Required** | Id of the operation |

```cadl
@operationId("custom_Foo")
op foo(): string;

```

## See also

- [Cadl Getting Started](https://github.com/microsoft/cadl#getting-started)
- [Cadl Tutorial](https://github.com/microsoft/cadl/blob/main/docs/tutorial.md)
- [Cadl for the OpenAPI Developer](https://github.com/microsoft/cadl/blob/main/docs/cadl-for-openapi-dev.md)
