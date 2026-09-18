import { v } from "convex/values";
import { internalAction, env } from "./_generated/server";
import { internal } from "./_generated/api";

type PushResult = {
  status?: string;
  id?: string;
  details?: { error?: string };
};
const headers = () => ({
  "Content-Type": "application/json",
  ...(env.EXPO_ACCESS_TOKEN
    ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` }
    : {}),
});

export const send = internalAction({
  args: {
    receiptId: v.id("receipts"),
    subscriptionId: v.id("deviceSubscriptions"),
    attempt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const target = await ctx.runQuery(internal.notifications.delivery, {
      receiptId: args.receiptId,
      subscriptionId: args.subscriptionId,
    });
    if (!target) return null;
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          to: target.subscription.token,
          sound: "default",
          title: target.title,
          body: target.body,
          data: { receiptId: args.receiptId },
        }),
      });
      if (!response.ok) throw new Error(`Push service: ${response.status}`);
      const result = (await response.json()) as { data?: PushResult };
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
    const result = (await response.json()) as {
      data?: Record<string, PushResult>;
    };
    if (result.data?.[args.ticketId]?.details?.error === "DeviceNotRegistered")
      await ctx.runMutation(internal.notifications.removeExpired, {
        id: args.subscriptionId,
      });
    return null;
  },
});
