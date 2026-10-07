import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalAction,
  internalQuery,
  type QueryCtx,
} from "./_generated/server";
import {
  classificationInputs,
  normalizeAlias,
  printedName,
  receiptDataValidator,
  type ReceiptData,
} from "../src/lib/domain/receipt";
import { classificationEvidenceValidator } from "../src/lib/domain/classification";
import { isDecidedCategory } from "../src/lib/domain/categories";
import { applyClassifications } from "../src/lib/domain/receipt-review";
import {
  readingScoreValidator,
  readingSummaryValidator,
  scoreReading,
  type ReadingScore,
  type ReadingSummary,
} from "../src/lib/domain/reading-evaluation";
import { summarizeReadings } from "../src/lib/domain/reading-summary";
import { reasoningValidator } from "./providerConfig";

/*
 * Reading quality against what people approved. A reviewed receipt keeps the
 * reader's lines and ids, so the approved receipt is the expected answer for
 * its own images. Run on a deployment with `npx convex run`; see `npm run eval`.
 */

const missValidator = v.object({
  receiptId: v.id("receipts"),
  store: v.union(v.string(), v.null()),
  readTotalOre: v.union(v.number(), v.null()),
  approvedTotalOre: v.union(v.number(), v.null()),
});

type Miss = Infer<typeof missValidator>;

const replayResultValidator = v.object({
  receiptId: v.id("receipts"),
  score: v.union(readingScoreValidator, v.null()),
  error: v.optional(v.string()),
});

type ReplayResult = Infer<typeof replayResultValidator>;

type ApprovedReceipt = Doc<"receipts"> & { data: ReceiptData };

/** Receipts a person approved; automatic approvals say nothing about the reader. */
function approvedByPerson(
  receipt: Doc<"receipts">,
): receipt is ApprovedReceipt {
  return (
    receipt.status === "reviewed" &&
    !receipt.excluded &&
    !receipt.autoAccepted &&
    receipt.data !== null
  );
}

async function storedReading(ctx: QueryCtx, receipt: Doc<"receipts">) {
  const extraction = await ctx.db
    .query("extractions")
    .withIndex("by_receiptId_and_generation", (q) =>
      q.eq("receiptId", receipt._id).eq("generation", receipt.generation),
    )
    .first();

  return extraction ? (extraction.classifiedData ?? extraction.data) : null;
}

function miss(receipt: ApprovedReceipt, reading: ReceiptData): Miss {
  return {
    receiptId: receipt._id,
    store: receipt.data.store,
    readTotalOre: reading.totalOre,
    approvedTotalOre: receipt.data.totalOre,
  };
}

const scorePageValidator = v.object({
  scores: v.array(readingScoreValidator),
  misses: v.array(missValidator),
  cursor: v.string(),
  isDone: v.boolean(),
});

/**
 * Stored readings scored against their approved receipts, up to `budget`
 * of them. A page that reaches the budget stops at that receipt and returns
 * the cursor of the page, so scores and misses describe the same receipts.
 */
export const scorePage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()), budget: v.number() },
  returns: scorePageValidator,
  handler: async (ctx, args) => {
    const page = await ctx.db.query("receipts").order("desc").paginate({
      cursor: args.cursor,
      numItems: 25,
      maximumRowsRead: 25,
      maximumBytesRead: 2_000_000,
    });

    const scores: ReadingScore[] = [];
    const misses: Miss[] = [];

    for (const receipt of page.page) {
      if (scores.length >= args.budget) break;

      if (!approvedByPerson(receipt)) continue;
      const reading = await storedReading(ctx, receipt);

      if (!reading) continue;
      const score = scoreReading(reading, receipt.data);
      scores.push(score);

      if (score.totalCorrect === false) misses.push(miss(receipt, reading));
    }

    return {
      scores,
      misses,
      cursor: page.continueCursor,
      isDone: page.isDone,
    };
  },
});

/**
 * How the readings people saw compare with what they approved, newest first.
 * No model calls. The stored readings include household memory, so this is
 * the quality people experienced, not the model's alone.
 */
export const scorecard = internalAction({
  args: { maxReceipts: v.optional(v.number()) },
  returns: v.object({
    summary: readingSummaryValidator,
    totalMisses: v.array(missValidator),
    complete: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    summary: ReadingSummary;
    totalMisses: Miss[];
    complete: boolean;
  }> => {
    const limit = args.maxReceipts ?? 500;
    const scores: ReadingScore[] = [];
    const misses: Miss[] = [];
    let cursor: string | null = null;
    let complete = false;

    while (scores.length < limit) {
      const page: Infer<typeof scorePageValidator> = await ctx.runQuery(
        internal.readingEvaluation.scorePage,
        { cursor, budget: limit - scores.length },
      );

      scores.push(...page.scores);
      misses.push(...page.misses);
      cursor = page.cursor;

      if (page.isDone) {
        complete = scores.length < limit;
        break;
      }
    }

    return {
      summary: summarizeReadings(scores),
      totalMisses: misses,
      complete,
    };
  },
});

/** The images and approved receipt a replay needs. */
export const replayCase = internalQuery({
  args: { id: v.id("receipts") },
  returns: v.union(
    v.object({
      storageIds: v.array(v.id("_storage")),
      approved: receiptDataValidator,
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get("receipts", args.id);

    if (!receipt || !approvedByPerson(receipt)) return null;

    const images = await ctx.db
      .query("images")
      .withIndex("by_receiptId", (q) => q.eq("receiptId", args.id))
      .take(8);

    if (!images.length) return null;
    images.sort((a, b) => a.position - b.position);

    return {
      storageIds: images.map((image) => image.storageId),
      approved: receipt.data,
    };
  },
});

/** The newest receipts a person approved among the latest 500, as a replay sample. */
export const recentApproved = internalQuery({
  args: { count: v.number() },
  returns: v.array(v.id("receipts")),
  handler: async (ctx, args) => {
    // Bounded: a sample, not every approved receipt.
    const recent = await ctx.db.query("receipts").order("desc").take(500);

    return recent
      .filter(approvedByPerson)
      .slice(0, Math.min(args.count, 50))
      .map((receipt) => receipt._id);
  },
});

/**
 * Read one approved receipt again with this deployment's reader and
 * classifier, without household memory, and score it. One receipt per call
 * keeps each reading within the action time limit; `npm run eval` loops.
 * Each call costs one reading and one classification call.
 */
export const replayOne = internalAction({
  args: {
    receiptId: v.id("receipts"),
    /** Read with this `provider:model` instead of the production reader. */
    model: v.optional(v.string()),
    reasoning: v.optional(reasoningValidator),
  },
  returns: replayResultValidator,
  handler: async (
    ctx,
    { receiptId, model, reasoning },
  ): Promise<ReplayResult> => {
    const replayCase: {
      storageIds: Id<"_storage">[];
      approved: Infer<typeof receiptDataValidator>;
    } | null = await ctx.runQuery(internal.readingEvaluation.replayCase, {
      id: receiptId,
    });

    if (!replayCase) return { receiptId, score: null, error: "not replayable" };

    try {
      const { data } = await ctx.runAction(internal.providers.extract, {
        storageIds: replayCase.storageIds,
        ...(model && { model }),
        ...(reasoning && { reasoning }),
      });

      const classification = await ctx.runAction(internal.providers.classify, {
        products: classificationInputs(data),
      });

      applyClassifications(data, classification.classifications);

      return { receiptId, score: scoreReading(data, replayCase.approved) };
    } catch (error) {
      return {
        receiptId,
        score: null,
        error: error instanceof Error ? error.message : "replay failed",
      };
    }
  },
});

/**
 * Product lines whose category a person approved, one per printed name, with
 * the evidence the classifier saw when the receipt was read. `read` is the
 * category people were shown, so a mismatch marks a line someone corrected.
 */
export const labeledCategories = internalQuery({
  args: { count: v.number() },
  returns: v.array(
    v.object({
      evidence: classificationEvidenceValidator,
      expected: v.string(),
      read: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    // Bounded: a sample of recent receipts, each with one stored reading.
    const recent = await ctx.db.query("receipts").order("desc").take(50);
    const seen = new Set<string>();
    const cases = [];

    for (const receipt of recent) {
      if (!approvedByPerson(receipt)) continue;
      const reading = await storedReading(ctx, receipt);

      if (!reading) continue;

      // Remembered lines skipped the model, but their evidence still tests it.
      const evidence = new Map(
        classificationInputs({
          ...reading,
          lines: reading.lines.map((line) => ({
            ...line,
            categoryAliasKey: null,
            productKey: null,
          })),
        }).map((input) => [input.id, input.evidence]),
      );

      const read = new Map(reading.lines.map((line) => [line.id, line]));

      for (const line of receipt.data.lines) {
        const original = read.get(line.id);
        const input = evidence.get(line.id);

        if (
          line.kind !== "product" ||
          !isDecidedCategory(line.categoryId) ||
          !original ||
          !input
        )
          continue;
        const key = normalizeAlias(printedName(original));

        if (seen.has(key)) continue;
        seen.add(key);
        cases.push({
          evidence: input,
          expected: line.categoryId,
          read: original.categoryId,
        });
      }
    }

    return cases.slice(0, Math.min(args.count, 200));
  },
});
