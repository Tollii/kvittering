import { v, type Infer } from "convex/values";
import { isCategoryUncertain } from "./receipt-issues";
import { isDecidedCategory, unclearCategoryId } from "./categories";
import {
  isTotalsLine,
  normalizeAlias,
  printedName,
  reconcile,
  type ReceiptData,
  type ReceiptLine,
} from "./receipt";

/**
 * How one automatic reading compares with the receipt a person approved.
 * Counts are of the approved receipt's product lines, so they add up across
 * receipts into rates.
 */
export const readingScoreValidator = v.object({
  /** The paid total was read as approved; null when the approved total is unknown. */
  totalCorrect: v.union(v.boolean(), v.null()),
  /** The read lines summed to the read total without a person's help. */
  balanced: v.boolean(),
  products: v.number(),
  amountsCorrect: v.number(),
  namesKept: v.number(),
  /** Approved lines with a decided category, and how many of those the reading had right. */
  categorized: v.number(),
  categoriesCorrect: v.number(),
  /** Product lines the reading returned, and how many of those it left without a clear category. */
  readProducts: v.number(),
  categoriesUnclear: v.number(),
  /** Read lines with an issue other than category uncertainty. */
  flaggedLines: v.number(),
});

export type ReadingScore = Infer<typeof readingScoreValidator>;

/** Scores added up: the per-receipt flags become counts of receipts. */
export const readingSummaryValidator = readingScoreValidator
  .omit("totalCorrect", "balanced")
  .extend({
    receipts: v.number(),
    totalsChecked: v.number(),
    totalsCorrect: v.number(),
    balanced: v.number(),
  });

export type ReadingSummary = Infer<typeof readingSummaryValidator>;

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
    readProducts: readProducts.length,
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
