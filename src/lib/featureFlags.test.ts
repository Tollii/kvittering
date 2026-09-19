import { expect, it } from "vitest";
import {
  defaultFeatureFlags,
  parseFeatureFlags,
  parseFeatureFlagSnapshot,
} from "./featureFlags";

it("defaults missing flags, ignores future keys, and preserves configured false values", () => {
  const input = { productLookup: false, futureFlag: { enabled: true } };
  const before = structuredClone(input);
  expect(parseFeatureFlags(input)).toEqual({
    ...defaultFeatureFlags(),
    productLookup: false,
  });
  expect(input).toEqual(before);
  expect(() => parseFeatureFlags({ productLookup: "false" })).toThrow(Error);
  expect(() => parseFeatureFlags({ productLookup: undefined })).toThrow(Error);
});

it("validates deployment and platform fallback without a freshness expiry", () => {
  const scope = { platform: "ios" as const, channel: "testflight" as const };
  const snapshot = { ...scope, revision: 4, values: { productLookup: false } };
  expect(parseFeatureFlagSnapshot(snapshot, scope).values.productLookup).toBe(
    false,
  );
  expect(() =>
    parseFeatureFlagSnapshot(snapshot, { ...scope, platform: "android" }),
  ).toThrow(Error);
  expect(() =>
    parseFeatureFlagSnapshot(snapshot, { ...scope, channel: "development" }),
  ).toThrow(Error);
  expect(() =>
    parseFeatureFlagSnapshot({ ...snapshot, revision: -1 }, scope),
  ).toThrow(Error);
});
