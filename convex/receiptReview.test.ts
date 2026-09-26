import type { CalendarDate } from "../src/lib/domain/calendar";
import { present } from "../src/lib/testing/receipts";
import { Ore } from "../src/lib/domain/ore";
/// <reference types="vite/client" />
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import {
  decideReceiptChange,
  commitReceiptChange,
  type ReceiptChangeOrigin,
} from "./receiptChanges";
import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { validateReceipt } from "../src/lib/domain/receipt";
import { batteryFixture } from "../src/lib/mock-receipts";
import { quickApproveData } from "../src/lib/domain/receipt-review";

const modules = import.meta.glob("./**/*.ts");

it("keeps unresolved extraction issues, mismatches, duplicates and mock results in review", async () => {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);

  const user = t.withIdentity({
    subject: "reviewer",
    issuer: "https://test.local",
  });

  const householdId = await user.mutation(api.households.create, {
    name: "Home",
    invitation: "0123456789abcdef0123456789abcdef",
  });

  let previousId: Id<"receipts"> | undefined;

  for (const scenario of [
    "issue",
    "category",
    "mismatch",
    "duplicate",
    "mock",
    "clean",
  ]) {
    const id = await user.mutation(api.receipts.reserve, {
      clientId: `review-policy-${scenario}`,
      imageCount: 1,
      householdId,
    });

    await t.run((ctx) =>
      ctx.db.patch("receipts", id, {
        status: "processing",
        generation: 1,
        duplicateOf: scenario === "duplicate" ? previousId : undefined,
      }),
    );
    const data = batteryFixture();

    if (scenario === "issue")
      present(data.lines[0]).issues.push("Varenavnet er usikkert.");

    if (scenario === "category") {
      present(data.lines[0]).issues = ["Kategorien er usikker."];
      present(data.lines[0]).confidence = 0.3;
      present(data.lines[0]).manual = false;
    }

    if (scenario === "mismatch")
      data.totalOre = Ore.add(data.totalOre!, Ore.of(100));
    await t.mutation(internal.processing.finish, {
      id,
      generation: 1,
      data,
      original: data,
      provider: scenario === "mock" ? "mock" : "test",
    });
    const receipt = (await user.query(api.receipts.detail, { id }))!.receipt;
    expect(receipt.status).toBe(
      ["clean", "category"].includes(scenario) ? "reviewed" : "needs_review",
    );
    expect(receipt.autoAccepted).toBe(["clean", "category"].includes(scenario));

    if (scenario === "issue") {
      present(data.lines[0]).issues = [];
      await user.mutation(api.receipts.save, {
        id,
        revision: 0,
        data,
        reviewed: false,
        rememberLineIds: [],
        duplicateResolved: false,
        excluded: false,
      });
    }

    expect(
      (await user.query(api.receipts.detail, { id }))!.receipt.status,
    ).toBe(
      ["issue", "clean", "category"].includes(scenario)
        ? "reviewed"
        : "needs_review",
    );
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
  registerRateLimiter(t);

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
  expect(await t.run((ctx) => ctx.db.query("revisions").take(10))).toHaveLength(
    1,
  );
  expect(
    (await user.query(api.receipts.detail, { id }))!.receipt.revision,
  ).toBe(1);
});

it("returns a readable rejection for an impossible date without saving", async () => {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);

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
    clientId: "invalid-date-0001",
    imageCount: 1,
  });

  const data = batteryFixture();
  await t.run((ctx) =>
    ctx.db.patch("receipts", id, { data, status: "needs_review" }),
  );

  await expect(
    user.mutation(api.receipts.save, {
      id,
      revision: 0,
      // SAFETY: A client can send any string; the mutation must reject it.
      data: { ...data, purchaseDate: "2026-13-01" as CalendarDate },
      reviewed: false,
      rememberLineIds: [],
      duplicateResolved: false,
      excluded: false,
    }),
  ).rejects.toMatchObject({
    data: { code: "REJECTED", message: "Ugyldig dato." },
  });
  expect(
    (await user.query(api.receipts.detail, { id }))!.receipt,
  ).toMatchObject({ revision: 0, data: { purchaseDate: data.purchaseDate } });
});

it("persists category uncertainty in the representation understood by installed editors", async () => {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  const user = t.withIdentity({ subject: "legacy-reviewer", issuer: "test" });

  const householdId = await user.mutation(api.households.create, {
    name: "Home",
    invitation: "0123456789abcdef0123456789abcdef",
  });

  const id = await user.mutation(api.receipts.reserve, {
    householdId,
    clientId: "legacy-category-001",
    imageCount: 1,
  });

  const data = batteryFixture();
  present(data.lines[0]).issues = ["category_uncertain"];
  present(data.lines[0]).confidence = 0.3;
  present(data.lines[0]).manual = false;
  await t.run((ctx) =>
    commitReceiptChange(ctx, {
      receiptId: id,
      expected: { revision: 0, generation: 0 },
      data,
      origin: { kind: "extraction", provider: "test", next: "none" },
    }),
  );
  const receipt = (await user.query(api.receipts.detail, { id }))!.receipt;
  expect(receipt.status).toBe("reviewed");
  expect(receipt.data!.lines[0]).toMatchObject({
    issues: ["Kategorien er usikker."],
    confidence: 0.3,
    manual: false,
  });
  expect(present(data.lines[0]).issues).toEqual(["category_uncertain"]);

  const approved = quickApproveData(receipt.data, false);
  expect(approved).not.toBeNull();
  await user.mutation(api.receipts.save, {
    id,
    revision: receipt.revision,
    data: approved!,
    reviewed: true,
    rememberLineIds: [],
    duplicateResolved: false,
    excluded: false,
  });
  const saved = (await user.query(api.receipts.detail, { id }))!.receipt;
  expect(saved.data!.lines[0]).toMatchObject({
    issues: ["Kategorien er usikker."],
    confidence: 0.3,
    manual: false,
  });
  expect(await t.run((ctx) => ctx.db.query("aliases").collect())).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("corrections").collect())).toEqual(
    [],
  );
});
