import {
  isCategoryUncertain,
  parseReceiptIssue,
  receiptIssueText,
} from "./receipt-issues";
import {
  emptyLine,
  reconcile,
  parseReceipt,
  type ParsedReceipt,
  type ReceiptData,
  type ReceiptLine,
} from "./receipt";
import { categoryById } from "./categories";

export { categoryUncertainIssue, isCategoryUncertain } from "./receipt-issues";

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
        : line.issues.filter((issue) => !isCategoryUncertain(issue)),
  };
}

/** A line whose only open question is its suggested category can be confirmed in one step. */
export function canConfirmSuggestedCategory(
  line: ReceiptLine,
): line is ReceiptLine & { categoryId: string } {
  return (
    line.kind === "product" &&
    !!line.categoryId &&
    line.categoryId !== "fallback.unclear" &&
    categoryById.has(line.categoryId) &&
    line.issues.some(isCategoryUncertain)
  );
}

/** Accept every suggested category that only needs confirmation. Other issues stay open. */
export function confirmSuggestedCategories(data: ReceiptData): ReceiptData {
  return {
    ...data,
    lines: data.lines.map((line) =>
      canConfirmSuggestedCategory(line)
        ? confirmLineCategory(line, line.categoryId)
        : line,
    ),
  };
}

export function lineReviewIssues(line: ReceiptLine): string[] {
  const issues = line.issues.map((issue) =>
    receiptIssueText(parseReceiptIssue(issue)),
  );

  if (!["summary", "vat"].includes(line.kind) && line.amountOre === null)
    issues.push("Beløpet mangler.");

  if (line.kind === "product" && !line.name.trim())
    issues.push("Varenavnet mangler.");

  return [...new Set(issues)];
}

export function receiptReviewIssues(data: ReceiptData): string[] {
  return [
    ...new Set([
      ...data.issues.map((issue) => receiptIssueText(parseReceiptIssue(issue))),
      ...reconcile(data).issues,
      ...(!data.store?.trim() ? ["Butikken mangler."] : []),
      ...(!data.lines.some((line) => line.kind === "product")
        ? ["Ingen varer er lest."]
        : []),
    ]),
  ];
}

/**
 * Approve receipt facts without confirming or learning suggested categories.
 * Material receipt errors still require a person to review them.
 */
export function quickApproveData(
  data: ReceiptData | null,
  unresolvedDuplicate: boolean,
): ReceiptData | null {
  if (!data) return null;

  return canAcceptReceipt(data, unresolvedDuplicate) ? data : null;
}

/**
 * Close a small gap between the lines and the printed total with an explicit
 * adjustment line, so the receipt balances without guessing which line is off.
 */
export function balanceWithAdjustment(
  data: ReceiptData,
  id: string,
): ReceiptData {
  const { difference } = reconcile(data);

  if (difference === null || difference === 0) return data;

  return {
    ...data,
    lines: [
      ...data.lines,
      {
        ...emptyLine(id),
        kind: "adjustment",
        name: "Justering mot betalt beløp",
        amountOre: -difference,
        categoryId: null,
      },
    ],
  };
}

/** Categories, product matching, and package information do not block receipt approval. */
export function canAcceptReceipt(
  data: ReceiptData,
  unresolvedDuplicate: boolean,
): boolean {
  const parsed = parseReceipt(data);

  return (
    parsed.kind === "parsed" &&
    assessReceipt(parsed.receipt, unresolvedDuplicate).acceptable
  );
}

export type ReviewTask =
  | { kind: "duplicate" }
  | { kind: "store" }
  | { kind: "total" }
  | { kind: "date" }
  | { kind: "currency" }
  | { kind: "difference"; amountOre: number }
  | { kind: "no-lines" }
  | { kind: "amounts"; count: number }
  | { kind: "names"; count: number }
  | { kind: "line-issues"; count: number }
  | { kind: "receipt-issues"; issues: string[] };

/**
 * Everything standing between the receipt and approval, grouped the way a
 * person would fix it: receipt facts first, then the affected product lines.
 */
export function assessReceipt(
  data: ParsedReceipt,
  unresolvedDuplicate: boolean,
) {
  const tasks: ReviewTask[] = [];

  if (unresolvedDuplicate) tasks.push({ kind: "duplicate" });

  if (!data.store?.trim()) tasks.push({ kind: "store" });

  if (data.totalOre === null) tasks.push({ kind: "total" });

  if (!data.purchaseDate) tasks.push({ kind: "date" });

  if (data.currency !== "NOK") tasks.push({ kind: "currency" });
  const totals = reconcile(data);

  if (
    totals.difference !== null &&
    totals.difference !== 0 &&
    totals.unknown === 0
  )
    tasks.push({ kind: "difference", amountOre: totals.difference });

  if (!data.lines.some((line) => line.kind === "product"))
    tasks.push({ kind: "no-lines" });

  const receiptIssues = [
    ...new Set([
      ...data.issues,
      ...totals.reviewIssues
        .filter((issue) =>
          [
            "duplicate_discount",
            "positive_discount",
            "positive_deposit_return",
          ].includes(issue.code),
        )
        .map(receiptIssueText),
    ]),
  ];

  if (receiptIssues.length)
    tasks.push({ kind: "receipt-issues", issues: receiptIssues });

  const counted = (predicate: (line: ReceiptLine) => boolean) =>
    data.lines.filter(predicate).length;

  const amounts = counted(
    (line) =>
      !["summary", "vat"].includes(line.kind) && line.amountOre === null,
  );

  if (amounts) tasks.push({ kind: "amounts", count: amounts });
  const names = counted((line) => line.kind === "product" && !line.name.trim());

  if (names) tasks.push({ kind: "names", count: names });

  const other = counted((line) =>
    line.issues.some((issue) => !isCategoryUncertain(issue)),
  );

  if (other) tasks.push({ kind: "line-issues", count: other });

  return { acceptable: tasks.length === 0, tasks };
}

export function reviewTasks(
  data: ReceiptData,
  unresolvedDuplicate: boolean,
): ReviewTask[] {
  const parsed = parseReceipt(data);

  return parsed.kind === "parsed"
    ? assessReceipt(parsed.receipt, unresolvedDuplicate).tasks
    : [{ kind: "receipt-issues", issues: [parsed.issue.message] }];
}

/** Short, plain-language summary of what a receipt still needs, for lists. */
export function reviewSummary(
  data: ReceiptData | null,
  unresolvedDuplicate: boolean,
): string[] {
  if (!data) return [];

  const plural = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;

  return reviewTasks(data, unresolvedDuplicate).map((task) => {
    switch (task.kind) {
      case "duplicate":
        return "Mulig duplikat";
      case "store":
        return "Butikk mangler";
      case "total":
        return "Betalt beløp mangler";
      case "date":
        return "Dato mangler";
      case "currency":
        return "Valuta må sjekkes";
      case "difference":
        return "Beløpene stemmer ikke";
      case "no-lines":
        return "Ingen varer lest";
      case "receipt-issues":
        return plural(task.issues.length, "merknad", "merknader");
      case "amounts":
        return `${task.count} beløp mangler`;
      case "names":
        return `${task.count} navn mangler`;
      case "line-issues":
        return plural(task.count, "vare å sjekke", "varer å sjekke");
    }
  });
}
