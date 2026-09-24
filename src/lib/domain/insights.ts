import { productIdentityKey, productReference } from "./product-reference";
import {
  preparePurchases,
  overviewPurchasePolicy,
} from "./purchase-projection";
import type { Doc } from "../../../convex/_generated/dataModel";
import { categoryById } from "./categories";
import { type ReceiptLine } from "./receipt";
import type { StorePurchase } from "./store-spending";
import type { ExtractedReceipt } from "./receipt-state";

export type Receipt = Doc<"receipts">;

export type Contribution = {
  receipt: Receipt;
  line: ReceiptLine | null;
  amountOre: number;
};

/** A prepared purchase's contribution: its receipt was read and its line is known. */
export type PurchaseContribution = Contribution & {
  receipt: ExtractedReceipt;
  line: ReceiptLine;
};

export type SpendingGroup = {
  id: string;
  name: string;
  amountOre: number;
  contributions: Contribution[];
};

export function monthBefore(month: string) {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 2, 1));

  return date.toISOString().slice(0, 7);
}

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

  let paid = 0,
    products = 0,
    discounts = 0,
    deposits = 0,
    returns = 0,
    unknownTotals = 0,
    unknownAmounts = 0;

  const add = (
    map: Map<string, SpendingGroup>,
    id: string,
    name: string,
    contribution: Contribution,
  ) => {
    const group = map.get(id) ?? { id, name, amountOre: 0, contributions: [] };
    group.amountOre += contribution.amountOre;
    group.contributions.push(contribution);
    map.set(id, group);
  };

  for (const { receipt, data, totals, purchases, unallocated } of prepared) {
    unknownAmounts += totals.unknown;
    paid += data.totalOre ?? 0;
    products += totals.productSpending;
    discounts += totals.discounts;
    deposits += totals.deposits;
    returns += totals.returns;

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
    categories: [...category.values()].sort(
      (a, b) => b.amountOre - a.amountOre,
    ),
    groups: [...groups.values()].sort((a, b) => b.amountOre - a.amountOre),
    stores: [...stores.values()].sort((a, b) => b.amountOre - a.amountOre),
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
      amountOre: number;
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
        amountOre: 0,
        contributions: [],
      };

      product.amountOre += line.netOre;
      product.quantity += line.quantity ?? 0;
      product.purchases.add(receipt._id);
      product.contributions.push({ receipt, line, amountOre: line.netOre });
      products.set(key, product);
    }
  }

  return [...products.values()].sort((a, b) => b.amountOre - a.amountOre);
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

  // Each group keeps its current name; groups absent this month keep their previous one.
  const names = new Map(current.groups.map((g) => [g.id, g.name]));

  for (const group of previous.groups)
    if (!names.has(group.id)) names.set(group.id, group.name);

  const changes = [...names]
    .map(([id, name]) => {
      const now = current.groups.find((g) => g.id === id);
      const before = previous.groups.find((g) => g.id === id);

      return {
        id,
        name,
        current: now?.amountOre ?? 0,
        previous: before?.amountOre ?? 0,
        difference: (now?.amountOre ?? 0) - (before?.amountOre ?? 0),
        currentContributions: now?.contributions ?? [],
        previousContributions: before?.contributions ?? [],
      };
    })
    .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

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
  const observations = contributions
    .flatMap((contribution) => {
      const date = contribution.receipt.data?.purchaseDate;

      return contribution.line && contribution.amountOre > 0 && date
        ? [{ contribution, date, ore: contribution.amountOre }]
        : [];
    })
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.contribution.receipt._creationTime -
          b.contribution.receipt._creationTime,
    );

  const sorted = observations.map((p) => p.ore).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  const typical = !sorted.length
    ? null
    : sorted.length % 2
      ? sorted[middle]
      : Math.round((sorted[middle - 1] + sorted[middle]) / 2);

  return {
    observations,
    omitted: contributions.length - observations.length,
    latest: observations.at(-1)?.ore ?? null,
    lowest: sorted[0] ?? null,
    typical,
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
      amountOre: number;
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
      amountOre: 0,
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
    day.amountOre += totals.productSpending;
    day.unknown += totals.unknown;
    day.provisional += receipt.status === "reviewed" ? 0 : 1;
    day.contributions.push({
      receipt,
      line: null,
      amountOre: totals.productSpending,
    });
  }

  const maximum = Math.max(
    0,
    ...[...days.values()].map((day) => day.amountOre),
  );

  return [...days.values()].map((day) => ({
    ...day,
    future: day.date > today,
    level:
      day.amountOre > 0 && maximum > 0
        ? Math.max(1, Math.ceil((day.amountOre / maximum) * 4))
        : 0,
  }));
}
