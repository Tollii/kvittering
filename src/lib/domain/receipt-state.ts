import { v, type Infer } from "convex/values";
import type { Doc } from "../../../convex/_generated/dataModel";
import type { ReceiptData } from "./receipt";

export const receiptStatusValidator = v.union(
  v.literal("uploading"),
  v.literal("uploaded"),
  v.literal("processing"),
  v.literal("needs_review"),
  v.literal("reviewed"),
  v.literal("failed"),
);

export type ReceiptStatus = Infer<typeof receiptStatusValidator>;

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

/** All images arrived and extraction was requested or is running. */
export function isReceiptBeingRead(status: ReceiptStatus): boolean {
  switch (status) {
    case "uploaded":
    case "processing":
      return true;
    case "uploading":
    case "needs_review":
    case "reviewed":
    case "failed":
      return false;
  }
}

/** Extraction succeeded, so the receipt has purchase data a person can use. */
export function hasReceiptBeenRead(status: ReceiptStatus): boolean {
  switch (status) {
    case "needs_review":
    case "reviewed":
      return true;
    case "uploading":
    case "uploaded":
    case "processing":
    case "failed":
      return false;
  }
}

/** Statuses that wait for a person: a review to confirm or a failure to resolve. */
export const attentionStatuses = ["needs_review", "failed"] as const;

export function needsAttention(status: ReceiptStatus): boolean {
  switch (status) {
    case "needs_review":
    case "failed":
      return true;
    case "uploading":
    case "uploaded":
    case "processing":
    case "reviewed":
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
