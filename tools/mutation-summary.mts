/**
 * Summarize Stryker's JSON report: `node tools/mutation-summary.mts report.json`.
 * Each surviving mutant is a change to a rule that no test noticed.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";

const report = z.object({
  files: z.record(
    z.string(),
    z.object({
      mutants: z.array(
        z.looseObject({
          mutatorName: z.string(),
          replacement: z.string().optional(),
          status: z.string(),
          location: z.object({ start: z.object({ line: z.number() }) }),
        }),
      ),
    }),
  ),
});

const [path] = process.argv.slice(2);

if (!path) {
  console.error("Usage: node tools/mutation-summary.mts mutation.json");
  process.exit(2);
}

const { files } = report.parse(JSON.parse(readFileSync(path, "utf8")));

const rows: string[] = [];

for (const [file, { mutants }] of Object.entries(files)) {
  const detected = mutants.filter((mutant) =>
    ["Killed", "Timeout"].includes(mutant.status),
  ).length;

  const survivors = mutants.filter((mutant) => mutant.status === "Survived");

  const listed = survivors.slice(0, 8).map(describeMutant);

  if (survivors.length > listed.length)
    listed.push(`… ${survivors.length - listed.length} more`);

  rows.push(
    `| \`${file}\` | ${detected}/${mutants.length} | ${listed.join("<br>")} |`,
  );
}

console.log("## Mutation report for changed domain rules\n");

console.log(
  `| File | Detected | Surviving changes |\n| --- | --- | --- |\n${rows.join("\n")}\n\nA surviving change is a rule edit no test notices. Add a test where the rule matters; see docs/verification.md.`,
);

function describeMutant(mutant: {
  mutatorName: string;
  replacement?: string;
  location: { start: { line: number } };
}): string {
  const replacement = mutant.replacement
    ? " → `" + mutant.replacement.replace(/\s+/g, " ").slice(0, 40) + "`"
    : "";

  return `L${mutant.location.start.line} ${mutant.mutatorName}${replacement}`;
}
