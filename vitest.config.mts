import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: [
      "convex/**/*.test.ts",
      "src/lib/**/*.test.ts",
      "tools/**/*.test.ts",
    ],
    // Random order exposes tests that depend on state left by another test.
    sequence: { shuffle: true },
    server: { deps: { inline: ["convex-test", "@better-auth/expo"] } },
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "lcov", "json-summary"],
      include: ["src/**/*.{ts,tsx}", "convex/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "src/lib/testing/**",
        "**/_generated/**",
        "convex/kassalapp/generated/**",
      ],
    },
  },
});
