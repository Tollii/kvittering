import { z } from "zod";
import { v } from "convex/values";
import {
  cancel,
  cleanup,
  vWorkflowId,
  type WorkflowId,
} from "@convex-dev/workflow";
import { vResultValidator } from "@convex-dev/workpool";
import { internalMutation } from "./serverFunctions";
import { components, internal } from "./_generated/api";

import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const workflowComponent = v.union(
  v.literal("processing"),
  v.literal("analysis"),
);

type WorkflowComponent = "processing" | "analysis";

function componentFor(component: WorkflowComponent) {
  return component === "analysis"
    ? components.productAnalysisWorkflow
    : components.workflow;
}

/** Persist only identifiers needed for cleanup; never copy receipt content here. */
export async function trackWorkflow(
  ctx: MutationCtx,
  workflowId: WorkflowId,
  component: WorkflowComponent,
  receiptId?: Id<"receipts">,
) {
  const existing = await ctx.db
    .query("workflowJournals")
    .withIndex("by_component_and_workflowId", (q) =>
      q.eq("component", component).eq("workflowId", workflowId),
    )
    .unique();

  if (existing) return existing._id;

  return ctx.db.insert("workflowJournals", {
    workflowId,
    component,
    receiptId,
  });
}

const thirtyDays = 30 * 24 * 60 * 60_000;

/** All terminal results have the same diagnostic retention period. Null is the legacy context. */
export const workflowCompleted = internalMutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.union(
      v.null(),
      v.object({ component: workflowComponent, receiptId: v.id("receipts") }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { workflowId, context }) => {
    // The daily inventory registers legacy journals without one scan per callback.
    if (!context) return null;

    const id = await trackWorkflow(
      ctx,
      workflowId,
      context.component,
      context.receiptId,
    );

    const receipt = await ctx.db.get("receipts", context.receiptId);
    const delay = receipt ? thirtyDays : 0;
    await ctx.db.patch("workflowJournals", id, {
      expiresAt: Date.now() + delay,
    });
    await ctx.scheduler.runAfter(delay, internal.retention.workflowJournal, {
      workflowId,
      component: context.component,
    });

    return null;
  },
});

/** Old scheduled arguments remain valid and are resolved through the component inventory. */
export const workflowJournal = internalMutation({
  args: { workflowId: vWorkflowId, component: workflowComponent.optional() },
  returns: v.null(),
  handler: async (ctx, { workflowId, component }) => {
    // The daily inventory resolves legacy jobs without duplicating component scans.
    if (!component) return null;

    const record = await ctx.db
      .query("workflowJournals")
      .withIndex("by_component_and_workflowId", (q) =>
        q.eq("component", component).eq("workflowId", workflowId),
      )
      .unique();

    if (
      !record ||
      record.expiresAt === undefined ||
      record.expiresAt > Date.now()
    )
      return null;

    if (await cleanup(ctx, componentFor(component), workflowId))
      await ctx.db.delete("workflowJournals", record._id);

    return null;
  },
});

/** Daily inventory also covers journals created before cleanup identifiers were recorded. */
export const inventoryWorkflows = internalMutation({
  args: { component: workflowComponent, cursor: v.string().optional() },
  returns: v.null(),
  handler: async (ctx, { component, cursor }) => {
    const owner = componentFor(component);

    // Descending traversal excludes new runs added after the first page.
    const page = await ctx.runQuery(owner.workflow.list, {
      order: "desc",
      paginationOpts: {
        cursor: cursor ?? null,
        numItems: 5,
        maximumBytesRead: 500_000,
      },
    });

    for (const workflow of page.page) {
      const args = z.object({ id: z.string() }).safeParse(workflow.args);

      const receiptId = args.success
        ? ctx.db.normalizeId("receipts", args.data.id)
        : null;

      // SAFETY: The component API returns validated workflow IDs but erases the SDK brand.
      const workflowId = workflow.workflowId as WorkflowId;

      const id = await trackWorkflow(
        ctx,
        workflowId,
        component,
        receiptId ?? undefined,
      );

      const record = await ctx.db.get("workflowJournals", id);

      if (!record) throw new Error("Workflow journal was not created.");

      const deleted =
        receiptId !== null && !(await ctx.db.get("receipts", receiptId));

      if (deleted && !workflow.runResult) await cancel(ctx, owner, workflowId);

      if (workflow.runResult || deleted) {
        // Legacy journals get a full grace period from first observation, not creation.
        const expiresAt = deleted
          ? Date.now()
          : (record.expiresAt ?? Date.now() + thirtyDays);

        await ctx.db.patch("workflowJournals", id, { expiresAt });

        if (record.expiresAt === undefined || expiresAt <= Date.now())
          await ctx.scheduler.runAfter(
            Math.max(0, expiresAt - Date.now()),
            internal.retention.workflowJournal,
            { workflowId: workflowId, component },
          );
      }
    }

    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.retention.inventoryWorkflows, {
        component,
        cursor: page.continueCursor,
      });

    return null;
  },
});

/** Cancel deleted receipts in small pages; terminal callbacks remove their journals. */
export const deletedReceiptWorkflows = internalMutation({
  args: { receiptId: v.id("receipts"), cursor: v.string().optional() },
  returns: v.null(),
  handler: async (ctx, { receiptId, cursor }) => {
    if (await ctx.db.get("receipts", receiptId)) return null;

    const page = await ctx.db
      .query("workflowJournals")
      .withIndex("by_receiptId", (q) => q.eq("receiptId", receiptId))
      .paginate({ cursor: cursor ?? null, numItems: 5 });

    for (const record of page.page) {
      const owner = componentFor(record.component);

      const status = await ctx.runQuery(owner.workflow.getStatus, {
        workflowId: record.workflowId,
      });

      if (!status.workflow.runResult)
        await cancel(ctx, owner, record.workflowId);
      await ctx.db.patch("workflowJournals", record._id, {
        expiresAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.retention.workflowJournal, {
        workflowId: record.workflowId,
        component: record.component,
      });
    }

    if (!page.isDone)
      await ctx.scheduler.runAfter(
        0,
        internal.retention.deletedReceiptWorkflows,
        { receiptId, cursor: page.continueCursor },
      );

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

    const through =
      args.through ??
      (
        await ctx.db
          .query("correctionBatches")
          .withIndex("by_householdId", (q) =>
            q.eq("householdId", args.householdId),
          )
          .order("desc")
          .first()
      )?._creationTime ??
      Date.now();

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
    const through =
      args.through ??
      (await ctx.db.query("correctionBatches").order("desc").first())
        ?._creationTime ??
      Date.now();

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
