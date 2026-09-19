/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { defaultPolicy } from "../src/lib/releases/policy";
import type { FeatureName } from "../src/lib/featureFlags";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.unstubAllEnvs());
it("transfers legacy values once and keeps version gates and old reads consistent", async () => {
  vi.stubEnv("RELEASE_CHANNEL", "testflight");
  const t = convexTest(schema, modules);
  const policy = defaultPolicy("ios", "testflight");
  policy.revision = 5;
  policy.minimum = { version: "1.0.0", build: "7" };
  policy.recommended = policy.minimum;
  policy.features.productLookup = false;
  await t.run((ctx) => ctx.db.insert("releasePolicies", policy));
  const before = await t.query(api.featureFlags.get, { platform: "ios" });
  expect(before.values.productLookup).toBe(false);
  expect(
    await t.mutation(internal.featureFlags.set, {
      platform: "ios",
      name: "spendingAnalysis",
      enabled: false,
      expectedRevision: 0,
      operator: "test",
      reason: "Pause analysis",
    }),
  ).toEqual({ revision: 1 });
  const after = await t.query(api.featureFlags.get, { platform: "ios" });
  expect(after.values).toMatchObject({
    productLookup: false,
    spendingAnalysis: false,
    receiptProcessing: true,
  });
  const legacy = await t.query(api.releasePolicy.get, { platform: "ios" });
  expect(legacy.minimum).toEqual(policy.minimum);
  expect(legacy.revision).toBe(6);
  expect(legacy.features).toMatchObject({
    productLookup: false,
    spendingAnalysis: false,
  });
  const stored = await t.run((ctx) => ctx.db.query("releasePolicies").unique());
  expect(stored?.features).toBeUndefined();
  expect(
    await t.run((ctx) => ctx.db.query("featureFlagHistory").collect()),
  ).toHaveLength(1);
  await expect(
    t.mutation(internal.featureFlags.set, {
      platform: "ios",
      name: "productLookup",
      enabled: true,
      expectedRevision: 0,
      operator: "test",
      reason: "Stale",
    }),
  ).rejects.toThrow("Flags changed");
  await expect(
    t.mutation(internal.featureFlags.set, {
      platform: "ios",
      name: "unknown" as FeatureName,
      enabled: true,
      expectedRevision: 1,
      operator: "test",
      reason: "Unknown",
    }),
  ).rejects.toThrow();
  expect(
    (await t.query(api.featureFlags.get, { platform: "android" })).values
      .productLookup,
  ).toBe(true);
  expect(
    await t.query(internal.featureFlags.enabled, { name: "productLookup" }),
  ).toBe(false);
  vi.stubEnv("RELEASE_CHANNEL", "development");
  expect(
    (await t.query(api.featureFlags.get, { platform: "ios" })).values
      .productLookup,
  ).toBe(true);
});
it("routes old operator writes into the one flag store", async () => {
  const t = convexTest(schema, modules);
  const original = await t.query(api.releasePolicy.get, { platform: "ios" });
  await t.mutation(internal.featureFlags.set, {
    platform: "ios",
    name: "productLookup",
    enabled: false,
    expectedRevision: 0,
    operator: "test",
    reason: "Pause",
  });
  await expect(
    t.mutation(internal.releasePolicy.configure, {
      platform: "ios",
      settings: {
        minimum: null,
        recommended: null,
        minimumApiVersion: 0,
        message: "",
        features: original.features,
      },
      expectedRevision: original.revision,
      operator: "test",
      reason: "Old stale settings",
      replacementAvailable: false,
    }),
  ).rejects.toThrow("Policy changed");
  const current = await t.query(api.releasePolicy.get, { platform: "ios" });
  const { minimum, recommended, minimumApiVersion, message, features } =
    current;
  await t.mutation(internal.releasePolicy.configure, {
    platform: "ios",
    settings: {
      minimum,
      recommended,
      minimumApiVersion,
      message,
      features: { ...features, receiptProcessing: false },
    },
    expectedRevision: current.revision,
    operator: "test",
    reason: "Legacy adapter",
    replacementAvailable: false,
  });
  expect(
    (await t.query(api.featureFlags.get, { platform: "ios" })).values,
  ).toMatchObject({ receiptProcessing: false, productLookup: false });
});
