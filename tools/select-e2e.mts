/** Select the same native verification that the trusted merge check requires. */
import { appendFileSync } from "node:fs";
import { changedFiles } from "./changes.mts";
import { requiresNativeFlows } from "./change-areas.mts";

const event = process.env.EVENT;

let run =
  event === "workflow_dispatch" ||
  (event === "schedule" && process.env.PRIVATE === "false");

if (event === "pull_request" || event === "merge_group") {
  const base = process.env.BASE;

  if (!base)
    throw new Error(
      "A pull request or merge group must provide its base commit.",
    );
  run = requiresNativeFlows(
    changedFiles(base),
    process.env.LABELLED === "true",
  );
}

console.log(`End-to-end run: ${run} (${event})`);

if (process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\n`);
