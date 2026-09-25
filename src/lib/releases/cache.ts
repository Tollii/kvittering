import Storage from "expo-sqlite/kv-store";
import { z } from "zod";
import { storageSuffix } from "../deployment-storage";
import {
  parseVersionPolicy,
  type ClientRelease,
  type VersionPolicy,
} from "./policy";
import { legacyFeatures, type FeatureFlags } from "../featureFlags";

/** The policy itself is parsed by its owner; this checks the cache envelope. */
const cachedPolicy = z.object({
  policy: z.unknown(),
  fetchedAt: z.number().nonnegative(),
});

/** Policy storage for one installed release; each channel and platform keeps its own entry. */
export function releasePolicyCache(
  release: Pick<ClientRelease, "channel" | "platform">,
) {
  const prefix = `release-policy-v1${storageSuffix}:${release.channel}:${release.platform}`;

  function readCachedPolicy():
    { policy: VersionPolicy; fetchedAt: number } | undefined {
    try {
      const raw = cachedPolicy.safeParse(
        JSON.parse(Storage.getItemSync(prefix) ?? "null"),
      );

      if (!raw.success) return;
      const policy = parseVersionPolicy(raw.data.policy);

      if (
        policy.channel !== release.channel ||
        policy.platform !== release.platform
      )
        return;

      return { policy, fetchedAt: Math.min(raw.data.fetchedAt, Date.now()) };
    } catch {
      return;
    }
  }

  function cachePolicy(
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

  function dismissedUntil(version: string): number {
    try {
      return Number(Storage.getItemSync(`${prefix}:reminder:${version}`)) || 0;
    } catch {
      return 0;
    }
  }

  function dismissUpdate(version: string, until: number) {
    try {
      Storage.setItemSync(`${prefix}:reminder:${version}`, String(until));
    } catch {
      /* Dismissal still applies for this session. */
    }
  }

  return { readCachedPolicy, cachePolicy, dismissedUntil, dismissUpdate };
}
