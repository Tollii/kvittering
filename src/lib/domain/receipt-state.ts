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

/** How long an upload may go without a new image before it counts as abandoned. */
export const abandonedUploadMs = 24 * 60 * 60 * 1000;

/**
 * An upload with no new image for a day. The phone that reserved it has most
 * likely lost the capture, for example by a reinstall, so nothing will finish
 * it and a person may delete it.
 */
export function isUploadAbandoned(lastProgressAt: number, now: number) {
  return now - lastProgressAt >= abandonedUploadMs;
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

/**
 * Something that happens to a stored receipt. A read and an edit carry the
 * approval policy's decision, because the policy, not the lifecycle, decides
 * whether the result is reviewed.
 */
export type ReceiptEvent =
  | { kind: "upload_completed" }
  | { kind: "reading_started" }
  | { kind: "read"; reviewed: boolean }
  | { kind: "reading_failed" }
  | { kind: "retried" }
  | { kind: "edited"; reviewed: boolean }
  | { kind: "product_linked" };

type ReceiptEventKind = ReceiptEvent["kind"];

/**
 * The statuses each event may leave: the receipt lifecycle's only legal moves.
 * Every writer of `status` goes through `receiptTransition`, so a move that is
 * missing here cannot happen.
 *
 * A read receipt can be read again, not only a failed one: installed clients
 * offer "Les bildene på nytt" in the editor's menu for any receipt that is not
 * being processed, and a misread receipt with no edits gets a fresh reading.
 */
const acceptedStatuses: Record<ReceiptEventKind, readonly ReceiptStatus[]> = {
  upload_completed: ["uploading"],
  reading_started: ["uploaded"],
  read: ["processing"],
  reading_failed: ["uploaded", "processing"],
  retried: ["needs_review", "reviewed", "failed"],
  edited: ["needs_review", "reviewed", "failed"],
  product_linked: ["needs_review", "reviewed"],
};

/** Whether a receipt in this status accepts the event. */
export function acceptsReceiptEvent(
  status: ReceiptStatus,
  kind: ReceiptEventKind,
): boolean {
  return acceptedStatuses[kind].includes(status);
}

/** The status after the event, or null when the receipt does not accept it. */
export function receiptTransition(
  from: ReceiptStatus,
  event: ReceiptEvent,
): ReceiptStatus | null {
  if (!acceptsReceiptEvent(from, event.kind)) return null;

  switch (event.kind) {
    case "upload_completed":
    case "retried":
      return "uploaded";
    case "reading_started":
      return "processing";
    case "reading_failed":
      return "failed";
    case "read":
    case "edited":
      return event.reviewed ? "reviewed" : "needs_review";
    case "product_linked":
      return from;
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
