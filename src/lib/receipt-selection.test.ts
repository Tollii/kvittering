import { expect, it } from "vitest";
import { createReceiptSelector } from "./receipt-selection";
import { receiptFixture } from "./testing/receipts";

it("reuses equivalent scopes and updates selections when their values or receipts change", () => {
  const select = createReceiptSelector();

  const receipts = [
    receiptFixture({ status: "needs_review", excluded: false }),
  ];

  const original = select(receipts, { kind: "inbox" });
  expect(original).toEqual(receipts);
  expect(select(receipts, { kind: "inbox" })).toBe(original);
  expect(
    select(receipts, {
      kind: "period",
      start: "2000-01-01",
      end: "2000-01-31",
    }),
  ).toEqual([]);
  expect(
    select([{ ...receipts[0]!, excluded: true }], { kind: "inbox" }),
  ).toEqual([]);
});
