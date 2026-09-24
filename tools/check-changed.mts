/**
 * Fast checks for the files changed since the base branch, including
 * uncommitted and untracked files. Agents run this after each change;
 * `npm run check` remains the complete check before committing.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { changedFiles, mergeBase } from "./changes.mts";

const base = mergeBase();

const changed = changedFiles(base);

if (changed.length === 0) {
  console.log(`No files changed since ${base}.`);
  process.exit(0);
}

const existing = changed.filter(existsSync);

const deleted = changed.length !== existing.length;

const code = existing.filter((path) => /\.[cm]?[jt]sx?$/.test(path));

const failures: string[] = [];

if (existing.length > 0)
  run("Formatting", "prettier/bin/prettier.cjs", [
    "--check",
    "--ignore-unknown",
    ...existing,
  ]);

run("Types", "typescript/bin/tsc", ["--noEmit"]);

run("Backend types", "typescript/bin/tsc", ["--noEmit", "-p", "convex"]);

run("Tool types", "typescript/bin/tsc", [
  "--noEmit",
  "-p",
  "tools/tsconfig.json",
]);

if (code.length > 0) {
  run("Oxlint", "oxlint/bin/oxlint", ["--deny-warnings", ...code]);
  run("Repository policy", "oxlint/bin/oxlint", [
    "--config",
    "oxlint.policy.config.mjs",
    "--deny-warnings",
    ...code,
  ]);
  run("ESLint", "eslint/bin/eslint.js", [
    "--max-warnings",
    "0",
    "--no-warn-ignored",
    ...code,
  ]);

  run("Related tests", "vitest/vitest.mjs", [
    "related",
    "--run",
    "--passWithNoTests",
    ...code,
  ]);

  const application = code.filter((path) => path.startsWith("src/"));

  if (application.length > 0)
    run("Related component tests", "jest/bin/jest.js", [
      "--findRelatedTests",
      "--passWithNoTests",
      ...application,
    ]);
}

if (code.length > 0 || deleted)
  run("Unused code", "knip/bin/knip.js", ["--no-progress"]);

if (changed.some((path) => path.startsWith("convex/")))
  run("Backend contract", "vitest/vitest.mjs", [
    "run",
    "convex/contract.test.ts",
  ]);

if (changed.some((path) => path.startsWith("tools/eslint/")))
  run("Lint rule tests", null, ["--test", "tools/eslint/rules.test.cjs"]);

if (
  deleted ||
  changed.some((path) => path.endsWith(".md") || path === "package.json")
)
  run("Documentation references", null, ["tools/check-docs.mts"]);

if (failures.length > 0) {
  console.error(
    `\nFailed: ${failures.join(", ")}. Fix these before finishing; each message names the fix or its document.`,
  );
  process.exit(1);
}

console.log(`\nChanged files pass the fast checks (base ${base}).`);

/**
 * Run a package's own script with this Node, or Node itself when `script` is
 * null. Only a failing step prints its output, so the findings stay readable.
 */
function run(name: string, script: string | null, args: string[]) {
  const result = spawnSync(
    process.execPath,
    script ? [`node_modules/${script}`, ...args] : args,
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );

  if (result.status === 0) {
    console.log(`✓ ${name}`);

    return;
  }

  failures.push(name);
  console.log(`✗ ${name}\n${result.stdout}${result.stderr}`);
}
