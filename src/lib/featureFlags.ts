import { z } from "zod";
import { v, type VBoolean } from "convex/values";

/** Existing services default on. New experimental entries must default off. */
export const featureFlagDefinitions = {
  receiptProcessing: { default: true, legacy: true },
  productLookup: { default: true, legacy: true },
  automaticProductMatching: { default: true, legacy: true },
  spendingAnalysis: { default: true, legacy: true },
} as const;

export type FeatureName = keyof typeof featureFlagDefinitions;

export type FeatureFlags = { [K in FeatureName]: boolean };

export type LegacyFeatureName = {
  [K in FeatureName]: (typeof featureFlagDefinitions)[K] extends {
    legacy: true;
  }
    ? K
    : never;
}[FeatureName];

// SAFETY: This closed definition object is the sole owner of feature names.
export const featureNames = Object.keys(
  featureFlagDefinitions,
) as FeatureName[];

export const featureNameValidator = v.union(
  ...featureNames.map((name) => v.literal(name)),
);

const legacyNames = featureNames.filter((name): name is LegacyFeatureName => {
  const definition: { default: boolean; legacy?: boolean } =
    featureFlagDefinitions[name];

  return definition.legacy === true;
});

/** This adapter retains the closed object read by older clients. */
// SAFETY: Every legacy key receives a boolean validator.
export const legacyFeaturesValidator = v.object(
  Object.fromEntries(legacyNames.map((name) => [name, v.boolean()])) as {
    [K in LegacyFeatureName]: VBoolean;
  },
);

export function legacyFeatures(
  flags: FeatureFlags,
): Record<LegacyFeatureName, boolean> {
  // SAFETY: Every legacy key is copied from the complete FeatureFlags object.
  return Object.fromEntries(
    legacyNames.map((name) => [name, flags[name]]),
  ) as Record<LegacyFeatureName, boolean>;
}

/** Defaults apply only to missing known keys. A malformed known value is an error. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This boundary parser validates external input before returning a domain value.
export function parseFeatureFlags(value: unknown): FeatureFlags {
  const supplied = z.record(z.string(), z.unknown()).parse(value);

  // SAFETY: Every declared key receives either a parsed boolean or its boolean default.
  return Object.fromEntries(
    featureNames.map((name) => {
      const enabled = Object.hasOwn(supplied, name)
        ? z.boolean().parse(supplied[name])
        : featureFlagDefinitions[name].default;

      return [name, enabled];
    }),
  ) as FeatureFlags;
}

export const defaultFeatureFlags = (): FeatureFlags => parseFeatureFlags({});

export type FeatureFlagScope = {
  platform: "ios" | "android";
  channel: "development" | "testflight" | "production";
};

export type FeatureFlagSnapshot = FeatureFlagScope & {
  revision: number;
  values: FeatureFlags;
};

export function parseFeatureFlagSnapshot(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This boundary parser validates external input before returning a domain value.
  value: unknown,
  scope: FeatureFlagScope,
): FeatureFlagSnapshot {
  const snapshot = z
    .object({
      platform: z.literal(scope.platform),
      channel: z.literal(scope.channel),
      revision: z.number().int().nonnegative(),
      values: z.unknown(),
    })
    .parse(value);

  return {
    ...scope,
    revision: snapshot.revision,
    values: parseFeatureFlags(snapshot.values),
  };
}
