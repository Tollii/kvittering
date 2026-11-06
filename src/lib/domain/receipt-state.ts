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

/** `approval` follows the event's decision; `unchanged` keeps the status. */
type ReceiptTarget = ReceiptStatus | "approval" | "unchanged";

/**
 * The receipt lifecycle's only legal moves. Every writer of `status` goes
 * through `receiptTransition`, so a move that is missing here cannot happen.
 *
 * Only a failed receipt is read again: every installed client offers
 * "Les bildene på nytt" only on failure, and a retry of a read receipt would
 * drop it back to review without new data.
 */
const receiptTransitions: Record<
  ReceiptEventKind,
  { from: readonly ReceiptStatus[]; to: ReceiptTarget }
> = {
  upload_completed: { from: ["uploading"], to: "uploaded" },
  reading_started: { from: ["uploaded"], to: "processing" },
  read: { from: ["processing"], to: "approval" },
  reading_failed: { from: ["uploaded", "processing"], to: "failed" },
  retried: { from: ["failed"], to: "uploaded" },
  edited: { from: ["needs_review", "reviewed", "failed"], to: "approval" },
  product_linked: { from: ["needs_review", "reviewed"], to: "unchanged" },
};

/** Whether a receipt in this status accepts the event. */
export function acceptsReceiptEvent(
  status: ReceiptStatus,
  kind: ReceiptEventKind,
): boolean {
  return receiptTransitions[kind].from.includes(status);
}

/** The status after the event, or null when the receipt does not accept it. */
export function receiptTransition(
  from: ReceiptStatus,
  event: ReceiptEvent,
): ReceiptStatus | null {
  const { from: accepted, to } = receiptTransitions[event.kind];

  if (!accepted.includes(from)) return null;

  if (to === "unchanged") return from;

  if (to !== "approval") return to;

  return "reviewed" in event && event.reviewed ? "reviewed" : "needs_review";
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
