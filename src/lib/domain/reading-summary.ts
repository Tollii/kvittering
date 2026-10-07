import type { ReadingScore, ReadingSummary } from "./reading-evaluation";

/**
 * Scores added up into a summary. It has no runtime imports, so the eval
 * script adds up replayed scores itself instead of sending them back to the
 * deployment.
 */
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
    readProducts: sum((score) => score.readProducts),
    categoriesUnclear: sum((score) => score.categoriesUnclear),
    flaggedLines: sum((score) => score.flaggedLines),
  };
}
