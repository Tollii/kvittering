// @vitest-environment node
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];

const command = resolve("tools/release.mts");

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function releaseFixture(ready: boolean) {
  const directory = mkdtempSync(join(tmpdir(), "kvitto-release-test-"));
  directories.push(directory);
  const cwd = join(directory, "repository");
  mkdirSync(join(cwd, "node_modules/convex/bin"), { recursive: true });
  mkdirSync(join(cwd, "releases"));
  const calls = join(directory, "calls.txt");
  writeFileSync(calls, "");
  writeFileSync(join(cwd, ".gitignore"), "node_modules/\n.env.local\n");
  writeFileSync(
    join(cwd, ".env.local"),
    "CONVEX_DEPLOYMENT=prod:personal-deployment\n",
  );
  writeFileSync(
    join(cwd, "releases/staging.json"),
    JSON.stringify({
      deployment: "courteous-jay-215",
      recoveryClient: {
        build: "12",
        sourceCommit: "a".repeat(40),
        verifiedAt: "2026-01-01T00:00:00Z",
        verifiedBy: "Test operator",
        evidence:
          "https://appstoreconnect.apple.com/apps/6813602733/testflight",
        availableToTesters: true,
        pendingUploadUpgradePassed: true,
      },
    }),
  );
  writeFileSync(
    join(cwd, "node_modules/convex/bin/main.js"),
    `
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.CONVEX_DEPLOY_KEY !== 'prod:courteous-jay-215|redacted-test-value') process.exit(91);
fs.appendFileSync(${JSON.stringify(calls)}, args[0] + '\\n');
if (args[0] === 'run') {
  if (!args.includes('--inline-query') || args.includes('--push')) process.exit(93);
  if (args[args.indexOf('--deployment') + 1] !== 'courteous-jay-215') process.exit(92);
  console.log(${JSON.stringify(String(ready))});
}
`,
  );

  for (const args of [
    ["init", "--quiet"],
    ["add", "."],
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.test",
      "commit",
      "--quiet",
      "-m",
      "Release fixture",
    ],
  ])
    execFileSync("/usr/bin/git", args, { cwd });

  return {
    run: (args: string[]) =>
      spawnSync(process.execPath, [command, ...args], {
        cwd,
        encoding: "utf8",
        env: {
          PATH: process.env.PATH,
          NODE_ENV: "test",
          CONVEX_DEPLOY_KEY: "prod:courteous-jay-215|redacted-test-value",
        },
      }),
    calls: () => readFileSync(calls, "utf8"),
  };
}

describe("release command effects", () => {
  it("checks the selected deployment without deploying when releasing a client", () => {
    const fixture = releaseFixture(true);
    const result = fixture.run(["client"]);
    expect(result.status).toBe(0);
    expect(fixture.calls()).toBe("run\n");
  });
  it("deploys eight-image source as the additive release", () => {
    const fixture = releaseFixture(false);
    const result = fixture.run(["backend", "--stage", "additive"]);
    expect(result.status).toBe(0);
    expect(fixture.calls()).toBe("deploy\n");
  });
  it.each([false, true])(
    "rejects enforcement from eight-image source when readiness is %s",
    (ready) => {
      const fixture = releaseFixture(ready);
      const result = fixture.run(["backend", "--stage", "enforcement"]);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Select --stage additive");
      expect(fixture.calls()).toBe("");
    },
  );
});
