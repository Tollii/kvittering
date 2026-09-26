import { z } from "zod";
import { expect, it, vi } from "vitest";
import { releasePolicyCache } from "./cache";
import { storageSuffix } from "../deployment-storage";
import { defaultFeatureFlags } from "../featureFlags";
import {
  defaultPolicy,
  parsePolicy,
  parseVersionPolicy,
  updateRequirement,
} from "./policy";

const storage = vi.hoisted(() => new Map<string, string>());

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace the native expo-sqlite key-value store with an in-memory map.
vi.mock("expo-sqlite/kv-store", () => ({
  default: {
    getItemSync: (key: string) => storage.get(key) ?? null,
    setItemSync: (key: string, value: string) => storage.set(key, value),
  },
}));

const { cachePolicy, readCachedPolicy } = releasePolicyCache({
  platform: "ios",
  channel: "testflight",
});

it("retains update requirements and disabled flags for an older client after rollback", () => {
  const policy = parseVersionPolicy({
    ...defaultPolicy("ios", "testflight"),
    revision: 3,
    minimumApiVersion: 2,
  });

  const flags = { ...defaultFeatureFlags(), productLookup: false };
  cachePolicy(policy, 100, flags);

  const saved = z
    .object({ policy: z.unknown() })
    .parse(
      JSON.parse(
        storage.get(`release-policy-v1${storageSuffix}:testflight:ios`)!,
      ),
    );

  const legacy = parsePolicy(saved.policy);
  expect(updateRequirement(legacy)).toBe("required");
  expect(legacy.features.productLookup).toBe(false);
  expect(readCachedPolicy()).toEqual({ policy, fetchedAt: 100 });
  expect(policy).not.toHaveProperty("features");
  expect(flags.productLookup).toBe(false);
});
