import { categoryOf } from "./categories";
import { CalendarDate, CalendarMonth } from "./calendar";
import { Ore } from "./ore";
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
  budget: Ore | null,
  today: CalendarDate,
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
    differenceOre: Ore.subtract(
      current.comparisonProducts,
      previous.comparisonProducts,
    ),
    categories: Object.entries(categories)
      .map(([id, differenceOre]) => ({
        name: categoryOf(id).name,
        differenceOre: Ore.of(differenceOre),
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
        within(
          CalendarMonth.first(CalendarDate.month(today)),
          CalendarMonth.last(CalendarDate.month(today)),
        ),
      ).products,
      comparison: previous.comparisonReceipts ? comparison : null,
    },
    budget,
    today,
  );
}
