import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "edge-runtime",
    // Tests must not send metrics to a collector named by the shell.
    env: {
      OTEL_EXPORTER_OTLP_ENDPOINT: "",
      OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: "",
    },
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
      include: ["src/**/*.{ts,tsx}", "convex/**/*.ts", "tools/contract/*.ts"],
      exclude: [
        "**/*.test.{ts,tsx}",
        "src/lib/testing/**",
        "**/_generated/**",
        "convex/kassalapp/generated/**",
      ],
    },
  },
});
