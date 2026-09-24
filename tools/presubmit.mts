/**
 * Name the review areas a change touches and the checks each one needs, in
 * the way Chromium's PRESUBMIT files do. `node tools/presubmit.mts [base]`
 * prints a Markdown checklist; in GitHub Actions it also writes one output
 * per area so jobs can run only where they apply.
 */
import { appendFileSync } from "node:fs";
import { changedFiles, mergeBase } from "./changes.mts";

type Area = {
  name: string;
  title: string;
  matches: (path: string) => boolean;
  checklist: string[];
};

const under =
  (...prefixes: string[]) =>
  (path: string) =>
    prefixes.some((prefix) => path.startsWith(prefix));

const areas: Area[] = [
  {
    name: "backend",
    title: "Backend functions",
    matches: (path) => path.startsWith("convex/") && !path.endsWith(".md"),
    checklist: [
      "The contract job compares `convex/contract.json` with the base branch. Run `npm run contract:update` after changing a function signature.",
      "Keep arguments accepted by installed apps and by work already scheduled; see [releases](.agents/skills/release-review/SKILL.md).",
      "For authorization, transactions, or bounded reads, use the `convex-reviewer` skill.",
    ],
  },
  {
    name: "schema",
    title: "Persisted data",
    matches: (path) => path === "convex/schema.ts",
    checklist: [
      "Existing documents must still validate. Rehearse any backfill with the `convex-migrate-rehearse` skill before deploying.",
    ],
  },
  {
    name: "releases",
    title: "Release policy and installed clients",
    matches: under(
      "src/lib/releases/",
      "convex/releasePolicy",
      "convex/clientReleases",
      "convex/featureFlags",
      "eas.json",
      ".github/workflows/ota.yml",
      ".github/workflows/testflight.yml",
    ),
    checklist: [
      "Run the `release-review` skill. Never raise minimum supported versions automatically.",
    ],
  },
  {
    name: "native",
    title: "Native configuration",
    matches: under(
      "app.json",
      "app.config.ts",
      "plugins/",
      "modules/",
      "native/",
      "metro.config.js",
      "package.json",
      "package-lock.json",
    ),
    checklist: [
      "The fingerprint job reports whether the native runtime changed. A changed runtime needs a TestFlight build; an OTA update cannot deliver it.",
      "The end-to-end job runs on the iOS Simulator for this change.",
    ],
  },
  {
    name: "domain",
    title: "Domain rules",
    matches: (path) =>
      path.startsWith("src/lib/domain/") && !path.endsWith(".test.ts"),
    checklist: [
      "The mutation report lists rule changes that no test notices. Add a test for each one that matters.",
    ],
  },
  {
    name: "e2e",
    title: "End-to-end flows",
    matches: under(".maestro/", ".github/workflows/e2e.yml", "tools/e2e/"),
    checklist: ["The end-to-end job runs the changed flows."],
  },
  {
    name: "workflows",
    title: "CI workflows",
    matches: under(".github/"),
    checklist: [
      "actionlint and zizmor check the workflows. Pin new actions to a full commit SHA with the version in a comment.",
    ],
  },
];

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
