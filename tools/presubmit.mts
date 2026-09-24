/**
 * Name the review areas a change touches and the checks each one needs, in
 * the way Chromium's PRESUBMIT files do. `node tools/presubmit.mts [base]`
 * prints a Markdown checklist; in GitHub Actions it also writes one output
 * per area so jobs can run only where they apply.
 */
import { appendFileSync } from "node:fs";
import { changedFiles, mergeBase } from "./changes.mts";

import { areas } from "./change-areas.mts";

const base = process.argv[2] ?? mergeBase();

const changed = changedFiles(base);

const touched = areas.filter((area) => changed.some(area.matches));

const report = [
  "## Change areas\n",
  touched.length === 0
    ? "No area needs checks beyond the standard quality checks."
    : touched
        .map(
          (area) =>
            `### ${area.title}\n\n` +
            area.checklist.map((item) => "- [ ] " + item).join("\n"),
        )
        .join("\n\n"),
].join("\n");

console.log(report);

const output = process.env.GITHUB_OUTPUT;

if (output)
  appendFileSync(
    output,
    areas
      .map((area) => `${area.name}=${String(touched.includes(area))}\n`)
      .join(""),
  );
