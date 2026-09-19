import { expect, it } from "vitest";
import { deploymentStorageSuffix } from "./deployment-storage";

it("retains personal storage and separates staging sessions, queues, and caches", () => {
  const personal = deploymentStorageSuffix(
    "https://agile-falcon-148.eu-west-1.convex.cloud/",
  );

  const staging = deploymentStorageSuffix(
    "https://courteous-jay-215.eu-west-1.convex.cloud",
  );

  expect(personal).toBe("");
  expect(staging).not.toBe(personal);
  expect(staging).toMatch(/^[-a-z0-9.]+$/);
  expect(
    deploymentStorageSuffix(
      "https://courteous-jay-215.eu-west-1.convex.cloud/",
    ),
  ).toBe(staging);
});
