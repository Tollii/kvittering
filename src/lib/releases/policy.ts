import { v, type Infer } from "convex/values";
import { parse } from "convex-helpers/validators";

export const apiVersion = 1;
export const policyFreshnessMs = 5 * 60_000;
export const reminderIntervalMs = 3 * 24 * 60 * 60_000;
export const platformValidator = v.union(
  v.literal("ios"),
  v.literal("android"),
);
export const channelValidator = v.union(
  v.literal("development"),
  v.literal("testflight"),
  v.literal("production"),
);
export const releaseValidator = v.object({
  version: v.string(),
  build: v.string(),
});
export const clientValidator = v.object({
  ...releaseValidator.fields,
  platform: platformValidator,
  channel: channelValidator,
  apiVersion: v.number(),
  updateId: v.union(v.string(), v.null()),
  runtimeVersion: v.union(v.string(), v.null()),
});
export const featuresValidator = v.object({
  receiptProcessing: v.boolean(),
  productLookup: v.boolean(),
  automaticProductMatching: v.boolean(),
  spendingAnalysis: v.boolean(),
});
export const policySettingsValidator = v.object({
  minimum: v.union(releaseValidator, v.null()),
  recommended: v.union(releaseValidator, v.null()),
  minimumApiVersion: v.number(),
  features: featuresValidator,
  message: v.string(),
});
export const policyValidator = v.object({
  ...policySettingsValidator.fields,
  schemaVersion: v.literal(1),
  revision: v.number(),
  platform: platformValidator,
  channel: channelValidator,
});
export type ClientRelease = Infer<typeof clientValidator>;
export type ReleasePolicy = Infer<typeof policyValidator>;
export type ReleaseSettings = Infer<typeof policySettingsValidator>;
export type Feature = keyof ReleasePolicy["features"];
export type Platform = ReleasePolicy["platform"];
export type Channel = ReleasePolicy["channel"];

export function defaultPolicy(
  platform: Platform,
  channel: Channel,
): ReleasePolicy {
  return {
    schemaVersion: 1,
    revision: 0,
    platform,
    channel,
    minimum: null,
    recommended: null,
    minimumApiVersion: 0,
    message: "",
    // Existing features remain enabled. New experimental flags must default off.
    features: {
      receiptProcessing: true,
      productLookup: true,
      automaticProductMatching: true,
      spendingAnalysis: true,
    },
  };
}
function components(value: string) {
  if (!/^\d+(\.\d+){0,2}$/.test(value))
    throw new Error("Invalid release number.");
  const parts = value.split(".").map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part)))
    throw new Error("Invalid release number.");
  return [parts[0], parts[1] ?? 0, parts[2] ?? 0];
}
function compareNumber(left: string, right: string) {
  const a = components(left),
    b = components(right);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
export function compareRelease(
  left: Infer<typeof releaseValidator>,
  right: Infer<typeof releaseValidator>,
) {
  return (
    compareNumber(left.version, right.version) ||
    compareNumber(left.build, right.build)
  );
}
export function validateSettings(settings: ReleaseSettings) {
  if (
    !Number.isSafeInteger(settings.minimumApiVersion) ||
    settings.minimumApiVersion < 0 ||
    settings.message.length > 500
  )
    throw new Error("Invalid release policy.");
  for (const release of [settings.minimum, settings.recommended])
    if (release) compareRelease(release, release);
  if (
    settings.minimum &&
    (!settings.recommended ||
      compareRelease(settings.minimum, settings.recommended) > 0)
  )
    throw new Error(
      "The recommended release must be at least the minimum release.",
    );
}
export function parsePolicy(value: unknown): ReleasePolicy {
  const result = parse(policyValidator, value);
  validateSettings(result);
  if (!Number.isSafeInteger(result.revision) || result.revision < 0)
    throw new Error("Invalid policy revision.");
  return result;
}
export function updateRequirement(
  policy: ReleasePolicy,
  client?: ClientRelease,
): "required" | "recommended" | "none" {
  // Clients released before this contract declare API version zero.
  if ((client?.apiVersion ?? 0) < policy.minimumApiVersion) return "required";
  if (!client) return policy.minimum ? "required" : "none";
  if (client.channel !== policy.channel || client.platform !== policy.platform)
    return "required";
  if (client.channel === "development") return "none";
  try {
    if (policy.minimum && compareRelease(client, policy.minimum) < 0)
      return "required";
    if (policy.recommended && compareRelease(client, policy.recommended) < 0)
      return "recommended";
  } catch {
    return "required";
  }
  return "none";
}
export function updateUrl(policy: ReleasePolicy) {
  if (policy.channel === "testflight") return "itms-beta://";
  return policy.platform === "ios"
    ? "https://apps.apple.com/app/id6813602733"
    : null;
}
