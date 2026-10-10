import { CalendarDate, CalendarMonth } from "./calendar";
import { Ore } from "./ore";
import {
  preparePurchases,
  comparisonPurchasePolicy,
  type PreparedPurchase,
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

type Side = "current" | "previous";

type PreparedReceipt = ReturnType<typeof preparePurchases>[number];

type LineContribution = Omit<PreparedPurchase, "analysis">;

const unitLabels = { millilitres: "ml", grams: "g", units: "stk" } as const;

/** Add one line to the spending of its category on one side of the comparison. */
function addCategoryLine(
  categories: Map<string, SpendingEffect>,
  side: Side,
  contribution: LineContribution,
) {
  const found = categoryOf(contribution.line.categoryId);

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
  category[key] = Ore.add(category[key], contribution.line.netOre);
  category.contributions.push(contribution);
  categories.set(found.id, category);
}

/** Add one line to its product family group. Lines without a family are not grouped. */
function addFamilyLine(
  groups: Map<string, Group>,
  side: Side,
  contribution: LineContribution,
  result: PreparedPurchase["analysis"],
) {
  if (!result?.family) return;
  const { line } = contribution;

  const group = groups.get(result.family.id) ?? {
    name: result.family.name,
    current: [],
    previous: [],
  };

  group[side].push({
    ...contribution,
    quantity:
      line.amountOre !== null && line.netOre >= 0 ? result.quantity : null,
  });
  groups.set(result.family.id, group);
}

/** Receipt totals, category rows, and product family groups for both periods. */
function collectPurchases(
  sides: readonly (readonly [Side, PreparedReceipt[]])[],
) {
  const groups = new Map<string, Group>();
  const categories = new Map<string, SpendingEffect>();
  const totals = { currentOre: Ore.zero, previousOre: Ore.zero };

  let missingAmounts = 0,
    productLines = 0;

  for (const [side, selected] of sides) {
    const key = side === "current" ? "currentOre" : "previousOre";

    for (const { receipt, totals: total, purchases } of selected) {
      totals[key] = Ore.add(totals[key], total.productSpending);
      missingAmounts += total.unknown;

      for (const { line, analysis } of purchases) {
        productLines++;
        const contribution = { receipt, line, amountOre: line.netOre };
        addCategoryLine(categories, side, contribution);
        addFamilyLine(groups, side, contribution, analysis);
      }
    }
  }

  return { groups, categories, ...totals, missingAmounts, productLines };
}

/** Spending on a family bought only in the current period, or null when there is none. */
function currentOnlyFamily(id: string, group: Group) {
  if (!group.current.length || group.previous.length) return null;
  const amountOre = Ore.sum(group.current.map((item) => item.amountOre));

  return amountOre > 0
    ? { id, name: group.name, amountOre, contributions: group.current }
    : null;
}

/**
 * The price and quantity effects of a family bought in both periods, or null
 * when the two periods have no comparable measure.
 */
function familyEffect(
  id: string,
  group: Group,
): (SpendingEffect & { priceOre: Ore; quantityOre: Ore }) | null {
  if (!group.current.length || !group.previous.length) return null;
  const all = [...group.current, ...group.previous];

  // Physical measures allow comparison across package sizes. Package counts do not.
  const measured = measures
    .flatMap((measure) => {
      const cq = measuredTotal(group.current, measure);
      const pq = measuredTotal(group.previous, measure);

      return cq !== null && pq !== null ? [{ measure, cq, pq }] : [];
    })
    .at(0);

  if (!measured) return null;

  const mixedProfiles =
    new Set(all.map((item) => productProfileKey(item.line))).size !== 1;

  if (measured.measure === "units" && mixedProfiles) return null;
  const { measure, cq, pq } = measured;

  const sum = (items: MeasuredLine[]) =>
    Ore.sum(items.map((item) => item.amountOre));

  const c = sum(group.current),
    p = sum(group.previous);

  // Symmetric decomposition: price and quantity effects add exactly to the change.
  const price = Ore.round(((Ore.per(c, cq) - Ore.per(p, pq)) * (cq + pq)) / 2);

  return {
    id,
    name: group.name,
    currentOre: c,
    previousOre: p,
    differenceOre: Ore.subtract(c, p),
    priceOre: price,
    quantityOre: Ore.subtract(Ore.subtract(c, p), price),
    currentQuantity: cq,
    previousQuantity: pq,
    unit: unitLabels[measure],
    contributions: all,
  };
}

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

  const {
    groups,
    categories,
    currentOre,
    previousOre,
    missingAmounts,
    productLines,
  } = collectPurchases([
    ["current", current],
    ["previous", previous],
  ]);

  let priceOre = Ore.zero,
    quantityOre = Ore.zero,
    measuredLines = 0;

  const effects: SpendingEffect[] = [];

  const currentOnly: {
    id: string;
    name: string;
    amountOre: Ore;
    contributions: Contribution[];
  }[] = [];

  for (const [id, group] of groups) {
    const onlyCurrent = currentOnlyFamily(id, group);

    if (onlyCurrent) currentOnly.push(onlyCurrent);
    const effect = familyEffect(id, group);

    if (!effect) continue;
    priceOre = Ore.add(priceOre, effect.priceOre);
    quantityOre = Ore.add(quantityOre, effect.quantityOre);
    measuredLines += effect.contributions.length;
    effects.push(effect);
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
    currentOnly: [...currentOnly].sort(
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
    return "Sammenligningen trenger kjøp fra forrige periode for å forklare endringen.";

  if (!report.differenceOre)
    return "Registrert forbruk er likt i de to periodene.";
  const largest = report.categories[0];

  const categoryChange = largest?.differenceOre
    ? ` Største kategoriendring: ${largest.name}, ${Ore.format(largest.differenceOre)}.`
    : "";

  return `Registrert forbruk er ${Ore.format(Ore.abs(report.differenceOre))} ${report.differenceOre > 0 ? "høyere" : "lavere"}.${categoryChange}`;
}
