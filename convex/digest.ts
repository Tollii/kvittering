import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { weeklyDigest } from "../src/lib/domain/budget";
import { osloDate } from "../src/lib/domain/receipt";

/** One weekly push per subscribed device with the household's week and budget position. */
export const sendAll = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const subscriptions = await ctx.db.query("deviceSubscriptions").take(500);
    const byHousehold = new Map<Id<"households">, typeof subscriptions>();
    for (const subscription of subscriptions)
      byHousehold.set(subscription.householdId, [
        ...(byHousehold.get(subscription.householdId) ?? []),
        subscription,
      ]);
    let sent = 0;
    for (const [householdId, devices] of byHousehold) {
      const digest = await ctx.runQuery(internal.digest.forHousehold, {
        householdId,
      });
      if (!digest) continue;
      for (const device of devices) {
        await ctx.scheduler.runAfter(0, internal.pushDelivery.sendMessage, {
          subscriptionId: device._id,
          title: digest.title,
          body: digest.body,
        });
        sent++;
      }
    }
    return sent;
  },
});

export const forHousehold = internalQuery({
  args: { householdId: v.id("households") },
  returns: v.union(v.object({ title: v.string(), body: v.string() }), v.null()),
  handler: async (ctx, { householdId }) => {
    const household = await ctx.db.get("households", householdId);
    if (!household) return null;
    // Recent receipts are enough for a week and the running month.
    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .order("desc")
      .take(300);
    const digest = weeklyDigest(
      receipts,
      household.monthlyBudgetOre ?? null,
      osloDate(),
    );
    return { title: digest.title, body: digest.body };
  },
});
