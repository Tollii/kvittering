/**
 * Compare two Expo fingerprints: `node tools/fingerprint-diff.mts base.json head.json`.
 * A different hash is a different native runtime, which only a new build can
 * deliver. The report names the sources that changed.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { z } from "zod";

const fingerprint = z.object({
  hash: z.string(),
  sources: z.array(
    z.looseObject({
      filePath: z.string().optional(),
      id: z.string().optional(),
      hash: z.string().nullable(),
    }),
  ),
});

const [basePath, headPath] = process.argv.slice(2);

if (!basePath || !headPath) {
  console.error("Usage: node tools/fingerprint-diff.mts base.json head.json");
  process.exit(2);
}

const read = (path: string) =>
  fingerprint.parse(JSON.parse(readFileSync(path, "utf8")));

const base = read(basePath);

const head = read(headPath);

const changed = base.hash !== head.hash;

const sourceHashes = (sources: typeof base.sources) =>
  new Map(
    sources.map((source) => [source.filePath ?? source.id ?? "", source.hash]),
  );

const before = sourceHashes(base.sources);

const after = sourceHashes(head.sources);

const differences = [...new Set([...before.keys(), ...after.keys()])]
  .filter((source) => before.get(source) !== after.get(source))
  .sort((a, b) => a.localeCompare(b));

console.log("## Native runtime\n");

const sourceList = differences.map((source) => "- `" + source + "`").join("\n");

console.log(
  changed
    ? `The iOS fingerprint changed (\`${base.hash.slice(0, 12)}\` → \`${head.hash.slice(0, 12)}\`). Installed apps need a new TestFlight build; an OTA update cannot deliver this change.\n\nChanged sources:\n${sourceList}`
    : `The iOS fingerprint is unchanged (\`${head.hash.slice(0, 12)}\`). The JavaScript can ship as an OTA update after release review.`,
);

const output = process.env.GITHUB_OUTPUT;

if (output) appendFileSync(output, `changed=${String(changed)}\n`);
