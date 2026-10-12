import { expect, it } from "vitest";
import {
  createReceiptSelector,
  listedInHistory,
  selectReceiptHistory,
} from "./receipt-selection";
import { receiptFixture, testId } from "./testing/receipts";

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

it("lists each receipt once: pinned receipts stay out of the months unless a search hides the pinned sections", () => {
  const receipt = (
    id: string,
    status: "processing" | "needs_review" | "failed" | "reviewed",
    excluded = false,
  ) => receiptFixture({ _id: testId<"receipts">(id), status, excluded });

  const receipts = [
    receipt("reading", "processing"),
    receipt("excluded", "processing", true),
    receipt("review", "needs_review"),
    receipt("failed", "failed"),
    receipt("reviewed", "reviewed"),
  ];

  const listed = (search: string) =>
    selectReceiptHistory(receipts, search).map((item) => item._id);

  expect(listed("")).toEqual([testId("excluded"), testId("reviewed")]);
  expect(listed("  ")).toEqual([testId("excluded"), testId("reviewed")]);
  expect(
    receipts.flatMap((item) =>
      listedInHistory(item, "kiwi") ? [item._id] : [],
    ),
  ).toEqual([
    testId("excluded"),
    testId("review"),
    testId("failed"),
    testId("reviewed"),
  ]);
});
