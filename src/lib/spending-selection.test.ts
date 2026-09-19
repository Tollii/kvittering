import { expect, it } from "vitest";
import {
  resolveSpendingSelection,
  type SpendingSelection,
} from "./spending-selection";
import type { Contribution } from "./domain/insights";
import { receiptFixture } from "./testing/receipts";

it("resolves current totals and closes on deletion or period change", () => {
  const selection: SpendingSelection = {
    period: "2026-09",
    dimension: "category",
    key: "drinks",
  };

  const contributions: Contribution[] = [
    { receipt: receiptFixture(), line: null, amountOre: 100 },
  ];

  const original = {
    id: "drinks",
    name: "Drinks",
    amountOre: 100,
    contributions,
  };

  expect(
    resolveSpendingSelection(selection, "2026-09", { category: [original] }),
  ).toBe(original);
  const updated = { ...original, amountOre: 200 };
  expect(
    resolveSpendingSelection(selection, "2026-09", { category: [updated] })
      ?.amountOre,
  ).toBe(200);
  expect(original.amountOre).toBe(100);
  expect(
    resolveSpendingSelection(selection, "2026-10", { category: [updated] }),
  ).toBeNull();
  expect(
    resolveSpendingSelection(selection, "2026-09", { category: [] }),
  ).toBeNull();
  expect(
    resolveSpendingSelection(selection, "2026-09", { store: [updated] }),
  ).toBeNull();
});
