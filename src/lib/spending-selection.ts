import type { SpendingGroup } from "./domain/insights";
export type SpendingDimension =
  | "group"
  | "category"
  | "store"
  | "type"
  | "catalogProduct"
  | "catalogBrand"
  | "catalogStore"
  | "attributeType"
  | "attributeSugar"
  | "attributePreparation"
  | "calendar"
  | "accounting"
  | "change"
  | "coverage"
  | "effect";
export type SpendingSelection = {
  period: string;
  dimension: SpendingDimension;
  key: string;
};
/** A changed period or removed group closes the detail view. */
export function resolveSpendingSelection(
  selection: SpendingSelection | null,
  period: string,
  groups: Partial<Record<SpendingDimension, readonly SpendingGroup[]>>,
): SpendingGroup | null {
  if (!selection || selection.period !== period) return null;
  const selected = groups[selection.dimension]?.find(
    (group) => group.id === selection.key,
  );
  return selected?.contributions.length ? selected : null;
}
