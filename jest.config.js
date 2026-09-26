const expoPreset = require("jest-expo/ios/jest-preset");

/**
 * Component tests render React Native components with Expo's iOS preset.
 * Domain, backend, and hook tests run in Vitest; see docs/verification.md.
 */
module.exports = {
  preset: "jest-expo/ios",
  testMatch: ["<rootDir>/src/**/*.test.tsx"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // Matches Metro's resolver override in metro.config.js.
    "^decode-uri-component$": "<rootDir>/tools/metro/decode-uri-component.cjs",
  },
  // Vitest writes the application coverage report to coverage/.
  coverageDirectory: "coverage/components",
  coveragePathIgnorePatterns: ["/node_modules/", "\\.test\\.tsx?$"],
  coverageReporters: ["text-summary", "lcov", "json-summary"],
  // Exercise the real receipt validators and Sentry React capture pipeline.
  transformIgnorePatterns: expoPreset.transformIgnorePatterns.map((pattern) =>
    pattern.replace(
      "(?!(",
      "(?!(convex-helpers|@sentry/|decode-uri-component|",
    ),
  ),
  // Metro applies babel-preset-expo without a project Babel file; Jest needs it named.
  transform: {
    ...expoPreset.transform,
    "\\.[jt]sx?$": [
      "babel-jest",
      {
        caller: { name: "metro", bundler: "metro", platform: "ios" },
        presets: ["babel-preset-expo"],
      },
    ],
  },
};
