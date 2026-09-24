import { Ore } from "./ore";
import type { spendingAnalysis } from "./spending-analysis";
import type { SpendingGroup } from "./insights";

export type SpendingExplanation = SpendingGroup & { detail: string };

/** Explain observed contributions without inferring consumption or missing purchases. */
export function spendingExplanations(
  report: ReturnType<typeof spendingAnalysis>,
): SpendingExplanation[] {
  if (!report.currentReceipts || !report.previousReceipts) return [];

  const explanations: SpendingExplanation[] = [];

  for (const kind of ["price", "quantity"] as const) {
    const field = kind === "price" ? "priceOre" : "quantityOre";

    const strongest = report.effects
      .filter((effect) => effect[field] !== null && effect[field] !== 0)
      .sort(
        (a, b) =>
          Math.abs(b[field]!) - Math.abs(a[field]!) || a.id.localeCompare(b.id),
      )
      .slice(0, 2);

    for (const effect of strongest) {
      const amount = effect[field]!;

      const change =
        kind === "price"
          ? `Pris per mengde var ${amount > 0 ? "høyere" : "lavere"}`
          : `Registrert kjøpt mengde var ${amount > 0 ? "større" : "mindre"}`;

      explanations.push({
        id: `${kind}:${effect.id}`,
        name: `${effect.name} · begge perioder`,
        // The detail sheet totals the supporting purchases from both periods.
        amountOre: Ore.add(effect.currentOre, effect.previousOre),
        contributions: effect.contributions,
        detail: `${change}. Bidrag til endringen: ${Ore.format(amount)}.`,
      });
    }
  }

  for (const purchase of report.currentOnly.slice(0, 2)) {
    explanations.push({
      ...purchase,
      id: `current:${purchase.id}`,
      detail: `${Ore.format(purchase.amountOre)} i denne perioden. Produktfamilien er ikke identifisert i forrige periode.`,
    });
  }

  return explanations;
}
