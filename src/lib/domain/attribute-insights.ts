import type { Receipt, SpendingGroup } from "./insights";
import {
  preparePurchases,
  overviewPurchasePolicy,
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
      const attribute = analysis?.attributes?.[dimension];

      const id =
        attribute && attribute.confidence >= 0.8 ? attribute.value : "unknown";

      if (id !== "unknown") known++;
      const labels: Record<string, string> = attributeLabels[dimension];

      const group = groups.get(id) ?? {
        id,
        name: labels[id] ?? "Ukjent",
        amountOre: 0,
        contributions: [],
        quantity: emptyPurchaseQuantity(),
      };

      group.amountOre += line.netOre;

      if (analysis && line.amountOre !== null && line.netOre >= 0) {
        for (const key of purchaseQuantityKeys) {
          const value = analysis.quantity[key];

          if (value !== null)
            group.quantity[key] = (group.quantity[key] ?? 0) + value;
        }
      }

      group.contributions.push({ receipt, line, amountOre: line.netOre });
      groups.set(id, group);
    }
  }

  return {
    total,
    known,
    groups: [...groups.values()].sort((a, b) => b.amountOre - a.amountOre),
  };
}
