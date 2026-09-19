import type { Id } from "../../../convex/_generated/dataModel";
import { retailerCode } from "../catalog/matching";
import type { PhysicalStore } from "../catalog/model";
import { normalizeSearch } from "../catalog/policy";

export type StorePurchase = {
  receiptId: Id<"receipts">;
  date?: string;
  retailer?: string;
  branch?: PhysicalStore;
  amountOre: number;
  unknownAmounts: number;
  provisional: boolean;
};

export type StoreLocation = { latitude: number; longitude: number };

export type StoreSpendingGroup = {
  id: string;
  name?: string;
  chain?: string;
  address?: string;
  location?: StoreLocation;
  amountOre: number;
  unknownAmounts: number;
  purchases: StorePurchase[];
};

function coordinates(branch: PhysicalStore): StoreLocation | undefined {
  const { latitude, longitude } = branch;

  if (
    latitude !== undefined &&
    longitude !== undefined &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  )
    return { latitude, longitude };
}

function chainIdentity(name?: string) {
  return name ? (retailerCode(name) ?? normalizeSearch(name)) : "unknown";
}

/** Group branch identities first, then include every purchase in its chain total. */
export function storeSpending(purchases: readonly StorePurchase[]) {
  const stores = new Map<string, StoreSpendingGroup>();

  const ordered = [...purchases].sort(
    (a, b) =>
      (b.date ?? "").localeCompare(a.date ?? "") ||
      a.receiptId.localeCompare(b.receiptId),
  );

  for (const purchase of ordered) {
    const branch = purchase.branch;

    const chain =
      branch?.chain?.trim() || purchase.retailer?.trim() || undefined;

    const id = branch
      ? `branch:${branch.id}`
      : `unlocated:${chainIdentity(chain)}`;

    const group = stores.get(id) ?? {
      id,
      name: branch?.name,
      chain,
      address: branch?.address,
      amountOre: 0,
      unknownAmounts: 0,
      purchases: [],
    };

    // A later receipt can omit coordinates that an earlier receipt established.
    group.location ??= branch ? coordinates(branch) : undefined;
    group.amountOre += purchase.amountOre;
    group.unknownAmounts += purchase.unknownAmounts;
    group.purchases.push(purchase);
    stores.set(id, group);
  }

  const chains = new Map<string, StoreSpendingGroup>();

  for (const store of stores.values()) {
    const id = `chain:${chainIdentity(store.chain)}`;

    const chain = chains.get(id) ?? {
      id,
      name: store.chain,
      amountOre: 0,
      unknownAmounts: 0,
      purchases: [],
    };

    chain.amountOre += store.amountOre;
    chain.unknownAmounts += store.unknownAmounts;
    chain.purchases.push(...store.purchases);
    chains.set(id, chain);
  }

  const rank = (groups: Map<string, StoreSpendingGroup>) =>
    [...groups.values()]
      .map((group) => ({
        ...group,
        purchases: [...group.purchases].sort(
          (a, b) =>
            (b.date ?? "").localeCompare(a.date ?? "") ||
            a.receiptId.localeCompare(b.receiptId),
        ),
      }))
      .sort((a, b) => b.amountOre - a.amountOre || a.id.localeCompare(b.id));

  return { stores: rank(stores), chains: rank(chains) };
}
