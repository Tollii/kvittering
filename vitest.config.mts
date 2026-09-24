import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: [
      "convex/**/*.test.ts",
      "src/lib/**/*.test.ts",
      "tools/**/*.test.ts",
    ],
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
