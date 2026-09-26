import { date, month } from "../testing/calendar";
import { present, receiptFixture, testId } from "../testing/receipts";
import { Ore } from "./ore";
import { expect, it } from "vitest";
import { storeSpending, type StorePurchase } from "./store-spending";
import { monthlyInsights, type Receipt } from "./insights";
import { emptyLine } from "./receipt";
import { batteryFixture } from "../mock-receipts";
import type { PhysicalStore } from "../catalog/model";

const branch: PhysicalStore = {
  id: 10,
  name: "KIWI Storgata",
  chain: "KIWI",
  address: "Storgata 1",
  latitude: 59.91,
  longitude: 10.75,
};

function purchase(
  id: string,
  overrides: Partial<StorePurchase> = {},
): StorePurchase {
  return {
    receiptId: testId<"receipts">(id),
    date: date("2026-09-01"),
    retailer: "KIWI",
    branch,
    amountOre: Ore.of(1000),
    unknownAmounts: 0,
    provisional: false,
    ...overrides,
  };
}

it("groups stable branch IDs, keeps branches separate, and includes unlocated purchases in chain totals", () => {
  const input = [
    purchase("a"),
    purchase("b", {
      date: date("2026-09-02"),
      branch: { ...branch, name: "Kiwi Storgata" },
    }),
    purchase("c", { branch: { ...branch, id: 20, name: "KIWI Sentrum" } }),
    purchase("d", {
      branch: undefined,
      retailer: "Kiwi",
      amountOre: Ore.of(500),
    }),
    purchase("e", {
      branch: undefined,
      retailer: undefined,
      amountOre: Ore.of(100),
    }),
  ];

  const before = structuredClone(input);
  const result = storeSpending(input);
  expect(result.stores.map((store) => [store.id, store.amountOre])).toEqual([
    ["branch:10", 2000],
    ["branch:20", 1000],
    ["unlocated:KIWI", 500],
    ["unlocated:unknown", 100],
  ]);
  expect(present(result.stores[0]).name).toBe("Kiwi Storgata");
  expect(
    present(result.stores[0]).purchases.map((item) => item.receiptId),
  ).toEqual(["b", "a"]);
  expect(present(result.chains[0]).amountOre).toBe(3500);
  expect(present(result.chains[0]).purchases).toHaveLength(4);
  expect(input).toEqual(before);
});

it("preserves known coordinates while refusing invalid or incomplete positions", () => {
  const result = storeSpending([
    purchase("a"),
    purchase("b", {
      date: date("2026-09-02"),
      branch: { ...branch, latitude: undefined, longitude: undefined },
    }),
    purchase("c", { branch: { ...branch, id: 20, latitude: 91 } }),
    purchase("d", { branch: { ...branch, id: 30, longitude: Number.NaN } }),
    purchase("e", { branch: { ...branch, id: 40, latitude: 0, longitude: 0 } }),
  ]);

  expect(
    result.stores.find((store) => store.id === "branch:10")?.location,
  ).toEqual({ latitude: 59.91, longitude: 10.75 });
  expect(
    result.stores.find((store) => store.id === "branch:20")?.location,
  ).toBeUndefined();
  expect(
    result.stores.find((store) => store.id === "branch:30")?.location,
  ).toBeUndefined();
  expect(
    result.stores.find((store) => store.id === "branch:40")?.location,
  ).toEqual({ latitude: 0, longitude: 0 });
  expect(present(result.chains[0]).amountOre).toBe(5000);
});

it("retains refunds, unknown amounts and review state without inventing spending", () => {
  const result = storeSpending([
    purchase("a", { amountOre: Ore.of(-1200) }),
    purchase("b", {
      amountOre: Ore.of(0),
      unknownAmounts: 2,
      provisional: true,
    }),
  ]);

  expect(result.stores[0]).toMatchObject({
    amountOre: Ore.of(-1200),
    unknownAmounts: 2,
  });
  expect(present(present(result.stores[0]).purchases[1]).provisional).toBe(
    true,
  );
  expect(present(result.chains[0]).amountOre).toBe(-1200);
  expect(storeSpending([])).toEqual({ stores: [], chains: [] });
});

it("agrees with Forbruk accounting, period, currency, exclusion and review filters", () => {
  const data = {
    ...batteryFixture(),
    purchaseDate: date("2026-09-07"),
    physicalStore: branch,
  };

  const receipt = receiptFixture({
    _id: "a",
    _creationTime: 0,
    status: "reviewed",
    data,
  });

  const pending = receiptFixture({
    ...receipt,
    _id: "b",
    status: "needs_review",
    data: {
      ...data,
      physicalStore: null,
      lines: [{ ...emptyLine(), amountOre: Ore.of(1000) }, emptyLine()],
    },
  });

  const receipts: Receipt[] = [
    receipt,
    pending,
    { ...receipt, _id: testId<"receipts">("c"), excluded: true },
    {
      ...receipt,
      _id: testId<"receipts">("d"),
      data: { ...data, currency: "EUR" },
    },
    {
      ...receipt,
      _id: testId<"receipts">("e"),
      data: { ...data, purchaseDate: date("2026-08-01") },
    },
    {
      ...receipt,
      _id: testId<"receipts">("f"),
      data: { ...data, purchaseDate: null },
    },
  ];

  const totals = monthlyInsights(receipts, month("2026-09"));
  const result = storeSpending(totals.storePurchases);
  expect(totals.products).toBe(3331);
  expect(Ore.sum(result.stores.map((store) => store.amountOre))).toBe(
    totals.products,
  );
  expect(Ore.sum(result.chains.map((store) => store.amountOre))).toBe(
    totals.products,
  );
  expect(
    result.stores.reduce((sum, store) => sum + store.unknownAmounts, 0),
  ).toBe(1);
  expect(result.stores.flatMap((store) => store.purchases)).toHaveLength(2);

  const reviewed = storeSpending(
    monthlyInsights(receipts, month("2026-09"), true).storePurchases,
  );

  expect(reviewed.stores).toHaveLength(1);
  expect(present(reviewed.stores[0]).amountOre).toBe(2331);
});
