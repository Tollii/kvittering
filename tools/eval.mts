/**
 * Reading and categorization quality on one Convex deployment.
 *
 *   npm run eval                          scorecard of stored readings (no model calls)
 *   npm run eval -- --replay 10           also re-read the 10 newest approved receipts
 *   npm run eval -- --replay-ids ids.json also re-read a fixed golden set of receipt ids
 *   npm run eval -- --fixed               also run the fixed product family and catalog cases
 *   npm run eval -- --save base.json      store the result as a baseline
 *   npm run eval -- --baseline base.json  fail when a rate drops more than --margin points
 *
 * The deployment comes from the Convex CLI's usual selection (.env.local,
 * CONVEX_DEPLOY_KEY); pass `--deployment <name>` to choose another one.
 * Receipt images and ids stay in the deployment and local files; never commit
 * a golden set, because receipts are household data and the repo is public.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { z } from "zod";

const { values } = parseArgs({
  options: {
    replay: { type: "string" },
    "replay-ids": { type: "string" },
    save: { type: "string" },
    baseline: { type: "string" },
    margin: { type: "string", default: "2" },
    deployment: { type: "string" },
    fixed: { type: "boolean", default: false },
  },
});

const count = z.number();

const summarySchema = z.object({
  receipts: count,
  totalsChecked: count,
  totalsCorrect: count,
  balanced: count,
  products: count,
  amountsCorrect: count,
  namesKept: count,
  categorized: count,
  categoriesCorrect: count,
  categoriesUnclear: count,
  flaggedLines: count,
});

type Summary = z.infer<typeof summarySchema>;

const scorecardSchema = z.object({
  summary: summarySchema,
  totalMisses: z.array(
    z.object({
      receiptId: z.string(),
      store: z.string().nullable(),
      readTotalOre: z.number().nullable(),
      approvedTotalOre: z.number().nullable(),
    }),
  ),
  complete: z.boolean(),
});

const scoreSchema = z.object({
  totalCorrect: z.boolean().nullable(),
  balanced: z.boolean(),
  products: count,
  amountsCorrect: count,
  namesKept: count,
  categorized: count,
  categoriesCorrect: count,
  categoriesUnclear: count,
  flaggedLines: count,
});

const replayResultSchema = z.object({
  receiptId: z.string(),
  score: scoreSchema.nullable(),
  error: z.string().optional(),
});

const ratesSchema = z.record(z.string(), z.number());

const resultsSchema = z.record(z.string(), ratesSchema);

type FunctionArgs =
  | Record<string, never>
  | { count: number }
  | { receiptId: string }
  | { scores: z.infer<typeof scoreSchema>[] };

const deployment = values.deployment ? ["--deployment", values.deployment] : [];

function run<T>(fn: string, schema: z.ZodType<T>, args: FunctionArgs = {}): T {
  const output = execFileSync(
    process.execPath,
    [
      "node_modules/convex/bin/main.js",
      "run",
      ...deployment,
      fn,
      JSON.stringify(args),
    ],
    { encoding: "utf8", maxBuffer: 20_000_000 },
  );

  return schema.parse(JSON.parse(output));
}

const percent = (part: number, whole: number) =>
  whole ? Math.round((1000 * part) / whole) / 10 : 0;

/** Higher is better for every rate, so one margin rule covers them all. */
function rates(summary: Summary) {
  return {
    "paid total read correctly": percent(
      summary.totalsCorrect,
      summary.totalsChecked,
    ),
    "lines balance without help": percent(summary.balanced, summary.receipts),
    "line amounts correct": percent(summary.amountsCorrect, summary.products),
    "names kept by people": percent(summary.namesKept, summary.products),
    "categories correct": percent(
      summary.categoriesCorrect,
      summary.categorized,
    ),
    "lines with a clear category":
      100 - percent(summary.categoriesUnclear, summary.products),
  } satisfies z.infer<typeof ratesSchema>;
}

function printRates(rates: z.infer<typeof ratesSchema>) {
  for (const [name, value] of Object.entries(rates))
    console.log(`  ${name.padEnd(30)} ${value.toFixed(1).padStart(5)} %`);
}

function print(title: string, summary: Summary) {
  console.log(
    `\n${title}: ${summary.receipts} receipts, ${summary.products} product lines`,
  );
  printRates(rates(summary));
}

const results: z.infer<typeof resultsSchema> = {};

const scorecard = run("readingEvaluation:scorecard", scorecardSchema);

print(
  `Stored readings${scorecard.complete ? "" : " (newest 500)"}`,
  scorecard.summary,
);

results.stored = rates(scorecard.summary);

for (const miss of scorecard.totalMisses)
  console.log(
    `  total misread: ${miss.receiptId} ${miss.store ?? "?"} read ${miss.readTotalOre} approved ${miss.approvedTotalOre}`,
  );

const receiptIds = values["replay-ids"]
  ? z
      .array(z.string())
      .parse(JSON.parse(readFileSync(values["replay-ids"], "utf8")))
  : undefined;

if (receiptIds || values.replay) {
  const ids =
    receiptIds ??
    run("readingEvaluation:recentApproved", z.array(z.string()), {
      count: Number(values.replay),
    });

  const replayed = ids.map((receiptId, index) => {
    console.error(`replaying ${index + 1}/${ids.length} ${receiptId}`);

    return run("readingEvaluation:replayOne", replayResultSchema, {
      receiptId,
    });
  });

  const scores = replayed.flatMap((result) =>
    result.score ? [result.score] : [],
  );

  const summary = run("readingEvaluation:summarize", summarySchema, {
    scores,
  });

  print("Replayed with this deployment's reader", summary);
  results.replay = rates(summary);

  for (const result of replayed.filter((result) => result.error))
    console.log(`  not scored: ${result.receiptId} ${result.error}`);

  console.log(`  replayed ids: ${JSON.stringify(ids)}`);
}

if (values.fixed) {
  const families = run(
    "productAnalysisEvaluation:evaluate",
    z.array(z.object({ expected: z.string(), choice: z.string() })),
  );

  const catalog = run(
    "catalogMatchingEvaluation:evaluate",
    z.array(z.object({ passed: z.boolean() })),
  );

  results.fixed = {
    "product families correct": percent(
      families.filter((result) => result.choice === result.expected).length,
      families.length,
    ),
    "catalog matches correct": percent(
      catalog.filter((result) => result.passed).length,
      catalog.length,
    ),
  };
  console.log("\nFixed cases");
  printRates(results.fixed);
}

if (values.save) writeFileSync(values.save, JSON.stringify(results, null, 2));

if (values.baseline) {
  const baseline = resultsSchema.parse(
    JSON.parse(readFileSync(values.baseline, "utf8")),
  );

  const margin = Number(values.margin);
  const drops: string[] = [];

  for (const [run, current] of Object.entries(results))
    for (const [name, value] of Object.entries(current)) {
      const before = baseline[run]?.[name];

      if (before !== undefined && value < before - margin)
        drops.push(`${run} ${name}: ${before} → ${value}`);
    }

  if (drops.length) {
    console.error(`\nDropped more than ${margin} points:\n${drops.join("\n")}`);
    process.exit(1);
  }

  console.log(`\nNo rate dropped more than ${margin} points.`);
}
