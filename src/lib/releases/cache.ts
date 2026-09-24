import Storage from "expo-sqlite/kv-store";
import { z } from "zod";
import { storageSuffix } from "../deployment-storage";
import { installedRelease } from "./client";
import { parseVersionPolicy, type VersionPolicy } from "./policy";
import { legacyFeatures, type FeatureFlags } from "../featureFlags";

/** The policy itself is parsed by its owner; this checks the cache envelope. */
const cachedPolicy = z.object({
  policy: z.unknown(),
  fetchedAt: z.number().nonnegative(),
});

const prefix = `release-policy-v1${storageSuffix}:${installedRelease.channel}:${installedRelease.platform}`;

export function readCachedPolicy():
  { policy: VersionPolicy; fetchedAt: number } | undefined {
  try {
    const raw = cachedPolicy.safeParse(
      JSON.parse(Storage.getItemSync(prefix) ?? "null"),
    );

    if (!raw.success) return;
    const policy = parseVersionPolicy(raw.data.policy);

    if (
      policy.channel !== installedRelease.channel ||
      policy.platform !== installedRelease.platform
    )
      return;

    return { policy, fetchedAt: Math.min(raw.data.fetchedAt, Date.now()) };
  } catch {
    return;
  }
}

export function cachePolicy(
  policy: VersionPolicy,
  fetchedAt: number,
  flags: FeatureFlags,
) {
  try {
    // Older OTA clients must still parse a confirmed update requirement after rollback.
    Storage.setItemSync(
      prefix,
      JSON.stringify({
        policy: { ...policy, features: legacyFeatures(flags) },
        fetchedAt,
      }),
    );
  } catch {
    /* Memory remains available when storage is full. */
  }
}

export function dismissedUntil(release: string): number {
  try {
    return Number(Storage.getItemSync(`${prefix}:reminder:${release}`)) || 0;
  } catch {
    return 0;
  }
}

export function dismissUpdate(release: string, until: number) {
  try {
    Storage.setItemSync(`${prefix}:reminder:${release}`, String(until));
  } catch {
    /* Dismissal still applies for this session. */
  }
}
