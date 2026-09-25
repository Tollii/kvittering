/**
 * Check that documentation points at things that exist: relative links,
 * their heading anchors, and `npm run` scripts. Agents follow these references
 * literally, so a stale one sends them to a file or command that is gone.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { z } from "zod";

// Vendored, archived, and generated documents are not maintained here.
const excluded = [
  "tools/oxlint/anti-slop/",
  "plans/simplification-review/",
  "convex/_generated/",
];

const packageJson = z.object({ scripts: z.record(z.string(), z.string()) });

const scripts = new Set(
  Object.keys(
    packageJson.parse(JSON.parse(readFileSync("package.json", "utf8"))).scripts,
  ),
);

// eslint-disable-next-line sonarjs/no-os-command-from-path -- Git is the contributor's own installation; the repository cannot pin its path.
const documents = execFileSync("git", ["ls-files", "*.md"], {
  encoding: "utf8",
})
  .split("\n")
  .filter(
    (path) => path && !excluded.some((prefix) => path.startsWith(prefix)),
  );

const problems: string[] = [];

for (const document of documents) {
  const text = withoutFencedCode(readFileSync(document, "utf8"));

  for (const match of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1] ?? "";

    // URLs and absolute paths to a contributor's machine are outside the repository.
    if (/^[a-z]+:/i.test(target) || target.startsWith("/")) continue;

    const [path = "", anchor] = target.split("#");
    const resolved = path ? normalize(join(dirname(document), path)) : document;

    if (!existsSync(resolved)) {
      problems.push(`${document}: link to missing ${target}`);
      continue;
    }

    if (
      anchor &&
      resolved.endsWith(".md") &&
      !statSync(resolved).isDirectory() &&
      !headingAnchors(resolved).has(anchor)
    )
      problems.push(`${document}: link to missing heading ${target}`);
  }

  for (const match of readFileSync(document, "utf8").matchAll(
    /npm run ([\w:.-]+)/g,
  )) {
    const script = match[1] ?? "";

    if (!scripts.has(script))
      problems.push(`${document}: \`npm run ${script}\` is not a script`);
  }
}

if (problems.length > 0) {
  console.error(
    `${problems.join("\n")}\n\nUpdate the reference or restore its target. Documentation is the agents' source of truth; see docs/verification.md.`,
  );
  process.exit(1);
}

function withoutFencedCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "");
}

/** GitHub's heading anchors: lower case, punctuation removed, spaces as hyphens. */
function headingAnchors(path: string): Set<string> {
  const anchors = new Set<string>();

  for (const line of withoutFencedCode(readFileSync(path, "utf8")).split(
    "\n",
  )) {
    const heading = /^#{1,6} (.*)/.exec(line)?.[1];

    if (heading)
      anchors.add(
        heading
          .trim()
          .toLowerCase()
          .replace(/[^\p{L}\p{N}\s_-]/gu, "")
          .replace(/\s/g, "-"),
      );
  }

  return anchors;
}
