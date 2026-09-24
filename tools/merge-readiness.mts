/** Read GitHub evidence. --publish writes a check; this command never merges. */
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { requiresNativeFlows } from "./change-areas.mts";
import {
  mergeObjections,
  type Review,
  type WorkflowResult,
} from "./merge-policy.mts";

const { values } = parseArgs({
  options: { publish: { type: "boolean", default: false } },
});

const repository = "Tollii/kvittering";

if (
  process.env.GITHUB_REPOSITORY &&
  process.env.GITHUB_REPOSITORY !== repository
)
  throw new Error("Unexpected repository.");

function github<T>(path: string, body?: string, method = "POST"): T {
  const output = execFileSync(
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- gh is the authenticated host CLI; arguments and JSON input do not pass through a shell.
    "gh",
    ["api", path, ...(body ? ["--method", method, "--input", "-"] : [])],
    {
      encoding: "utf8",
      input: body,
    },
  );

  // SAFETY: Fixed GitHub endpoints define T. Missing structures throw; policy values must match explicit success conditions before a check can pass.
  return JSON.parse(output) as T;
}

function pages<T>(path: string): T[] {
  const rows: T[] = [];

  for (let page = 1; ; page++) {
    const result = github<T[]>(
      `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
    );

    rows.push(...result);

    if (result.length < 100) return rows;
  }
}

type Pull = {
  number: number;
  head: { sha: string };
  draft: boolean;
  labels: { name: string }[];
};

type Run = WorkflowResult & { id: number };

const root = `repos/${repository}`;

function workflow(name: string, head: string): Run | undefined {
  const result = github<{ workflow_runs: Run[] }>(
    `${root}/actions/workflows/${name}/runs?head_sha=${head}&event=pull_request&per_page=1`,
  );

  return result.workflow_runs[0];
}

function unresolvedThreads(number: number): number {
  let cursor: string | null = null;
  let unresolved = 0;

  do {
    const result: {
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: { isResolved: boolean }[];
              pageInfo: { hasNextPage: boolean; endCursor: string };
            };
          };
        };
      };
    } = github(
      "graphql",
      JSON.stringify({
        query: `query($number:Int!,$cursor:String) { repository(owner:"Tollii",name:"kvittering") { pullRequest(number:$number) { reviewThreads(first:100,after:$cursor) { nodes { isResolved } pageInfo { hasNextPage endCursor } } } } }`,
        variables: { number, cursor },
      }),
    );

    const threads = result.data.repository.pullRequest.reviewThreads;
    unresolved += threads.nodes.filter((thread) => !thread.isResolved).length;
    cursor = threads.pageInfo.hasNextPage ? threads.pageInfo.endCursor : null;
  } while (cursor);

  return unresolved;
}

for (const pull of pages<Pull>(`${root}/pulls?state=open&base=main`)) {
  const head = pull.head.sha;

  const check = {
    name: "Merge readiness",
    head_sha: head,
    external_id: `merge-readiness:${pull.number}`,
  };

  // Refresh one check per commit. API failures leave that same check pending.
  let pending: { id: number } | undefined;

  if (values.publish) {
    const existing = github<{
      check_runs: { id: number; external_id: string; app: { id: number } }[];
    }>(
      `${root}/commits/${head}/check-runs?check_name=Merge%20readiness&filter=latest&per_page=100`,
    ).check_runs.find(
      (run) => run.external_id === check.external_id && run.app.id === 15368,
    );

    pending = existing
      ? github<{ id: number }>(
          `${root}/check-runs/${existing.id}`,
          JSON.stringify({ status: "in_progress" }),
          "PATCH",
        )
      : github<{ id: number }>(
          `${root}/check-runs`,
          JSON.stringify({ ...check, status: "in_progress" }),
        );
  }

  const files = pages<{ filename: string; previous_filename?: string }>(
    `${root}/pulls/${pull.number}/files`,
  );

  if (files.length >= 3000)
    throw new Error(
      "GitHub truncates pull-request file lists at 3000 files. Split this pull request before checking it.",
    );
  const quality = workflow("quality.yml", head);
  const native = workflow("e2e.yml", head);

  if (native) {
    const jobs = github<{
      jobs: { name: string; conclusion: string | null }[];
    }>(`${root}/actions/runs/${native.id}/jobs?per_page=100`);

    native.nativeJob =
      jobs.jobs.find((job) => job.name === "iOS Simulator flows")?.conclusion ??
      undefined;
  }

  const objections = mergeObjections({
    head,
    draft: pull.draft,
    quality,
    native,
    nativeRequired: requiresNativeFlows(
      files.flatMap((file) => [
        file.filename,
        ...(file.previous_filename ? [file.previous_filename] : []),
      ]),
      pull.labels.some((label) => label.name === "e2e"),
    ),
    reviews: pages<Review>(`${root}/pulls/${pull.number}/reviews`),
    unresolvedThreads: unresolvedThreads(pull.number),
  });

  const current = github<Pull>(`${root}/pulls/${pull.number}`);

  if (current.head.sha !== head)
    objections.push("The pull request changed while its evidence was read.");

  const summary = objections.length
    ? objections.map((reason) => `- ${reason}`).join("\n")
    : "Required CI and CodeRabbit review passed for this commit; no review threads remain open.";

  console.log(`#${pull.number} ${head}\n${summary}`);

  if (!values.publish && objections.length) process.exitCode = 1;

  if (pending)
    github(
      `${root}/check-runs/${pending.id}`,
      JSON.stringify({
        status: "completed",
        conclusion: objections.length ? "failure" : "success",
        output: {
          title: objections.length
            ? "Merge requirements are not met"
            : "Ready to merge",
          summary,
        },
      }),
      "PATCH",
    );
}
