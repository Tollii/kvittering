import { CalendarMonth, CalendarDate } from "./calendar";
import { Ore } from "./ore";
import { productIdentityKey, productReference } from "./product-reference";
import {
  preparePurchases,
  overviewPurchasePolicy,
} from "./purchase-projection";
import type { Doc } from "../../../convex/_generated/dataModel";
import { categoryOf } from "./categories";
import { type ReceiptLine } from "./receipt";
import type { StorePurchase } from "./store-spending";
import type { ExtractedReceipt } from "./receipt-state";

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

/** A prepared purchase's contribution: its receipt was read and its line is known. */
export type PurchaseContribution = Contribution & {
  receipt: ExtractedReceipt;
  line: ReceiptLine;
};

export type SpendingGroup = {
  id: string;
  name: string;
  amountOre: Ore;
  contributions: Contribution[];
};

export function receiptMonth(receipt: Receipt) {
  const date = receipt.data?.purchaseDate;

  return date ? CalendarDate.month(date) : null;
}

export function monthlyInsights(
  receipts: Receipt[],
  month: CalendarMonth,
  reviewedOnly = false,
) {
  const projected = preparePurchases(receipts, {
    ...overviewPurchasePolicy,
    currency: "all",
    provisional: reviewedOnly ? "exclude" : "include",
    period: {
      start: CalendarMonth.first(month),
      end: CalendarMonth.last(month),
    },
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
      const found = categoryOf(line.categoryId);
      add(category, found.id, found.name, {
        receipt,
        line,
        amountOre: line.netOre,
      });
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
    // Unallocated discounts have no category and read as unclear.
    const found = categoryOf(leaf.id);

    for (const contribution of leaf.contributions)
      add(groups, found.group, found.groupName, contribution);
  }

  const purchaseTypes = new Map<string, SpendingGroup>();

  for (const leaf of category.values()) {
    const type = categoryOf(leaf.id).purchaseType;

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
  month: CalendarMonth,
  reviewedOnly = false,
  today = CalendarDate.today(),
) {
  const priorMonth = CalendarMonth.before(month);

  // An unfinished month compares with the same days of the month before.
  const partial = month === CalendarDate.month(today);
  const currentEnd = partial ? today : CalendarMonth.last(month);

  const previousEnd = partial
    ? CalendarMonth.day(priorMonth, CalendarDate.day(today))
    : CalendarMonth.last(priorMonth);

  const through = (end: CalendarDate) =>
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
  const observations = contributions
    .flatMap((contribution) => {
      const date = contribution.receipt.data?.purchaseDate;

      return contribution.line && contribution.amountOre > 0 && date
        ? [{ contribution, date, ore: contribution.amountOre }]
        : [];
    })
    .sort(
      (a, b) =>
        CalendarDate.compare(a.date, b.date) ||
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
      date: CalendarDate;
      amountOre: Ore;
      contributions: Contribution[];
      provisional: number;
      unknown: number;
    }
  >();

  const dates = Array.from({ length: 12 }, (_, index) =>
    CalendarMonth.dates(CalendarMonth.of(year, index + 1)),
  ).flat();

  for (const date of dates) {
    days.set(date, {
      date,
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
