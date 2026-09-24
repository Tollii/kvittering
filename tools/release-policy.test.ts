import { describe, expect, it } from "vitest";
import {
  requireDeploymentKey,
  requireReadModel,
  requireRecoveryClient,
  requireReleaseStage,
} from "./release-policy.mjs";

const availability = {
  deployment: "courteous-jay-215",
  recoveryClient: {
    build: "12",
    sourceCommit: "a".repeat(40),
    verifiedAt: "2026-09-24T12:00:00Z",
    verifiedBy: "Andreas",
    evidence: "https://appstoreconnect.apple.com/apps/6813602733/testflight",
    availableToTesters: true,
    pendingUploadUpgradePassed: true,
  },
};

describe("release admission", () => {
  it("refuses initial deployment from five-image source", () => {
    expect(() => requireReleaseStage("additive", 5)).toThrow("eight-image");
    expect(() => requireReleaseStage("additive", 8)).not.toThrow();
    expect(() => requireReleaseStage("enforcement", 5)).not.toThrow();
    expect(() => requireReleaseStage(undefined, 5)).toThrow("Select");
  });
  it.each([
    undefined,
    "",
    "prod:other-deployment|redacted",
    "prod:courteous-jay-215|",
  ])("rejects an absent or incorrect deployment credential", (key) => {
    expect(() => requireDeploymentKey(key)).toThrow("staging deploy key");
  });
  it("accepts only the designated staging key", () => {
    expect(() =>
      requireDeploymentKey("prod:courteous-jay-215|redacted-test-value"),
    ).not.toThrow();
  });
  it.each([false, null, "true", {}])(
    "does not treat %j as completed backfill",
    (ready) => {
      expect(() => requireReadModel(JSON.stringify(ready))).toThrow(
        "not ready",
      );
    },
  );
  it("allows an explicitly ready read model", () =>
    expect(() => requireReadModel("true")).not.toThrow());
  it("blocks enforcement until a recovery client is verified", () => {
    expect(() =>
      requireRecoveryClient(
        JSON.stringify({
          deployment: availability.deployment,
          recoveryClient: null,
        }),
      ),
    ).toThrow("recovery-client");
    expect(() =>
      requireRecoveryClient(
        JSON.stringify(availability),
        Date.parse("2026-09-25T00:00:00Z"),
      ),
    ).not.toThrow();
  });
  it.each([
    { ...availability, deployment: "other" },
    {
      ...availability,
      recoveryClient: {
        ...availability.recoveryClient,
        availableToTesters: false,
      },
    },
    {
      ...availability,
      recoveryClient: {
        ...availability.recoveryClient,
        pendingUploadUpgradePassed: false,
      },
    },
    {
      ...availability,
      recoveryClient: {
        ...availability.recoveryClient,
        verifiedAt: "2099-01-01T00:00:00Z",
      },
    },
  ])("rejects incomplete or mismatched release evidence", (record) => {
    expect(() =>
      requireRecoveryClient(
        JSON.stringify(record),
        Date.parse("2026-09-25T00:00:00Z"),
      ),
    ).toThrow("recovery-client");
  });
});
