import { expect, it } from "vitest";
import { storeSpending, type StorePurchase } from "./store-spending";
import { monthlyInsights, type Receipt } from "./insights";
import { batteryFixture, emptyLine } from "./receipt";
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
    receiptId: id as StorePurchase["receiptId"],
    date: "2026-09-01",
    retailer: "KIWI",
    branch,
    amountOre: 1000,
    unknownAmounts: 0,
    provisional: false,
    ...overrides,
  };
}

it("groups stable branch IDs, keeps branches separate, and includes unlocated purchases in chain totals", () => {
  const input = [
    purchase("a"),
    purchase("b", {
      date: "2026-09-02",
      branch: { ...branch, name: "Kiwi Storgata" },
    }),
    purchase("c", { branch: { ...branch, id: 20, name: "KIWI Sentrum" } }),
    purchase("d", { branch: undefined, retailer: "Kiwi", amountOre: 500 }),
    purchase("e", { branch: undefined, retailer: undefined, amountOre: 100 }),
  ];
  const before = structuredClone(input);
  const result = storeSpending(input);
  expect(result.stores.map((store) => [store.id, store.amountOre])).toEqual([
    ["branch:10", 2000],
    ["branch:20", 1000],
    ["unlocated:KIWI", 500],
    ["unlocated:unknown", 100],
  ]);
  expect(result.stores[0].name).toBe("Kiwi Storgata");
  expect(result.stores[0].purchases.map((item) => item.receiptId)).toEqual([
    "b",
    "a",
  ]);
  expect(result.chains[0].amountOre).toBe(3500);
  expect(result.chains[0].purchases).toHaveLength(4);
  expect(input).toEqual(before);
});

it("preserves known coordinates while refusing invalid or incomplete positions", () => {
  const result = storeSpending([
    purchase("a"),
    purchase("b", {
      date: "2026-09-02",
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
  expect(result.chains[0].amountOre).toBe(5000);
});

it("retains refunds, unknown amounts and review state without inventing spending", () => {
  const result = storeSpending([
    purchase("a", { amountOre: -1200 }),
    purchase("b", { amountOre: 0, unknownAmounts: 2, provisional: true }),
  ]);
  expect(result.stores[0]).toMatchObject({
    amountOre: -1200,
    unknownAmounts: 2,
  });
  expect(result.stores[0].purchases[1].provisional).toBe(true);
  expect(result.chains[0].amountOre).toBe(-1200);
  expect(storeSpending([])).toEqual({ stores: [], chains: [] });
});

it("agrees with Forbruk accounting, period, currency, exclusion and review filters", () => {
  const data = {
    ...batteryFixture(),
    purchaseDate: "2026-09-07",
    physicalStore: branch,
  };
  const receipt = {
    _id: "a",
    _creationTime: 0,
    status: "reviewed",
    data,
  } as Receipt;
  const pending = {
    ...receipt,
    _id: "b",
    status: "needs_review",
    data: {
      ...data,
      physicalStore: null,
      lines: [{ ...emptyLine(), amountOre: 1000 }, emptyLine()],
    },
  } as Receipt;
  const receipts = [
    receipt,
    pending,
    { ...receipt, _id: "c", excluded: true },
    { ...receipt, _id: "d", data: { ...data, currency: "EUR" } },
    { ...receipt, _id: "e", data: { ...data, purchaseDate: "2026-08-01" } },
    { ...receipt, _id: "f", data: { ...data, purchaseDate: null } },
  ] as Receipt[];
  const totals = monthlyInsights(receipts, "2026-09");
  const result = storeSpending(totals.storePurchases);
  expect(totals.products).toBe(3331);
  expect(result.stores.reduce((sum, store) => sum + store.amountOre, 0)).toBe(
    totals.products,
  );
  expect(result.chains.reduce((sum, store) => sum + store.amountOre, 0)).toBe(
    totals.products,
  );
  expect(
    result.stores.reduce((sum, store) => sum + store.unknownAmounts, 0),
  ).toBe(1);
  expect(result.stores.flatMap((store) => store.purchases)).toHaveLength(2);
  const reviewed = storeSpending(
    monthlyInsights(receipts, "2026-09", true).storePurchases,
  );
  expect(reviewed.stores).toHaveLength(1);
  expect(reviewed.stores[0].amountOre).toBe(2331);
});
