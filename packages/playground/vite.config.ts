import { definePlaygroundViteConfig } from "./src/build-utils";

export default definePlaygroundViteConfig({
  defaultEmitter: "@cadl-lang/openapi3",
  libraries: [
    "@cadl-lang/compiler",
    "@cadl-lang/rest",
    "@cadl-lang/openapi",
    "@cadl-lang/versioning",
    "@cadl-lang/openapi3",
  ],
  samples: {
    Http: "samples/http.cadl",
    "Rest framework": "samples/rest.cadl",
    "Versioned Rest framework": "samples/versioning.cadl",
  },
});
