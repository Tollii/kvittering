import { readFeatureFlags, writeFeatureFlags } from "./featureFlags";
import { featureNameValidator, legacyFeatures } from "../src/lib/featureFlags";
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
  versionPolicyValidator,
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
  const flags = await readFeatureFlags(ctx, platform, channel);
  if (!row)
    return {
      ...defaultPolicy(platform, channel),
      features: legacyFeatures(flags.values),
    };
  const { _id, _creationTime, ...policy } = row;
  void _id;
  void _creationTime;
  return { ...policy, features: legacyFeatures(flags.values) };
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
  if (
    feature &&
    !(await readFeatureFlags(ctx, client?.platform ?? "ios", policy.channel))
      .values[feature]
  )
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
    client: clientValidator.optional(),
    feature: featureNameValidator.optional(),
  },
  returns: policyValidator,
  handler: (ctx, { client, feature }) =>
    requireCompatibleClient(ctx, client, feature),
});
/** Version controls no longer carry flags for current clients. */
export const getVersions = query({
  args: { platform: platformValidator },
  returns: versionPolicyValidator,
  handler: async (ctx, { platform }) => {
    const channel = deploymentChannel();
    const row = await ctx.db
      .query("releasePolicies")
      .withIndex("by_platform_and_channel", (q) =>
        q.eq("platform", platform).eq("channel", channel),
      )
      .unique();
    const { features: _features, ...policy } =
      row ?? defaultPolicy(platform, channel);
    void _features;
    if ("_id" in policy) {
      const { _id, _creationTime, ...version } = policy;
      void _id;
      void _creationTime;
      return version;
    }
    return policy;
  },
});
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
    const flags = await readFeatureFlags(ctx, args.platform, previous.channel);
    await writeFeatureFlags(
      ctx,
      flags,
      { ...flags.values, ...args.settings.features },
      args.operator,
      args.reason,
    );
    const { features: _features, ...versionPolicy } = policy;
    void _features;
    if (row) await ctx.db.replace("releasePolicies", row._id, versionPolicy);
    else await ctx.db.insert("releasePolicies", versionPolicy);
    await ctx.db.insert("releasePolicyHistory", {
      previous,
      policy,
      operator: args.operator.slice(0, 120),
      reason: args.reason.slice(0, 500),
    });
    return policy;
  },
});
