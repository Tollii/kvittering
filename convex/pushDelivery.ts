import { receiptReviewCategory } from "../src/lib/receipt-notifications";
import { z } from "zod";
import { v } from "convex/values";
import { internalAction, env } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
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

type PushMessage = {
  title: string;
  body: string;
  categoryId?: string;
  data: Record<string, string>;
};

/** What happened to one push request; only `delivered` and `unregistered` are final. */
type PushOutcome =
  | { kind: "delivered"; ticketId: string }
  | { kind: "unregistered" }
  | { kind: "rejected"; status: number; reason: string | null }
  | { kind: "failed"; error: unknown };

const retryDelays = [10_000, 60_000];

async function request(
  token: string,
  message: PushMessage,
): Promise<PushOutcome> {
  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ to: token, sound: "default", ...message }),
    });

    if (!response.ok)
      return {
        kind: "rejected",
        status: response.status,
        reason: null,
      };

    const ticket = z
      .object({ data: pushResultSchema.optional() })
      .parse(await response.json()).data;

    if (ticket?.details?.error === "DeviceNotRegistered")
      return { kind: "unregistered" };

    return ticket?.status === "ok" && ticket.id
      ? { kind: "delivered", ticketId: ticket.id }
      : {
          kind: "rejected",
          status: response.status,
          reason: ticket?.details?.error ?? ticket?.status ?? null,
        };
  } catch (error) {
    return { kind: "failed", error };
  }
}

/**
 * Sends one push message and applies its outcome: an accepted ticket is checked
 * later, an unregistered device is removed, and any other outcome is logged and
 * retried through `retry` until the attempts run out.
 */
async function deliverPush(
  ctx: ActionCtx,
  delivery: {
    subscriptionId: Id<"deviceSubscriptions">;
    token: string;
    attempt: number;
    retry: (delay: number) => Promise<Id<"_scheduled_functions">>;
  },
  message: PushMessage,
) {
  const outcome = await request(delivery.token, message);

  if (outcome.kind === "delivered")
    await ctx.scheduler.runAfter(
      15 * 60 * 1000,
      internal.pushDelivery.checkReceipt,
      { ticketId: outcome.ticketId, subscriptionId: delivery.subscriptionId },
    );
  else if (outcome.kind === "unregistered")
    await ctx.runMutation(internal.notifications.removeExpired, {
      id: delivery.subscriptionId,
    });
  else {
    const delay = retryDelays[delivery.attempt];

    console.warn("push.delivery_failed", {
      subscriptionId: delivery.subscriptionId,
      attempt: delivery.attempt,
      kind: outcome.kind,
      ...(outcome.kind === "rejected"
        ? { status: outcome.status, reason: outcome.reason }
        : { error: String(outcome.error) }),
      retrying: delay !== undefined,
    });

    if (delay !== undefined) await delivery.retry(delay);
  }
}

export const sendArgs = v.object({
  receiptId: v.id("receipts"),
  subscriptionId: v.id("deviceSubscriptions"),
  attempt: v.number(),
  reviewOnly: v.boolean().optional(),
});

export const send = internalAction({
  args: sendArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const target = await ctx.runQuery(internal.notifications.delivery, {
      receiptId: args.receiptId,
      subscriptionId: args.subscriptionId,
    });

    if (!target || (args.reviewOnly && target.autoAccepted)) return null;

    await deliverPush(
      ctx,
      {
        subscriptionId: args.subscriptionId,
        token: target.subscription.token,
        attempt: args.attempt,
        retry: (delay) =>
          ctx.scheduler.runAfter(delay, internal.pushDelivery.send, {
            ...args,
            attempt: args.attempt + 1,
          }),
      },
      {
        title: target.title,
        body: target.body,
        categoryId: target.autoAccepted ? undefined : receiptReviewCategory,
        data: { receiptId: args.receiptId },
      },
    );

    return null;
  },
});

/**
 * A plain notification that is not about one receipt, such as the weekly digest.
 * It retries like `send`: a digest is sent once a week, so a transient failure
 * would otherwise drop it. A retry is skipped once the device has moved to another
 * household. `householdId` and `attempt` are optional for jobs scheduled before they existed.
 */
export const sendMessage = internalAction({
  args: {
    subscriptionId: v.id("deviceSubscriptions"),
    householdId: v.optional(v.id("households")),
    title: v.string(),
    body: v.string(),
    attempt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const subscription = await ctx.runQuery(
      internal.notifications.subscription,
      { id: args.subscriptionId },
    );

    if (
      !subscription ||
      (args.householdId && subscription.householdId !== args.householdId)
    )
      return null;

    const attempt = args.attempt ?? 0;

    await deliverPush(
      ctx,
      {
        subscriptionId: args.subscriptionId,
        token: subscription.token,
        attempt,
        retry: (delay) =>
          ctx.scheduler.runAfter(delay, internal.pushDelivery.sendMessage, {
            ...args,
            attempt: attempt + 1,
          }),
      },
      { title: args.title, body: args.body, data: { route: "/spending" } },
    );

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
