import { defineConfig } from "vitest/config";
import base from "./vitest.config.mts";

// Mutation testing covers pure domain rules, so it runs only their tests.
// Stryker selects the mutant through the environment; edge-runtime isolates it.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    environment: "node",
    include: ["src/lib/**/*.test.ts"],
  },
});
