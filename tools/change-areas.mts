/** Change classification shared by the review checklist and native CI selection. */
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

export const areas: Area[] = [
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
    name: "durable",
    title: "Authentication and durable receipt data",
    matches: (path) =>
      under(
        "src/app/",
        "src/features/",
        "src/lib/auth",
        "src/lib/apple-auth",
        "src/lib/receipt",
        "src/lib/upload",
        "src/lib/queue",
        "src/lib/session",
        "src/lib/deployment-storage",
        "src/lib/capture",
        "src/lib/pending-import",
        "src/lib/releases/",
        "src/lib/featureFlags",
        "src/lib/domain/receipt",
        "convex/auth",
        "convex/http",
        "convex/receipt",
        "convex/release",
        "convex/clientFunctions",
        "convex/access",
        "convex/households",
        "convex/schema",
      )(path) && !/\.test\.[cm]?[jt]sx?$/.test(path),
    checklist: [
      "Run the seeded iOS flows. Preserve sign-in, pending uploads, drafts, saved edits, and deletion across restarts.",
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
    matches: under(
      ".maestro/",
      ".github/workflows/e2e.yml",
      "tools/e2e/",
      "tools/select-e2e.mts",
      "tools/change-areas.mts",
    ),
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

export function requiresNativeFlows(
  paths: string[],
  labelled = false,
): boolean {
  return (
    labelled ||
    areas.some(
      (area) =>
        ["native", "e2e", "durable", "releases"].includes(area.name) &&
        paths.some(area.matches),
    )
  );
}
