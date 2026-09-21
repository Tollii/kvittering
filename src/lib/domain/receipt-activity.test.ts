import { describe, expect, it } from "vitest";
import { receiptActivityProgress } from "./receipt-activity";

describe("receipt activity progress", () => {
  it("counts accepted receipts and receipts awaiting review as processed", () => {
    expect(
      receiptActivityProgress([
        "uploading",
        "processing",
        "needs_review",
        "reviewed",
      ]),
    ).toEqual({ total: 4, completed: 2, failed: 0, ended: false });
  });
  it("ends a batch with failures without reporting those failures as completed receipts", () => {
    expect(receiptActivityProgress(["reviewed", "failed", null])).toEqual({
      total: 3,
      completed: 1,
      failed: 2,
      ended: true,
    });
  });
  it("ends expired tracking without inventing completion", () => {
    expect(receiptActivityProgress(["processing", "reviewed"], true)).toEqual({
      total: 2,
      completed: 1,
      failed: 0,
      ended: true,
    });
  });
});
