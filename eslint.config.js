const { defineConfig } = require("eslint/config");

const expo = require("eslint-config-expo/flat");

const sonarjs = require("eslint-plugin-sonarjs");

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
      "sonarjs/no-all-duplicated-branches": "error",
      "sonarjs/no-element-overwrite": "error",
      "sonarjs/no-identical-expressions": "error",
      "sonarjs/no-ignored-return": "error",
      "sonarjs/no-invariant-returns": "error",
      "sonarjs/no-use-of-empty-return-value": "error",
    },
  },
  {
    files: ["convex/**/*.ts"],
    // Convex commands deliberately return null after every successful write.
    rules: { "sonarjs/no-invariant-returns": "off" },
  },
]);
