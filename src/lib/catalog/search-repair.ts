import { v } from "convex/values";
import type { ReceiptLine } from "../domain/receipt";
import { lineEvidenceKey } from "./matching";
import { productSearch } from "./search";

export const searchRepairValidator = v.object({
  lineId: v.string(),
  evidenceKey: v.string(),
  search: v.union(v.string(), v.null()),
});
export type SearchRepair = {
  lineId: string;
  evidenceKey: string;
  search: string | null;
};

export function savedSearchRepair(
  repairs: SearchRepair[] | undefined,
  line: ReceiptLine,
) {
  return repairs?.find(
    (repair) =>
      repair.lineId === line.id && repair.evidenceKey === lineEvidenceKey(line),
  );
}

export function searchSuggestionKey(store: string | null, line: ReceiptLine) {
  return JSON.stringify([
    productSearch(store ?? ""),
    productSearch(line.name),
    line.brand,
    line.packageSize,
    line.packageUnit,
    line.attributes,
  ]);
}
