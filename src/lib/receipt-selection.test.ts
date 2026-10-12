import { expect, it } from "vitest";
import {
  createReceiptSelector,
  historyPage,
  isPinned,
  listedInHistory,
} from "./receipt-selection";
import { receiptFixture, testId } from "./testing/receipts";
import { date } from "./testing/calendar";
import { receiptListItem } from "./domain/receipt-summary";

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
  const statuses = [
    "uploading",
    "uploaded",
    "processing",
    "needs_review",
    "failed",
    "reviewed",
  ] as const;

  const receipts = statuses.flatMap((status) =>
    [false, true].map((excluded) =>
      receiptFixture({
        _id: testId<"receipts">(`${status}-${excluded}`),
        status,
        excluded,
      }),
    ),
  );

  for (const receipt of receipts)
    expect(listedInHistory(receipt, "")).toBe(!isPinned(receipt));

  // Any search term hides the pinned sections; matching the text is selectReceiptHistory's job.
  const anySearch = "x";

  expect(
    receipts.flatMap((receipt) =>
      listedInHistory(receipt, anySearch) ? [receipt._id] : [],
    ),
  ).toEqual([
    testId("uploading-true"),
    testId("uploaded-true"),
    testId("processing-true"),
    testId("needs_review-false"),
    testId("needs_review-true"),
    testId("failed-false"),
    testId("failed-true"),
    testId("reviewed-false"),
    testId("reviewed-true"),
  ]);
  expect(
    receipts.flatMap((receipt) => (isPinned(receipt) ? [receipt._id] : [])),
  ).toEqual([
    testId("uploading-false"),
    testId("uploaded-false"),
    testId("processing-false"),
    testId("needs_review-false"),
    testId("failed-false"),
  ]);
});

it("pages history by whole months, keeping the undated tail together", () => {
  const item = (id: string, day: string | null) => ({
    ...receiptListItem(receiptFixture({ _id: testId<"receipts">(id) })),
    purchaseDate: day === null ? null : date(day),
  });

  const history = [
    item("september", "2026-09-02"),
    item("august-late", "2026-08-20"),
    item("august-early", "2026-08-01"),
    item("undated-first", null),
    item("undated-second", null),
  ];

  const page = (limit: number) =>
    historyPage(history, limit).map((receipt) => receipt._id);

  expect(page(1)).toEqual([testId("september")]);
  expect(page(2)).toEqual([
    testId("september"),
    testId("august-late"),
    testId("august-early"),
  ]);
  expect(page(4)).toHaveLength(5);
  expect(page(10)).toHaveLength(5);
});
