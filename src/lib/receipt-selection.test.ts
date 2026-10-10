import { expect, it } from "vitest";
import {
  createReceiptSelector,
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

it("keeps receipts that are still being read out of the months until they are read, unless excluded", () => {
  const receipt = (
    id: string,
    status: "processing" | "needs_review",
    excluded = false,
  ) => receiptFixture({ _id: testId<"receipts">(id), status, excluded });

  const listed = selectReceiptHistory(
    [
      receipt("reading", "processing"),
      receipt("excluded", "processing", true),
      receipt("review", "needs_review"),
    ],
    "",
  ).map((item) => item._id);

  expect(listed).toEqual([testId("excluded"), testId("review")]);
});
