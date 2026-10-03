import { categoryReviewThreshold } from "./receipt-review";
import { categoryUncertainIssue, isCategoryUncertain } from "./receipt-issues";
import { isDecidedCategory, unclearCategoryId } from "./categories";
import {
  isTotalsLine,
  normalizeAlias,
  printedName,
  reconcile,
  type ReceiptData,
  type ReceiptLine,
} from "./receipt";

/** Put the classifier's answers on the read lines, flagging the ones a person must confirm. */
export function applyClassifications(
  data: ReceiptData,
  classifications: readonly {
    id: string;
    categoryId: string;
    confidence: number;
  }[],
) {
  for (const result of classifications) {
    const line = data.lines.find((line) => line.id === result.id);

    if (!line) continue;
    line.categoryId = result.categoryId;
    line.confidence = result.confidence;

    if (
      result.confidence < categoryReviewThreshold ||
      result.categoryId === unclearCategoryId
    )
      line.issues.push(categoryUncertainIssue);
  }
}

/**
 * How one automatic reading compares with the receipt a person approved.
 * Counts are of the approved receipt's product lines, so they add up across
 * receipts into rates.
 */
export type ReadingScore = {
  /** The paid total was read as approved; null when the approved total is unknown. */
  totalCorrect: boolean | null;
  /** The read lines summed to the read total without a person's help. */
  balanced: boolean;
  products: number;
  amountsCorrect: number;
  namesKept: number;
  /** Approved lines with a decided category, and how many of those the reading had right. */
  categorized: number;
  categoriesCorrect: number;
  /** Read product lines left for a person: an unclear category, or another flagged issue. */
  categoriesUnclear: number;
  flaggedLines: number;
};

/**
 * Pair each approved product line with at most one read product line. Stored
 * readings keep their ids through review; a new reading of the same images
 * gets new ids, so the rest pair by printed text, then by amount. A line a
 * person added and nothing matches counts as missed.
 */
function pairProducts(reading: ReceiptData, approved: ReceiptLine[]) {
  const unused = new Set(
    reading.lines.filter((line) => line.kind === "product"),
  );

  const pairs = new Map<ReceiptLine, ReceiptLine>();

  const printed = (line: ReceiptLine) =>
    normalizeAlias(line.originalText || printedName(line));

  const rules: ((expected: ReceiptLine, read: ReceiptLine) => boolean)[] = [
    (expected, read) => expected.id === read.id,
    (expected, read) =>
      printed(expected) === printed(read) &&
      expected.amountOre === read.amountOre,
    (expected, read) => printed(expected) === printed(read),
    (expected, read) => expected.amountOre === read.amountOre,
  ];

  for (const rule of rules)
    for (const expected of approved) {
      if (pairs.has(expected)) continue;

      const match = [...unused].find((read) => rule(expected, read));

      if (!match) continue;
      pairs.set(expected, match);
      unused.delete(match);
    }

  return (line: ReceiptLine) => pairs.get(line) ?? null;
}

export function scoreReading(
  reading: ReceiptData,
  approved: ReceiptData,
): ReadingScore {
  const products = approved.lines.filter((line) => line.kind === "product");

  const counted = (predicate: (line: ReceiptLine) => boolean) =>
    products.filter(predicate).length;

  const pair = pairProducts(reading, products);

  const categorized = products.filter((line) =>
    isDecidedCategory(line.categoryId),
  );

  const readProducts = reading.lines.filter((line) => line.kind === "product");

  return {
    totalCorrect:
      approved.totalOre === null
        ? null
        : reading.totalOre === approved.totalOre,
    balanced: reconcile(reading).difference === 0,
    products: products.length,
    amountsCorrect: counted((line) => pair(line)?.amountOre === line.amountOre),
    namesKept: counted((line) => {
      const other = pair(line);

      return (
        !!other && normalizeAlias(other.name) === normalizeAlias(line.name)
      );
    }),
    categorized: categorized.length,
    categoriesCorrect: categorized.filter(
      (line) => pair(line)?.categoryId === line.categoryId,
    ).length,
    categoriesUnclear: readProducts.filter(
      (line) =>
        line.categoryId === unclearCategoryId ||
        line.issues.some(isCategoryUncertain),
    ).length,
    flaggedLines: reading.lines.filter(
      (line) =>
        !isTotalsLine(line.kind) &&
        line.issues.some((issue) => !isCategoryUncertain(issue)),
    ).length,
  };
}

export type ReadingSummary = {
  receipts: number;
  totalsChecked: number;
  totalsCorrect: number;
  balanced: number;
} & Omit<ReadingScore, "totalCorrect" | "balanced">;

export function summarizeReadings(
  scores: readonly ReadingScore[],
): ReadingSummary {
  const sum = (pick: (score: ReadingScore) => number) =>
    scores.reduce((total, score) => total + pick(score), 0);

  return {
    receipts: scores.length,
    totalsChecked: sum((score) => (score.totalCorrect === null ? 0 : 1)),
    totalsCorrect: sum((score) => (score.totalCorrect ? 1 : 0)),
    balanced: sum((score) => (score.balanced ? 1 : 0)),
    products: sum((score) => score.products),
    amountsCorrect: sum((score) => score.amountsCorrect),
    namesKept: sum((score) => score.namesKept),
    categorized: sum((score) => score.categorized),
    categoriesCorrect: sum((score) => score.categoriesCorrect),
    categoriesUnclear: sum((score) => score.categoriesUnclear),
    flaggedLines: sum((score) => score.flaggedLines),
  };
}
