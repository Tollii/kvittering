/** Explicit release operations. Building or publishing never deploys a backend. */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { parseArgs, parseEnv } from "node:util";
import { maxReceiptImages } from "../src/lib/domain/receipt-images.ts";
import {
  requireDeploymentKey,
  requireReadModel,
  requireRecoveryClient,
  requireReleaseStage,
  stagingDeployment,
} from "./release-policy.mts";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { stage: { type: "string" } },
});

const [operation] = positionals;

if (
  positionals.length !== 1 ||
  !["backend", "client"].includes(operation ?? "")
) {
  throw new Error(
    "Use release.mts backend --stage additive|enforcement, or release.mts client.",
  );
}

if (operation === "client" && values.stage)
  throw new Error("Client checks do not accept a backend stage.");

if (operation === "backend") {
  requireReleaseStage(values.stage, maxReceiptImages);

  if (values.stage === "enforcement") {
    requireRecoveryClient(readFileSync("releases/staging.json", "utf8"));
  }
}

const fileEnvironment = existsSync(".env.staging.local")
  ? parseEnv(readFileSync(".env.staging.local", "utf8"))
  : {};

const key = process.env.CONVEX_DEPLOY_KEY ?? fileEnvironment.CONVEX_DEPLOY_KEY;

requireDeploymentKey(key);

if (
  process.env.CONVEX_DEPLOY_KEY &&
  fileEnvironment.CONVEX_DEPLOY_KEY &&
  process.env.CONVEX_DEPLOY_KEY !== fileEnvironment.CONVEX_DEPLOY_KEY
) {
  throw new Error(
    "The environment and staging file contain different deploy keys. Select one credential source.",
  );
}

for (const name of [
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
]) {
  if (process.env[name] || fileEnvironment[name])
    throw new Error(`Remove conflicting ${name} before a staging operation.`);
}

// Git and the installed Convex CLI are fixed commands; caller data is never shell code.
const git = (args: string[]) =>
  execFileSync("/usr/bin/git", args, { encoding: "utf8" }).trim();

if (git(["status", "--porcelain"]))
  throw new Error(
    "Release from a clean, committed worktree so the checked revision is the released revision.",
  );

console.log(
  `Checking ${operation} at ${git(["rev-parse", "HEAD"])} on ${stagingDeployment}.`,
);

// The installed CLI gives a deployment-specific key precedence over .env.local.
// Keep it in the child environment, never in arguments or temporary files.
const convex = (args: string[]) =>
  execFileSync(process.execPath, ["node_modules/convex/bin/main.js", ...args], {
    encoding: "utf8",
    env: { ...process.env, CONVEX_DEPLOY_KEY: key },
  });

if (operation === "client" || values.stage === "enforcement") {
  const ready = convex([
    "run",
    "--deployment",
    stagingDeployment,
    "--inline-query",
    'return (await ctx.db.query("receiptReadModel").withIndex("by_name", q => q.eq("name", "receipts-v1")).unique())?.ready === true;',
  ]);

  requireReadModel(ready);
}

if (operation === "backend") console.log(convex(["deploy", "--yes"]));
else console.log("Staging read model is ready. No backend was deployed.");
