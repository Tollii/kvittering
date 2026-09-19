import {
  preparePurchases,
  overviewPurchasePolicy,
} from "../domain/purchase-projection";
import type { Receipt, SpendingGroup, Contribution } from "../domain/insights";
import { normalizeSearch } from "./policy";

/** Catalog coverage is partial. All amounts come from receipts, never catalog prices. */
export function catalogInsights(receipts: Receipt[]) {
  const products = new Map<string, SpendingGroup>();
  const brands = new Map<string, SpendingGroup>();
  const stores = new Map<string, SpendingGroup>();
  let linked = 0,
    total = 0;
  function add(
    groups: Map<string, SpendingGroup>,
    id: string,
    name: string,
    contribution: Contribution,
  ) {
    const group = groups.get(id) ?? {
      id,
      name,
      amountOre: 0,
      contributions: [],
    };
    group.amountOre += contribution.amountOre;
    group.contributions.push(contribution);
    groups.set(id, group);
  }
  for (const { receipt, data, purchases } of preparePurchases(
    receipts,
    overviewPurchasePolicy,
  )) {
    for (const { line } of purchases) {
      total++;
      const contribution = { receipt, line, amountOre: line.netOre };
      if (data.physicalStore)
        add(
          stores,
          String(data.physicalStore.id),
          data.physicalStore.name,
          contribution,
        );
      const product = line.catalogProduct;
      if (!product) continue;
      linked++;
      add(products, product.key, product.name, contribution);
      if (product.brand)
        add(
          brands,
          normalizeSearch(product.brand),
          product.brand,
          contribution,
        );
    }
  }
  const sorted = (groups: Map<string, SpendingGroup>) =>
    [...groups.values()].sort((a, b) => b.amountOre - a.amountOre);
  return {
    linked,
    total,
    products: sorted(products),
    brands: sorted(brands),
    stores: sorted(stores),
  };
}
