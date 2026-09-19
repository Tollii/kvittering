import { normalizeAlias, type ReceiptLine } from "./receipt";
import { isCategoryUncertain } from "./receipt-review";
import { categoryById } from "./categories";

/**
 * What the household has approved before, keyed only by store and receipt
 * name. Looser than an alias (no brand or size), so it settles the category
 * of an item without claiming product identity.
 */
export type CategoryMemory = { categoryId: string; confirmations: number };

/** Approvals needed before a remembered category is trusted on a new receipt. */
export const categoryMemoryThreshold = 2;

export function categoryMemoryKey(
  store: string | null,
  name: string,
): string | null {
  if (!store?.trim() || !name.trim()) return null;
  return JSON.stringify([normalizeAlias(store), normalizeAlias(name)]);
}

/** One more approval for a category; a different decision starts over. */
export function recordCategoryDecision(
  existing: CategoryMemory | null,
  categoryId: string,
  weight = 1,
): CategoryMemory {
  return existing && existing.categoryId === categoryId
    ? { categoryId, confirmations: existing.confirmations + weight }
    : { categoryId, confirmations: weight };
}

/** Lines a person approves count; suggestions the reader made on its own do not. */
export function learnableLine(line: ReceiptLine): boolean {
  return (
    line.kind === "product" &&
    !!line.categoryId &&
    categoryById.has(line.categoryId) &&
    line.categoryId !== "fallback.unclear" &&
    !line.issues.some(isCategoryUncertain)
  );
}

/** Settle a freshly read line from memory. Returns whether anything changed. */
export function applyCategoryMemory(
  line: ReceiptLine,
  memory: CategoryMemory,
): boolean {
  if (
    line.kind !== "product" ||
    line.manual ||
    !categoryById.has(memory.categoryId) ||
    memory.confirmations < categoryMemoryThreshold
  )
    return false;
  const issues = line.issues.filter((issue) => !isCategoryUncertain(issue));
  const changed =
    line.categoryId !== memory.categoryId ||
    issues.length !== line.issues.length ||
    line.confidence !== 1;
  line.categoryId = memory.categoryId;
  line.issues = issues;
  line.confidence = 1;
  return changed;
}
