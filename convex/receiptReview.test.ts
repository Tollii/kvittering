import {
  decideReceiptChange,
  commitReceiptChange,
  type ReceiptChangeOrigin,
} from "./receiptChanges";
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { batteryFixture, validateReceipt } from "../src/lib/domain/receipt";
const modules = import.meta.glob("./**/*.ts");
it("keeps unresolved extraction issues, mismatches, duplicates and mock results in review", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({
    subject: "reviewer",
    issuer: "https://test.local",
  });
  const householdId = await user.mutation(api.households.create, {
    name: "Home",
    invitation: "0123456789abcdef0123456789abcdef",
  });
  let previousId: Id<"receipts"> | undefined;
  for (const scenario of ["issue", "mismatch", "duplicate", "mock", "clean"]) {
    const id = await user.mutation(api.receipts.reserve, {
      clientId: `review-policy-${scenario}`,
      imageCount: 1,
      householdId,
    });
    await t.run((ctx) =>
      ctx.db.patch("receipts", id, {
        status: "processing",
        generation: 1,
        ...(scenario === "duplicate" ? { duplicateOf: previousId } : {}),
      }),
    );
    const data = batteryFixture();
    if (scenario === "issue")
      data.lines[0].issues.push("Varenavnet er usikkert.");
    if (scenario === "mismatch") data.totalOre! += 100;
    await t.mutation(internal.processing.finish, {
      id,
      generation: 1,
      data,
      original: data,
      provider: scenario === "mock" ? "mock" : "test",
    });
    const receipt = (await user.query(api.receipts.detail, { id }))!.receipt;
    expect(receipt.status).toBe(
      scenario === "clean" ? "reviewed" : "needs_review",
    );
    expect(receipt.autoAccepted).toBe(scenario === "clean");
    if (scenario === "issue") {
      data.lines[0].issues = [];
      await user.mutation(api.receipts.save, {
        id,
        revision: 0,
        data,
        reviewed: false,
        rememberLineIds: [],
        duplicateResolved: false,
        excluded: false,
      });
      expect(
        (await user.query(api.receipts.detail, { id }))!.receipt.status,
      ).toBe("reviewed");
    }
    previousId = id;
  }
});

it.each([
  "human",
  "alias",
  "correction",
  "undo",
  "catalog",
  "extraction",
] as const)("applies the %s policy without changing input", (kind) => {
  const origin: ReceiptChangeOrigin =
    kind === "human"
      ? { kind, editor: "person", reviewed: true }
      : kind === "extraction"
        ? { kind, provider: "reader", next: "analysis" }
        : kind === "catalog"
          ? { kind }
          : { kind, editor: "person" };
  const previous = {
    revision: 0,
    status: "needs_review" as const,
    provider: "reader",
  };
  const data = validateReceipt(batteryFixture());
  const before = structuredClone(data);
  const result = decideReceiptChange({
    previous,
    data,
    unresolvedDuplicate: false,
    origin,
  });
  expect(result.revision).toBe(kind === "extraction" ? 0 : 1);
  expect(result.status).toBe(kind === "undo" ? "needs_review" : "reviewed");
  expect(data).toEqual(before);
});

it("rejects stale commits without data or history changes and returns a small save acknowledgement", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({
    subject: "person",
    issuer: "https://test.local",
  });
  const householdId = await user.mutation(api.households.create, {
    name: "Home",
    invitation: "0123456789abcdef0123456789abcdef",
  });
  const id = await user.mutation(api.receipts.reserve, {
    householdId,
    clientId: "policy-test-0001",
    imageCount: 1,
  });
  const data = batteryFixture();
  await t.run((ctx) =>
    ctx.db.patch("receipts", id, { data, status: "needs_review" }),
  );
  const acknowledgement = await user.mutation(api.receipts.save, {
    id,
    revision: 0,
    data,
    reviewed: true,
    rememberLineIds: [],
    duplicateResolved: false,
    excluded: false,
  });
  expect(acknowledgement).toEqual({ receiptId: id, revision: 1 });
  await expect(
    t.run((ctx) =>
      commitReceiptChange(ctx, {
        receiptId: id,
        expected: { revision: 0, generation: 0 },
        data,
        origin: { kind: "undo", editor: "person" },
      }),
    ),
  ).rejects.toThrow("endret");
  expect(
    (await t.run((ctx) => ctx.db.query("revisions").take(10))).length,
  ).toBe(1);
  expect(
    (await user.query(api.receipts.detail, { id }))!.receipt.revision,
  ).toBe(1);
});
