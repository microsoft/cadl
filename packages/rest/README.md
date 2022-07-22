# Cadl HTTP/Rest Library

This package provides [Cadl](htps://github.com/microsoft/Cadl) decorators, models, and interfaces to describe HTTP and REST API. With fundamental models and decorators defined in Cadl.Http namespace, you will be able describe basic http level operations. Cadl.Rest namespace adds additional predefined models and interfaces. These building blocks make defining REST resources and operations based on standard patterns extremely simple.

## Install

In your cadl project root

```bash
npm install @cadl-lang/rest
```

## Usage

```Cadl
import "@cadl-lang/rest";

using Cadl.Http;
using Cadl.Rest;
```

See [Rest section in the tutorial](https://github.com/microsoft/cadl/blob/main/docs/tutorial.md#rest-apis)

## Library Tour

`@cadl-lang/rest` library defines of the following artifacts:

- [Models](#models)
- [Decorators](#decorators)
- [Interfaces](#interfaces)

## Models

- ### HTTP namespace
  | Model                | Notes                                                                                                                                  |
  | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
  | LocationHeader       | Location header                                                                                                                        |
  | Response&lt;Status>  | &lt;Status> is numerical status code.                                                                                                  |
  | OkResponse&lt;T>     | Response&lt;200> with T as the response body model type.                                                                               |
  | CreatedResponse      | Response&lt;201>                                                                                                                       |
  | AcceptedResponse     | Response&lt;202>                                                                                                                       |
  | NoContentResponse    | Response&lt;204>                                                                                                                       |
  | MovedResponse        | Response&lt;301> with LocationHeader for redirected URL                                                                                |
  | NotModifiedResponse  | Response&lt;304>                                                                                                                       |
  | UnauthorizedResponse | Response&lt;401>                                                                                                                       |
  | NotFoundResponse     | Response&lt;404>                                                                                                                       |
  | ConflictResponse     | Response&lt;409>                                                                                                                       |
  | PlainData&lt;T>      | Produces a new model with the same properties as T, but with @query, @header, @body, and @path decorators removed from all properties. |
- ### REST namespace
  | Model                                      | Notes                                                                                                       |
  | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
  | KeysOf&lt;T>                               | Dynamically gathers keys of the model type T.                                                               |
  | Page&lt;T>                                 | A model defines page of T which includes an array of T and optional next link.                              |
  | ParentKeysOf&lt;T>                         | Dynamically gathers parent keys of the model type T, which are referenced with `@parentResource` decorator. |
  | ResourceError                              | The default error response for resource operations that includes <br> `code: int32` and `message string`.   |
  | ResourceParameters&lt;TResource>           | Represents operation parameters for resource TResource. Default to KeysOf&lt;T>.                            |
  | ResourceCollectionParameters&lt;TResource> | Represents collection operation parameters for resource TResource. Default to ParentKeysOf&lt;T>            |
  | ResourceCreatedResponse&lt;T>              | Resource create operation completed successfully.                                                           |
  | ResourceDeletedResponse                    | Resource deleted successfully.                                                                              |

## Decorators

- ### HTTP namespace

The `@cadl-lang/rest` library defines the following decorators in `Cadl.Http` namespace:

| Declarator  | Scope                                     | Usage                                                                                             |
| ----------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| @get        | operations                                | indicating operation uses HTTP `GET` verb.                                                        |
| @put        | operations                                | indicating operation uses HTTP `PUT` verb.                                                        |
| @post       | operations                                | indicating operation uses HTTP `POST` verb.                                                       |
| @patch      | operations                                | indicating operation uses HTTP `PATCH` verb.                                                      |
| @delete     | operations                                | indicating operation uses HTTP `DEL` verb.                                                        |
| @head       | operations                                | indicating operation uses HTTP `HEAD` verb.                                                       |
| @header     | model properties and operation parameters | indicating the properties are request or response headers.                                        |
| @query      | model properties and operation parameters | indicating the properties are in the request query string.                                        |
| @body       | model properties and operation parameters | indicating the property is in request or response body. Only one allowed per model and operation. |
| @path       | model properties and operation parameters | indicating the properties are in request path.                                                    |
| @statusCode | model properties and operation parameters | indicating the property is the return status code. Only one allowed per model.                    |
| @server     | namespace                                 | Configure the server url for the service.                                                         |

- ### REST namespace

The `@cadl-lang/rest` library defines the following decorators in `Cadl.Rest` namespace:

| Declarator                | Scope                                                 | Syntax                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| @produces                 | namespace, operations                                 | Syntax:<br> `@produces(mimetypeString)` <br><br>Note:<br> The `@produces` decorator is used to specify the MIME media types or representations a resource can produce and send back to the client.                                                                                                                                                                                                                                                           |
| @consumes                 | namespace, operations                                 | Syntax:<br> `@consumes(mimetypeString)` <br><br>Note:<br> The `@consumes` decorator is used to specify which MIME media types of representations a resource can accept, or consume, from the client.                                                                                                                                                                                                                                                         |
| @discriminator            | models                                                | Syntax:<br> `@discriminator(kindString)` <br><br>Note:<br> `@discriminator` allows defining polymorphic models to be used by API as parameters and return types. In many strongly typed languages, they are expressed as inheritance.                                                                                                                                                                                                                        |
| @readsResource            | operations                                            | Syntax:<br> `@readsResource(modelType)` <br><br>Note:<br> This decorator is to used to signal the operation that is the Read operation for a particular resource.                                                                                                                                                                                                                                                                                            |
| @createsResource          | operations                                            | Syntax:<br> `@createsResource(modelType)` <br><br>Note:<br> This decorator is to used to signal the operation that is the Create operation for a particular resource.                                                                                                                                                                                                                                                                                        |
| @createsOrUpdatesResource | operations                                            | Syntax:<br> `@createsOrUpdatesResource(modelType)` <br><br>Note:<br> This decorator is to used to signal the operation that is the CreatesOrUpdate operation for a particular resource.                                                                                                                                                                                                                                                                      |
| @updatesResource          | operations                                            | Syntax:<br> `@updatesResource(modelType)` <br><br>Note:<br> This decorator is to used to signal the operation that is the Update operation for a particular resource.                                                                                                                                                                                                                                                                                        |
| @deletesResource          | operations                                            | Syntax:<br> `@deletesResource(modelType)` <br><br>Note:<br> This decorator is to used to signal the operation that is the Delete operation for a particular resource.                                                                                                                                                                                                                                                                                        |
| @listsResource            | operations                                            | Syntax:<br> `@listsResource(modelType)` <br><br>Note:<br> This decorator is to used to signal the operation that is the List operation for a particular resource.                                                                                                                                                                                                                                                                                            |
| @parentResource           | models                                                | Syntax:<br> `@parentResource(parentModelTypeReference)` <br><br>Note:<br> `@parentResource` marks a model property with a reference to its parent resource type. The first argument should be a reference to a model type which will be treated as the parent type of the target model type. This will cause the `@key` properties of all parent types of the target type to show up in operations of the `Resource*<T>` interfaces defined in this library. |
| @segment                  | model properties, operation parameters                | Syntax:<br> `@segment(segmentString)` <br><br>Note:<br>`@segment` defines the preceding path segment for a `@path` parameter in auto-generated routes. The first argument should be a string that will be inserted into the operation route before the path parameter's name field. For exmaple: <br> `op getUser(@path @segment("users") userId: string): User` <br> will produce the route `/users/{userId}`.                                              |
| @segmentOf                | models                                                | Syntax:<br> `@segment(segmentString)` <br><br>Note:<br>`@segmentOf` returns the URL segment of a given model if it has `@segment` and `@key` decorator.                                                                                                                                                                                                                                                                                                      |
| @segmentSeparator         | model properties, operation parameters, or operations | Syntax:<br> `@segmentSeparator(separatorString)` <br><br>Note:<br> `@segmentSeparator` defines the separator string that is inserted between the target's `@segment` and the preceding route path in auto-generated routes. <br> The first argument should be a string that will be inserted into the operation route before the target's `@segment` value. Can be a string of any length. Defaults to `/`.                                                  |
| @route                    | operations, namespaces, interfaces                    | Syntax:<br> `@route(routeString)` <br><br>Note:<br> `@route` defines the relative route URI for the target operation The first argument should be a URI fragment that may contain one or more path parameter fields.If the namespace or interface that contains the operation is also marked with a `@route` decorator, it will be used as a prefix to the route URI of the operation.                                                                       |
| @autoRoute                | operations                                            | Syntax:<br> `@autoRoute()` <br><br>Note:<br>`@autoRoute` enables automatic route generation for an operation, namespace, or interface. <br> When applied to an operation, it automatically generates the operation's route based on path parameter metadata. When applied to a namespace or interface, it causes all operations under that scope to have auto-generated routes.                                                                              |

## Interfaces

- ### HTTP namespace
  None
- ### REST namespace

These standard interfaces defines resource operations in basic building blocks that you can expose on the resources. You can use `extends` to compose the operations to meet the exact needs of your resource APIs.

For example, for below `foo` model

```
model foo {
  @key id: string;
  name: string;
}
```

- `foo` resource supports full CRUDL operations.

```Cadl
interface FooService extends Resource.ResourceOperations<Foo, Error>;
```

- `foo` resource supports only CRD operations.

```Cadl
interface WidgetService
   extends Resource.ResourceRead<Widget, Error>,
    Resource.ResourceCreate<Widget, Error>,
    Resource.ResourceDelete<Widget, Error> {
}
```

-

| Interfaces                                                              | Notes                                                                                                                |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| ResourceRead&lt;TResource, TError>                                      | Resource GET operation                                                                                               |
| ResourceCreateOrUpdate&lt;TResource, TError>                            | Resource PUT operation                                                                                               |
| ResourceCreate&lt;TResource, TError>                                    | Resource POST operation                                                                                              |
| ResourceUpdate&lt;TResource, TError>                                    | Resource PATCH operation                                                                                             |
| ResourceDelete&lt;TResource, TError>                                    | Resource DEL operation                                                                                               |
| ResourceList&lt;TResource, TError>                                      | Resource LIST operation which is a GET operation from a parent resource.                                             |
| ResourceInstanceOperations&lt;TResource, TError>                        | Combines resource GET + PATCH + DEL operations                                                                       |
| ResourceCollectionOperations&lt;TResource, TError>                      | Combines resource POST + LIST operations                                                                             |
| ResourceOperations&lt;TResource, TError>                                | Combines resource instance and collection operations. Includes GET + PATCH + DEL + POST + LIST                       |
| SingletonResourceRead&lt;TSingleton, TResource, TError>                 | Singleton resource GET operation.                                                                                    |
| SingletonResourceUpdate&lt;TSingleton, TResource, TError>               | Singleton resource PATCH operation.                                                                                  |
| SingletonResourceOperations&lt;TSingleton, TResource, TError>           | Combines resource GET + PATCH operations                                                                             |
| ExtensionResourceRead&lt;TExtension, TResource, TError>                 | Extension resource GET operation.                                                                                    |
| ExtensionResourceCreateOrUpdate&lt;TExtension, TResource, TError>       | Extension resource PUT operation                                                                                     |
| ExtensionResourceCreate&lt;TExtension, TResource, TError>               | Extension resource POST operation                                                                                    |
| ExtensionResourceUpdate&lt;TExtension, TResource, TError>               | Extension resource PATCH operation                                                                                   |
| ExtensionResourceDelete&lt;TExtension, TResource, TError>               | Extension resource GET operation                                                                                     |
| ExtensionResourceList&lt;TExtension, TResource, TError>                 | Extension resource LIST operation which is a GET operation from a parent resource.                                   |
| ExtensionResourceInstanceOperations&lt;TExtension, TResource, TError>   | Combines extension resource GET + PATCH + DEL operations.                                                            |
| ExtensionResourceCollectionOperations&lt;TExtension, TResource, TError> | Combines extension resource POST + LIST operations.                                                                  |
| ExtensionResourceOperations&lt;TExtension, TResource, TError>           | Combines extension resource instance and collection operations. Includes GET + PATCH + DEL + POST + LIST operations. |

## See also

- [HTTP example](https://cadlplayground.z22.web.core.windows.net/?c=aW1wb3J0ICJAY2FkbC1sYW5nL3Jlc3QiOwoKQHNlcnZpY2VUaXRsZSgiV2lkZ2V0IFPGFSIpCm5hbWVzcGFjZSBEZW1vxxg7CnVzaW5nIENhZGwuSHR0cDsKCm1vZGVsIMdAewogIEBrZXkgaWQ6IHN0cmluZzsKICB3ZWlnaHQ6IGludDMyxBFjb2xvcjogInJlZCIgfCAiYmx1ZSI7Cn0KCkBlcnJvcsdWRcQMxVVjb2Rly0BtZXNzYWdlymR9CgppbnRlcmbkALLmAI3nALTFP0DkAJ1saXN0KCk6xx9bXSB8xmHEUUByb3V0ZSgid8Uccy97aWR9IinGOHJlYWQoQHBhdGjrANfJSM1GcG9zdCBjcmVhdGUoQGJvZHkgxAXIK9Y0x3pjdXN0b21HZXTId8kR6gC0yjh9Cg%3D%3D):
- [REST example](https://cadlplayground.z22.web.core.windows.net/?c=aW1wb3J0ICJAY2FkbC1sYW5nL3Jlc3QiOwoKQHNlcnZpY2VUaXRsZSgiV2lkZ2V0IFPGFSIpCm5hbWVzcGFjZSBEZW1vxxg7Cgp1c2luZyBDYWRsLkh0dHA7zBFSZXN0OwoKbW9kZWwgx1J7CiAgQGtleSBpZDogc3RyaW5nOwogIHdlaWdodDogaW50MzLEEWNvbG9yOiAicmVkIiB8ICJibHVlIjsKfQoKQGVycm9yx1ZFxAzFVWNvZGXLQG1lc3NhZ2XKZH0KCmludGVyZuQAxOYAjecAxiBleHRlbmRzIFJlc291cmNl5AC5xQlPcGVyYXRpb25zPMYyLMZxPsVyQOQA0EByb3V0ZSgiY3VzdG9tR2V0IikgyQwoKTrHa%2BQAgA%3D%3D):
- [Cadl Getting Started](https://github.com/microsoft/cadl#getting-started)
- [Cadl Tutorial](https://github.com/microsoft/cadl/blob/main/docs/tutorial.md)

```

```
