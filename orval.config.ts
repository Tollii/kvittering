import { defineConfig } from "orval";

export default defineConfig({
  kassalapp: {
    input: {
      target: "./api/kassalapp.openapi.json",
      filters: { mode: "include", tags: ["Product", "PhysicalStore"] },
    },
    output: {
      target: "./convex/kassalapp/generated/client.ts",
      schemas: "./convex/kassalapp/generated/models",
      client: "fetch",
      override: {
        mutator: {
          path: "./convex/kassalapp/transport.ts",
          name: "kassalappFetch",
        },
        fetch: { includeHttpResponseReturnType: false },
      },
    },
  },
});
