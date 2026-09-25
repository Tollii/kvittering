import { describe, expect, it } from "vitest";
import { requiresNativeFlows } from "./change-areas.mjs";

describe("required native verification", () => {
  it.each([
    "src/features/sign-in.tsx",
    "src/features/session.tsx",
    "src/lib/receipt-draft-storage.ts",
    "src/lib/receipt-migrations.ts",
    "src/lib/upload-queue.ts",
    "src/lib/releases/policy.ts",
    "src/app/_layout.tsx",
    "convex/auth.ts",
    "convex/receipts.ts",
    "convex/releasePolicy.ts",
    "convex/schema.ts",
    "convex/clientFunctions.ts",
    "src/lib/domain/receipt-images.ts",
    "src/lib/featureFlags.ts",
    "package-lock.json",
    ".maestro/reviewed-receipts/draft-recovery.yaml",
  ])("requires device journeys for %s, including deleted paths", (path) => {
    expect(requiresNativeFlows([path])).toBe(true);
  });

  it("does not spend native minutes for documentation or isolated unit tests", () => {
    expect(
      requiresNativeFlows([
        "docs/verification.md",
        "src/lib/receipt-draft.test.ts",
      ]),
    ).toBe(false);
    expect(requiresNativeFlows(["docs/verification.md"], true)).toBe(true);
  });
});
