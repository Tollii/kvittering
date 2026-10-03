import { normalizeAlias, printedName, type ReceiptLine } from "./receipt";
import { isCategoryUncertain } from "./receipt-review";
import { isCategoryId, isDecidedCategory, type CategoryId } from "./categories";

/**
 * What the household has approved before, keyed only by store and printed
 * receipt text. Looser than an alias (no brand or size), so it settles the
 * category of an item without claiming product identity. A name the person
 * typed for that text is offered again on the next receipt.
 */
export type CategoryMemory = {
  categoryId: string;
  confirmations: number;
  name?: string;
};

/** Approvals needed before a remembered category is trusted on a new receipt. */
export const categoryMemoryThreshold = 2;

export function categoryMemoryKey(
  store: string | null,
  name: string,
): string | null {
  if (!store?.trim() || !name.trim()) return null;

  return JSON.stringify([normalizeAlias(store), normalizeAlias(name)]);
}

/** The name a person gave a printed line, when it differs from the print. */
export function renamedName(line: ReceiptLine): string | undefined {
  const name = line.name.trim();

  return name && name !== printedName(line).trim() ? name : undefined;
}

/**
 * One more approval for a line's category; a different decision starts over.
 * An item the person asked to remember, or gave a name of their own, is a
 * deliberate identification and is trusted at once. The name is always
 * present, so saving the result also clears a name remembered earlier.
 */
export function recordCategoryDecision(
  existing: CategoryMemory | null,
  line: ReceiptLine & { categoryId: CategoryId },
  remembered: boolean,
): CategoryMemory & { name: string | undefined } {
  const name = renamedName(line);
  const weight = remembered || name ? categoryMemoryThreshold : 1;

  const confirmations =
    existing && existing.categoryId === line.categoryId
      ? existing.confirmations + weight
      : weight;

  return { categoryId: line.categoryId, confirmations, name };
}

/** Lines a person approves count; suggestions the reader made on its own do not. */
export function learnableLine(
  line: ReceiptLine,
): line is ReceiptLine & { categoryId: CategoryId } {
  return (
    line.kind === "product" &&
    isDecidedCategory(line.categoryId) &&
    !line.issues.some(isCategoryUncertain)
  );
}

/**
 * Settle a line with what the household decided for its printed text: the
 * category and any name a person gave it replace the automatic suggestion,
 * and the category uncertainty goes. Lines a person edited by hand keep their
 * own category and name. Returns whether anything changed.
 */
export function settleLine(
  line: ReceiptLine,
  decision: { categoryId: CategoryId; name?: string },
): boolean {
  const categoryId = line.manual ? line.categoryId : decision.categoryId;
  const name = line.manual ? line.name : (decision.name ?? line.name);
  const issues = line.issues.filter((issue) => !isCategoryUncertain(issue));

  const changed =
    line.categoryId !== categoryId ||
    line.name !== name ||
    issues.length !== line.issues.length ||
    line.confidence !== 1;

  // The reader records the printed text; lines saved before it did keep
  // theirs here before a remembered name replaces it.
  line.receiptName ??= line.name;
  line.name = name;
  line.categoryId = categoryId;
  line.issues = issues;
  line.confidence = 1;

  return changed;
}

/** Settle a freshly read line from memory. Returns whether anything changed. */
export function applyCategoryMemory(
  line: ReceiptLine,
  memory: CategoryMemory,
): boolean {
  if (
    line.kind !== "product" ||
    line.manual ||
    !isCategoryId(memory.categoryId) ||
    memory.confirmations < categoryMemoryThreshold
  )
    return false;

  return settleLine(line, { categoryId: memory.categoryId, name: memory.name });
}
