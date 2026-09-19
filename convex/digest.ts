import { receiptPeriodPage } from "./receipts";
import { featureEnabled } from "./featureFlags";
import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { weeklyDigest, digestPeriod } from "../src/lib/domain/budget";
import { osloDate } from "../src/lib/domain/receipt";

const device = v.object({
  householdId: v.id("households"),
  subscriptionId: v.id("deviceSubscriptions"),
});

/** A fixed insertion boundary visits each existing device once during normal traversal. */
export const sendAll = internalMutation({
  args: {
    cursor: v.string().optional(),
    through: v.number().optional(),
    today: v.string().optional(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    if (!(await featureEnabled(ctx, "spendingAnalysis"))) return 0;

    const through =
      args.through ??
      (await ctx.db.query("deviceSubscriptions").order("desc").first())
        ?._creationTime ??
      Date.now();

    const today = args.today ?? osloDate();

    const page = await ctx.db
      .query("deviceSubscriptions")
      .withIndex("by_creation_time", (q) => q.lte("_creationTime", through))
      .paginate({ cursor: args.cursor ?? null, numItems: 100 });

    await ctx.scheduler.runAfter(0, internal.digest.deliverBatch, {
      today,
      devices: page.page.map((item) => ({
        householdId: item.householdId,
        subscriptionId: item._id,
      })),
    });

    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.digest.sendAll, {
        today,
        through,
        cursor: page.continueCursor,
      });

    return page.page.length;
  },
});

export const periodPage = internalQuery({
  args: {
    householdId: v.id("households"),
    today: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    household: v.union(schema.doc("households"), v.null()),
    receipts: paginationResultValidator(schema.doc("receipts")),
  }),
  handler: async (ctx, { householdId, today, paginationOpts }) => {
    const period = digestPeriod(today);

    return {
      household: await ctx.db.get("households", householdId),
      receipts: await receiptPeriodPage(
        ctx,
        householdId,
        period.start,
        period.end,
        paginationOpts,
      ),
    };
  },
});

export const forHousehold = internalAction({
  args: { householdId: v.id("households"), today: v.string() },
  returns: v.union(v.object({ title: v.string(), body: v.string() }), v.null()),
  handler: async (
    ctx,
    args,
  ): Promise<{ title: string; body: string } | null> => {
    const receipts: Doc<"receipts">[] = [];
    let cursor: string | null = null;
    let budget: number | null = null;

    while (true) {
      const result: {
        household: Doc<"households"> | null;
        receipts: {
          page: Doc<"receipts">[];
          continueCursor: string;
          isDone: boolean;
        };
      } = await ctx.runQuery(internal.digest.periodPage, {
        ...args,
        paginationOpts: { cursor, numItems: 100 },
      });

      if (!result.household) return null;
      budget = result.household.monthlyBudgetOre ?? null;
      receipts.push(...result.receipts.page);

      if (result.receipts.isDone) break;
      cursor = result.receipts.continueCursor;
    }

    const digest = weeklyDigest(receipts, budget, args.today);

    return { title: digest.title, body: digest.body };
  },
});

export const deliverBatch = internalAction({
  args: { today: v.string(), devices: v.array(device) },
  returns: v.null(),
  handler: async (ctx, { today, devices }) => {
    const digests = new Map<
      Id<"households">,
      { title: string; body: string } | null
    >();

    for (const item of devices) {
      if (!digests.has(item.householdId))
        digests.set(
          item.householdId,
          await ctx.runAction(internal.digest.forHousehold, {
            householdId: item.householdId,
            today,
          }),
        );
      const digest = digests.get(item.householdId);

      if (digest)
        await ctx.runMutation(internal.digest.queueMessage, {
          ...item,
          ...digest,
        });
    }

    return null;
  },
});

export const queueMessage = internalMutation({
  args: { ...device.fields, title: v.string(), body: v.string() },
  returns: v.null(),
  handler: async (ctx, { householdId, subscriptionId, title, body }) => {
    if (!(await featureEnabled(ctx, "spendingAnalysis"))) return null;

    const subscription = await ctx.db.get(
      "deviceSubscriptions",
      subscriptionId,
    );

    if (subscription?.householdId === householdId)
      await ctx.scheduler.runAfter(0, internal.pushDelivery.sendMessage, {
        subscriptionId,
        title,
        body,
      });

    return null;
  },
});
