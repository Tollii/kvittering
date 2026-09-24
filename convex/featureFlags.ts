import { v } from "convex/values";
import {
  query,
  internalQuery,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { deploymentChannel } from "./deployment";
import { internalMutation } from "./serverFunctions";
import {
  platformValidator,
  channelValidator,
  defaultPolicy,
  type Platform,
  type Channel,
} from "../src/lib/releases/policy";
import {
  parseFeatureFlags,
  featureNameValidator,
  type FeatureName,
  type FeatureFlagSnapshot,
  type FeatureFlags,
} from "../src/lib/featureFlags";

export const snapshotValidator = v.object({
  platform: platformValidator,
  channel: channelValidator,
  revision: v.number(),
  values: v.record(v.string(), v.boolean()),
});

/** Until a scope is transferred, its existing release settings are the authoritative fallback. */
export async function readFeatureFlags(
  ctx: Pick<QueryCtx, "db">,
  platform: Platform,
  channel: Channel,
): Promise<FeatureFlagSnapshot> {
  const row = await ctx.db
    .query("featureFlags")
    .withIndex("by_platform_and_channel", (q) =>
      q.eq("platform", platform).eq("channel", channel),
    )
    .unique();

  if (row)
    return {
      platform,
      channel,
      revision: row.revision,
      values: parseFeatureFlags(row.values),
    };

  const legacy = await ctx.db
    .query("releasePolicies")
    .withIndex("by_platform_and_channel", (q) =>
      q.eq("platform", platform).eq("channel", channel),
    )
    .unique();

  return {
    platform,
    channel,
    revision: 0,
    values: parseFeatureFlags(legacy?.features ?? {}),
  };
}

/** Transactional storage shared by the single-flag operation and the old operator adapter. */
export async function writeFeatureFlags(
  ctx: MutationCtx,
  previous: FeatureFlagSnapshot,
  values: FeatureFlags,
  operator: string,
  reason: string,
) {
  const { platform, channel } = previous;
  const revision = previous.revision + 1;

  const row = await ctx.db
    .query("featureFlags")
    .withIndex("by_platform_and_channel", (q) =>
      q.eq("platform", platform).eq("channel", channel),
    )
    .unique();

  const next = { platform, channel, revision, values };

  if (row) await ctx.db.replace("featureFlags", row._id, next);
  else await ctx.db.insert("featureFlags", next);
  await ctx.db.insert("featureFlagHistory", {
    platform,
    channel,
    revision,
    previous: previous.values,
    values,
    operator: operator.slice(0, 120),
    reason: reason.slice(0, 500),
  });

  return revision;
}

// Access: public. Flags gate features before sign-in and hold no household data.
export const get = query({
  args: { platform: platformValidator },
  returns: snapshotValidator,
  handler: (ctx, { platform }) =>
    readFeatureFlags(ctx, platform, deploymentChannel()),
});

export async function featureEnabled(
  ctx: Pick<QueryCtx, "db">,
  name: FeatureName,
): Promise<boolean> {
  const channel = deploymentChannel();

  const snapshots = await Promise.all([
    readFeatureFlags(ctx, "ios", channel),
    readFeatureFlags(ctx, "android", channel),
  ]);

  return snapshots.every((snapshot) => snapshot.values[name]);
}

export const enabled = internalQuery({
  args: { name: featureNameValidator },
  returns: v.boolean(),
  handler: (ctx, { name }) => featureEnabled(ctx, name),
});

export const set = internalMutation({
  args: {
    platform: platformValidator,
    name: featureNameValidator,
    enabled: v.boolean(),
    expectedRevision: v.number(),
    operator: v.string(),
    reason: v.string(),
  },
  returns: v.object({ revision: v.number() }),
  handler: async (ctx, args) => {
    if (!args.operator.trim() || !args.reason.trim())
      throw new Error("Operator and reason are required.");
    const channel = deploymentChannel();
    const previous = await readFeatureFlags(ctx, args.platform, channel);

    if (previous.revision !== args.expectedRevision)
      throw new Error("Flags changed. Read them again before editing.");

    const revision = await writeFeatureFlags(
      ctx,
      previous,
      { ...previous.values, [args.name]: args.enabled },
      args.operator,
      args.reason,
    );

    // Retire the legacy copy and advance the old read adapter's revision atomically.
    const row = await ctx.db
      .query("releasePolicies")
      .withIndex("by_platform_and_channel", (q) =>
        q.eq("platform", args.platform).eq("channel", channel),
      )
      .unique();

    if (row)
      await ctx.db.patch("releasePolicies", row._id, {
        features: undefined,
        revision: row.revision + 1,
      });
    else {
      const { features: _features, ...policy } = defaultPolicy(
        args.platform,
        channel,
      );

      await ctx.db.insert("releasePolicies", { ...policy, revision: 1 });
    }

    return { revision };
  },
});
