import { v } from "convex/values";
import {
  query,
  mutation,
  internalQuery,
  internalMutation,
} from "./_generated/server";
import { requireMember } from "./access";
import schema from "./schema";
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
    if (!validPushToken(token)) throw new Error("Ugyldig varslingsadresse.");
    const existing = await ctx.db
      .query("deviceSubscriptions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (existing && existing.identity !== member.identity)
      throw new Error(
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
        throw new Error("Varsler er allerede aktivert på ti enheter.");
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
      (receipt.status !== "needs_review" &&
        !(receipt.status === "reviewed" && receipt.autoAccepted)) ||
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
    const autoAccepted = receipt.autoAccepted ?? false;
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
      autoAccepted,
      title: receipt.data?.store || "Kvitteringen er klar",
      // Say what the person will have to do, so the tap is informed.
      body: [
        amount,
        autoAccepted
          ? "godkjent automatisk"
          : needs.length
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
