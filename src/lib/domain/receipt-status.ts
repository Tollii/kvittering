import { v, type Infer } from "convex/values";

export const receiptStatusValidator = v.union(
  v.literal("uploading"),
  v.literal("uploaded"),
  v.literal("processing"),
  v.literal("needs_review"),
  v.literal("reviewed"),
  v.literal("failed"),
);

export type ReceiptStatus = Infer<typeof receiptStatusValidator>;

/**
 * Images are still arriving or being read. The receipt's data may change, so
 * it cannot be edited, retried, or enriched yet.
 */
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
