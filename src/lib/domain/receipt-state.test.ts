import { expect, it } from "vitest";
import {
  attentionStatuses,
  hasReceiptBeenRead,
  isReceiptProcessing,
  needsAttention,
  receiptTransition,
  type ReceiptEvent,
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
});

it("separates read receipts from those that need a person", () => {
  expect(matching(hasReceiptBeenRead)).toEqual(["needs_review", "reviewed"]);
  expect(matching(needsAttention)).toEqual([...attentionStatuses]);
});

const events: ReceiptEvent[] = [
  { kind: "upload_completed" },
  { kind: "reading_started" },
  { kind: "read", reviewed: false },
  { kind: "read", reviewed: true },
  { kind: "reading_failed" },
  { kind: "retried" },
  { kind: "edited", reviewed: false },
  { kind: "edited", reviewed: true },
  { kind: "product_linked" },
];

const next = (status: ReceiptStatus) =>
  events.flatMap((event) => receiptTransition(status, event) ?? []);

it("leaves no status without a way to a read receipt", () => {
  for (const start of statuses) {
    const reached = new Set([start]);

    for (const status of reached)
      for (const after of next(status)) reached.add(after);

    expect([...reached]).toEqual(
      expect.arrayContaining(["needs_review", "reviewed"]),
    );
  }
});

it("refuses a person's change while images are uploading or being read", () => {
  for (const status of matching(isReceiptProcessing)) {
    expect(
      receiptTransition(status, { kind: "edited", reviewed: true }),
    ).toBeNull();
    expect(receiptTransition(status, { kind: "product_linked" })).toBeNull();
    expect(receiptTransition(status, { kind: "retried" })).toBeNull();
  }
});

it("lets the approval decision, not the previous status, settle a read or edit", () => {
  expect(
    receiptTransition("processing", { kind: "read", reviewed: false }),
  ).toBe("needs_review");
  expect(
    receiptTransition("reviewed", { kind: "edited", reviewed: false }),
  ).toBe("needs_review");
  expect(receiptTransition("failed", { kind: "edited", reviewed: true })).toBe(
    "reviewed",
  );
  expect(receiptTransition("reviewed", { kind: "product_linked" })).toBe(
    "reviewed",
  );
});
