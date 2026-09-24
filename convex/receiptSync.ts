import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { internalMutation } from "./serverFunctions";
import { internal } from "./_generated/api";
import { requireMember } from "./access";
import schema from "./schema";
import { updateReceiptReadModel } from "./receiptReadModel";
import {
  spendingTotalsValidator,
  addSpendingTotals,
  emptySpendingTotals,
} from "../src/lib/domain/receipt-summary";

export const head = query({
  args: {},
  returns: v.object({ ready: v.boolean(), sequence: v.number() }),
  handler: async (ctx) => {
    const member = await requireMember(ctx);

    const state = await ctx.db
      .query("receiptReadModel")
      .withIndex("by_name", (q) => q.eq("name", "receipts-v1"))
      .unique();

    const head = await ctx.db
      .query("receiptSyncHeads")
      .withIndex("by_householdId", (q) =>
        q.eq("householdId", member.householdId),
      )
      .unique();

    return { ready: state?.ready ?? false, sequence: head?.sequence ?? 0 };
  },
});

/** A coalesced change stream: one current entry per receipt, including permanent deletion markers. */
export const changes = query({
  args: { after: v.number(), through: v.number() },
  returns: v.object({
    through: v.number(),
    done: v.boolean(),
    changes: v.array(
      v.object({
        id: v.id("receipts"),
        receipt: v.union(schema.doc("receipts"), v.null()),
      }),
    ),
  }),
  handler: async (ctx, { after, through }) => {
    const member = await requireMember(ctx);

    if (
      !Number.isSafeInteger(after) ||
      !Number.isSafeInteger(through) ||
      after < 0 ||
      through < after
    )
      throw new Error("Invalid synchronization cursor.");

    const state = await ctx.db
      .query("receiptReadModel")
      .withIndex("by_name", (q) => q.eq("name", "receipts-v1"))
      .unique();

    if (!state?.ready) throw new Error("Receipt synchronization is not ready.");

    const head = await ctx.db
      .query("receiptSyncHeads")
      .withIndex("by_householdId", (q) =>
        q.eq("householdId", member.householdId),
      )
      .unique();

    if (through > (head?.sequence ?? 0))
      throw new Error("Invalid synchronization boundary.");

    const rows = await ctx.db
      .query("receiptSummaries")
      .withIndex("by_householdId_and_sequence", (q) =>
        q
          .eq("householdId", member.householdId)
          .gt("sequence", after)
          .lte("sequence", through),
      )
      .take(20);

    const changes: { id: Id<"receipts">; receipt: Doc<"receipts"> | null }[] =
      [];

    let bytes = 0;
    let cursor = after;

    for (const row of rows) {
      const receipt = row.deleted
        ? null
        : await ctx.db.get("receipts", row.receiptId);

      changes.push({
        id: row.receiptId,
        receipt: receipt?.householdId === member.householdId ? receipt : null,
      });
      cursor = row.sequence;
      // Three bytes per UTF-16 code unit is a conservative UTF-8 upper bound.
      bytes += JSON.stringify(receipt).length * 3;

      if (bytes >= 4 * 1024 * 1024) break;
    }

    const done = changes.length === rows.length && rows.length < 20;

    return { through: done ? through : cursor, done, changes };
  },
});

export const month = query({
  args: { month: v.string(), through: v.string().optional() },
  returns: v.union(v.null(), spendingTotalsValidator),
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month))
      throw new Error("Invalid month.");

    const state = await ctx.db
      .query("receiptReadModel")
      .withIndex("by_name", (q) => q.eq("name", "receipts-v1"))
      .unique();

    if (!state?.ready) return null;

    const end = args.through ?? `${args.month}-31`;

    if (
      !/^\d{4}-\d{2}-(0[1-9]|[12]\d|3[01])$/.test(end) ||
      end.slice(0, 7) !== args.month
    )
      throw new Error("Invalid report boundary.");

    const days = await ctx.db
      .query("receiptDailyTotals")
      .withIndex("by_householdId_and_date", (q) =>
        q
          .eq("householdId", member.householdId)
          .gte("date", `${args.month}-01`)
          .lte("date", end),
      )
      .take(31);

    return days.reduce((sum, day) => addSpendingTotals(sum, day.totals), {
      ...emptySpendingTotals,
    });
  },
});

/** Resume safely after interruption. Concurrent receipt writes maintain their own summaries. */
export const backfill = internalMutation({
  args: {},
  returns: v.object({ ready: v.boolean(), processed: v.number() }),
  handler: async (ctx) => {
    let state = await ctx.db
      .query("receiptReadModel")
      .withIndex("by_name", (q) => q.eq("name", "receipts-v1"))
      .unique();

    if (state?.ready) return { ready: true, processed: 0 };

    if (!state) {
      const id = await ctx.db.insert("receiptReadModel", {
        name: "receipts-v1",
        cursor: null,
        ready: false,
      });

      state = (await ctx.db.get("receiptReadModel", id))!;
    }

    const options = {
      cursor: state.cursor,
      numItems: 20,
      maximumBytesRead: 4 * 1024 * 1024,
    };

    const page = await ctx.db.query("receipts").paginate(options);

    for (const receipt of page.page) {
      const existing = await ctx.db
        .query("receiptSummaries")
        .withIndex("by_receiptId", (q) => q.eq("receiptId", receipt._id))
        .unique();

      if (!existing) await updateReceiptReadModel(ctx, receipt);
    }

    await ctx.db.patch("receiptReadModel", state._id, {
      cursor: page.continueCursor,
      ready: page.isDone,
    });

    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.receiptSync.backfill, {});

    return { ready: page.isDone, processed: page.page.length };
  },
});
