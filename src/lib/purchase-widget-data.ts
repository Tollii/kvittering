import { CalendarMonth } from "./domain/calendar";
import { Ore } from "./domain/ore";

export type PurchaseWidgetData = {
  /** The month's label, such as "september 2026". */
  month: string;
  amount: string;
  budget: string;
  updated: string;
};

export const emptyPurchaseWidget: PurchaseWidgetData = {
  month: "Dagligvarer",
  amount: "Åpne Kvitto",
  budget: "Se forbruket for å oppdatere",
  updated: "",
};

/** Publish only complete, unfiltered month totals. Absence of a budget is not zero. */
export function purchaseWidgetData({
  month,
  amountOre,
  budgetOre,
  provisional,
  now,
}: Readonly<{
  month: CalendarMonth;
  amountOre: Ore;
  budgetOre: Ore | null;
  provisional: number;
  now: Date;
}>): PurchaseWidgetData {
  const remaining =
    budgetOre === null ? null : Ore.subtract(budgetOre, amountOre);

  return {
    month: CalendarMonth.format(month),
    amount: Ore.format(amountOre),
    budget:
      remaining === null
        ? "Uten månedsbudsjett"
        : `${Ore.format(Ore.abs(remaining))} ${remaining < 0 ? "over budsjett" : "igjen"}`,
    updated: `${provisional ? "Foreløpig · " : ""}${new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" }).format(now)}`,
  };
}
