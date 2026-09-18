import type { Doc } from "../../../convex/_generated/dataModel";
import { categoryById } from "./categories";
import { reconcile, spendingLines, type ReceiptLine } from "./receipt";
export type Receipt = Doc<"receipts">;
export type Contribution = {
  receipt: Receipt;
  line: ReceiptLine | null;
  amountOre: number;
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
  const eligible = receipts.filter(
    (r) =>
      !r.excluded &&
      r.data &&
      receiptMonth(r) === month &&
      (!reviewedOnly || r.status === "reviewed"),
  );
  const unconverted = eligible.filter(
    (receipt) => receipt.data!.currency !== "NOK",
  );
  const selected = eligible.filter(
    (receipt) => receipt.data!.currency === "NOK",
  );
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
  for (const receipt of selected) {
    const data = receipt.data!;
    const totals = reconcile(data);
    unknownAmounts += totals.unknown;
    paid += data.totalOre ?? 0;
    products += totals.productSpending;
    discounts += totals.discounts;
    deposits += totals.deposits;
    returns += totals.returns;
    if (data.totalOre === null) unknownTotals++;
    const lines = spendingLines(data);
    for (const line of lines.products) {
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
    if (lines.unallocated)
      add(category, "unallocated", "Ufordelte rabatter og justeringer", {
        receipt,
        line: null,
        amountOre: lines.unallocated,
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
    const type =
      found?.group === "household"
        ? "household"
        : found?.group === "personal-care"
          ? "personal-care"
          : found?.group === "pets"
            ? "pets"
            : found?.group === "other-purchases" ||
                leaf.id === "fallback.non-food"
              ? "other"
              : (found?.group === "fallback" && leaf.id !== "fallback.food") ||
                  leaf.id === "unallocated"
                ? "unknown"
                : "food";
    const names: Record<string, string> = {
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
    unconverted,
    paid,
    products,
    discounts,
    deposits,
    returns,
    unknownTotals,
    unknownAmounts,
    purchaseTypes: [...purchaseTypes.values()],
    discrepancies: selected.filter((receipt) => {
      const result = reconcile(receipt.data!);
      return result.difference !== null && result.difference !== 0;
    }),
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
  for (const receipt of receipts) {
    if (!receipt.data || receipt.excluded || receipt.data.currency !== "NOK")
      continue;
    for (const line of spendingLines(receipt.data).products) {
      // Unlinked items remain separate; similar names do not establish identity.
      const key = line.catalogProduct?.key ?? line.productId ?? `${receipt._id}:${line.id}`;
      const product = products.get(key) ?? {
        key,
        name: line.catalogProduct?.name ?? (line.productName || line.name),
        linked: !!line.catalogProduct || !!line.productId,
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
  const changes = [
    ...new Set([...current.groups, ...previous.groups].map((g) => g.id)),
  ]
    .map((id) => {
      const now = current.groups.find((g) => g.id === id);
      const before = previous.groups.find((g) => g.id === id);
      return {
        id,
        name: now?.name ?? before!.name,
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
      r.data?.lines.some((l) => l.kind === "product" && !l.productId),
    ),
    unlinkedCount: included.reduce(
      (n, r) =>
        n +
        (r.data?.lines.filter((l) => l.kind === "product" && !l.productId)
          .length ?? 0),
      0,
    ),
  };
}
export function matchLabel(line: ReceiptLine) {
  return !line.productId
    ? "Ikke koblet"
    : line.productMatchManual
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
  for (const receipt of receipts) {
    if (
      receipt.excluded ||
      !receipt.data ||
      receipt.data.currency !== "NOK" ||
      (reviewedOnly && receipt.status !== "reviewed")
    )
      continue;
    const date = receipt.data.purchaseDate;
    if (!date || date > today) continue;
    const day = days.get(date);
    if (!day) continue;
    const totals = reconcile(receipt.data);
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
