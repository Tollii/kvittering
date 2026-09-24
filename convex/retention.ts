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
