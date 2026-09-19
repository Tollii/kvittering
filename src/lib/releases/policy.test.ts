import { describe, expect, it } from "vitest";
import {
  compareRelease,
  defaultPolicy,
  parsePolicy,
  updateRequirement,
  validateSettings,
  type ClientRelease,
} from "./policy";

const client: ClientRelease = {
  platform: "ios",
  channel: "testflight",
  version: "1.0.0",
  build: "10",
  apiVersion: 1,
  updateId: null,
  runtimeVersion: null,
};

describe("release compatibility", () => {
  it("compares numeric components, with app version preceding build number", () => {
    expect(
      compareRelease(
        { version: "1.10.0", build: "1" },
        { version: "1.9.0", build: "999" },
      ),
    ).toBeGreaterThan(0);
    expect(
      compareRelease(client, { version: "1.0.0", build: "9" }),
    ).toBeGreaterThan(0);
  });
  it("preserves legacy clients by default and distinguishes reminders from required updates", () => {
    const policy = defaultPolicy("ios", "testflight");
    expect(updateRequirement(policy)).toBe("none");
    policy.recommended = { version: "1.1.0", build: "11" };
    expect(updateRequirement(policy, client)).toBe("recommended");
    policy.minimum = { version: "1.0.0", build: "10" };
    expect(updateRequirement(policy, client)).toBe("recommended");
    policy.minimum = policy.recommended;
    expect(updateRequirement(policy, client)).toBe("required");
    expect(updateRequirement(policy)).toBe("required");
  });
  it("requires compatible API contracts even during local development", () => {
    const policy = {
      ...defaultPolicy("ios", "development"),
      minimumApiVersion: 2,
    };

    expect(
      updateRequirement(policy, { ...client, channel: "development" }),
    ).toBe("required");
  });
  it("restores restrictions from a valid cached policy and accepts an operator rollback with a new revision", () => {
    const policy = {
      ...defaultPolicy("ios", "testflight"),
      minimumApiVersion: 2,
      revision: 5,
    };

    expect(
      updateRequirement(
        parsePolicy(JSON.parse(JSON.stringify(policy))),
        client,
      ),
    ).toBe("required");
    expect(
      updateRequirement(
        parsePolicy({ ...policy, revision: 6, minimumApiVersion: 1 }),
        client,
      ),
    ).toBe("none");
  });
  it("ignores unknown fields, rejects invalid policies, and refuses cross-channel use", () => {
    const policy = defaultPolicy("ios", "testflight");
    expect(
      parsePolicy({
        ...policy,
        future: true,
        features: { ...policy.features, futureFlag: true },
      }),
    ).toEqual(policy);
    expect(() => parsePolicy({ ...policy, schemaVersion: 2 })).toThrow(Error);
    expect(() =>
      validateSettings({ ...policy, minimumApiVersion: NaN }),
    ).toThrow(Error);
    expect(() =>
      validateSettings({
        ...policy,
        minimum: { version: "1.0.0", build: "11" },
      }),
    ).toThrow(Error);
    expect(
      updateRequirement(policy, { ...client, channel: "production" }),
    ).toBe("required");
  });
});
