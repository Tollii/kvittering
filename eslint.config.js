const { defineConfig } = require("eslint/config");
const expo = require("eslint-config-expo/flat");
module.exports = defineConfig([
  expo,
  { ignores: ["sveltemo/**", "convex/_generated/**", "convex/kassalapp/generated/**", "dist/**"] },
]);
