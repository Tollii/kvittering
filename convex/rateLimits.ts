import { DAY, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import { type MutationCtx } from "./_generated/server";
import { internalMutation } from "./serverFunctions";
import type { Doc } from "./_generated/dataModel";

/** Fixed UTC windows have no rollover. Provider allowances are shared by all accounts. */
export const providerAllowances = {
  openai: { daily: 300, thirtyDays: 3000 },
  typesafe: { daily: 10000, thirtyDays: 100000 },
  kassalapp: { daily: 10000, thirtyDays: 100000 },
} as const;

export type Provider = keyof typeof providerAllowances;

const limiter = new RateLimiter(components.rateLimiter, {
  receiptDaily: { kind: "fixed window", rate: 30, period: DAY, start: 0 },
  receiptBurst: {
    kind: "token bucket",
    rate: 10,
    period: MINUTE,
    capacity: 10,
  },
});

/** The caller's mutation rolls back all counters if any quota or receipt write fails. */
export async function consumeReceiptQuota(
  ctx: MutationCtx,
  member: Pick<Doc<"members">, "identity" | "householdId">,
  retryMetadata = false,
) {
  for (const key of [
    `user:${member.identity}`,
    `household:${member.householdId}`,
  ]) {
    for (const name of ["receiptDaily", "receiptBurst"] as const) {
      const result = await limiter.limit(ctx, name, { key });

      if (!result.ok) {
        const message =
          name === "receiptDaily"
            ? "Dagens grense for kvitteringer er nådd. Prøv igjen i morgen. Bildene blir liggende i køen."
            : "For mange kvitteringer på kort tid. Vent ett minutt og prøv igjen. Bildene blir liggende i køen.";

        throw new ConvexError(
          retryMetadata
            ? {
                code: "RATE_LIMITED",
                message,
                retryAt: Date.now() + result.retryAfter,
              }
            : message,
        );
      }
    }
  }
}

/** Commit before external I/O; failed requests and uncertain outcomes still consume quota. */
export const consumeProvider = internalMutation({
  args: {
    provider: v.union(
      v.literal("openai"),
      v.literal("typesafe"),
      v.literal("kassalapp"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { provider }) => {
    const allowance = providerAllowances[provider];

    for (const [period, rate] of [
      [DAY, allowance.daily],
      [30 * DAY, allowance.thirtyDays],
    ]) {
      const result = await limiter.limit(ctx, `${provider}:${period}`, {
        config: { kind: "fixed window", rate, period, start: 0 },
      });

      if (!result.ok)
        throw new ConvexError(
          "Tjenestens bruksgrense er nådd. Prøv igjen senere.",
        );
    }

    return null;
  },
});
