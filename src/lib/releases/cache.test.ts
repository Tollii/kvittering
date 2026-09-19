import { expect, it, vi } from "vitest";
import { cachePolicy, readCachedPolicy } from "./cache";
import { defaultFeatureFlags } from "../featureFlags";
import {
  defaultPolicy,
  parsePolicy,
  parseVersionPolicy,
  updateRequirement,
} from "./policy";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("expo-sqlite/kv-store", () => ({
  default: {
    getItemSync: (key: string) => storage.get(key) ?? null,
    setItemSync: (key: string, value: string) => storage.set(key, value),
  },
}));
vi.mock("../deployment-storage", () => ({ storageSuffix: "-test" }));
vi.mock("./client", () => ({
  installedRelease: { platform: "ios", channel: "testflight" },
}));

it("retains update requirements and disabled flags for an older client after rollback", () => {
  const policy = parseVersionPolicy({
    ...defaultPolicy("ios", "testflight"),
    revision: 3,
    minimumApiVersion: 2,
  });
  const flags = { ...defaultFeatureFlags(), productLookup: false };
  cachePolicy(policy, 100, flags);
  const saved = JSON.parse(
    storage.get("release-policy-v1-test:testflight:ios")!,
  );
  const legacy = parsePolicy(saved.policy);
  expect(updateRequirement(legacy)).toBe("required");
  expect(legacy.features.productLookup).toBe(false);
  expect(readCachedPolicy()).toEqual({ policy, fetchedAt: 100 });
  expect(policy).not.toHaveProperty("features");
  expect(flags.productLookup).toBe(false);
});
