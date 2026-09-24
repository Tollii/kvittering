import { userError } from "./userErrors";
import { v } from "convex/values";
import { clientMutation as mutation } from "./clientFunctions";
import {
  query,
  internalQuery,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireMember, requireReceipt } from "./access";
import type { Doc, Id } from "./_generated/dataModel";
import { receiptActivityProgress } from "../src/lib/domain/receipt-activity";
import schema from "./schema";

const progressValidator = v.object({
  total: v.number(),
  completed: v.number(),
  failed: v.number(),
  ended: v.boolean(),
});

async function progress(ctx: QueryCtx, activity: Doc<"receiptActivities">) {
  const receipts = await Promise.all(
    activity.receiptIds.map((id) => ctx.db.get("receipts", id)),
  );

  return receiptActivityProgress(
    receipts.map((receipt) =>
      receipt?.householdId === activity.householdId ? receipt.status : null,
    ),
    activity.expired ?? false,
  );
}

export const register = mutation({
  args: {
    activityId: v.string(),
    receiptIds: v.array(v.id("receipts")),
    token: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);

    if (
      !/^[\w-]{1,100}$/.test(args.activityId) ||
      args.receiptIds.length < 2 ||
      args.receiptIds.length > 30 ||
      new Set(args.receiptIds).size !== args.receiptIds.length ||
      (args.token && !/^[a-f0-9]{32,512}$/.test(args.token))
    )
      throw userError("Ugyldig aktivitetsforespørsel.");

    for (const id of args.receiptIds) await requireReceipt(ctx, id);

    const existing = await ctx.db
      .query("receiptActivities")
      .withIndex("by_activityId", (q) => q.eq("activityId", args.activityId))
      .unique();

    if (
      existing &&
      (existing.identity !== member.identity ||
        existing.householdId !== member.householdId)
    )
      throw userError("Aktiviteten er ikke tilgjengelig.");

    const values = {
      ...args,
      identity: member.identity,
      householdId: member.householdId,
      updatedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    };

    let id: Id<"receiptActivities">;

    if (existing) {
      id = existing._id;
      await ctx.db.patch("receiptActivities", id, {
        token: args.token,
        updatedAt: Math.max(Date.now(), existing.updatedAt + 1000),
      });
    } else {
      const current = await ctx.db
        .query("receiptActivities")
        .withIndex("by_identity", (q) => q.eq("identity", member.identity))
        .take(3);

      if (current.length >= 3)
        throw userError("Tre aktiviteter er allerede i gang.");
      id = await ctx.db.insert("receiptActivities", values);
      await ctx.scheduler.runAfter(3600000, internal.liveActivities.expire, {
        id,
      });
    }

    await ctx.scheduler.runAfter(0, internal.liveActivityPush.deliver, {
      id,
      attempt: 0,
      expired: false,
    });

    return null;
  },
});

export const current = query({
  args: { activityId: v.string() },
  returns: v.union(progressValidator, v.null()),
  handler: async (ctx, { activityId }) => {
    const member = await requireMember(ctx);

    const activity = await ctx.db
      .query("receiptActivities")
      .withIndex("by_activityId", (q) => q.eq("activityId", activityId))
      .unique();

    return activity?.identity === member.identity &&
      activity.householdId === member.householdId
      ? progress(ctx, activity)
      : null;
  },
});

export const stop = mutation({
  args: { activityId: v.string() },
  returns: v.null(),
  handler: async (ctx, { activityId }) => {
    const member = await requireMember(ctx);

    const activity = await ctx.db
      .query("receiptActivities")
      .withIndex("by_activityId", (q) => q.eq("activityId", activityId))
      .unique();

    if (activity?.identity === member.identity)
      await ctx.db.delete("receiptActivities", activity._id);

    return null;
  },
});

/** Called in the transaction that changes receipt status. No client polling is required. */
export async function notifyReceiptActivities(
  ctx: MutationCtx,
  householdId: Id<"households">,
) {
  const activities = await ctx.db
    .query("receiptActivities")
    .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
    .take(6);

  for (const activity of activities) {
    await ctx.db.patch("receiptActivities", activity._id, {
      updatedAt: Math.max(Date.now(), activity.updatedAt + 1000),
    });
    await ctx.scheduler.runAfter(0, internal.liveActivityPush.deliver, {
      id: activity._id,
      attempt: 0,
      expired: false,
    });
  }
}

export const delivery = internalQuery({
  args: { id: v.id("receiptActivities") },
  returns: v.union(
    v.object({
      activity: schema.doc("receiptActivities"),
      progress: progressValidator,
    }),
    v.null(),
  ),
  handler: async (ctx, { id }) => {
    const activity = await ctx.db.get("receiptActivities", id);

    if (!activity) return null;

    const member = await ctx.db
      .query("members")
      .withIndex("by_identity", (q) => q.eq("identity", activity.identity))
      .unique();

    if (member?.householdId !== activity.householdId)
      return {
        activity,
        progress: { total: 0, completed: 0, failed: 0, ended: true },
      };

    return { activity, progress: await progress(ctx, activity) };
  },
});

export const expire = internalMutation({
  args: { id: v.id("receiptActivities") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const activity = await ctx.db.get("receiptActivities", id);

    if (activity && !activity.expired) {
      await ctx.db.patch("receiptActivities", id, {
        expired: true,
        updatedAt: Math.max(Date.now(), activity.updatedAt + 1000),
      });
      await ctx.scheduler.runAfter(0, internal.liveActivityPush.deliver, {
        id,
        attempt: 0,
        expired: true,
      });
    }

    return null;
  },
});

export const remove = internalMutation({
  args: { id: v.id("receiptActivities"), updatedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, updatedAt }) => {
    const activity = await ctx.db.get("receiptActivities", id);

    if (activity?.updatedAt === updatedAt)
      await ctx.db.delete("receiptActivities", id);

    return null;
  },
});

export const setToken = mutation({
  args: {
    activityId: v.string(),
    token: v.string(),
    environment: v.union(v.literal("development"), v.literal("production")),
  },
  returns: v.null(),
  handler: async (ctx, { activityId, token, environment }) => {
    const member = await requireMember(ctx);

    if (!/^[a-f0-9]{32,512}$/.test(token))
      throw userError("Ugyldig aktivitetsadresse.");

    const activity = await ctx.db
      .query("receiptActivities")
      .withIndex("by_activityId", (q) => q.eq("activityId", activityId))
      .unique();

    if (
      !activity ||
      activity.identity !== member.identity ||
      activity.householdId !== member.householdId
    )
      return null;
    await ctx.db.patch("receiptActivities", activity._id, {
      token,
      environment,
      updatedAt: Math.max(Date.now(), activity.updatedAt + 1000),
    });
    await ctx.scheduler.runAfter(0, internal.liveActivityPush.deliver, {
      id: activity._id,
      attempt: 0,
      expired: false,
    });

    return null;
  },
});
