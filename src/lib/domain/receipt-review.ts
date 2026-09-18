import { reconcile, type ReceiptData, type ReceiptLine } from "./receipt";
import { categoryById } from "./categories";

export const categoryReviewThreshold = 0.5;

/** A category decision resolves category uncertainty, not reading or amount errors. */
export function confirmLineCategory(
  line: ReceiptLine,
  categoryId: string,
): ReceiptLine {
  if (line.kind !== "product" || !categoryById.has(categoryId))
    throw new Error("Velg en gyldig varekategori.");
  return {
    ...line,
    categoryId,
    manual: true,
    confidence: 1,
    issues:
      categoryId === "fallback.unclear"
        ? line.issues
        : line.issues.filter((issue) => issue !== "Kategorien er usikker."),
  };
}

export function lineReviewIssues(line: ReceiptLine): string[] {
  const issues = [...line.issues];
  if (!["summary", "vat"].includes(line.kind) && line.amountOre === null)
    issues.push("Beløpet mangler.");
  if (line.kind === "product" && !line.name.trim())
    issues.push("Varenavnet mangler.");
  return [...new Set(issues)];
}

export function receiptReviewIssues(data: ReceiptData): string[] {
  return [
    ...new Set([
      ...data.issues,
      ...reconcile(data).issues,
      ...(!data.store?.trim() ? ["Butikken mangler."] : []),
      ...(!data.lines.some((line) => line.kind === "product")
        ? ["Ingen varer er lest."]
        : []),
    ]),
  ];
}

/** Product matching and optional package information do not require receipt review. */
export function canAcceptReceipt(
  data: ReceiptData,
  unresolvedDuplicate: boolean,
): boolean {
  return (
    !unresolvedDuplicate &&
    receiptReviewIssues(data).length === 0 &&
    data.lines.every((line) => lineReviewIssues(line).length === 0)
  );
}
