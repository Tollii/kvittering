import { requireMember } from "./access";
import { requireCompatibleClient } from "./releasePolicy";
import { clientValidator } from "../src/lib/releases/policy";
import { DAY, HOUR, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v, type Infer } from "convex/values";
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

export type QuotaActor = Pick<Doc<"members">, "identity" | "householdId">;

export const workAllowances = {
  catalog: { hourly: 120, daily: 400 },
  evaluation: { hourly: 6, daily: 12 },
  analysis: { hourly: 20, daily: 60 },
} as const;

export const actorProviderAllowances = {
  openai: { hourly: 30, daily: 60 },
  typesafe: { hourly: 600, daily: 2000 },
  kassalapp: { hourly: 600, daily: 2000 },
} as const;

export const providerSourceValidator = v.union(
  v.object({ kind: v.literal("receipt"), id: v.id("receipts") }),
  v.object({ kind: v.literal("catalog"), id: v.id("catalogRequests") }),
  v.object({ kind: v.literal("member") }),
);

export type ProviderSource = Infer<typeof providerSourceValidator>;

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

/** Fixed-hour and daily admission survives restarts and household changes. */
async function consumeActorQuota(
  ctx: MutationCtx,
  actor: QuotaActor,
  name: string,
  allowance: { hourly: number; daily: number },
) {
  for (const key of [
    `user:${actor.identity}`,
    `household:${actor.householdId}`,
  ]) {
    for (const [period, rate] of [
      [HOUR, allowance.hourly],
      [DAY, allowance.daily],
    ] as const) {
      const result = await limiter.limit(ctx, `${name}:${period}`, {
        key,
        config: { kind: "fixed window", period, rate, start: 0 },
      });

      if (!result.ok)
        throw new ConvexError(
          "Bruksgrensen for denne brukeren eller husstanden er nådd. Prøv igjen senere. Lagrede data er beholdt.",
        );
    }
  }
}

export function consumeWorkQuota(
  ctx: MutationCtx,
  actor: QuotaActor,
  kind: keyof typeof workAllowances,
) {
  return consumeActorQuota(ctx, actor, `work:${kind}`, workAllowances[kind]);
}

export const admitEvaluation = internalMutation({
  args: { client: clientValidator.optional() },
  returns: v.null(),
  handler: async (ctx, { client }) => {
    const member = await requireMember(ctx);
    await requireCompatibleClient(ctx, client, "receiptProcessing");
    await consumeWorkQuota(ctx, member, "evaluation");

    return null;
  },
});

async function providerActor(
  ctx: MutationCtx,
  source?: ProviderSource,
): Promise<QuotaActor | undefined> {
  if (!source) return undefined;

  if (source.kind === "member") return requireMember(ctx);

  if (source.kind === "catalog") {
    const request = await ctx.db.get("catalogRequests", source.id);

    if (!request) throw new Error("Catalog request no longer exists.");

    return request.payer;
  }

  const receipt = await ctx.db.get("receipts", source.id);

  if (!receipt) throw new Error("Receipt no longer exists.");

  return { householdId: receipt.householdId, identity: receipt.uploadedBy };
}

/** Commit before external I/O; failed requests and uncertain outcomes still consume quota. */
export const consumeProvider = internalMutation({
  args: {
    source: providerSourceValidator.optional(),
    provider: v.union(
      v.literal("openai"),
      v.literal("typesafe"),
      v.literal("kassalapp"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { provider, source }) => {
    const actor = await providerActor(ctx, source);

    if (actor)
      await consumeActorQuota(
        ctx,
        actor,
        `provider:${provider}`,
        actorProviderAllowances[provider],
      );
    const allowance = providerAllowances[provider];

    for (const [period, rate] of [
      [DAY, allowance.daily],
      [30 * DAY, allowance.thirtyDays],
    ] as const) {
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
