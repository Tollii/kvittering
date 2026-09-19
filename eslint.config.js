const { defineConfig } = require("eslint/config");

const expo = require("eslint-config-expo/flat");

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
    plugins: { kvitto },
    rules: {
      "kvitto/no-undefined-record": "error",
    },
  },
]);
