// @vitest-environment node
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("requires native verification when a durable-data file is renamed outside its old directory", () => {
  const directory = mkdtempSync(join(tmpdir(), "kvitto-selection-test-"));
  const cwd = join(directory, "repository");
  mkdirSync(join(cwd, "src/lib"), { recursive: true });

  const runGit = (args: string[]) =>
    execFileSync("/usr/bin/git", args, { cwd, encoding: "utf8" }).trim();

  try {
    writeFileSync(
      join(cwd, "src/lib/receipt-draft.ts"),
      "export const version = 1;\n",
    );
    runGit(["init", "--quiet"]);
    runGit(["add", "."]);
    runGit([
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.test",
      "commit",
      "--quiet",
      "-m",
      "Selection fixture",
    ]);
    const base = runGit(["rev-parse", "HEAD"]);
    runGit(["mv", "src/lib/receipt-draft.ts", "src/lib/persistence.ts"]);
    const output = join(directory, "output");
    execFileSync(process.execPath, [resolve("tools/select-e2e.mts")], {
      cwd,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test",
        EVENT: "pull_request",
        BASE: base,
        GITHUB_OUTPUT: output,
      },
    });
    expect(readFileSync(output, "utf8")).toBe("run=true\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
