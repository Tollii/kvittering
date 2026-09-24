/**
 * Report which changed lines no test executed: `node tools/diff-coverage.mts [base]`
 * after the coverage run. It is a review aid, not a percentage gate; a line may
 * be uncovered for a good reason, but a changed rule with no test is visible.
 */
import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { git, mergeBase } from "./changes.mts";

const reports = ["coverage/lcov.info", "coverage/components/lcov.info"];

const base = process.argv[2] ?? mergeBase();

/** Executed state per line; a line counts as covered when any report ran it. */
const executed = new Map<string, Map<number, boolean>>();

for (const report of reports.filter((path) => existsSync(path))) {
  let file = "";

  for (const line of readFileSync(report, "utf8").split("\n")) {
    if (line.startsWith("SF:")) file = relative(process.cwd(), line.slice(3));
    else if (line.startsWith("DA:")) {
      const [number = "", hits = ""] = line.slice(3).split(",");
      const lines = executed.get(file) ?? new Map<number, boolean>();

      lines.set(
        Number(number),
        lines.get(Number(number)) === true || hits !== "0",
      );
      executed.set(file, lines);
    }
  }
}

const rows: string[] = [];

for (const [file, lines] of executed) {
  const uncovered = changedLines(file).filter(
    (number) => lines.get(number) === false,
  );

  if (uncovered.length > 0) rows.push(`| \`${file}\` | ${ranges(uncovered)} |`);
}

console.log("## Changed lines without test coverage\n");

console.log(
  rows.length === 0
    ? "Every changed executable line ran in a test."
    : `| File | Lines |\n| --- | --- |\n${rows.join("\n")}\n\nCover the lines that carry a rule or an important failure; see docs/verification.md.`,
);

function changedLines(file: string): number[] {
  const numbers: number[] = [];

  for (const hunk of git(["diff", "--unified=0", base, "--", file])) {
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(hunk);

    if (!match) continue;

    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);

    for (let offset = 0; offset < count; offset++) numbers.push(start + offset);
  }

  return numbers;
}

function ranges(numbers: number[]): string {
  const parts: string[] = [];
  let start = numbers[0] ?? 0;
  let previous = start;

  for (const number of [...numbers.slice(1), Number.NaN]) {
    if (number === previous + 1) {
      previous = number;
      continue;
    }

    parts.push(start === previous ? `${start}` : `${start}–${previous}`);
    start = number;
    previous = number;
  }

  return parts.join(", ");
}
