import { ConvexError, v } from "convex/values";
import {
  query,
  internalQuery,
  internalMutation,
  type QueryCtx,
} from "./_generated/server";
import {
  apiVersion,
  clientValidator,
  defaultPolicy,
  platformValidator,
  policySettingsValidator,
  policyValidator,
  updateRequirement,
  validateSettings,
  type ClientRelease,
  type Feature,
  type Platform,
  type Channel,
  type ReleasePolicy,
} from "../src/lib/releases/policy";

export function deploymentChannel(): Channel {
  const value = process.env.RELEASE_CHANNEL ?? "development";
  if (
    value !== "development" &&
    value !== "testflight" &&
    value !== "production"
  )
    throw new Error("Invalid RELEASE_CHANNEL.");
  return value;
}
export async function readPolicy(
  ctx: Pick<QueryCtx, "db">,
  platform: Platform,
): Promise<ReleasePolicy> {
  const channel = deploymentChannel();
  const row = await ctx.db
    .query("releasePolicies")
    .withIndex("by_platform_and_channel", (q) =>
      q.eq("platform", platform).eq("channel", channel),
    )
    .unique();
  if (!row) return defaultPolicy(platform, channel);
  const { _id, _creationTime, ...policy } = row;
  void _id;
  void _creationTime;
  return policy;
}
export async function requireCompatibleClient(
  ctx: Pick<QueryCtx, "db">,
  client?: ClientRelease,
  feature?: Feature,
) {
  if (
    client &&
    (!Number.isSafeInteger(client.apiVersion) ||
      client.apiVersion < 1 ||
      client.apiVersion > apiVersion)
  ) {
    throw new ConvexError({
      code: "UNSUPPORTED_API_VERSION",
      message:
        "Denne appversjonen støttes ikke av tjenesten ennå. Prøv igjen senere.",
    });
  }
  const policy = await readPolicy(ctx, client?.platform ?? "ios");
  if (updateRequirement(policy, client) === "required")
    throw new ConvexError({
      code: "UPDATE_REQUIRED",
      message: "Oppdater Kvitto for å fortsette.",
      policy,
    });
  if (feature && !policy.features[feature])
    throw new ConvexError({
      code: "SERVICE_PAUSED",
      message:
        policy.message || "Denne funksjonen er midlertidig satt på pause.",
      policy,
    });
  return policy;
}
export const get = query({
  args: { platform: platformValidator },
  returns: policyValidator,
  handler: (ctx, { platform }) => readPolicy(ctx, platform),
});
export const check = internalQuery({
  args: {
    client: v.optional(clientValidator),
    feature: v.optional(
      v.union(
        v.literal("receiptProcessing"),
        v.literal("productLookup"),
        v.literal("automaticProductMatching"),
        v.literal("spendingAnalysis"),
      ),
    ),
  },
  returns: policyValidator,
  handler: (ctx, { client, feature }) =>
    requireCompatibleClient(ctx, client, feature),
});
export async function featureEnabled(
  ctx: Pick<QueryCtx, "db">,
  feature: Feature,
) {
  // Server work has no device platform; either platform can stop shared processing.
  const policies = await Promise.all([
    readPolicy(ctx, "ios"),
    readPolicy(ctx, "android"),
  ]);
  return policies.every((policy) => policy.features[feature]);
}
/** Operator-only change. Build and OTA workflows must never invoke this mutation. */
export const configure = internalMutation({
  args: {
    platform: platformValidator,
    settings: policySettingsValidator,
    expectedRevision: v.number(),
    operator: v.string(),
    reason: v.string(),
    replacementAvailable: v.boolean(),
  },
  returns: policyValidator,
  handler: async (ctx, args) => {
    validateSettings(args.settings);
    if (!args.operator.trim() || !args.reason.trim())
      throw new Error("Operator and reason are required.");
    const previous = await readPolicy(ctx, args.platform);
    if (previous.revision !== args.expectedRevision)
      throw new Error("Policy changed. Read it again before editing.");
    if (
      (args.settings.minimum || args.settings.minimumApiVersion > 0) &&
      !args.replacementAvailable
    )
      throw new Error(
        "Confirm the replacement is available to affected users first.",
      );
    const policy: ReleasePolicy = {
      ...previous,
      ...args.settings,
      revision: previous.revision + 1,
    };
    const row = await ctx.db
      .query("releasePolicies")
      .withIndex("by_platform_and_channel", (q) =>
        q.eq("platform", args.platform).eq("channel", previous.channel),
      )
      .unique();
    if (row) await ctx.db.replace("releasePolicies", row._id, policy);
    else await ctx.db.insert("releasePolicies", policy);
    await ctx.db.insert("releasePolicyHistory", {
      previous,
      policy,
      operator: args.operator.slice(0, 120),
      reason: args.reason.slice(0, 500),
    });
    return policy;
  },
});
