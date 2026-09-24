const { defineConfig } = require("eslint/config");

const expo = require("eslint-config-expo/flat");

const sonarjs = require("eslint-plugin-sonarjs");

const path = require("node:path");

const kvitto = require("./tools/eslint/index.cjs");

module.exports = defineConfig([
  expo,
  {
    ignores: [
      "sveltemo/**",
      "convex/_generated/**",
      "convex/kassalapp/generated/**",
      "tools/oxlint/anti-slop/**",
      ".agents/**",
      ".codex/**",
      ".expo/**",
      "ios/**",
      "android/**",
      "coverage/**",
      "dist/**",
    ],
  },
  {
    plugins: { sonarjs, kvitto },
    rules: {
      "kvitto/no-undefined-record": "error",
      ...Object.fromEntries(
        Object.entries(sonarjs.rules).flatMap(([name, rule]) =>
          rule.meta.deprecated ? [] : [[`sonarjs/${name}`, "error"]],
        ),
      ),
      // Match Prettier: parenthesized parameters and concise single-return arrow bodies.
      "sonarjs/arrow-function-convention": [
        "error",
        { requireParameterParentheses: true, requireBodyBraces: false },
      ],
      "sonarjs/shorthand-property-grouping": "off",
      // The project has no per-file copyright header convention.
      "sonarjs/file-header": "off",
      // Literal labels and validator values do not need shared constants merely because they repeat.
      "sonarjs/no-duplicate-string": "off",
      // These limits measure syntax or size rather than a module's responsibility.
      "sonarjs/cyclomatic-complexity": "off",
      "sonarjs/cognitive-complexity": "off",
      "sonarjs/expression-complexity": "off",
      "sonarjs/nested-control-flow": "off",
      "sonarjs/max-lines": "off",
      "sonarjs/max-lines-per-function": "off",
      // Named unions, early exits, optional branches, and compact multi-way values are deliberate.
      "sonarjs/max-union-size": "off",
      "sonarjs/too-many-break-or-continue-in-loop": "off",
      "sonarjs/elseif-without-else": "off",
      "sonarjs/no-nested-conditional": "off",
      // Undefined clears Convex fields and represents absent local state.
      "sonarjs/no-undefined-assignment": "off",
      // SDK namespace imports and PascalCase React components are standard here.
      "sonarjs/no-wildcard-import": "off",
      "sonarjs/function-name": ["error", { format: "^[_a-zA-Z][a-zA-Z0-9]*$" }],
      // ISO dates and stable identifiers use lexical ordering.
      "sonarjs/strings-comparison": "off",
      // TypeScript handles type compatibility; Sonar reports overlapping unions as disjoint.
      "sonarjs/different-types-comparison": "off",
      // The TypeScript rule supports intentional omission through rest destructuring.
      "sonarjs/no-unused-vars": "off",
      // Expo and Convex require specific entry filenames.
      "sonarjs/file-name-differ-from-class": "off",
      // Boolean inputs to pure state decisions do not require separate functions for each case.
      "sonarjs/no-selector-parameter": "off",
    },
  },
  {
    files: ["**/*.{ts,tsx,mts}"],
    plugins: {
      "@typescript-eslint": require("@typescript-eslint/eslint-plugin"),
    },
    languageOptions: {
      parser: require("@typescript-eslint/parser"),
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: path.dirname(require.resolve("./package.json")),
      },
    },
    rules: {
      // Rest destructuring deliberately omits persisted metadata.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { ignoreRestSiblings: true, argsIgnorePattern: "^_" },
      ],
      // `any` disables checking; parse external data into declared types instead.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-function-type": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description" },
      ],
      // A dropped promise loses its failure and its ordering.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/prefer-promise-reject-errors": "error",
      "@typescript-eslint/no-base-to-string": "error",
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],
    },
  },
  {
    files: ["**/*.{js,cjs,mjs}"],
    // Expo, Metro and ESLint configuration and rule tests use CommonJS.
    rules: { "sonarjs/no-require-or-define": "off" },
  },
  {
    files: ["convex/**/*.ts"],
    // Convex commands deliberately return null after every successful write.
    rules: { "sonarjs/no-invariant-returns": "off" },
  },
]);
