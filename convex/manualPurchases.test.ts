/// <reference types="vite/client" />
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { register } from "@convex-dev/workflow/test";
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { sharedHousehold } from "../src/lib/testing/households";
import { date } from "../src/lib/testing/calendar";
import { Ore } from "../src/lib/domain/ore";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.useRealTimers();
});

async function setup() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  register(t);

  return { t, ...(await sharedHousehold(t)) };
}

const purchase = {
  store: "  Torghandel  ",
  purchaseDate: date("2026-10-10"),
  totalOre: Ore.of(15000),
};

it("records a typed purchase once and reads it through the receipt rules", async () => {
  const { t, first, second, householdId } = await setup();

  const request = {
    clientId: "manual-purchase-0001",
    householdId,
    purchase: {
      ...purchase,
      lines: [
        { name: "Epler", amountOre: Ore.of(6000) },
        { name: "Poteter", amountOre: Ore.of(9000) },
      ],
    },
  };

  const id = await first.mutation(api.manualPurchases.add, request);

  // A retry after a lost answer finds the same purchase.
  expect(await first.mutation(api.manualPurchases.add, request)).toBe(id);
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const detail = await second.query(api.receipts.detail, { id });
  expect(detail!.images).toEqual([]);
  expect(detail!.receipt).toMatchObject({
    imageCount: 0,
    status: "reviewed",
    data: {
      store: "Torghandel",
      purchaseDate: "2026-10-10",
      totalOre: 15000,
      currency: "NOK",
      lines: [
        { kind: "product", name: "Epler", amountOre: 6000, manual: false },
        { kind: "product", name: "Poteter", amountOre: 9000, manual: false },
      ],
    },
  });

  // With no images to read, a retry reads the typed purchase again.
  await first.mutation(api.receipts.retry, { id });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.run((ctx) => ctx.db.get("receipts", id))).toMatchObject({
    generation: 2,
    data: { store: "Torghandel", totalOre: 15000 },
  });

  // Deleting the purchase takes the typed evidence with it.
  const { revision } = (await t.run((ctx) => ctx.db.get("receipts", id)))!;
  await first.mutation(api.receipts.remove, { id, revision });
  expect(
    await t.run((ctx) => ctx.db.query("receiptImports").collect()),
  ).toEqual([]);
});

it("keeps a purchase whose lines do not add up for review", async () => {
  const { t, first, householdId } = await setup();

  const id = await first.mutation(api.manualPurchases.add, {
    clientId: "manual-purchase-0002",
    householdId,
    purchase: {
      ...purchase,
      lines: [{ name: "Epler", amountOre: Ore.of(6000) }],
    },
  });

  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.run((ctx) => ctx.db.get("receipts", id))).toMatchObject({
    status: "needs_review",
  });
});

it("records a purchase without lines as one unspecified line for the paid amount", async () => {
  const { t, first, householdId } = await setup();

  const id = await first.mutation(api.manualPurchases.add, {
    clientId: "manual-purchase-0003",
    householdId,
    purchase: { ...purchase, lines: [] },
  });

  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.run((ctx) => ctx.db.get("receipts", id))).toMatchObject({
    status: "reviewed",
    data: {
      lines: [{ kind: "product", name: "Uspesifisert kjøp", amountOre: 15000 }],
    },
  });
});

it("refuses a purchase without a store, a paid amount, or the caller's household", async () => {
  const { t, first, outsider, householdId } = await setup();

  const request = {
    clientId: "manual-purchase-0004",
    householdId,
    purchase: { ...purchase, lines: [] },
  };

  await expect(
    first.mutation(api.manualPurchases.add, {
      ...request,
      purchase: { ...request.purchase, store: " " },
    }),
  ).rejects.toThrow("Skriv inn butikken");
  await expect(
    first.mutation(api.manualPurchases.add, {
      ...request,
      purchase: { ...request.purchase, totalOre: Ore.zero },
    }),
  ).rejects.toThrow("over null");
  await expect(
    outsider.mutation(api.manualPurchases.add, request),
  ).rejects.toThrow("Velg en husstand");
  expect(await t.run((ctx) => ctx.db.query("receipts").collect())).toEqual([]);
});
