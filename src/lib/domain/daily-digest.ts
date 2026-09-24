import { categoryById } from "./categories";
import { formatWeeklyDigest } from "./budget";
import { analysisPeriod, analysisSummary } from "./spending-analysis";
import {
  addCategoryTotals,
  addSpendingTotals,
  emptySpendingTotals,
  type SpendingTotals,
} from "./receipt-summary";

/** Daily aggregates retain the same weekly duplicate and monthly inclusion policies. */
export function dailyDigest(
  days: {
    date: string;
    totals: SpendingTotals;
    categories: Record<string, number>;
  }[],
  budget: number | null,
  today: string,
) {
  const period = analysisPeriod(today, "week", today);

  const within = (start: string, end: string) =>
    days.filter((day) => day.date >= start && day.date <= end);

  const sum = (selected: typeof days) =>
    selected.reduce((total, day) => addSpendingTotals(total, day.totals), {
      ...emptySpendingTotals,
    });

  const currentDays = within(period.start, period.end);
  const previousDays = within(period.previousStart, period.previousEnd);

  const current = sum(currentDays),
    previous = sum(previousDays);

  let categories: Record<string, number> = {};

  for (const day of currentDays)
    categories = addCategoryTotals(categories, day.categories);

  for (const day of previousDays)
    categories = addCategoryTotals(categories, day.categories, -1);

  const comparison = analysisSummary({
    currentReceipts: current.comparisonReceipts,
    previousReceipts: previous.comparisonReceipts,
    differenceOre: current.comparisonProducts - previous.comparisonProducts,
    categories: Object.entries(categories)
      .map(([id, differenceOre]) => ({
        name: categoryById.get(id)?.name ?? "Ukjent",
        differenceOre,
      }))
      .sort(
        (left, right) =>
          Math.abs(right.differenceOre) - Math.abs(left.differenceOre),
      ),
  });

  return formatWeeklyDigest(
    {
      weekStart: period.start,
      weekSpentOre: current.comparisonProducts,
      weekReceipts: current.comparisonReceipts,
      monthSpentOre: sum(
        within(`${today.slice(0, 7)}-01`, `${today.slice(0, 7)}-31`),
      ).products,
      comparison: previous.comparisonReceipts ? comparison : null,
    },
    budget,
    today,
  );
}
