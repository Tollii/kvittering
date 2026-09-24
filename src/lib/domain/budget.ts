import { Ore } from "./ore";
import {
  analysisPeriod,
  analysisSummary,
  spendingAnalysis,
} from "./spending-analysis";
import { monthlyInsights, type Receipt } from "./insights";
import { osloDate } from "./receipt";

export type BudgetPace = {
  dayOfMonth: number;
  daysInMonth: number;
  /** Share of the month that has passed, 0–1. */
  elapsedShare: number;
  /** Share of the budget spent, may exceed 1. */
  spentShare: number;
  expectedOre: Ore;
  differenceOre: Ore;
  remainingOre: Ore;
  /** What can be spent per remaining day to land on budget, null once over. */
  dailyAllowanceOre: Ore | null;
  status: "under" | "on" | "over";
};

export function daysInMonth(month: string) {
  return new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  ).getUTCDate();
}

/** Where the month stands against a budget. Past months are complete; future ones untouched. */
export function budgetPace(
  budgetOre: Ore,
  spentOre: Ore,
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
  const spentShare = budgetOre > 0 ? Ore.ratio(spentOre, budgetOre) : 0;
  const expectedOre = Ore.scale(budgetOre, elapsedShare);
  const differenceOre = Ore.subtract(spentOre, expectedOre);
  const remainingOre = Ore.subtract(budgetOre, spentOre);
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
        ? Ore.divide(remainingOre, daysLeft)
        : null,
    // Within 5 % of the budget line counts as on track.
    status:
      differenceOre > Ore.scale(budgetOre, 0.05)
        ? "over"
        : differenceOre < Ore.scale(budgetOre, -0.05)
          ? "under"
          : "on",
  };
}

/** Short pace line for the Forbruk hero. */
export function paceLabel(pace: BudgetPace): string {
  const percent = Math.round(pace.spentShare * 100);

  if (pace.dayOfMonth >= pace.daysInMonth)
    return pace.remainingOre >= 0
      ? `${percent} % av budsjettet · ${Ore.format(pace.remainingOre)} igjen`
      : `${percent} % av budsjettet · ${Ore.format(Ore.negate(pace.remainingOre))} over`;

  if (pace.remainingOre < 0)
    return `Dag ${pace.dayOfMonth} av ${pace.daysInMonth} · ${Ore.format(Ore.negate(pace.remainingOre))} over budsjett`;

  return `Dag ${pace.dayOfMonth} av ${pace.daysInMonth} · ${percent} % brukt · ${Ore.format(pace.remainingOre)} igjen`;
}

/** Monday-to-today spending for a weekly push. */
export function weeklyDigest(
  receipts: Receipt[],
  budgetOre: Ore | null,
  today = osloDate(),
) {
  const analysis = spendingAnalysis(
    receipts,
    analysisPeriod(today, "week", today),
  );

  const weekStart = analysis.period.start;
  const weekSpentOre = analysis.currentOre;
  const weekReceipts = analysis.currentReceipts;
  const month = monthlyInsights(receipts, today.slice(0, 7));

  const pace =
    budgetOre && budgetOre > 0
      ? budgetPace(budgetOre, month.products, today.slice(0, 7), today)
      : null;

  const parts = [
    `Denne uken: ${Ore.format(weekSpentOre)}`,
    `${weekReceipts} ${weekReceipts === 1 ? "kvittering" : "kvitteringer"}`,
  ];

  if (analysis.previousReceipts) parts.push(analysisSummary(analysis));

  if (pace)
    parts.push(
      `${Math.round(pace.spentShare * 100)} % av budsjettet brukt, dag ${pace.dayOfMonth} av ${pace.daysInMonth}`,
    );

  return {
    weekStart,
    weekSpentOre,
    weekReceipts,
    monthSpentOre: month.products,
    pace,
    title: weekReceipts ? "Ukens handel" : "Ingen kvitteringer denne uken",
    body: parts.join(" · "),
  };
}

/** Required week comparison and whole calendar month, including future-dated month entries. */
export function digestPeriod(today: string) {
  const week = analysisPeriod(today, "week", today);
  const month = today.slice(0, 7);

  return {
    start: [week.previousStart, `${month}-01`].sort((left, right) =>
      left.localeCompare(right, "en"),
    )[0],
    end: `${month}-${daysInMonth(month)}`,
  };
}
