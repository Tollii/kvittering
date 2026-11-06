import { expect, it } from "vitest";
import { testId } from "../testing/receipts";
import {
  attentionStatuses,
  duplicateState,
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

it("only holds back a receipt that matches another and is still undecided", () => {
  const other = testId<"receipts">("other");

  expect(
    duplicateState({ duplicateOf: undefined, duplicateResolved: false }),
  ).toBe("none");
  expect(
    duplicateState({ duplicateOf: undefined, duplicateResolved: true }),
  ).toBe("none");
  expect(duplicateState({ duplicateOf: other, duplicateResolved: false })).toBe(
    "suspected",
  );
  expect(duplicateState({ duplicateOf: other, duplicateResolved: true })).toBe(
    "separate",
  );
});
