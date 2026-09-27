const { defineConfig } = require("eslint/config");

const globals = require("globals");

const sonarjs = require("eslint-plugin-sonarjs");

const path = require("node:path");

const kvitto = require("./tools/lint-rules/index.cjs");

const { sonarjsRules } = require("./tools/lint-rules/sonarjs.cjs");

/**
 * The rules that need a TypeScript program. Oxlint (oxlint.config.mts) runs
 * every other rule; it gives JavaScript plugins no type information.
 */
module.exports = defineConfig([
  {
    ignores: [
      "convex/_generated/**",
      "convex/kassalapp/generated/**",
      "tools/oxlint/anti-slop/**",
      ".agents/**",
      ".codex/**",
      ".expo/**",
      ".convex/**",
      "ios/**",
      "android/**",
      "coverage/**",
      "dist/**",
      "build/**",
      "plans/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx,mts}"],
    plugins: { sonarjs, kvitto },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    languageOptions: {
      // The app runs in React Native and browsers; the backend and tools run in Node.
      globals: {
        ...globals.browser,
        ...globals.node,
        __DEV__: "readonly",
        ErrorUtils: "readonly",
      },
      parser: require("@typescript-eslint/parser"),
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: path.dirname(require.resolve("./package.json")),
      },
    },
    rules: {
      // React Native crashes when 0 or "" is rendered outside <Text>.
      "kvitto/no-leaked-render": "error",
      // Amounts change only through the Ore operations.
      "kvitto/no-ore-arithmetic": "error",
      // Dates change only through the CalendarDate and CalendarMonth operations.
      "kvitto/no-calendar-string-ops": "error",
      ...sonarjsRules("eslint"),
    },
  },
  {
    files: ["src/lib/domain/ore.ts"],
    rules: { "kvitto/no-ore-arithmetic": "off" },
  },
  {
    files: ["src/lib/domain/calendar.ts"],
    rules: { "kvitto/no-calendar-string-ops": "off" },
  },
]);
