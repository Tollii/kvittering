import type { Contribution, Receipt } from "./insights";
import { reconcile, spendingLines, formatMoney } from "./receipt";
import {
  productAnalysisVersion,
  productProfileKey,
  purchaseEvidenceKey,
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
export function analysisPeriod(
  anchor: string,
  frequency: AnalysisFrequency,
  today: string,
): AnalysisPeriod {
  const date = new Date(`${anchor}T12:00:00Z`);
  if (frequency === "week") {
    const start = shiftDate(anchor, -((date.getUTCDay() + 6) % 7));
    const end = [shiftDate(start, 6), today].sort()[0];
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
  const end = [monthEnd, today].sort()[0];
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

export function currentLineAnalysis(
  receipt: Receipt,
  line: NonNullable<Receipt["data"]>["lines"][number],
): ProductAnalysisResult | undefined {
  const analysis = receipt.productAnalysis;
  if (
    analysis?.state !== "complete" ||
    analysis.version !== productAnalysisVersion ||
    analysis.generation !== receipt.generation ||
    analysis.revision !== receipt.revision
  )
    return;
  return analysis.results.find(
    (result) =>
      result.lineId === line.id &&
      result.evidenceKey === purchaseEvidenceKey(line),
  );
}
export type SpendingEffect = {
  id: string;
  name: string;
  previousOre: number;
  currentOre: number;
  differenceOre: number;
  priceOre: number | null;
  quantityOre: number | null;
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
  const eligible = receipts.filter(
    (receipt) =>
      receipt.data?.currency === "NOK" &&
      !receipt.excluded &&
      !(receipt.duplicateOf && !receipt.duplicateResolved) &&
      (!reviewedOnly || receipt.status === "reviewed"),
  );
  const within = (start: string, end: string) =>
    eligible.filter(
      (receipt) =>
        !!receipt.data?.purchaseDate &&
        receipt.data.purchaseDate >= start &&
        receipt.data.purchaseDate <= end,
    );
  const current = within(period.start, period.end),
    previous = within(period.previousStart, period.previousEnd);
  const groups = new Map<string, Group>();
  const categories = new Map<string, SpendingEffect>();
  let currentOre = 0,
    previousOre = 0,
    missingAmounts = 0,
    measuredLines = 0,
    productLines = 0;
  for (const [side, selected] of [
    ["current", current],
    ["previous", previous],
  ] as const) {
    for (const receipt of selected) {
      const data = receipt.data!;
      const total = reconcile(data);
      if (side === "current") currentOre += total.productSpending;
      else previousOre += total.productSpending;
      missingAmounts += total.unknown;
      for (const line of spendingLines(data).products) {
        productLines++;
        const contribution = { receipt, line, amountOre: line.netOre };
        const categoryId = line.categoryId ?? "fallback.unclear";
        const category = categories.get(categoryId) ?? {
          id: categoryId,
          name: categoryById.get(categoryId)?.name ?? "Ukjent",
          currentOre: 0,
          previousOre: 0,
          differenceOre: 0,
          priceOre: null,
          quantityOre: null,
          currentQuantity: null,
          previousQuantity: null,
          unit: null,
          contributions: [],
        };
        category[side === "current" ? "currentOre" : "previousOre"] +=
          line.netOre;
        category.contributions.push(contribution);
        categories.set(categoryId, category);
        const result = currentLineAnalysis(receipt, line);
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
  let priceOre = 0,
    quantityOre = 0;
  const effects: SpendingEffect[] = [];
  for (const [id, group] of groups) {
    const all = [...group.current, ...group.previous];
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
      items.reduce((total, item) => total + item.amountOre, 0);
    const quantity = (items: MeasuredLine[]) =>
      items.reduce((total, item) => total + item.quantity![measure]!, 0);
    const c = sum(group.current),
      p = sum(group.previous),
      cq = quantity(group.current),
      pq = quantity(group.previous);
    // Symmetric decomposition: price and quantity effects add exactly to the change.
    const price = Math.round(((c / cq - p / pq) * (cq + pq)) / 2);
    const amount = c - p - price;
    priceOre += price;
    quantityOre += amount;
    measuredLines += all.length;
    effects.push({
      id,
      name: group.name,
      currentOre: c,
      previousOre: p,
      differenceOre: c - p,
      priceOre: price,
      quantityOre: amount,
      currentQuantity: cq,
      previousQuantity: pq,
      unit:
        measure === "grams" ? "g" : measure === "millilitres" ? "ml" : "stk",
      contributions: all,
    });
  }
  const differenceOre = currentOre - previousOre;
  return {
    period,
    currentOre,
    previousOre,
    differenceOre,
    priceOre,
    quantityOre,
    unexplainedOre: differenceOre - priceOre - quantityOre,
    currentReceipts: current.length,
    previousReceipts: previous.length,
    provisionalReceipts: [...current, ...previous].filter(
      (r) => r.status !== "reviewed",
    ).length,
    missingAmounts,
    measuredLines,
    productLines,
    effects: effects.sort(
      (a, b) => Math.abs(b.differenceOre) - Math.abs(a.differenceOre),
    ),
    categories: [...categories.values()]
      .map((row) => ({
        ...row,
        differenceOre: row.currentOre - row.previousOre,
      }))
      .sort((a, b) => Math.abs(b.differenceOre) - Math.abs(a.differenceOre)),
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
  return `Registrert forbruk er ${formatMoney(Math.abs(report.differenceOre))} ${report.differenceOre > 0 ? "høyere" : "lavere"}.${largest?.differenceOre ? ` Største kategoriendring: ${largest.name}, ${formatMoney(largest.differenceOre)}.` : ""}`;
}
