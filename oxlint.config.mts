import { defineConfig } from "oxlint";
import antiSlop from "./tools/oxlint/anti-slop/index.ts";
import { sonarjsRules } from "./tools/lint-rules/sonarjs.cjs";

/**
 * The repository lint rules. ESLint (eslint.config.js) runs only the rules
 * that need a TypeScript program, which Oxlint does not give JavaScript
 * plugins.
 */

const ignorePatterns = [
  "convex/_generated/**",
  "convex/kassalapp/generated/**",
  "tools/oxlint/anti-slop/**",
  ".agents/**",
  ".codex/**",
  ".convex/**",
  ".expo/**",
  "node_modules/**",
  "ios/**",
  "android/**",
  "build/**",
  "dist/**",
  "coverage/**",
  "plans/**",
];

const typescriptFiles = ["**/*.ts", "**/*.tsx", "**/*.mts"];

const scriptFiles = ["**/*.js", "**/*.cjs", "**/*.mjs"];

const testFiles = ["**/*.test.ts", "**/*.test.tsx"];

const themeColor = {
  selector: "Literal[value=/^#[0-9a-f]{3,8}$|^rgba?\\(/i]",
  message: "Add a theme token in src/constants/theme.ts.",
};

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc", "vitest", "react", "import"],
  categories: { correctness: "error" },
  options: {
    typeAware: true,
    reportUnusedDisableDirectives: "error",
    // ESLint reads eslint-disable comments and Oxlint reads oxlint-disable
    // comments, so each comment names a rule that its linter runs.
    respectEslintDisableDirectives: false,
  },
  jsPlugins: [
    { name: "kvitto", specifier: "./tools/lint-rules/index.cjs" },
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
    { name: "sonarjs", specifier: "eslint-plugin-sonarjs" },
    { name: "expo", specifier: "eslint-plugin-expo" },
    // ESLint core and import rules that Oxlint does not implement natively.
    { name: "eslint-js", specifier: "oxlint-plugin-eslint" },
    { name: "import-js", specifier: "eslint-plugin-import" },
  ],
  settings: {
    "import/resolver": { typescript: true },
  },
  ignorePatterns,
  rules: {
    // General rules from the Expo configuration.
    eqeqeq: ["error", "smart"],
    "no-empty-pattern": ["error", { allowObjectPatternsAsParameters: false }],
    "no-extend-native": "error",
    "no-extra-bind": "error",
    "no-unused-expressions": [
      "error",
      { allowShortCircuit: true, enforceForJSX: true },
    ],
    "no-var": "error",
    "unicode-bom": ["error", "never"],
    "use-isnan": [
      "error",
      { enforceForIndexOf: false, enforceForSwitchCase: true },
    ],
    "no-invalid-regexp": "error",
    "no-misleading-character-class": "error",
    "no-regex-spaces": "error",
    // A file past this size holds several responsibilities; split it along them.
    "max-lines": [
      "error",
      { max: 750, skipBlankLines: true, skipComments: true },
    ],
    "import/export": "error",
    "import/first": "error",
    "import/namespace": "error",
    "import/no-duplicates": "error",
    "import/no-named-as-default": "error",
    "import/no-named-as-default-member": "error",
    "react/display-name": "error",
    "react/jsx-key": "error",
    "react/jsx-no-comment-textnodes": "error",
    "react/jsx-no-duplicate-props": "error",
    "react/jsx-no-undef": "error",
    "react/no-children-prop": "error",
    "react/no-danger-with-children": "error",
    "react/no-direct-mutation-state": "error",
    "react/no-find-dom-node": "error",
    "react/no-is-mounted": "error",
    "react/no-render-return-value": "error",
    "react/no-string-refs": "error",
    "react/no-this-in-sfc": "error",
    "react/no-unescaped-entities": "error",
    "react/no-unknown-property": "error",
    "react/require-render-return": "error",
    "react/rules-of-hooks": "error",
    "react/exhaustive-deps": "error",
    // React Compiler rules.
    "react/error-boundaries": "error",
    "react/globals": "error",
    "react/immutability": "error",
    "react/incompatible-library": "error",
    "react/preserve-manual-memoization": "error",
    "react/purity": "error",
    "react/refs": "error",
    "react/set-state-in-effect": "error",
    "react/set-state-in-render": "error",
    "react/static-components": "error",
    "react/unsupported-syntax": "error",
    "react/use-memo": "error",
    "expo/no-dynamic-env-var": "error",
    "expo/no-env-var-destructuring": "error",
    "expo/use-dom-exports": "error",
    "kvitto/no-undefined-record": "error",
    "kvitto/no-effect-fetch": "error",
    // Tools resolve imports to the base file, not the shipped platform variant.
    "kvitto/platform-variant-contract": "error",
    "vitest/no-focused-tests": "error",
    "oxc/no-accumulating-spread": "error",
    ...sonarjsRules("oxlint"),
    // New upstream general rules are enabled when the vendored copy changes.
    ...Object.fromEntries(
      Object.keys(antiSlop.rules).map((name) => [`anti-slop/${name}`, "error"]),
    ),
  },
  overrides: [
    {
      files: scriptFiles,
      env: { node: true, browser: true },
      rules: {
        "no-dupe-class-members": "error",
        "no-redeclare": ["error", { builtinGlobals: true }],
        "no-undef": ["error", { typeof: false }],
        "no-unused-vars": [
          "error",
          {
            args: "none",
            ignoreRestSiblings: true,
            caughtErrors: "all",
            caughtErrorsIgnorePattern: "^_",
          },
        ],
      },
    },
    {
      files: typescriptFiles,
      rules: {
        // TypeScript reports redeclarations, and these rules reject companion
        // objects that share a type's name, such as Ore.
        "no-redeclare": "off",
        "typescript/no-redeclare": "off",
        "typescript/array-type": ["error", { default: "array" }],
        "typescript/consistent-type-assertions": [
          "error",
          { assertionStyle: "as", objectLiteralTypeAssertions: "allow" },
        ],
        "typescript/no-dupe-class-members": "error",
        "typescript/no-empty-object-type": "error",
        "typescript/no-extra-non-null-assertion": "error",
        "typescript/no-require-imports": [
          "error",
          {
            allow: [
              "\\.(aac|aiff|avif|bmp|caf|db|gif|heic|html|jpeg|jpg|json|m4a|m4v|mov|mp3|mp4|mpeg|mpg|otf|pdf|png|psd|svg|ttf|wav|webm|webp|xml|yaml|yml|zip)$",
            ],
          },
        ],
        "typescript/no-useless-constructor": "error",
        "typescript/no-wrapper-object-types": "error",
        "react/no-array-index-key": "error",
        "react/jsx-no-useless-fragment": ["error", { allowExpressions: true }],
        // Navigation options such as `headerRight` take render functions.
        "react/no-unstable-nested-components": [
          "error",
          { allowAsProps: true },
        ],
        "typescript/no-deprecated": "error",
        // Rest destructuring deliberately omits persisted metadata.
        "no-unused-vars": [
          "error",
          { ignoreRestSiblings: true, argsIgnorePattern: "^_" },
        ],
        // `any` disables checking; parse external data into declared types instead.
        "typescript/no-explicit-any": "error",
        "typescript/no-unsafe-assignment": "error",
        "typescript/no-unsafe-member-access": "error",
        "typescript/no-unsafe-argument": "error",
        "typescript/no-unsafe-return": "error",
        "typescript/no-unsafe-call": "error",
        "typescript/no-unsafe-function-type": "error",
        "typescript/no-unnecessary-type-assertion": "error",
        // Index reads include undefined (noUncheckedIndexedAccess), so a guard the
        // type already rules out is dead code.
        "typescript/no-unnecessary-condition": [
          "error",
          { allowConstantLoopConditions: "only-allowed-literals" },
        ],
        "typescript/ban-ts-comment": [
          "error",
          { "ts-expect-error": "allow-with-description" },
        ],
        // A dropped promise loses its failure and its ordering.
        "typescript/no-floating-promises": "error",
        "typescript/no-misused-promises": "error",
        "typescript/await-thenable": "error",
        "typescript/only-throw-error": "error",
        "typescript/prefer-promise-reject-errors": "error",
        "typescript/no-base-to-string": "error",
        "typescript/switch-exhaustiveness-check": [
          "error",
          { considerDefaultExhaustiveForUnions: true },
        ],
        // Native replacements for sonarjs rules that need type information.
        "typescript/no-array-delete": "error",
        "typescript/no-for-in-array": "error",
        "typescript/prefer-regexp-exec": "error",
        "typescript/require-array-sort-compare": "error",
      },
    },
    {
      files: testFiles,
      // Test probes record hook results in variables outside the component.
      rules: { "react/globals": "off" },
    },
    {
      files: typescriptFiles,
      excludeFiles: testFiles,
      // Parse absent values once at a boundary instead of asserting them present.
      rules: { "typescript/no-non-null-assertion": "error" },
    },
    {
      files: ["convex/**/*.ts"],
      // Convex commands deliberately return null after every successful write.
      rules: { "sonarjs/no-invariant-returns": "off" },
    },
    {
      files: ["src/**/*.ts", "src/**/*.tsx", "convex/**/*.ts"],
      excludeFiles: ["**/*.test.ts"],
      rules: { "kvitto/no-inline-literal-set": "error" },
    },
    {
      files: ["src/**/*.ts", "src/**/*.tsx", "convex/**/*.ts"],
      rules: { "import/no-cycle": ["error", { ignoreExternal: true }] },
    },
    {
      files: ["src/**/*.tsx"],
      // expo-widgets serializes each "widget" function to a string, so widgets
      // cannot read theme values from module scope and keep their literals.
      excludeFiles: ["src/widgets/**"],
      rules: {
        "eslint-js/no-restricted-syntax": ["error", themeColor],
      },
    },
    {
      files: ["src/lib/**/*.ts", "convex/**/*.ts"],
      excludeFiles: ["**/*.test.ts"],
      rules: {
        // Dependencies point inward: screens and features use lib; lib and the
        // backend never import screens, features, or components.
        "import-js/no-restricted-paths": [
          "error",
          {
            zones: [
              {
                target: ["./src/lib", "./convex"],
                from: ["./src/app", "./src/features", "./src/components"],
              },
              {
                target: ["./src/lib", "./convex"],
                from: ["./src/lib/testing"],
                message: "Test helpers are for tests only.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["src/**/*.ts", "src/**/*.tsx"],
      rules: {
        "no-restricted-properties": [
          "error",
          {
            property: "toSorted",
            message:
              "Supported Hermes clients lack Array.toSorted. Copy the array before calling sort.",
          },
        ],
      },
    },
    {
      files: ["src/app/**", "src/features/**"],
      rules: {
        // This setting replaces the one above, so it repeats the theme rule.
        "eslint-js/no-restricted-syntax": [
          "error",
          themeColor,
          {
            // Convex puts its request trace in Error.message; the user message is in the error data.
            selector: 'CatchClause MemberExpression[property.name="message"]',
            message:
              "Show failureMessage(cause, operation, fallback) instead of a caught error's message.",
          },
        ],
      },
    },
    {
      files: ["src/lib/domain/**/*.ts", "src/lib/catalog/**/*.ts"],
      rules: {
        // Domain rules stay pure so tests and the backend can run them.
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                regex: "^(react|react-native|expo[^/]*|convex/react)(/|$)",
                message: "Domain code must not depend on React or Expo.",
              },
              {
                regex: "^@/(app|features|components)/",
                message: "Domain code must not depend on UI modules.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["convex/**/*.ts"],
      excludeFiles: ["**/*.test.ts", "convex/providerConfig.ts"],
      rules: {
        "no-restricted-properties": [
          "error",
          ...[
            "RECEIPT_PROVIDER",
            "RECEIPT_MODEL",
            "OPENAI_RECEIPT_MODEL",
            "PRODUCT_MODEL",
            "TYPESAFE_MODEL",
            "OPENAI_API_KEY",
            "ANTHROPIC_API_KEY",
            "TYPESAFE_API_KEY",
          ].map((property) => ({
            object: "env",
            property,
            message:
              "Use providerConfig so a missing model key fails in one place instead of changing receipt data.",
          })),
        ],
      },
    },
    {
      files: ["convex/**/*.ts"],
      excludeFiles: ["**/*.test.ts"],
      rules: {
        "kvitto/no-db-query-filter": "error",
        "kvitto/no-unbounded-collect": "error",
        "kvitto/no-silent-catch": "error",
        "kvitto/structured-log": "error",
        "kvitto/convex-function-access": [
          "error",
          {
            builders: ["query", "mutation", "action"],
            checks: [
              "requireMember",
              "requireReceipt",
              "requireCorrection",
              "getUserIdentity",
              "safeGetAuthUser",
              "getAuthUser",
            ],
          },
        ],
      },
    },
  ],
});
