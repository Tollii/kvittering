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
  receiptDataValidator,
} from "../src/lib/domain/receipt";
import {
  applyClassifications,
  scoreReading,
  summarizeReadings,
  type ReadingScore,
} from "../src/lib/domain/reading-evaluation";

/*
 * Reading quality against what people approved. A reviewed receipt keeps the
 * reader's lines and ids, so the approved receipt is the expected answer for
 * its own images. Run on a deployment with `npx convex run`; see `npm run eval`.
 */

const scoreValidator = v.object({
  totalCorrect: v.union(v.boolean(), v.null()),
  balanced: v.boolean(),
  products: v.number(),
  amountsCorrect: v.number(),
  namesKept: v.number(),
  categorized: v.number(),
  categoriesCorrect: v.number(),
  categoriesUnclear: v.number(),
  flaggedLines: v.number(),
});

const summaryValidator = v.object({
  receipts: v.number(),
  totalsChecked: v.number(),
  totalsCorrect: v.number(),
  balanced: v.number(),
  products: v.number(),
  amountsCorrect: v.number(),
  namesKept: v.number(),
  categorized: v.number(),
  categoriesCorrect: v.number(),
  categoriesUnclear: v.number(),
  flaggedLines: v.number(),
});

const missValidator = v.object({
  receiptId: v.id("receipts"),
  store: v.union(v.string(), v.null()),
  readTotalOre: v.union(v.number(), v.null()),
  approvedTotalOre: v.union(v.number(), v.null()),
});

type Miss = Infer<typeof missValidator>;

type Summary = Infer<typeof summaryValidator>;

const replayResultValidator = v.object({
  receiptId: v.id("receipts"),
  score: v.union(scoreValidator, v.null()),
  error: v.optional(v.string()),
});

type ReplayResult = Infer<typeof replayResultValidator>;

/** Receipts a person approved; automatic approvals say nothing about the reader. */
function approvedByPerson(receipt: Doc<"receipts">) {
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

function miss(
  receiptId: Id<"receipts">,
  reading: Doc<"receipts">["data"],
  approved: NonNullable<Doc<"receipts">["data"]>,
): Miss {
  return {
    receiptId,
    store: approved.store,
    readTotalOre: reading?.totalOre ?? null,
    approvedTotalOre: approved.totalOre,
  };
}

/** One page of stored readings scored against their approved receipts. */
export const scorePage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({
    scores: v.array(scoreValidator),
    misses: v.array(missValidator),
    cursor: v.string(),
    isDone: v.boolean(),
  }),
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
      if (!approvedByPerson(receipt) || !receipt.data) continue;
      const reading = await storedReading(ctx, receipt);

      if (!reading) continue;
      const score = scoreReading(reading, receipt.data);
      scores.push(score);

      if (score.totalCorrect === false)
        misses.push(miss(receipt._id, reading, receipt.data));
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
    summary: summaryValidator,
    totalMisses: v.array(missValidator),
    complete: v.boolean(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ summary: Summary; totalMisses: Miss[]; complete: boolean }> => {
    const limit = args.maxReceipts ?? 500;
    const scores: ReadingScore[] = [];
    const misses: Miss[] = [];
    let cursor: string | null = null;
    let complete = false;

    while (scores.length < limit) {
      const page: {
        scores: ReadingScore[];
        misses: Miss[];
        cursor: string;
        isDone: boolean;
      } = await ctx.runQuery(internal.readingEvaluation.scorePage, { cursor });

      scores.push(...page.scores);
      misses.push(...page.misses);
      cursor = page.cursor;

      if (page.isDone) {
        complete = true;
        break;
      }
    }

    return {
      summary: summarizeReadings(scores.slice(0, limit)),
      totalMisses: misses.slice(0, 20),
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

    if (!receipt?.data || !approvedByPerson(receipt)) return null;

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
  args: { receiptId: v.id("receipts") },
  returns: replayResultValidator,
  handler: async (ctx, { receiptId }): Promise<ReplayResult> => {
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

/** Add up replayed scores the same way the scorecard does. */
export const summarize = internalQuery({
  args: { scores: v.array(scoreValidator) },
  returns: summaryValidator,
  handler: (_ctx, { scores }): Summary => summarizeReadings(scores),
});
