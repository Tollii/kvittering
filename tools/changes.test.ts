// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";

const directories: string[] = [];

const moduleUrl = new URL("./changes.mts", import.meta.url).href;

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function repository(branch: string) {
  const directory = mkdtempSync(join(tmpdir(), "kvitto-change-check-"));
  directories.push(directory);

  const git = (...args: string[]) =>
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- Exercise the contributor's Git against a disposable repository.
    execFileSync("git", args, {
      cwd: directory,
      encoding: "utf8",
      stdio: "pipe",
    });

  git("init", "-b", branch);
  git("config", "user.name", "Change check test");
  git("config", "user.email", "change-check@example.com");
  writeFileSync(join(directory, "dependency.ts"), "export const value = 1;\n");
  git("add", ".");
  git("commit", "-m", "Create fixture dependency");

  return { directory, git };
}

function inspect(directory: string) {
  return spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { mergeBase, changedFiles } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify(changedFiles(mergeBase())));`,
    ],
    { cwd: directory, encoding: "utf8" },
  );
}

test("refuses to omit committed changes when the base branch is unavailable", () => {
  const { directory, git } = repository("topic");
  writeFileSync(join(directory, "dependency.ts"), "export const value = 2;\n");
  git("commit", "-am", "Change fixture dependency");
  const result = inspect(directory);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("fetch origin/main");
});

test("includes a committed deletion so dependants and change areas are checked", () => {
  const { directory, git } = repository("main");
  git("checkout", "-b", "topic");
  git("rm", "dependency.ts");
  git("commit", "-m", "Delete fixture dependency");
  const result = inspect(directory);
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual(["dependency.ts"]);
});

test("deletion-only changes report the broken import and documentation link", () => {
  const { directory, git } = repository("main");
  mkdirSync(join(directory, "tools"));
  writeFileSync(join(directory, ".gitignore"), "node_modules\n");
  symlinkSync(
    join(process.cwd(), "node_modules"),
    join(directory, "node_modules"),
  );
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ type: "module", scripts: {} }),
  );
  writeFileSync(
    join(directory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { noEmit: true, skipLibCheck: true, types: [] },
      files: ["consumer.ts"],
    }),
  );
  writeFileSync(
    join(directory, "tools/tsconfig.json"),
    JSON.stringify({ extends: "../tsconfig.json" }),
  );
  writeFileSync(
    join(directory, "consumer.ts"),
    'import { value } from "./dependency"; console.log(value);\n',
  );
  writeFileSync(join(directory, "README.md"), "[Dependency](dependency.ts)\n");
  copyFileSync(
    new URL("./check-docs.mts", import.meta.url),
    join(directory, "tools/check-docs.mts"),
  );
  git("add", ".");
  git("commit", "-m", "Add fixture dependants");
  git("checkout", "-b", "topic");
  git("rm", "dependency.ts");
  git("commit", "-m", "Delete fixture dependency");

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./check-changed.mts", import.meta.url))],
    {
      cwd: directory,
      encoding: "utf8",
      timeout: 15000,
    },
  );

  expect(result.status).toBe(1);
  expect(result.stdout).toContain("Cannot find module './dependency'");
  expect(result.stdout).toContain("Documentation references");
  expect(result.stdout).toContain("dependency.ts");
  expect(result.stdout).not.toContain("No files changed");
}, 20000);
