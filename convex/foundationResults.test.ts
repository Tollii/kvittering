/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { batteryFixture } from "../src/lib/domain/receipt";
import { prepareFoundationResult } from "./foundationResults";
import type { FoundationResult } from "../src/lib/domain/processing-engine";
const modules = import.meta.glob("./**/*.ts");
function result(): FoundationResult {
  const data = batteryFixture();
  return {
    extraction: JSON.stringify({
      ...data,
      issues: [],
      lines: data.lines.map((line) => ({
        ...line,
        issues: [],
        sourceImages: [1],
        overlapUncertain: false,
      })),
    }),
    classifications: data.lines
      .filter((line) => line.kind === "product")
      .map((line) => ({
        id: line.id,
        categoryId: "drinks.energy-drinks",
        uncertain: false,
      })),
    durationMs: 1500,
    systemVersion: "27.0",
  };
}
it("validates local extraction and categories while retaining OCR evidence and amounts", () => {
  const prepared = prepareFoundationResult(result(), 1);
  expect(prepared.original.originalText).toBe(batteryFixture().originalText);
  expect(prepared.data.totalOre).toBe(batteryFixture().totalOre);
  expect(prepared.data.lines[0].categoryId).toBe("drinks.energy-drinks");
  expect(prepared.original.lines[0].categoryId).toBe("fallback.unclear");
  expect(() =>
    prepareFoundationResult({ ...result(), classifications: [] }, 1),
  ).toThrow("mangler");
  expect(() =>
    prepareFoundationResult(
      {
        ...result(),
        classifications: [
          { ...result().classifications[0], categoryId: "invented" },
        ],
      },
      1,
    ),
  ).toThrow();
});
it("accepts only the selected engine, checks ownership, and keeps repeated readings separate from edits", async () => {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({
    subject: "first",
    issuer: "https://test.local",
  });
  const other = t.withIdentity({
    subject: "other",
    issuer: "https://test.local",
  });
  const householdId = await user.mutation(api.households.create, {
    name: "First",
    invitation: "11111111111111111111111111111111",
  });
  await other.mutation(api.households.create, {
    name: "Other",
    invitation: "22222222222222222222222222222222",
  });
  const id = await user.mutation(api.receipts.reserve, {
    householdId,
    clientId: "foundation-test-0001",
    imageCount: 1,
    processingEngine: "foundation",
  });
  await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["receipt"]));
    await ctx.db.insert("images", {
      receiptId: id,
      position: 0,
      storageId,
      sha256: "test",
    });
  });
  await expect(
    other.mutation(api.receipts.completeUpload, {
      id,
      foundationResult: result(),
    }),
  ).rejects.toThrow("ikke tilgjengelig");
  await expect(
    user.mutation(api.receipts.completeUpload, { id }),
  ).rejects.toThrow("Mangler");
  await user.mutation(api.receipts.completeUpload, {
    id,
    foundationResult: result(),
  });
  await user.mutation(api.receipts.completeUpload, {
    id,
    foundationResult: result(),
  });
  const first = await user.query(api.receipts.detail, { id });
  expect(first.extractions).toHaveLength(1);
  expect(first.extractions[0].classifiedData?.lines[0].categoryId).toBe(
    "drinks.energy-drinks",
  );
  expect(first.receipt.processingEngine).toBe("foundation");
  await expect(user.mutation(api.receipts.retry, { id })).rejects.toThrow(
    "på enheten",
  );
  const edited = { ...first.receipt.data!, branch: "Manual correction" };
  await t.run((ctx) =>
    ctx.db.patch("receipts", id, { data: edited, revision: 1 }),
  );
  await expect(
    user.mutation(api.receipts.reprocessFoundation, {
      id,
      revision: 0,
      generation: 1,
      result: result(),
    }),
  ).rejects.toThrow("endret");
  await user.mutation(api.receipts.reprocessFoundation, {
    id,
    revision: 1,
    generation: 1,
    result: result(),
  });
  const second = await user.query(api.receipts.detail, { id });
  expect(second.receipt.data?.branch).toBe("Manual correction");
  expect(second.extractions).toHaveLength(2);
  expect(second.extractions[0].durationMs).toBe(1500);
});
