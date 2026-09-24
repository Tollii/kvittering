import { v } from "convex/values";
import { monthlyInsights, type Receipt } from "./insights";
import { reconcile } from "./receipt";

export const spendingTotalsValidator = v.object({
  products: v.number(),
  paid: v.number(),
  discounts: v.number(),
  deposits: v.number(),
  returns: v.number(),
  receipts: v.number(),
  provisional: v.number(),
  unconverted: v.number(),
  unknownTotals: v.number(),
  unknownAmounts: v.number(),
  comparisonProducts: v.number(),
  comparisonReceipts: v.number(),
});

export const emptySpendingTotals = {
  products: 0,
  paid: 0,
  discounts: 0,
  deposits: 0,
  returns: 0,
  receipts: 0,
  provisional: 0,
  unconverted: 0,
  unknownTotals: 0,
  unknownAmounts: 0,
  comparisonProducts: 0,
  comparisonReceipts: 0,
};

export type SpendingTotals = typeof emptySpendingTotals;

export function addSpendingTotals(
  left: SpendingTotals,
  right: SpendingTotals,
  sign = 1,
): SpendingTotals {
  return {
    products: left.products + sign * right.products,
    paid: left.paid + sign * right.paid,
    discounts: left.discounts + sign * right.discounts,
    deposits: left.deposits + sign * right.deposits,
    returns: left.returns + sign * right.returns,
    receipts: left.receipts + sign * right.receipts,
    provisional: left.provisional + sign * right.provisional,
    unconverted: left.unconverted + sign * right.unconverted,
    unknownTotals: left.unknownTotals + sign * right.unknownTotals,
    unknownAmounts: left.unknownAmounts + sign * right.unknownAmounts,
    comparisonProducts:
      left.comparisonProducts + sign * right.comparisonProducts,
    comparisonReceipts:
      left.comparisonReceipts + sign * right.comparisonReceipts,
  };
}

/** Uses the same inclusion and amount rules as the detailed phone reports. */
export function receiptSpendingTotals(receipt: Receipt): SpendingTotals {
  const date = receipt.data?.purchaseDate;

  if (!date) return { ...emptySpendingTotals };
  const insight = monthlyInsights([receipt], date.slice(0, 7));
  const comparable = !receipt.duplicateOf || receipt.duplicateResolved;

  return {
    products: insight.products,
    paid: insight.paid,
    discounts: insight.discounts,
    deposits: insight.deposits,
    returns: insight.returns,
    receipts: insight.selected.length,
    provisional: insight.provisional,
    unconverted: insight.unconverted.length,
    unknownTotals: insight.unknownTotals,
    unknownAmounts: insight.unknownAmounts,
    comparisonProducts: comparable ? insight.products : 0,
    comparisonReceipts: comparable ? insight.selected.length : 0,
  };
}

export function receiptListItem(receipt: Receipt) {
  return {
    _id: receipt._id,
    _creationTime: receipt._creationTime,
    status: receipt.status,
    store: receipt.data?.store ?? null,
    purchaseDate: receipt.data?.purchaseDate ?? null,
    totalOre: receipt.data?.totalOre ?? null,
    spendingOre:
      receipt.data && !receipt.excluded
        ? reconcile(receipt.data).productSpending
        : 0,
    excluded: receipt.excluded,
  };
}

export function receiptSearchText(receipt: Receipt) {
  return [
    receipt.data?.store,
    receipt.data?.purchaseDate,
    ...(receipt.data?.lines.flatMap((line) => [
      line.name,
      line.originalText,
      ...line.tags,
    ]) ?? []),
  ]
    .join(" ")
    .toLocaleLowerCase("nb-NO");
}

export function receiptComparisonCategories(
  receipt: Receipt,
): Record<string, number> {
  if (receipt.duplicateOf && !receipt.duplicateResolved) return {};
  const date = receipt.data?.purchaseDate;

  if (!date) return {};

  return Object.fromEntries(
    monthlyInsights([receipt], date.slice(0, 7))
      .categories.values()
      .filter((category) => category.id !== "unallocated")
      .map((category) => [category.id, category.amountOre]),
  );
}

export function addCategoryTotals(
  left: Record<string, number>,
  right: Record<string, number>,
  sign = 1,
) {
  const result = new Map(Object.entries(left));

  for (const [key, amount] of Object.entries(right)) {
    const total = (result.get(key) ?? 0) + sign * amount;

    if (total === 0) result.delete(key);
    else result.set(key, total);
  }

  return Object.fromEntries(result);
}
