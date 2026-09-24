import { CalendarDate } from "./calendar";
import { Ore } from "./ore";
import type { Receipt } from "./insights";
import { extractedReceipt, type ExtractedReceipt } from "./receipt-state";
import { reconcile, spendingLines, type ReceiptLine } from "./receipt";
import {
  productAnalysisVersion,
  purchaseEvidenceKey,
  type ProductAnalysisResult,
} from "./product-families";

export type PurchasePolicy = {
  currency: "NOK" | "all";
  provisional: "include" | "exclude";
  duplicates: "include" | "exclude";
  period?: { start: CalendarDate; end: CalendarDate };
  undated: "include" | "exclude";
};

export const overviewPurchasePolicy: PurchasePolicy = {
  currency: "NOK",
  provisional: "include",
  duplicates: "include",
  undated: "include",
};

export const comparisonPurchasePolicy: PurchasePolicy = {
  ...overviewPurchasePolicy,
  duplicates: "exclude",
  undated: "exclude",
};

export type PreparedPurchase = {
  receipt: ExtractedReceipt;
  line: ReceiptLine & { netOre: Ore };
  amountOre: Ore;
  analysis: ProductAnalysisResult | undefined;
};

export function currentAnalysis(receipt: Receipt) {
  const analysis = receipt.productAnalysis;

  return analysis?.version === productAnalysisVersion &&
    analysis.generation === receipt.generation &&
    analysis.revision === receipt.revision
    ? analysis
    : undefined;
}

/** One preparation pass owns inclusion, accounting, and current analysis evidence. */
export function preparePurchases(
  receipts: readonly Receipt[],
  policy: PurchasePolicy,
) {
  return receipts.flatMap((row) => {
    const receipt = extractedReceipt(row);

    if (!receipt) return [];
    const { data } = receipt;

    if (
      receipt.excluded ||
      (policy.currency === "NOK" && data.currency !== "NOK") ||
      (policy.provisional === "exclude" && receipt.status !== "reviewed") ||
      (policy.duplicates === "exclude" &&
        receipt.duplicateOf &&
        !receipt.duplicateResolved) ||
      (!data.purchaseDate && policy.undated === "exclude") ||
      (policy.period &&
        (!data.purchaseDate ||
          data.purchaseDate < policy.period.start ||
          data.purchaseDate > policy.period.end))
    )
      return [];
    const analysis = currentAnalysis(receipt);

    const byLine = new Map(
      analysis?.state === "complete"
        ? analysis.results.map((result) => [result.lineId, result])
        : [],
    );

    const spending = spendingLines(data);

    const purchases: PreparedPurchase[] = spending.products.map((line) => {
      const result = byLine.get(line.id);

      return {
        receipt,
        line,
        amountOre: line.netOre,
        analysis:
          result?.evidenceKey === purchaseEvidenceKey(line)
            ? result
            : undefined,
      };
    });

    return [
      {
        receipt,
        data,
        totals: reconcile(data),
        purchases,
        unallocated: spending.unallocated,
        analysisState: analysis?.state ?? "pending",
      },
    ];
  });
}
