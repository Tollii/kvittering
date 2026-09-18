import type { Receipt, Contribution } from "./insights";
import { spendingLines } from "./receipt";
import {
  emptyPurchaseQuantity,
  productAnalysisVersion,
  purchaseEvidenceKey,
  type PurchaseQuantity,
} from "./product-families";

export type FamilyPurchase = {
  id: string;
  name: string;
  amountOre: number;
  quantity: PurchaseQuantity;
  coverage: Record<keyof PurchaseQuantity, number>;
  contributions: (Contribution & { quantity: PurchaseQuantity })[];
};
export function familyInsights(receipts: Receipt[]) {
  const families = new Map<string, FamilyPurchase>();
  let total = 0,
    linked = 0,
    pending = 0,
    failed = 0;
  for (const receipt of receipts) {
    if (!receipt.data || receipt.excluded || receipt.data.currency !== "NOK")
      continue;
    const analysis = receipt.productAnalysis;
    const current =
      analysis?.version === productAnalysisVersion &&
      analysis.generation === receipt.generation &&
      analysis.revision === receipt.revision;
    if (!current || analysis.state === "pending") pending++;
    else if (analysis.state === "error") failed++;
    for (const line of spendingLines(receipt.data).products) {
      total++;
      const result =
        current && analysis.state === "complete"
          ? analysis.results.find(
              (item) =>
                item.lineId === line.id &&
                item.evidenceKey === purchaseEvidenceKey(line),
            )
          : null;
      if (!result?.family) continue;
      linked++;
      const family = families.get(result.family.id) ?? {
        id: result.family.id,
        name: result.family.name,
        amountOre: 0,
        quantity: emptyPurchaseQuantity(),
        coverage: { packages: 0, units: 0, grams: 0, millilitres: 0 },
        contributions: [],
      };
      family.amountOre += line.netOre;
      family.contributions.push({
        receipt,
        line,
        amountOre: line.netOre,
        quantity: result.quantity,
      });
      for (const key of Object.keys(
        result.quantity,
      ) as (keyof PurchaseQuantity)[]) {
        const value = result.quantity[key];
        if (value !== null) {
          family.quantity[key] = (family.quantity[key] ?? 0) + value;
          family.coverage[key]++;
        }
      }
      families.set(family.id, family);
    }
  }
  return {
    families: [...families.values()].sort((a, b) => b.amountOre - a.amountOre),
    total,
    linked,
    pending,
    failed,
  };
}
const number = (value: number) =>
  new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 }).format(value);
export function formatPurchaseQuantity(quantity: PurchaseQuantity) {
  const parts: string[] = [];
  if (quantity.units !== null) parts.push(`${number(quantity.units)} stk`);
  if (quantity.grams !== null)
    parts.push(
      quantity.grams >= 1000
        ? `${number(quantity.grams / 1000)} kg`
        : `${number(quantity.grams)} g`,
    );
  if (quantity.millilitres !== null)
    parts.push(
      quantity.millilitres >= 1000
        ? `${number(quantity.millilitres / 1000)} l`
        : `${number(quantity.millilitres)} ml`,
    );
  if (!parts.length && quantity.packages !== null)
    parts.push(`${number(quantity.packages)} pakninger`);
  return parts.join(" · ") || "Mengde ukjent";
}
export function partialQuantity(family: FamilyPurchase) {
  return (Object.keys(family.coverage) as (keyof PurchaseQuantity)[]).some(
    (key) =>
      family.quantity[key] !== null &&
      family.coverage[key] < family.contributions.length,
  );
}
