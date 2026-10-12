import { CalendarDate, CalendarMonth } from "./calendar";
import { Ore } from "./ore";
import {
  monthlyInsights,
  receiptMonth,
  type Receipt,
  type SpendingGroup,
} from "./insights";

export const trendLength = 12;

type TrendMonthTotals = {
  month: CalendarMonth;
  products: Ore;
  groups: SpendingGroup[];
  /** Receipts are on record for the month; a month without any is unknown, not zero. */
  recorded: boolean;
  /** The month is still running, so its amount covers only the days so far. */
  partial: boolean;
};

export type SpendingTrend = {
  months: TrendMonthTotals[];
  /** Category groups over the whole window, largest first. */
  groups: SpendingGroup[];
};

/** The twelve months that end with `end`, oldest first, totalled as Forbruk totals one month. */
export function spendingTrend(
  receipts: Receipt[],
  end: CalendarMonth,
  today = CalendarDate.today(),
): SpendingTrend {
  const current = CalendarDate.month(today);
  const byMonth = new Map<CalendarMonth, Receipt[]>();

  for (const receipt of receipts) {
    const month = receiptMonth(receipt);

    if (!month) continue;
    const list = byMonth.get(month);

    if (list) list.push(receipt);
    else byMonth.set(month, [receipt]);
  }

  const months = Array.from({ length: trendLength }, (_, index) => {
    const month = CalendarMonth.shift(end, index + 1 - trendLength);
    const totals = monthlyInsights(byMonth.get(month) ?? [], month);

    return {
      month,
      products: totals.products,
      groups: totals.groups,
      recorded: totals.selected.length > 0,
      partial: month === current,
    };
  });

  const groups = new Map<string, SpendingGroup>();

  // Later months come last, so a group keeps its most recent name.
  for (const month of months)
    for (const group of month.groups) {
      const previous = groups.get(group.id);

      groups.set(group.id, {
        id: group.id,
        name: group.name,
        amountOre: Ore.add(previous?.amountOre ?? Ore.zero, group.amountOre),
        contributions: [
          ...(previous?.contributions ?? []),
          ...group.contributions,
        ],
      });
    }

  return {
    months,
    groups: [...groups.values()].sort((a, b) =>
      Ore.compare(b.amountOre, a.amountOre),
    ),
  };
}

/**
 * Each month's amount for one category group, or for every purchase when
 * `group` is null. The average covers whole months with receipts on record,
 * so an unfinished month and months before the household started do not pull
 * it down.
 */
export function trendSeries(trend: SpendingTrend, group: string | null) {
  const months = trend.months.map((month) => ({
    month: month.month,
    recorded: month.recorded,
    partial: month.partial,
    amountOre: group
      ? (month.groups.find((value) => value.id === group)?.amountOre ??
        Ore.zero)
      : month.products,
  }));

  const whole = months.filter((month) => month.recorded && !month.partial);

  return {
    months,
    averageMonths: whole.length,
    averageOre: whole.length
      ? Ore.scale(
          Ore.sum(whole.map((month) => month.amountOre)),
          1 / whole.length,
        )
      : null,
  };
}
