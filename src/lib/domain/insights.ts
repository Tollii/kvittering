import { Ore } from "./ore";
import { productIdentityKey, productReference } from "./product-reference";
import {
  preparePurchases,
  overviewPurchasePolicy,
} from "./purchase-projection";
import type { Doc } from "../../../convex/_generated/dataModel";
import { categoryById } from "./categories";
import { type ReceiptLine } from "./receipt";
import type { StorePurchase } from "./store-spending";

export type Receipt = Doc<"receipts">;

export type Contribution = {
  receipt: Receipt;
  line: ReceiptLine | null;
  amountOre: Ore;
};

/** A receipt contributes once per line, or once as a whole when it has no lines. */
export function contributionKey({ receipt, line }: Contribution) {
  return `${receipt._id}:${line?.id ?? "receipt"}`;
}

export type SpendingGroup = {
  id: string;
  name: string;
  amountOre: Ore;
  contributions: Contribution[];
};

/** The "YYYY-MM" month `offset` months after `month`. */
export function shiftMonth(month: string, offset: number) {
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5, 7));

  return new Date(Date.UTC(year, number - 1 + offset, 1))
    .toISOString()
    .slice(0, 7);
}

export const monthBefore = (month: string) => shiftMonth(month, -1);

export function receiptMonth(receipt: Receipt) {
  return receipt.data?.purchaseDate?.slice(0, 7) ?? null;
}

export function monthlyInsights(
  receipts: Receipt[],
  month: string,
  reviewedOnly = false,
) {
  const projected = preparePurchases(receipts, {
    ...overviewPurchasePolicy,
    currency: "all",
    provisional: reviewedOnly ? "exclude" : "include",
    period: { start: `${month}-01`, end: `${month}-31` },
  });

  const unconverted = projected
    .filter((item) => item.data.currency !== "NOK")
    .map((item) => item.receipt);

  const prepared = projected.filter((item) => item.data.currency === "NOK");
  const selected = prepared.map((item) => item.receipt);
  const category = new Map<string, SpendingGroup>();
  const stores = new Map<string, SpendingGroup>();

  let paid = Ore.zero,
    products = Ore.zero,
    discounts = Ore.zero,
    deposits = Ore.zero,
    returns = Ore.zero,
    unknownTotals = 0,
    unknownAmounts = 0;

  const add = (
    map: Map<string, SpendingGroup>,
    id: string,
    name: string,
    contribution: Contribution,
  ) => {
    const group = map.get(id) ?? {
      id,
      name,
      amountOre: Ore.zero,
      contributions: [],
    };

    group.amountOre = Ore.add(group.amountOre, contribution.amountOre);
    group.contributions.push(contribution);
    map.set(id, group);
  };

  for (const { receipt, data, totals, purchases, unallocated } of prepared) {
    unknownAmounts += totals.unknown;
    paid = Ore.add(paid, data.totalOre ?? Ore.zero);
    products = Ore.add(products, totals.productSpending);
    discounts = Ore.add(discounts, totals.discounts);
    deposits = Ore.add(deposits, totals.deposits);
    returns = Ore.add(returns, totals.returns);

    if (data.totalOre === null) unknownTotals++;

    for (const { line } of purchases) {
      const found = categoryById.get(line.categoryId ?? "");
      add(
        category,
        line.categoryId ?? "fallback.unclear",
        found?.name ?? "Ukjent vare",
        {
          receipt,
          line,
          amountOre: line.netOre,
        },
      );
    }

    if (unallocated)
      add(category, "unallocated", "Ufordelte rabatter og justeringer", {
        receipt,
        line: null,
        amountOre: unallocated,
      });
    add(stores, data.store ?? "unknown", data.store ?? "Ukjent butikk", {
      receipt,
      line: null,
      amountOre: totals.productSpending,
    });
  }

  const groups = new Map<string, SpendingGroup>();

  for (const leaf of category.values()) {
    const found = categoryById.get(leaf.id);

    for (const contribution of leaf.contributions)
      add(
        groups,
        found?.group ?? "fallback",
        found?.groupName ?? "Uavklart",
        contribution,
      );
  }

  const purchaseTypes = new Map<string, SpendingGroup>();

  for (const leaf of category.values()) {
    const found = categoryById.get(leaf.id);
    const type = found?.purchaseType ?? "unknown";

    const names = {
      food: "Mat og drikke",
      household: "Husholdning",
      "personal-care": "Personlig pleie",
      pets: "Kjæledyr",
      other: "Andre varer",
      unknown: "Uavklart",
    };

    for (const contribution of leaf.contributions)
      add(purchaseTypes, type, names[type], contribution);
  }

  return {
    selected,
    storePurchases: prepared.map(
      ({ receipt, data, totals }) =>
        ({
          receiptId: receipt._id,
          date: data.purchaseDate ?? undefined,
          retailer: data.store ?? undefined,
          branch: data.physicalStore ?? undefined,
          amountOre: totals.productSpending,
          unknownAmounts: totals.unknown,
          provisional: receipt.status !== "reviewed",
        }) satisfies StorePurchase,
    ),
    unconverted,
    paid,
    products,
    discounts,
    deposits,
    returns,
    unknownTotals,
    unknownAmounts,
    purchaseTypes: [...purchaseTypes.values()],
    discrepancies: prepared
      .filter(
        ({ totals }) => totals.difference !== null && totals.difference !== 0,
      )
      .map((item) => item.receipt),
    suspectedDuplicates: selected.filter(
      (receipt) => receipt.duplicateOf && !receipt.duplicateResolved,
    ),
    provisional: selected.filter((r) => r.status !== "reviewed").length,
    categories: [...category.values()].sort((a, b) =>
      Ore.compare(b.amountOre, a.amountOre),
    ),
    groups: [...groups.values()].sort((a, b) =>
      Ore.compare(b.amountOre, a.amountOre),
    ),
    stores: [...stores.values()].sort((a, b) =>
      Ore.compare(b.amountOre, a.amountOre),
    ),
    undated: receipts.filter(
      (r) => !r.excluded && r.data && !r.data.purchaseDate,
    ),
  };
}

export function productHistory(receipts: Receipt[]) {
  const products = new Map<
    string,
    {
      key: string;
      name: string;
      linked: boolean;
      quantity: number;
      purchases: Set<string>;
      amountOre: Ore;
      contributions: Contribution[];
    }
  >();

  for (const { receipt, purchases } of preparePurchases(
    receipts,
    overviewPurchasePolicy,
  )) {
    for (const { line } of purchases) {
      // Unlinked items remain separate; similar names do not establish identity.
      const key = productIdentityKey(line) ?? `${receipt._id}:${line.id}`;

      const product = products.get(key) ?? {
        key,
        name: line.catalogProduct?.name ?? (line.productName || line.name),
        linked: productIdentityKey(line) !== null,
        quantity: 0,
        purchases: new Set<string>(),
        amountOre: Ore.zero,
        contributions: [],
      };

      product.amountOre = Ore.add(product.amountOre, line.netOre);
      product.quantity += line.quantity ?? 0;
      product.purchases.add(receipt._id);
      product.contributions.push({ receipt, line, amountOre: line.netOre });
      products.set(key, product);
    }
  }

  return [...products.values()].sort((a, b) =>
    Ore.compare(b.amountOre, a.amountOre),
  );
}

/** Current months compare equal calendar ranges; completed months compare in full. */
export function comparisonInsights(
  receipts: Receipt[],
  month: string,
  reviewedOnly = false,
  today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" }),
) {
  const priorMonth = monthBefore(month);

  const lastDay = (value: string) =>
    new Date(
      Date.UTC(Number(value.slice(0, 4)), Number(value.slice(5, 7)), 0),
    ).getUTCDate();

  const partial = month === today.slice(0, 7);
  const day = partial ? Number(today.slice(8, 10)) : lastDay(month);
  const currentEnd = `${month}-${String(day).padStart(2, "0")}`;
  const previousEnd = `${priorMonth}-${String(partial ? Math.min(day, lastDay(priorMonth)) : lastDay(priorMonth)).padStart(2, "0")}`;

  const through = (end: string) =>
    receipts.filter((r) => !r.data?.purchaseDate || r.data.purchaseDate <= end);

  const current = monthlyInsights(through(currentEnd), month, reviewedOnly);

  const previous = monthlyInsights(
    through(previousEnd),
    priorMonth,
    reviewedOnly,
  );

  const changes = [
    ...new Set([...current.groups, ...previous.groups].map((g) => g.id)),
  ]
    .map((id) => {
      const now = current.groups.find((g) => g.id === id);
      const before = previous.groups.find((g) => g.id === id);

      return {
        id,
        name: now?.name ?? before!.name,
        current: now?.amountOre ?? Ore.zero,
        previous: before?.amountOre ?? Ore.zero,
        difference: Ore.subtract(
          now?.amountOre ?? Ore.zero,
          before?.amountOre ?? Ore.zero,
        ),
        currentContributions: now?.contributions ?? [],
        previousContributions: before?.contributions ?? [],
      };
    })
    .sort((a, b) => Ore.compare(Ore.abs(b.difference), Ore.abs(a.difference)));

  return { current, previous, currentEnd, previousEnd, partial, changes };
}

export function receiptCoverage(receipts: Receipt[]) {
  const included = receipts.filter((r) => !r.excluded);

  return {
    pending: included.filter((r) => r.status !== "reviewed"),
    unlinked: included.filter((r) =>
      r.data?.lines.some(
        (l) => l.kind === "product" && productIdentityKey(l) === null,
      ),
    ),
    unlinkedCount: included.reduce(
      (n, r) =>
        n +
        (r.data?.lines.filter(
          (l) => l.kind === "product" && productIdentityKey(l) === null,
        ).length ?? 0),
      0,
    ),
  };
}

export function matchLabel(line: ReceiptLine) {
  const reference = productReference(line);

  return reference.kind === "unresolved" || reference.kind === "separate"
    ? "Ikke koblet"
    : reference.provenance === "manual"
      ? "Bekreftet av deg"
      : "Automatisk koblet";
}

/** Purchase totals after item discounts. Returns and unknown dates are omitted. */
export function productPrices(contributions: Contribution[]) {
  const purchases = contributions.filter(
    (c) => c.line && c.amountOre > 0 && c.receipt.data?.purchaseDate,
  );

  const observations = purchases
    .map((contribution) => ({ contribution, ore: contribution.amountOre }))
    .sort(
      (a, b) =>
        a.contribution.receipt.data!.purchaseDate!.localeCompare(
          b.contribution.receipt.data!.purchaseDate!,
        ) ||
        a.contribution.receipt._creationTime -
          b.contribution.receipt._creationTime,
    );

  const amounts = observations.map((p) => p.ore);

  return {
    observations,
    omitted: contributions.length - observations.length,
    latest: observations.at(-1)?.ore ?? null,
    lowest: amounts.length ? Ore.min(amounts) : null,
    typical: Ore.median(amounts),
  };
}

/** Daily net product spending, using receipt purchase dates rather than upload timestamps. */
export function spendingCalendar(
  receipts: Receipt[],
  year: number,
  reviewedOnly = false,
  today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" }),
) {
  const days = new Map<
    string,
    {
      date: string;
      amountOre: Ore;
      contributions: Contribution[];
      provisional: number;
      unknown: number;
    }
  >();

  for (
    let date = new Date(Date.UTC(year, 0, 1));
    date.getUTCFullYear() === year;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const key = date.toISOString().slice(0, 10);
    days.set(key, {
      date: key,
      amountOre: Ore.zero,
      contributions: [],
      provisional: 0,
      unknown: 0,
    });
  }

  for (const { receipt, data, totals } of preparePurchases(receipts, {
    ...overviewPurchasePolicy,
    provisional: reviewedOnly ? "exclude" : "include",
  })) {
    const date = data.purchaseDate;

    if (!date || date > today) continue;
    const day = days.get(date);

    if (!day) continue;
    day.amountOre = Ore.add(day.amountOre, totals.productSpending);
    day.unknown += totals.unknown;
    day.provisional += receipt.status === "reviewed" ? 0 : 1;
    day.contributions.push({
      receipt,
      line: null,
      amountOre: totals.productSpending,
    });
  }

  const maximum = Ore.max([...days.values()].map((day) => day.amountOre));

  return [...days.values()].map((day) => ({
    ...day,
    future: day.date > today,
    level:
      day.amountOre > 0 && maximum > 0
        ? Math.max(1, Math.ceil(Ore.ratio(day.amountOre, maximum) * 4))
        : 0,
  }));
}
