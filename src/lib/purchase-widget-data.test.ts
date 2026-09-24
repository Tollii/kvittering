import { month } from "./testing/calendar";
import { Ore } from "./domain/ore";
import { describe, expect, it } from "vitest";
import { purchaseWidgetData } from "./purchase-widget-data";

const purchase = {
  month: month("2026-09"),
  amountOre: Ore.of(125000),
  budgetOre: Ore.of(200000),
  provisional: 0,
  now: new Date("2026-09-21T09:30:00Z"),
};

describe("purchase widget summary", () => {
  it("uses grocery spending and the remaining monthly budget", () => {
    const summary = purchaseWidgetData(purchase);
    expect(summary.amount.replaceAll("\u00a0", " ")).toBe("1 250,00 kr");
    expect(summary.budget.replaceAll("\u00a0", " ")).toBe("750,00 kr igjen");
    expect(summary.month).toBe("september 2026");
  });

  it("distinguishes no budget from an exceeded budget", () => {
    expect(purchaseWidgetData({ ...purchase, budgetOre: null }).budget).toBe(
      "Uten månedsbudsjett",
    );
    expect(
      purchaseWidgetData({
        ...purchase,
        budgetOre: Ore.of(100000),
      }).budget.replaceAll("\u00a0", " "),
    ).toBe("250,00 kr over budsjett");
  });

  it("marks provisional totals and retains the update date in Oslo time", () => {
    const summary = purchaseWidgetData({ ...purchase, provisional: 2 });
    expect(summary.updated).toContain("Foreløpig");
    expect(summary.updated).toContain("21.");
    expect(summary.updated).toContain("11:30");
  });
});
