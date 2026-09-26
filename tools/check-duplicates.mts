import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import config from "../.jscpd.json" with { type: "json" };

const testPatterns = [
  "**/*.test.*",
  "**/*.spec.*",
  "**/testing/**",
  "**/fixtures/**",
];

// Test repetition is advisory. Scan it first so a production failure does not
// prevent its report. Both scans retain the generated and vendored exclusions.
const scans = [
  {
    name: "tests",
    args: ["--pattern", `{${testPatterns.join(",")}}`],
  },
  {
    name: "production",
    args: [
      "--ignore",
      [...config.ignore, ...testPatterns].join(","),
      "--threshold",
      "0.15",
    ],
  },
];

let failed = false;

for (const scan of scans) {
  console.log(
    `Duplicate code: ${scan.name}${scan.name === "tests" ? " (advisory)" : ""}`,
  );

  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(import.meta.resolve("jscpd/run-jscpd.js")),
      ...scan.args,
      "--output",
      `build/duplication/${scan.name}`,
    ],
    { stdio: "inherit" },
  );

  if (result.status !== 0) failed = true;
}

if (failed) process.exit(1);
