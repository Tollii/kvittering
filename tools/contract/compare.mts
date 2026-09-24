/**
 * Compare two committed contracts: `node tools/contract/compare.mts base.json head.json`.
 * Prints a Markdown report and exits with 1 when a change is breaking, unless
 * `--allow-breaking` records that the release review accepted it.
 */
import { readFileSync } from "node:fs";
import { compareContracts, contractSchema } from "./compatibility.ts";

const [basePath, headPath, flag] = process.argv.slice(2);

if (!basePath || !headPath) {
  console.error("Usage: node tools/contract/compare.mts base.json head.json");
  process.exit(2);
}

const read = (path: string) =>
  contractSchema.parse(JSON.parse(readFileSync(path, "utf8")));

const changes = compareContracts(read(basePath), read(headPath));

const breaking = changes.filter((change) => change.breaking);

console.log("## Backend contract\n");

if (changes.length === 0) console.log("No contract changes.");

for (const change of changes)
  console.log(
    `- ${change.breaking ? "**Breaking**" : "Compatible"} \`${change.subject}\`: ${change.detail}`,
  );

if (breaking.length > 0) {
  console.log(
    "\nInstalled apps or queued work may fail after this deploys. Keep the old contract, add a new function, or follow the release review in .agents/skills/release-review/SKILL.md. If the review accepts the break, add the `breaking-contract` label.",
  );

  if (flag !== "--allow-breaking") process.exit(1);
}
