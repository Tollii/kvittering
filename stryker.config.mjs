// Mutation testing for pure domain rules: `npm run test:mutation`, or
// `npm run test:mutation -- --mutate src/lib/domain/ore.ts` for one module.
// It shows whether tests notice a changed rule. Run it when changing domain
// logic or its tests; it is not a CI gate or a percentage target.
//
// The command runner reruns the domain tests for each mutant. Stryker's Vitest
// runner does not activate mutants under the installed Vitest version.
export default {
  testRunner: "command",
  commandRunner: {
    command: "npx vitest run --config vitest.mutation.config.mts --bail 1",
  },
  mutate: ["src/lib/domain/**/*.ts", "!src/lib/domain/**/*.test.ts"],
  coverageAnalysis: "off",
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: "coverage/mutation/index.html" },
  jsonReporter: { fileName: "coverage/mutation/mutation.json" },
  tempDirName: ".stryker-tmp",
  // Only source and configuration are copied into the sandbox.
  ignorePatterns: [
    ".claude",
    ".agents",
    ".codex",
    "docs",
    "plans",
    "ios",
    "android",
    "sveltemo",
    "coverage",
    "reports",
  ],
  thresholds: { high: 80, low: 60, break: null },
};
