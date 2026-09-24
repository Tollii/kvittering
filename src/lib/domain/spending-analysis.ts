import { CalendarDate, CalendarMonth } from "./calendar";
import { Ore } from "./ore";
import {
  preparePurchases,
  comparisonPurchasePolicy,
} from "./purchase-projection";
import type { Contribution, PurchaseContribution, Receipt } from "./insights";
import {
  productProfileKey,
  type ProductAnalysisResult,
} from "./product-families";
import { categoryOf } from "./categories";

export type AnalysisPeriod = {
  start: CalendarDate;
  end: CalendarDate;
  previousStart: CalendarDate;
  previousEnd: CalendarDate;
};

export type AnalysisFrequency = "week" | "month";

/** Compare an unfinished week/month with the same elapsed part of its predecessor. */
export function analysisPeriod(
  anchor: CalendarDate,
  frequency: AnalysisFrequency,
  today: CalendarDate,
): AnalysisPeriod {
  if (frequency === "week") {
    const start = CalendarDate.shift(anchor, -CalendarDate.weekday(anchor));

    const end = CalendarDate.earlier(CalendarDate.shift(start, 6), today);

    return {
      start,
      end,
      previousStart: CalendarDate.shift(start, -7),
      previousEnd: CalendarDate.shift(end, -7),
    };
  }

  const month = CalendarDate.month(anchor);
  const previousMonth = CalendarMonth.before(month);
  const start = CalendarMonth.first(month);
  const monthEnd = CalendarMonth.last(month);
  const end = CalendarDate.earlier(monthEnd, today);
  const previousStart = CalendarMonth.first(previousMonth);

  // A finished month compares with the whole month before; an unfinished one
  // with the same days, clamped to the shorter month.
  const previousEnd =
    end === monthEnd
      ? CalendarMonth.last(previousMonth)
      : CalendarMonth.day(previousMonth, CalendarDate.day(end));

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

type MeasuredLine = PurchaseContribution & {
  quantity: ProductAnalysisResult["quantity"] | null;
};

const measures = ["millilitres", "grams", "units"] as const;

/** One measure summed across lines, or null when any line lacks a positive amount. */
function measuredTotal(
  items: MeasuredLine[],
  measure: (typeof measures)[number],
): number | null {
  let total = 0;

  for (const item of items) {
    const amount = item.quantity?.[measure];

    // Missing, zero, negative, and NaN amounts cannot be compared.
    if (!amount || amount < 0) return null;
    total += amount;
  }

  return total;
}

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

  const within = (start: CalendarDate, end: CalendarDate) =>
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
        const found = categoryOf(line.categoryId);

        const category = categories.get(found.id) ?? {
          id: found.id,
          name: found.name,
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
        categories.set(found.id, category);

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
    const measured = measures
      .flatMap((measure) => {
        const cq = measuredTotal(group.current, measure);
        const pq = measuredTotal(group.previous, measure);

        return cq !== null && pq !== null ? [{ measure, cq, pq }] : [];
      })
      .at(0);

    if (
      !measured ||
      (measured.measure === "units" &&
        new Set(all.map((item) => productProfileKey(item.line))).size !== 1)
    )
      continue;
    const { measure, cq, pq } = measured;

    const sum = (items: MeasuredLine[]) =>
      Ore.sum(items.map((item) => item.amountOre));

    const c = sum(group.current),
      p = sum(group.previous);

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
  report: Pick<
    ReturnType<typeof spendingAnalysis>,
    "currentReceipts" | "previousReceipts" | "differenceOre"
  > & { categories: { name: string; differenceOre: Ore }[] },
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
