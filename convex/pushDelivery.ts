import { receiptReviewCategory } from "../src/lib/receipt-notifications";
import { z } from "zod";
import { v } from "convex/values";
import { internalAction, env } from "./_generated/server";
import { internal } from "./_generated/api";

const pushResultSchema = z.object({
  status: z.string().optional(),
  id: z.string().optional(),
  details: z.object({ error: z.string().optional() }).optional(),
});

function headers() {
  const result = new Headers({ "Content-Type": "application/json" });

  if (env.EXPO_ACCESS_TOKEN)
    result.set("Authorization", `Bearer ${env.EXPO_ACCESS_TOKEN}`);

  return result;
}

export const send = internalAction({
  args: {
    receiptId: v.id("receipts"),
    subscriptionId: v.id("deviceSubscriptions"),
    attempt: v.number(),
    reviewOnly: v.boolean().optional(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const target = await ctx.runQuery(internal.notifications.delivery, {
      receiptId: args.receiptId,
      subscriptionId: args.subscriptionId,
    });

    if (!target || (args.reviewOnly && target.autoAccepted)) return null;

    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          to: target.subscription.token,
          sound: "default",
          title: target.title,
          body: target.body,
          categoryId: target.autoAccepted ? undefined : receiptReviewCategory,
          data: { receiptId: args.receiptId },
        }),
      });

      if (!response.ok) throw new Error(`Push service: ${response.status}`);

      const result = z
        .object({ data: pushResultSchema.optional() })
        .parse(await response.json());

      if (result.data?.details?.error === "DeviceNotRegistered")
        await ctx.runMutation(internal.notifications.removeExpired, {
          id: args.subscriptionId,
        });
      else if (result.data?.status === "ok" && result.data.id)
        await ctx.scheduler.runAfter(
          15 * 60 * 1000,
          internal.pushDelivery.checkReceipt,
          { ticketId: result.data.id, subscriptionId: args.subscriptionId },
        );
      else throw new Error("Push service rejected the notification.");
    } catch {
      if (args.attempt < 2)
        await ctx.scheduler.runAfter(
          args.attempt === 0 ? 10000 : 60000,
          internal.pushDelivery.send,
          { ...args, attempt: args.attempt + 1 },
        );
      else console.warn("Receipt notification delivery failed.");
    }

    return null;
  },
});

/** A plain notification that is not about one receipt, such as the weekly digest. */
export const sendMessage = internalAction({
  args: {
    subscriptionId: v.id("deviceSubscriptions"),
    title: v.string(),
    body: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const subscription = await ctx.runQuery(
      internal.notifications.subscription,
      {
        id: args.subscriptionId,
      },
    );

    if (!subscription) return null;

    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          to: subscription.token,
          sound: "default",
          title: args.title,
          body: args.body,
          data: { route: "/spending" },
        }),
      });

      if (!response.ok) throw new Error(`Push service: ${response.status}`);

      const result = z
        .object({ data: pushResultSchema.optional() })
        .parse(await response.json());

      if (result.data?.details?.error === "DeviceNotRegistered")
        await ctx.runMutation(internal.notifications.removeExpired, {
          id: args.subscriptionId,
        });
    } catch {
      console.warn("Digest notification delivery failed.");
    }

    return null;
  },
});

export const checkReceipt = internalAction({
  args: { ticketId: v.string(), subscriptionId: v.id("deviceSubscriptions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const response = await fetch(
      "https://exp.host/--/api/v2/push/getReceipts",
      {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ ids: [args.ticketId] }),
      },
    );

    if (!response.ok) return null;

    const result = z
      .object({ data: z.record(z.string(), pushResultSchema).optional() })
      .parse(await response.json());

    if (result.data?.[args.ticketId]?.details?.error === "DeviceNotRegistered")
      await ctx.runMutation(internal.notifications.removeExpired, {
        id: args.subscriptionId,
      });

    return null;
  },
});
