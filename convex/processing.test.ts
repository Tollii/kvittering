/// <reference types="vite/client" />
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { register as registerWorkflow } from "@convex-dev/workflow/test";
import type { WorkflowId } from "@convex-dev/workflow";
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { sharedHousehold } from "../src/lib/testing/households";
import { date } from "../src/lib/testing/calendar";
import { Ore } from "../src/lib/domain/ore";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => vi.useRealTimers());

async function setup() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  registerWorkflow(t);

  return { t, ...(await sharedHousehold(t)) };
}

const purchase = {
  store: "Torghandel",
  purchaseDate: date("2026-10-10"),
  totalOre: Ore.of(15000),
  lines: [],
};

it("finds a duplicate several pages back while reading the receipt", async () => {
  const { t, first, householdId } = await setup();

  const original = await first.mutation(api.manualPurchases.add, {
    clientId: "duplicate-search-original",
    householdId,
    purchase,
  });

  await t.finishAllScheduledFunctions(vi.runAllTimers);

  // Later purchases from another store on the same day push the original past the first page.
  await t.run(async (ctx) => {
    const { _id, _creationTime, ...template } = (await ctx.db.get(
      "receipts",
      original,
    ))!;

    for (let index = 0; index < 150; index++)
      await ctx.db.insert("receipts", {
        ...template,
        clientId: `same-day-${index}`,
        data: { ...template.data!, store: `Butikk ${index}` },
      });
  });

  const id = await first.mutation(api.manualPurchases.add, {
    clientId: "duplicate-search-repeat",
    householdId,
    purchase,
  });

  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.run((ctx) => ctx.db.get("receipts", id))).toMatchObject({
    status: "needs_review",
    duplicateOf: original,
  });
});

it.each([
  { kind: "failed", error: "step failed" },
  { kind: "canceled" },
  // The run ended without finishing or failing the receipt.
  { kind: "success", returnValue: null },
] as const)(
  "fails a receipt that a $kind reading run left being read",
  async (result) => {
    const { t, first, householdId } = await setup();

    const reserve = (clientId: string) =>
      first.mutation(api.receipts.reserve, {
        householdId,
        clientId,
        imageCount: 1,
      });

    const current = await reserve("stuck-reading-current");
    const retried = await reserve("stuck-reading-retried");

    await t.run(async (ctx) => {
      await ctx.db.patch("receipts", current, {
        status: "processing",
        generation: 1,
      });
      // A retry started a newer reading run before the old one ended.
      await ctx.db.patch("receipts", retried, {
        status: "processing",
        generation: 2,
      });
    });

    for (const receiptId of [current, retried])
      await t.mutation(internal.retention.workflowCompleted, {
        // SAFETY: The callback only stores the ID; no workflow is read.
        workflowId: `reading-${receiptId}` as WorkflowId,
        result,
        context: { component: "processing", receiptId, readGeneration: 1 },
      });

    expect(await t.run((ctx) => ctx.db.get("receipts", current))).toMatchObject(
      { status: "failed", error: "Behandlingen mislyktes." },
    );
    expect(await t.run((ctx) => ctx.db.get("receipts", retried))).toMatchObject(
      { status: "processing", generation: 2 },
    );
  },
);
