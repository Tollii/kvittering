import { monthlyInsights, type Receipt } from "./insights";
import { formatMoney, osloDate } from "./receipt";

export type BudgetPace = {
  dayOfMonth: number;
  daysInMonth: number;
  /** Share of the month that has passed, 0–1. */
  elapsedShare: number;
  /** Share of the budget spent, may exceed 1. */
  spentShare: number;
  expectedOre: number;
  differenceOre: number;
  remainingOre: number;
  /** What can be spent per remaining day to land on budget, null once over. */
  dailyAllowanceOre: number | null;
  status: "under" | "on" | "over";
};

export function daysInMonth(month: string) {
  return new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  ).getUTCDate();
}

/** Where the month stands against a budget. Past months are complete; future ones untouched. */
export function budgetPace(
  budgetOre: number,
  spentOre: number,
  month: string,
  today = osloDate(),
): BudgetPace {
  const days = daysInMonth(month);
  const currentMonth = today.slice(0, 7);
  const dayOfMonth =
    month < currentMonth
      ? days
      : month > currentMonth
        ? 0
        : Number(today.slice(8, 10));
  const elapsedShare = days ? dayOfMonth / days : 0;
  const spentShare = budgetOre > 0 ? spentOre / budgetOre : 0;
  const expectedOre = Math.round(budgetOre * elapsedShare);
  const differenceOre = spentOre - expectedOre;
  const remainingOre = budgetOre - spentOre;
  const daysLeft = days - dayOfMonth;
  return {
    dayOfMonth,
    daysInMonth: days,
    elapsedShare,
    spentShare,
    expectedOre,
    differenceOre,
    remainingOre,
    dailyAllowanceOre:
      remainingOre > 0 && daysLeft > 0
        ? Math.floor(remainingOre / daysLeft)
        : null,
    // Within 5 % of the budget line counts as on track.
    status:
      differenceOre > budgetOre * 0.05
        ? "over"
        : differenceOre < -budgetOre * 0.05
          ? "under"
          : "on",
  };
}

/** Short pace line for the Forbruk hero. */
export function paceLabel(pace: BudgetPace): string {
  const percent = Math.round(pace.spentShare * 100);
  if (pace.dayOfMonth >= pace.daysInMonth)
    return pace.remainingOre >= 0
      ? `${percent} % av budsjettet · ${formatMoney(pace.remainingOre)} igjen`
      : `${percent} % av budsjettet · ${formatMoney(-pace.remainingOre)} over`;
  if (pace.remainingOre < 0)
    return `Dag ${pace.dayOfMonth} av ${pace.daysInMonth} · ${formatMoney(-pace.remainingOre)} over budsjett`;
  return `Dag ${pace.dayOfMonth} av ${pace.daysInMonth} · ${percent} % brukt · ${formatMoney(pace.remainingOre)} igjen`;
}

/** Monday-to-today spending for a weekly push. */
export function weeklyDigest(
  receipts: Receipt[],
  budgetOre: number | null,
  today = osloDate(),
) {
  const date = new Date(`${today}T12:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - offset);
  const weekStart = monday.toISOString().slice(0, 10);
  const week = receipts.filter(
    (receipt) =>
      !receipt.excluded &&
      receipt.data?.currency === "NOK" &&
      !!receipt.data.purchaseDate &&
      receipt.data.purchaseDate >= weekStart &&
      receipt.data.purchaseDate <= today,
  );
  const weekSpentOre = week.reduce(
    (sum, receipt) =>
      sum +
      receipt.data!.lines.reduce(
        (lines, line) =>
          [
            "product",
            "item_discount",
            "receipt_discount",
            "adjustment",
          ].includes(line.kind)
            ? lines + (line.amountOre ?? 0)
            : lines,
        0,
      ),
    0,
  );
  const month = monthlyInsights(receipts, today.slice(0, 7));
  const pace =
    budgetOre && budgetOre > 0
      ? budgetPace(budgetOre, month.products, today.slice(0, 7), today)
      : null;
  const parts = [
    `Denne uken: ${formatMoney(weekSpentOre)}`,
    `${week.length} ${week.length === 1 ? "kvittering" : "kvitteringer"}`,
  ];
  if (pace)
    parts.push(
      `${Math.round(pace.spentShare * 100)} % av budsjettet brukt, dag ${pace.dayOfMonth} av ${pace.daysInMonth}`,
    );
  return {
    weekStart,
    weekSpentOre,
    weekReceipts: week.length,
    monthSpentOre: month.products,
    pace,
    title: week.length ? "Ukens handel" : "Ingen kvitteringer denne uken",
    body: parts.join(" · "),
  };
}
