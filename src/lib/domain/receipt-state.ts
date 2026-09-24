import type { Doc } from "../../../convex/_generated/dataModel";
import type { ReceiptData } from "./receipt";

export type ReceiptStatus = Doc<"receipts">["status"];

/** Images are still uploading or being read, so the receipt's data may be missing or replaced. */
export function isReceiptProcessing(status: ReceiptStatus): boolean {
  switch (status) {
    case "uploading":
    case "uploaded":
    case "processing":
      return true;
    case "needs_review":
    case "reviewed":
    case "failed":
      return false;
  }
}

/** A stored receipt whose reader result is present. */
export type ExtractedReceipt = Doc<"receipts"> & { data: ReceiptData };

/** Parse a stored receipt once at an entry point so later steps can rely on its data. */
export function extractedReceipt(
  receipt: Doc<"receipts">,
): ExtractedReceipt | null {
  const { data } = receipt;

  return data ? { ...receipt, data } : null;
}
