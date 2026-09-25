import { expect, it } from "vitest";
import { month } from "../testing/calendar";
import { Ore } from "./ore";
import { present, receiptFixture } from "../testing/receipts";
import { monthlyInsights } from "./insights";
import { emptyLine } from "./receipt";
import { batteryFixture } from "../mock-receipts";
import { receiptCategorySpending } from "./receipt-category-spending";

it("groups drinks after item and receipt discounts, with the same totals as the overview", () => {
  const data = batteryFixture();
  data.lines.push(
    {
      ...emptyLine("juice"),
      name: "Juice",
      categoryId: "drinks.juice",
      amountOre: Ore.of(1669),
    },
    {
      ...emptyLine("apples"),
      categoryId: "produce.fruit",
      amountOre: Ore.of(1000),
    },
    {
      ...emptyLine("receipt-discount"),
      kind: "receipt_discount",
      amountOre: Ore.of(-500),
    },
    {
      ...emptyLine("returned-deposit"),
      kind: "deposit_return",
      amountOre: Ore.of(-200),
    },
  );
  const groups = receiptCategorySpending(data);

  expect(groups.map(({ id, amountOre }) => ({ id, amountOre }))).toEqual([
    { id: "drinks", amountOre: Ore.of(3601) },
    { id: "produce", amountOre: Ore.of(899) },
  ]);
  expect(present(groups[0]).items.map((item) => item.amountOre)).toEqual([
    2098, 1503,
  ]);
  expect(
    monthlyInsights([receiptFixture({ data })], month("2026-09")).groups.map(
      ({ id, amountOre }) => ({ id, amountOre }),
    ),
  ).toEqual(groups.map(({ id, amountOre }) => ({ id, amountOre })));
});

it("keeps unknown categories and unallocated adjustments visible", () => {
  const data = batteryFixture();
  data.lines = [
    { ...emptyLine("unknown"), categoryId: null, amountOre: Ore.of(500) },
    { ...emptyLine("adjustment"), kind: "adjustment", amountOre: Ore.of(-75) },
    {
      ...emptyLine("unlinked-discount"),
      kind: "item_discount",
      relatedLineId: "missing",
      amountOre: Ore.of(-25),
    },
  ];

  expect(receiptCategorySpending(data)).toEqual([
    {
      id: "fallback",
      name: "Uavklart",
      amountOre: Ore.of(400),
      items: [
        { id: "product:unknown", name: "Ukjent vare", amountOre: Ore.of(500) },
        {
          id: "unallocated",
          name: "Ufordelte rabatter og justeringer",
          amountOre: Ore.of(-100),
        },
      ],
    },
  ]);
});

it("uses current draft categories without requiring a date and retains unknown amounts", () => {
  const data = batteryFixture();
  data.purchaseDate = null;
  data.lines = [
    {
      ...emptyLine("unknown-price"),
      categoryId: "drinks.juice",
      amountOre: null,
    },
    {
      ...emptyLine("refund"),
      categoryId: "drinks.soft-drinks",
      amountOre: Ore.of(-1000),
    },
  ];

  const groups = receiptCategorySpending(data);
  expect(present(groups[0]).amountOre).toBe(-1000);
  expect(present(present(groups[0]).items[0]).amountOre).toBeNull();
  present(data.lines[1]).categoryId = "produce.fruit";
  expect(receiptCategorySpending(data).map((group) => group.id)).toEqual([
    "drinks",
    "produce",
  ]);
});

it("has no category rows for a receipt that only contains a deposit", () => {
  const data = batteryFixture();
  data.lines = data.lines.filter((line) => line.kind === "deposit");
  expect(receiptCategorySpending(data)).toEqual([]);
});
