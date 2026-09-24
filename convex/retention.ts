import { v } from "convex/values";
import { cleanup, vWorkflowId } from "@convex-dev/workflow";
import { vResultValidator } from "@convex-dev/workpool";
import { internalMutation } from "./serverFunctions";
import { components, internal } from "./_generated/api";

const thirtyDays = 30 * 24 * 60 * 60_000;

/** Keep successful journals for diagnostics, then use the component's bounded cleanup. */
export const workflowCompleted = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.null(),
  },
  returns: v.null(),
  handler: async (ctx, { workflowId, result }) => {
    if (result.kind === "success")
      await ctx.scheduler.runAfter(
        thirtyDays,
        internal.retention.workflowJournal,
        { workflowId },
      );

    return null;
  },
});

export const workflowJournal = internalMutation({
  args: { workflowId: vWorkflowId },
  returns: v.null(),
  handler: async (ctx, { workflowId }) => {
    await cleanup(ctx, components.workflow, workflowId);

    return null;
  },
});

/** Expired terminal cache entries have no business history; active waiters retain their result. */
export const catalog = internalMutation({
  args: {
    state: v.union(v.literal("ready"), v.literal("error")),
    cursor: v.string().optional(),
    before: v.number().optional(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const before = args.before ?? Date.now() - thirtyDays;

    const page = await ctx.db
      .query("catalogRequests")
      .withIndex("by_state_and_expiresAt", (q) =>
        q.eq("state", args.state).lt("expiresAt", before),
      )
      .paginate({ cursor: args.cursor ?? null, numItems: 50 });

    let removed = 0;

    for (const row of page.page) {
      const waiter = await ctx.db
        .query("catalogRequestWaiters")
        .withIndex("by_requestId", (q) => q.eq("requestId", row._id))
        .first();

      if (!waiter) {
        await ctx.db.delete("catalogRequests", row._id);
        removed++;
      }
    }

    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.retention.catalog, {
        state: args.state,
        before,
        cursor: page.continueCursor,
      });

    return removed;
  },
});

/** Remove retained copies without reading a household's complete history. */
export const deletedReceiptBatches = internalMutation({
  args: {
    householdId: v.id("households"),
    receiptId: v.id("receipts"),
    cursor: v.string().optional(),
    through: v.number().optional(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await ctx.db.get("receipts", args.receiptId)) return null;
    const through = args.through ?? Date.now();

    const page = await ctx.db
      .query("correctionBatches")
      .withIndex("by_householdId", (q) =>
        q.eq("householdId", args.householdId).lte("_creationTime", through),
      )
      .paginate({ cursor: args.cursor ?? null, numItems: 1 });

    for (const batch of page.page) {
      const changes = batch.changes.filter(
        (change) => change.receiptId !== args.receiptId,
      );

      if (changes.length === batch.changes.length) continue;

      if (changes.length)
        await ctx.db.patch("correctionBatches", batch._id, { changes });
      else await ctx.db.delete("correctionBatches", batch._id);
    }

    if (!page.isDone)
      await ctx.scheduler.runAfter(
        0,
        internal.retention.deletedReceiptBatches,
        {
          ...args,
          through,
          cursor: page.continueCursor,
        },
      );

    return null;
  },
});

/** Operator repair for copies left by older deletion code. The creation bound is stable. */
export const orphanedCorrectionBatches = internalMutation({
  args: { cursor: v.string().optional(), through: v.number().optional() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const through = args.through ?? Date.now();

    const page = await ctx.db
      .query("correctionBatches")
      .withIndex("by_creation_time", (q) => q.lte("_creationTime", through))
      .paginate({ cursor: args.cursor ?? null, numItems: 1 });

    for (const batch of page.page)
      for (const change of batch.changes)
        await ctx.scheduler.runAfter(0, internal.retention.orphanedCorrection, {
          batchId: batch._id,
          receiptId: change.receiptId,
        });

    if (!page.isDone)
      await ctx.scheduler.runAfter(
        0,
        internal.retention.orphanedCorrectionBatches,
        {
          through,
          cursor: page.continueCursor,
        },
      );

    return null;
  },
});

/** Each repair reads one batch and at most one full receipt. */
export const orphanedCorrection = internalMutation({
  args: { batchId: v.id("correctionBatches"), receiptId: v.id("receipts") },
  returns: v.null(),
  handler: async (ctx, { batchId, receiptId }) => {
    if (await ctx.db.get("receipts", receiptId)) return null;
    const batch = await ctx.db.get("correctionBatches", batchId);

    if (!batch) return null;

    const changes = batch.changes.filter(
      (change) => change.receiptId !== receiptId,
    );

    if (changes.length === batch.changes.length) return null;

    if (changes.length)
      await ctx.db.patch("correctionBatches", batchId, { changes });
    else await ctx.db.delete("correctionBatches", batchId);

    return null;
  },
});
