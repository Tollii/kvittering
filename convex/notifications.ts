import { userError } from "./userErrors";
import { clientMutation as mutation } from "./clientFunctions";
import { v } from "convex/values";
import { query, internalQuery, internalMutation } from "./_generated/server";
import { requireMember, requireReceipt } from "./access";
import schema from "./schema";
import { internal } from "./_generated/api";
import { reviewSummary } from "../src/lib/domain/receipt-review";
import { formatMoney } from "../src/lib/domain/receipt";

export function validPushToken(token: string) {
  return /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/.test(
    token,
  );
}

export const enabled = query({
  args: { token: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { token }) => {
    const member = await requireMember(ctx);

    const subscription = await ctx.db
      .query("deviceSubscriptions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    return (
      subscription?.identity === member.identity &&
      subscription.householdId === member.householdId
    );
  },
});

export const subscribe = mutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, { token }) => {
    const member = await requireMember(ctx);

    if (!validPushToken(token)) throw userError("Ugyldig varslingsadresse.");

    const existing = await ctx.db
      .query("deviceSubscriptions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    if (existing && existing.identity !== member.identity)
      throw userError(
        "Slå av varsler for forrige konto på denne enheten først.",
      );

    const values = {
      token,
      identity: member.identity,
      householdId: member.householdId,
    };

    if (existing)
      await ctx.db.replace("deviceSubscriptions", existing._id, values);
    else {
      const subscriptions = await ctx.db
        .query("deviceSubscriptions")
        .withIndex("by_identity", (q) => q.eq("identity", member.identity))
        .take(10);

      if (subscriptions.length >= 10)
        throw userError("Varsler er allerede aktivert på ti enheter.");
      await ctx.db.insert("deviceSubscriptions", values);
    }

    return null;
  },
});

export const unsubscribe = mutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, { token }) => {
    const member = await requireMember(ctx);

    const subscription = await ctx.db
      .query("deviceSubscriptions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    if (subscription?.identity === member.identity)
      await ctx.db.delete("deviceSubscriptions", subscription._id);

    return null;
  },
});

export const delivery = internalQuery({
  args: {
    receiptId: v.id("receipts"),
    subscriptionId: v.id("deviceSubscriptions"),
  },
  returns: v.union(
    v.object({
      subscription: schema.doc("deviceSubscriptions"),
      store: v.union(v.string(), v.null()),
      autoAccepted: v.boolean(),
      title: v.string(),
      body: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get("receipts", args.receiptId);

    const subscription = await ctx.db.get(
      "deviceSubscriptions",
      args.subscriptionId,
    );

    if (
      !receipt ||
      !subscription ||
      receipt.status !== "needs_review" ||
      receipt.excluded ||
      receipt.uploadedBy !== subscription.identity ||
      receipt.householdId !== subscription.householdId
    )
      return null;

    const member = await ctx.db
      .query("members")
      .withIndex("by_identity", (q) => q.eq("identity", subscription.identity))
      .unique();

    if (member?.householdId !== receipt.householdId) return null;

    const needs = reviewSummary(
      receipt.data,
      !!receipt.duplicateOf && !receipt.duplicateResolved,
    );

    const amount =
      receipt.data?.totalOre !== null && receipt.data?.totalOre !== undefined
        ? formatMoney(receipt.data.totalOre)
        : null;

    return {
      subscription,
      store: receipt.data?.store ?? null,
      autoAccepted: false,
      title: receipt.data?.store || "Kvitteringen er klar",
      // Say what the person will have to do, so the tap is informed.
      body: [
        amount,
        needs.length
          ? needs.slice(0, 3).join(" · ") +
            (needs.length > 3 ? ` · +${needs.length - 3}` : "")
          : "klar til kontroll",
      ]
        .filter(Boolean)
        .join(" · "),
    };
  },
});

export const subscription = internalQuery({
  args: { id: v.id("deviceSubscriptions") },
  returns: v.union(schema.doc("deviceSubscriptions"), v.null()),
  handler: (ctx, { id }) => ctx.db.get("deviceSubscriptions", id),
});

export const removeExpired = internalMutation({
  args: { id: v.id("deviceSubscriptions") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    if (await ctx.db.get("deviceSubscriptions", id))
      await ctx.db.delete("deviceSubscriptions", id);

    return null;
  },
});

/** Replace this device's reminder in the same transaction as its authorization check. */
export const remindLater = mutation({
  args: { receiptId: v.id("receipts"), token: v.string(), at: v.number() },
  returns: v.null(),
  handler: async (ctx, { receiptId, token, at }) => {
    const { member, receipt } = await requireReceipt(ctx, receiptId);

    const subscription = await ctx.db
      .query("deviceSubscriptions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    if (
      !subscription ||
      subscription.identity !== member.identity ||
      subscription.householdId !== member.householdId ||
      receipt.uploadedBy !== member.identity
    )
      throw userError("Slå på varsler for denne kontoen først.");

    if (receipt.status !== "needs_review" || receipt.excluded)
      throw userError("Kvitteringen trenger ikke kontroll nå.");
    const now = Date.now();

    if (!Number.isFinite(at) || at <= now || at > now + 48 * 60 * 60 * 1000)
      throw userError("Velg et tidspunkt innen to døgn.");

    const existing = await ctx.db
      .query("receiptReminders")
      .withIndex("by_subscriptionId_and_receiptId", (q) =>
        q.eq("subscriptionId", subscription._id).eq("receiptId", receiptId),
      )
      .unique();

    if (existing) {
      await ctx.scheduler.cancel(existing.scheduledId);
      await ctx.db.delete("receiptReminders", existing._id);
    } else {
      const pending = await ctx.db
        .query("receiptReminders")
        .withIndex("by_subscriptionId_and_receiptId", (q) =>
          q.eq("subscriptionId", subscription._id),
        )
        .take(50);

      if (pending.length >= 50)
        throw userError("Du har allerede 50 påminnelser.");
    }

    const scheduledId = await ctx.scheduler.runAt(
      at,
      internal.notifications.sendReminder,
      {
        receiptId,
        subscriptionId: subscription._id,
      },
    );

    await ctx.db.insert("receiptReminders", {
      receiptId,
      subscriptionId: subscription._id,
      scheduledId,
    });

    return null;
  },
});

export const sendReminder = internalMutation({
  args: {
    receiptId: v.id("receipts"),
    subscriptionId: v.id("deviceSubscriptions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reminder = await ctx.db
      .query("receiptReminders")
      .withIndex("by_subscriptionId_and_receiptId", (q) =>
        q
          .eq("subscriptionId", args.subscriptionId)
          .eq("receiptId", args.receiptId),
      )
      .unique();

    if (!reminder) return null;
    await ctx.db.delete("receiptReminders", reminder._id);
    const receipt = await ctx.db.get("receipts", args.receiptId);

    if (receipt?.status === "needs_review" && !receipt.excluded)
      await ctx.scheduler.runAfter(0, internal.pushDelivery.send, {
        ...args,
        attempt: 0,
        reviewOnly: true,
      });

    return null;
  },
});
