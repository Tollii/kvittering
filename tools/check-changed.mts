/**
 * Fast checks for the files changed since the base branch, including
 * uncommitted and untracked files. Agents run this after each change;
 * `npm run check` remains the complete check before committing.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const base = mergeBase();

const changed = [
  ...git(["diff", "--name-only", "--diff-filter=ACMR", base]),
  ...git(["ls-files", "--others", "--exclude-standard"]),
].filter((path, index, all) => all.indexOf(path) === index && existsSync(path));

if (changed.length === 0) {
  console.log(`No files changed since ${base}.`);
  process.exit(0);
}

const code = changed.filter((path) => /\.[cm]?[jt]sx?$/.test(path));

const failures: string[] = [];

run("Formatting", "prettier/bin/prettier.cjs", [
  "--check",
  "--ignore-unknown",
  ...changed,
]);

run("Types", "typescript/bin/tsc", ["--noEmit"]);

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
  run("Unused code", "knip/bin/knip.js", ["--no-progress"]);
  run("Related tests", "vitest/vitest.mjs", [
    "related",
    "--run",
    "--passWithNoTests",
    ...code,
  ]);
}

if (changed.some((path) => path.startsWith("convex/")))
  run("Backend contract", "vitest/vitest.mjs", [
    "run",
    "convex/contract.test.ts",
  ]);

if (changed.some((path) => path.startsWith("tools/eslint/")))
  run("Lint rule tests", null, ["--test", "tools/eslint/rules.test.cjs"]);

if (changed.some((path) => path.endsWith(".md") || path === "package.json"))
  run("Documentation references", null, ["tools/check-docs.mts"]);

if (failures.length > 0) {
  console.error(
    `\nFailed: ${failures.join(", ")}. Fix these before finishing; each message names the fix or its document.`,
  );
  process.exit(1);
}

console.log(`\nChanged files pass the fast checks (base ${base}).`);

/** Run a package's own script with this Node, or Node itself when `script` is null. */
function run(name: string, script: string | null, args: string[]) {
  console.log(`\n▸ ${name}`);

  const result = spawnSync(
    process.execPath,
    script ? [`node_modules/${script}`, ...args] : args,
    { stdio: "inherit" },
  );

  if (result.status !== 0) failures.push(name);
}

function git(args: string[]): string[] {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- Git is the contributor's own installation; the repository cannot pin its path.
  return execFileSync("git", args, { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

/** The commit this branch started from, or HEAD when no main branch is known. */
function mergeBase(): string {
  for (const branch of ["origin/main", "main"]) {
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- Git is the contributor's own installation; the repository cannot pin its path.
    const result = spawnSync("git", ["merge-base", "HEAD", branch], {
      encoding: "utf8",
    });

    if (result.status === 0) return result.stdout.trim();
  }

  return "HEAD";
}
