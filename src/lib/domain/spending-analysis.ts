import { Ore } from "./ore";
import {
  preparePurchases,
  comparisonPurchasePolicy,
} from "./purchase-projection";
import type { Contribution, Receipt } from "./insights";
import {
  productProfileKey,
  type ProductAnalysisResult,
} from "./product-families";
import { categoryById } from "./categories";

export type AnalysisPeriod = {
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
};

export type AnalysisFrequency = "week" | "month";

const dateString = (date: Date) => date.toISOString().slice(0, 10);

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);

  return dateString(value);
}

/** Compare an unfinished week/month with the same elapsed part of its predecessor. */
/** ISO dates order lexically. */
export const earlierDate = (left: string, right: string) =>
  left < right ? left : right;

export function analysisPeriod(
  anchor: string,
  frequency: AnalysisFrequency,
  today: string,
): AnalysisPeriod {
  const date = new Date(`${anchor}T12:00:00Z`);

  if (frequency === "week") {
    const start = shiftDate(anchor, -((date.getUTCDay() + 6) % 7));

    const end = earlierDate(shiftDate(start, 6), today);

    return {
      start,
      end,
      previousStart: shiftDate(start, -7),
      previousEnd: shiftDate(end, -7),
    };
  }

  const start = `${anchor.slice(0, 7)}-01`;

  const monthEnd = dateString(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)),
  );

  const end = earlierDate(monthEnd, today);

  const previousStart = dateString(
    new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1, 12)),
  );

  const previousLast = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0, 12),
  );

  const previousEnd =
    end === monthEnd
      ? dateString(previousLast)
      : shiftDate(
          previousStart,
          Math.min(Number(end.slice(8)), previousLast.getUTCDate()) - 1,
        );

  return { start, end, previousStart, previousEnd };
}

export type SpendingEffect = {
  id: string;
  name: string;
  previousOre: Ore;
  currentOre: Ore;
  differenceOre: Ore;
  priceOre: Ore | null;
  quantityOre: Ore | null;
  currentQuantity: number | null;
  previousQuantity: number | null;
  unit: string | null;
  contributions: Contribution[];
};

type MeasuredLine = Contribution & {
  quantity: ProductAnalysisResult["quantity"] | null;
};

type Group = {
  name: string;
  current: MeasuredLine[];
  previous: MeasuredLine[];
};

export function spendingAnalysis(
  receipts: Receipt[],
  period: AnalysisPeriod,
  reviewedOnly = false,
) {
  const prepared = preparePurchases(receipts, {
    ...comparisonPurchasePolicy,
    provisional: reviewedOnly ? "exclude" : "include",
  });

  const within = (start: string, end: string) =>
    prepared.filter(
      ({ data }) =>
        !!data.purchaseDate &&
        data.purchaseDate >= start &&
        data.purchaseDate <= end,
    );

  const current = within(period.start, period.end),
    previous = within(period.previousStart, period.previousEnd);

  const groups = new Map<string, Group>();
  const categories = new Map<string, SpendingEffect>();

  let currentOre = Ore.zero,
    previousOre = Ore.zero,
    missingAmounts = 0,
    measuredLines = 0,
    productLines = 0;

  for (const [side, selected] of [
    ["current", current],
    ["previous", previous],
  ] as const) {
    for (const { receipt, totals: total, purchases } of selected) {
      if (side === "current")
        currentOre = Ore.add(currentOre, total.productSpending);
      else previousOre = Ore.add(previousOre, total.productSpending);
      missingAmounts += total.unknown;

      for (const { line, analysis: result } of purchases) {
        productLines++;
        const contribution = { receipt, line, amountOre: line.netOre };
        const categoryId = line.categoryId ?? "fallback.unclear";

        const category = categories.get(categoryId) ?? {
          id: categoryId,
          name: categoryById.get(categoryId)?.name ?? "Ukjent",
          currentOre: Ore.zero,
          previousOre: Ore.zero,
          differenceOre: Ore.zero,
          priceOre: null,
          quantityOre: null,
          currentQuantity: null,
          previousQuantity: null,
          unit: null,
          contributions: [],
        };

        const key = side === "current" ? "currentOre" : "previousOre";
        category[key] = Ore.add(category[key], line.netOre);
        category.contributions.push(contribution);
        categories.set(categoryId, category);

        if (!result?.family) continue;

        const group = groups.get(result.family.id) ?? {
          name: result.family.name,
          current: [],
          previous: [],
        };

        group[side].push({
          ...contribution,
          quantity:
            line.amountOre !== null && line.netOre >= 0
              ? result.quantity
              : null,
        });
        groups.set(result.family.id, group);
      }
    }
  }

  let priceOre = Ore.zero,
    quantityOre = Ore.zero;

  const effects: SpendingEffect[] = [];

  const currentOnly: {
    id: string;
    name: string;
    amountOre: Ore;
    contributions: Contribution[];
  }[] = [];

  for (const [id, group] of groups) {
    const all = [...group.current, ...group.previous];

    if (group.current.length && !group.previous.length) {
      const amountOre = Ore.sum(group.current.map((item) => item.amountOre));

      if (amountOre > 0)
        currentOnly.push({
          id,
          name: group.name,
          amountOre,
          contributions: group.current,
        });
    }

    if (!group.current.length || !group.previous.length) continue;

    // Physical measures allow comparison across package sizes. Package counts do not.
    const measure = (["millilitres", "grams", "units"] as const).find((key) =>
      all.every(
        (line) =>
          line.quantity?.[key] !== null && (line.quantity?.[key] ?? 0) > 0,
      ),
    );

    if (
      !measure ||
      (measure === "units" &&
        new Set(all.map((item) => productProfileKey(item.line!))).size !== 1)
    )
      continue;

    const sum = (items: MeasuredLine[]) =>
      Ore.sum(items.map((item) => item.amountOre));

    const quantity = (items: MeasuredLine[]) =>
      items.reduce((total, item) => total + item.quantity![measure]!, 0);

    const c = sum(group.current),
      p = sum(group.previous),
      cq = quantity(group.current),
      pq = quantity(group.previous);

    // Symmetric decomposition: price and quantity effects add exactly to the change.
    const price = Ore.round(
      ((Ore.per(c, cq) - Ore.per(p, pq)) * (cq + pq)) / 2,
    );

    const amount = Ore.subtract(Ore.subtract(c, p), price);
    priceOre = Ore.add(priceOre, price);
    quantityOre = Ore.add(quantityOre, amount);
    measuredLines += all.length;
    effects.push({
      id,
      name: group.name,
      currentOre: c,
      previousOre: p,
      differenceOre: Ore.subtract(c, p),
      priceOre: price,
      quantityOre: amount,
      currentQuantity: cq,
      previousQuantity: pq,
      unit:
        measure === "grams" ? "g" : measure === "millilitres" ? "ml" : "stk",
      contributions: all,
    });
  }

  effects.sort((a, b) =>
    Ore.compare(Ore.abs(b.differenceOre), Ore.abs(a.differenceOre)),
  );
  const differenceOre = Ore.subtract(currentOre, previousOre);

  return {
    period,
    currentOre,
    previousOre,
    differenceOre,
    priceOre,
    quantityOre,
    unexplainedOre: Ore.subtract(differenceOre, Ore.add(priceOre, quantityOre)),
    currentReceipts: current.length,
    previousReceipts: previous.length,
    provisionalReceipts: [...current, ...previous].filter(
      (r) => r.receipt.status !== "reviewed",
    ).length,
    missingAmounts,
    measuredLines,
    productLines,
    effects,
    currentOnly: currentOnly.toSorted(
      (a, b) =>
        Ore.compare(b.amountOre, a.amountOre) || a.id.localeCompare(b.id),
    ),
    categories: [...categories.values()]
      .map((row) => ({
        ...row,
        differenceOre: Ore.subtract(row.currentOre, row.previousOre),
      }))
      .sort((a, b) =>
        Ore.compare(Ore.abs(b.differenceOre), Ore.abs(a.differenceOre)),
      ),
  };
}

export function analysisSummary(
  report: ReturnType<typeof spendingAnalysis>,
): string {
  if (!report.currentReceipts) return "Ingen registrerte kjøp i perioden.";

  if (!report.previousReceipts)
    return "Vi trenger kjøp fra forrige periode for å forklare endringen.";

  if (!report.differenceOre)
    return "Registrert forbruk er likt i de to periodene.";
  const largest = report.categories[0];

  const categoryChange = largest?.differenceOre
    ? ` Største kategoriendring: ${largest.name}, ${Ore.format(largest.differenceOre)}.`
    : "";

  return `Registrert forbruk er ${Ore.format(Ore.abs(report.differenceOre))} ${report.differenceOre > 0 ? "høyere" : "lavere"}.${categoryChange}`;
}
