import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { z } from "zod";
import { loadFixture, resolveTables } from "./fixtures.mts";

const site = "http://127.0.0.1:3211";

const output = resolve(process.argv[3] ?? "build/e2e/seed");

mkdirSync(output, { recursive: true });

// This command clears the entire deployment, including components. Restrict
// both the auth request and CLI selection to a disposable backend on this
// machine: the self-hosted backend of tools/visual/backend.sh when
// VISUAL_ENV_FILE names its CLI environment file, otherwise this worktree's
// anonymous backend.
function selectEnvFile() {
  const visual = process.env.VISUAL_ENV_FILE;

  if (visual) {
    z.literal("http://127.0.0.1:3210").parse(
      parseEnv(readFileSync(visual, "utf8")).CONVEX_SELF_HOSTED_URL,
    );

    return resolve(visual);
  }

  const local = parseEnv(readFileSync(".env.local", "utf8"));

  const deployment = z
    .string()
    .regex(/^anonymous:[a-zA-Z0-9_-]+$/)
    .parse(local.CONVEX_DEPLOYMENT);

  z.literal(site).parse(local.EXPO_PUBLIC_CONVEX_SITE_URL);

  z.literal("http://127.0.0.1:3210").parse(local.EXPO_PUBLIC_CONVEX_URL);

  const file = resolve(output, "deployment.env");

  writeFileSync(file, `CONVEX_DEPLOYMENT=${deployment}\n`);

  return file;
}

const envFile = selectEnvFile();

const environment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith("CONVEX_")),
);

const fixture = process.argv[2] ? loadFixture(process.argv[2]) : undefined;

function convex(args: string[]) {
  return execFileSync(
    process.execPath,
    ["node_modules/convex/bin/main.js", ...args, "--env-file", envFile],
    {
      encoding: "utf8",
      env: environment,
      stdio: ["ignore", "pipe", "inherit"],
    },
  );
}

function importTable(
  table: string,
  rows: ReturnType<typeof resolveTables>[string],
  mode = "--replace",
) {
  const file = resolve(output, `${table}.json`);
  writeFileSync(file, JSON.stringify(rows));
  convex(["import", "--yes", mode, "--table", table, file]);
}

importTable("households", [], "--replace-all");

// Local test accounts use email. Disable paid integrations in every fixture.
importTable(
  "featureFlags",
  ["ios", "android"].map((platform) => ({
    platform,
    channel: "development",
    revision: 1,
    values: {
      emailSignUp: true,
      receiptProcessing: true,
      productLookup: false,
      automaticProductMatching: false,
      spendingAnalysis: false,
    },
  })),
);

if (fixture) {
  if (!fixture.account)
    throw new Error("A seeded flow needs one fixture account.");

  const response = await fetch(`${site}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "expo-origin": "kvitto://" },
    body: JSON.stringify(fixture.account),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok)
    throw new Error(
      `Fixture sign-up failed (${response.status}): ${await response.text()}`,
    );

  const { user } = z
    .object({ user: z.object({ id: z.string().min(1) }) })
    .parse(await response.json());

  const households = fixture.tables.households;

  if (households?.length !== 1)
    throw new Error("A seeded flow needs exactly one household.");
  importTable("households", households);

  const [household] = z
    .array(z.object({ _id: z.string() }))
    .length(1)
    .parse(JSON.parse(convex(["data", "households", "--format", "json"])));

  if (!household) throw new Error("The fixture household was not imported.");

  const tables = resolveTables(fixture.tables, {
    userId: user.id,
    issuer: site,
    householdId: household._id,
  });

  for (const [table, rows] of Object.entries(tables)) {
    if (table !== "households") importTable(table, rows);
  }

  writeFileSync(
    resolve(output, "account.json"),
    JSON.stringify(fixture.account),
  );
}

// Direct fixture imports bypass the receipt write triggers. Advance the resumable
// backfill until its read model is ready, with a bound on fixture work.
function prepareReceiptReadModel() {
  for (let page = 0; page < 100; page += 1) {
    const state = z
      .object({ ready: z.boolean() })
      .parse(JSON.parse(convex(["run", "receiptSync:backfill", "{}"])));

    if (state.ready) return;
  }

  throw new Error("The fixture read model did not finish within 100 pages.");
}

prepareReceiptReadModel();
