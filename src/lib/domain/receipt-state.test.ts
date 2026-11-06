import { expect, it } from "vitest";
import {
  abandonedUploadMs,
  attentionStatuses,
  hasReceiptBeenRead,
  isReceiptBeingRead,
  isReceiptProcessing,
  isUploadAbandoned,
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

it("counts an upload as abandoned after a full day without progress", () => {
  const lastProgress = Date.UTC(2026, 10, 1);

  expect(
    isUploadAbandoned(lastProgress, lastProgress + abandonedUploadMs - 1),
  ).toBe(false);
  expect(
    isUploadAbandoned(lastProgress, lastProgress + abandonedUploadMs),
  ).toBe(true);
});
