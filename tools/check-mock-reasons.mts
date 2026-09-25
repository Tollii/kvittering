/**
 * Each module-mocking suppression must say why that particular module is
 * replaced. A reason copied into several files reads as a justification while
 * describing none of the mocks, so reviewers stop checking what is mocked.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const marker = "anti-slop/no-module-mocking -- ";

// eslint-disable-next-line sonarjs/no-os-command-from-path -- Git is the contributor's own installation; the repository cannot pin its path.
const sources = execFileSync("git", ["ls-files", "*.ts", "*.tsx"], {
  encoding: "utf8",
})
  .split("\n")
  .filter((path) => path && !path.startsWith("tools/oxlint/anti-slop/"));

const filesByReason = new Map<string, Set<string>>();

for (const path of sources)
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const start = line.indexOf(marker);

    if (start === -1) continue;
    const reason = line.slice(start + marker.length).trim();
    filesByReason.set(
      reason,
      (filesByReason.get(reason) ?? new Set()).add(path),
    );
  }

const repeated = [...filesByReason].filter(([, files]) => files.size > 1);

for (const [reason, files] of repeated)
  console.error(
    `Module-mocking reason reused in ${[...files].join(", ")}:\n  ${reason}\nName the module each mock replaces and why that test needs it replaced.`,
  );

if (repeated.length > 0) process.exit(1);
