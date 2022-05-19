# Cadl Rest Library

This package provides [Cadl](htps://github.com/microsoft/Cadl) decorators to describe REST API.

## Install

In your cadl project root

```bash
npm install @cadl-lang/rest
```

## Usage

See [Rest section in the tutorial](../../docs/tutorial.md#rest-apis)

## Decorators

The `@cadl-lang/rest` library defines the following decorators:

### `@parentResource`

Syntax:

```
@parentResource(parentModelTypeReference)
```

`@parentResource` marks a model property with a reference to its parent resource type

The first argument should be a reference to a model type which will be treated as the parent
type of the target model type. This will cause the `@key` properties of all parent types of
the target type to show up in operations of the `Resource*<T>` interfaces defined in this library.

`@parentResource` can only be applied to models.

### `@segment`

Syntax:

```
@segment(segmentString)
```

`@segment` defines the preceding path segment for a `@path` parameter in auto-generated routes

The first argument should be a string that will be inserted into the operation route before the
path parameter's name field. For example:

```
op getUser(
  @path
  @segment("users")
  userId: string
): User
```

Would produce the route `/users/{userId}`.

`@segment` can only be applied to model properties or operation parameters.

### `@route`

Syntax:

```
@route(routeString)
```

`@route` defines the relative route URI for the target operation

The first argument should be a URI fragment that may contain one or more path parameter fields.
If the namespace or interface that contains the operation is also marked with a `@route` decorator,
it will be used as a prefix to the route URI of the operation.

`@route` can only be applied to operations, namespaces, and interfaces.

### `@autoRoute`

Syntax:

```
@autoRoute()
```

`@autoRoute` enables automatic route generation for an operation, namespace, or interface.

When applied to an operation, it automatically generates the operation's route based on path parameter
metadata. When applied to a namespace or interface, it causes all operations under that scope to have
auto-generated routes.

## See also

- [Cadl Getting Started](https://github.com/microsoft/cadl#getting-started)
- [Cadl Tutorial](https://github.com/microsoft/cadl/blob/main/docs/tutorial.md)
