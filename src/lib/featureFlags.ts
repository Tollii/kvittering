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
export const featureNames = Object.keys(
  featureFlagDefinitions,
) as FeatureName[];
export const featureNameValidator = v.union(
  ...featureNames.map((name) => v.literal(name)),
);
const legacyNames = featureNames.filter((name) => {
  const definition: { default: boolean; legacy?: boolean } =
    featureFlagDefinitions[name];
  return definition.legacy;
}) as LegacyFeatureName[];
/** This adapter retains the closed object read by older clients. */
export const legacyFeaturesValidator = v.object(
  Object.fromEntries(legacyNames.map((name) => [name, v.boolean()])) as {
    [K in LegacyFeatureName]: VBoolean;
  },
);
export function legacyFeatures(
  flags: FeatureFlags,
): Record<LegacyFeatureName, boolean> {
  return Object.fromEntries(
    legacyNames.map((name) => [name, flags[name]]),
  ) as Record<LegacyFeatureName, boolean>;
}
/** Defaults apply only to missing known keys. A malformed known value is an error. */
export function parseFeatureFlags(value: unknown): FeatureFlags {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid feature flags.");
  return Object.fromEntries(
    featureNames.map((name) => {
      const supplied = Object.hasOwn(value, name)
        ? (value as Record<string, unknown>)[name]
        : undefined;
      if (Object.hasOwn(value, name) && typeof supplied !== "boolean")
        throw new Error(`Invalid feature flag: ${name}`);
      return [name, supplied ?? featureFlagDefinitions[name].default];
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
  value: unknown,
  scope: FeatureFlagScope,
): FeatureFlagSnapshot {
  if (
    !value ||
    typeof value !== "object" ||
    !("platform" in value) ||
    !("channel" in value) ||
    value.platform !== scope.platform ||
    value.channel !== scope.channel ||
    !("revision" in value) ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !("values" in value)
  )
    throw new Error("Invalid feature flag snapshot.");
  return {
    ...scope,
    revision: value.revision,
    values: parseFeatureFlags(value.values),
  };
}
