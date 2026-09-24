// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const publishedChange = z.object({
  path: z.string(),
  body: z.object({ status: z.string(), conclusion: z.string().optional() }),
});

const command = resolve("tools/merge-readiness.mts");

function verifyPullRequest(failReviewRead: boolean) {
  const directory = mkdtempSync(join(tmpdir(), "kvitto-merge-test-"));
  const calls = join(directory, "calls.jsonl");
  writeFileSync(calls, "");
  writeFileSync(
    join(directory, "gh"),
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = process.argv[3];
const body = process.argv.includes('--input') ? JSON.parse(fs.readFileSync(0, 'utf8')) : null;
const head = 'a'.repeat(40);
const pull = { number: 31, head: { sha: head }, draft: false, labels: [] };
let result;
if (path.includes('/check-runs') && body) {
  fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ path, body }) + '\\n');
  result = { id: 123 };
} else if (path.includes('/check-runs?')) {
  result = { check_runs: [{ id: 123, external_id: 'merge-readiness:31', app: { id: 15368 } }] };
} else if (path.includes('/pulls?')) {
  result = [pull];
} else if (path.endsWith('/pulls/31')) {
  result = pull;
} else if (path.includes('/files?')) {
  result = [{ filename: 'docs/verification.md' }];
} else if (path.includes('/quality.yml/runs?')) {
  result = { workflow_runs: [{ id: 456, head_sha: head, status: 'completed', conclusion: 'success' }] };
} else if (path.includes('/e2e.yml/runs?')) {
  result = { workflow_runs: [] };
} else if (path.includes('/reviews?')) {
  if (${failReviewRead}) process.exit(1);
  result = [{ user: { login: 'coderabbitai[bot]' }, commit_id: head, state: 'COMMENTED', body: '**Actionable comments posted: 0**' }];
} else if (path === 'graphql') {
  result = { data: { repository: { pullRequest: { reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } } } } };
} else process.exit(90);
console.log(JSON.stringify(result));
`,
    { mode: 0o700 },
  );

  try {
    const result = spawnSync(process.execPath, [command, "--publish"], {
      encoding: "utf8",
      env: { PATH: `${directory}:${process.env.PATH}`, NODE_ENV: "test" },
    });

    const writes = readFileSync(calls, "utf8")
      .trim()
      .split("\n")
      .map((line) => publishedChange.parse(JSON.parse(line)));

    return { status: result.status, writes };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("published merge evidence", () => {
  it("refreshes the existing check from pending to success without creating duplicate checks", () => {
    const result = verifyPullRequest(false);
    expect(result.status).toBe(0);
    expect(result.writes).toMatchObject([
      {
        path: "repos/Tollii/kvittering/check-runs/123",
        body: { status: "in_progress" },
      },
      {
        path: "repos/Tollii/kvittering/check-runs/123",
        body: { status: "completed", conclusion: "success" },
      },
    ]);
  });
  it("revokes an earlier success before reading evidence and leaves it pending on API failure", () => {
    const result = verifyPullRequest(true);
    expect(result.status).not.toBe(0);
    expect(result.writes).toEqual([
      {
        path: "repos/Tollii/kvittering/check-runs/123",
        body: { status: "in_progress" },
      },
    ]);
  });
});
