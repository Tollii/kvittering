import { expect, it } from "vitest";
import {
  attentionStatuses,
  hasReceiptBeenRead,
  isReceiptBeingRead,
  isReceiptProcessing,
  needsAttention,
  type ReceiptStatus,
} from "./receipt-state";

const statuses: ReceiptStatus[] = [
  "uploading",
  "uploaded",
  "processing",
  "needs_review",
  "reviewed",
  "failed",
];

const matching = (predicate: (status: ReceiptStatus) => boolean) =>
  statuses.filter(predicate);

it("treats a receipt as processing until its images have been read", () => {
  expect(matching(isReceiptProcessing)).toEqual([
    "uploading",
    "uploaded",
    "processing",
  ]);
  expect(matching(isReceiptBeingRead)).toEqual(["uploaded", "processing"]);
});

it("separates read receipts from those that need a person", () => {
  expect(matching(hasReceiptBeenRead)).toEqual(["needs_review", "reviewed"]);
  expect(matching(needsAttention)).toEqual([...attentionStatuses]);
});
