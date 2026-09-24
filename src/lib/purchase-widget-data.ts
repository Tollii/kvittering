import { Ore } from "./domain/ore";

export type PurchaseWidgetData = {
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
  month: string;
  amountOre: Ore;
  budgetOre: Ore | null;
  provisional: number;
  now: Date;
}>): PurchaseWidgetData {
  const remaining =
    budgetOre === null ? null : Ore.subtract(budgetOre, amountOre);

  return {
    month: new Intl.DateTimeFormat("nb-NO", {
      month: "long",
      year: "numeric",
      timeZone: "Europe/Oslo",
    }).format(new Date(`${month}-01T12:00:00Z`)),
    amount: Ore.format(amountOre),
    budget:
      remaining === null
        ? "Uten månedsbudsjett"
        : `${Ore.format(Ore.abs(remaining))} ${remaining < 0 ? "over budsjett" : "igjen"}`,
    updated: `${provisional ? "Foreløpig · " : ""}${new Intl.DateTimeFormat("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Oslo" }).format(now)}`,
  };
}
