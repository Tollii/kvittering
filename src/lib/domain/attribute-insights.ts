import { Ore } from "./ore";
import type { Receipt, SpendingGroup } from "./insights";
import {
  preparePurchases,
  overviewPurchasePolicy,
  type PreparedPurchase,
} from "./purchase-projection";
import {
  emptyPurchaseQuantity,
  purchaseQuantityKeys,
  type PurchaseQuantity,
} from "./product-families";
import {
  productTypes,
  sugarVariants,
  preparationTypes,
  type ProductAttributes,
} from "./product-attributes";

export type AttributeDimension = Exclude<keyof ProductAttributes, "source">;

export const attributeLabels = {
  type: productTypes,
  sugar: sugarVariants,
  preparation: preparationTypes,
};

/** The attribute value for a dimension, or "unknown" when the analysis is not confident. */
function confidentAttribute(
  analysis: PreparedPurchase["analysis"],
  dimension: AttributeDimension,
): string {
  const attribute = analysis?.attributes?.[dimension];

  return attribute && attribute.confidence >= 0.8 ? attribute.value : "unknown";
}

/** Add each known measure of `source` to `total`. Unknown measures stay unknown. */
function addKnownQuantity(total: PurchaseQuantity, source: PurchaseQuantity) {
  for (const key of purchaseQuantityKeys) {
    const value = source[key];

    if (value !== null) total[key] = (total[key] ?? 0) + value;
  }
}

export function attributeInsights(
  receipts: Receipt[],
  dimension: AttributeDimension,
) {
  const groups = new Map<
    string,
    SpendingGroup & { quantity: PurchaseQuantity }
  >();

  let total = 0,
    known = 0;

  for (const prepared of preparePurchases(receipts, {
    ...overviewPurchasePolicy,
    duplicates: "exclude",
  })) {
    const { receipt } = prepared;

    for (const { line, analysis } of prepared.purchases) {
      total++;
      const id = confidentAttribute(analysis, dimension);

      if (id !== "unknown") known++;
      const labels: Record<string, string> = attributeLabels[dimension];

      const group = groups.get(id) ?? {
        id,
        name: labels[id] ?? "Ukjent",
        amountOre: Ore.zero,
        contributions: [],
        quantity: emptyPurchaseQuantity(),
      };

      group.amountOre = Ore.add(group.amountOre, line.netOre);

      if (analysis && line.amountOre !== null && line.netOre >= 0)
        addKnownQuantity(group.quantity, analysis.quantity);

      group.contributions.push({ receipt, line, amountOre: line.netOre });
      groups.set(id, group);
    }
  }

  return {
    total,
    known,
    groups: [...groups.values()].sort((a, b) =>
      Ore.compare(b.amountOre, a.amountOre),
    ),
  };
}
