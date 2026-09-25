import { date, month } from "../testing/calendar";
import { present, receiptFixture, testId } from "../testing/receipts";
import { Ore } from "./ore";
import { expect, it } from "vitest";
import { emptyLine } from "./receipt";
import { batteryFixture } from "../mock-receipts";
import {
  comparisonInsights,
  spendingCalendar,
  productPrices,
  matchLabel,
  receiptCoverage,
  type Receipt,
  type Contribution,
} from "./insights";

function receipt(day: string, ore = 1000): Receipt {
  const data = batteryFixture();
  data.purchaseDate = date(day);
  data.lines = [{ ...emptyLine("item"), amountOre: Ore.of(ore) }];
  data.totalOre = Ore.of(ore);

  return receiptFixture({
    _id: day,
    _creationTime: 0,
    status: "reviewed",
    data,
  });
}

it("compares the same part of the current month and excludes later purchases", () => {
  const result = comparisonInsights(
    [
      receipt("2026-09-10"),
      receipt("2026-09-20"),
      receipt("2026-08-10", 500),
      receipt("2026-08-20", 2000),
    ],
    month("2026-09"),
    false,
    date("2026-09-17"),
  );

  expect(result.current.products).toBe(1000);
  expect(result.previous.products).toBe(500);
  expect(present(result.changes[0]).difference).toBe(500);
});

it("handles year boundaries, leap days and completed months", () => {
  expect(
    comparisonInsights([], month("2026-01"), false, date("2026-01-17"))
      .previousEnd,
  ).toBe("2025-12-17");
  expect(
    comparisonInsights([], month("2024-03"), false, date("2024-03-31"))
      .previousEnd,
  ).toBe("2024-02-29");

  const result = comparisonInsights(
    [receipt("2026-08-31")],
    month("2026-08"),
    false,
    date("2026-09-17"),
  );

  expect(result.current.products).toBe(1000);
  expect(result.partial).toBe(false);
});

function contribution(
  day: string,
  ore: number,
  size: number | null,
): Contribution {
  return {
    receipt: receipt(day),
    line: {
      ...emptyLine(),
      quantity: 1,
      packageSize: size,
      packageUnit: size ? "g" : null,
    },
    amountOre: Ore.of(ore),
  };
}

it("calculates purchase totals and median amounts in øre", () => {
  const result = productPrices([
    contribution("2026-09-03", 6000, null),
    contribution("2026-09-02", 3000, 500),
    contribution("2026-09-01", 2000, 500),
  ]);

  expect(result.latest).toBe(6000);
  expect(result.typical).toBe(3000);
  expect(result.lowest).toBe(2000);
  expect(result.omitted).toBe(0);
});

it("does not graph returns", () => {
  const result = productPrices([
    contribution("2026-09-01", 2000, null),
    contribution("2026-09-02", -1000, null),
  ]);

  expect(result.latest).toBe(2000);
  expect(result.omitted).toBe(1);
});

it("distinguishes automatic links from user confirmation and excludes duplicate coverage", () => {
  const line = {
    ...emptyLine(),
    productId: testId<"products">("product"),
  };

  expect(matchLabel(line)).toBe("Automatisk koblet");
  expect(matchLabel({ ...line, productMatchManual: true })).toBe(
    "Bekreftet av deg",
  );
  const item = receipt("2026-09-01");
  expect(
    receiptCoverage([item, { ...item, excluded: true }]).unlinkedCount,
  ).toBe(1);
});

it("aggregates calendar dates with discounts, excludes pant, and applies receipt filters", () => {
  const data = batteryFixture();
  data.purchaseDate = date("2026-09-07");
  const purchase = { ...receipt("2026-09-07"), data };

  const second = receiptFixture({
    ...receipt("2026-09-07", 1000),
    status: "needs_review",
  });

  const excluded = { ...receipt("2026-09-07", 9000), excluded: true };

  const foreign = {
    ...receipt("2026-09-07"),
    data: { ...data, currency: "EUR" },
  };

  const calendar = spendingCalendar(
    [purchase, second, excluded, foreign, receipt("2026-10-01")],
    2026,
    false,
    "2026-09-17",
  );

  const day = calendar.find((d) => d.date === "2026-09-07")!;
  expect(day.amountOre).toBe(3331);
  expect(day.contributions).toHaveLength(2);
  expect(day.provisional).toBe(1);
  expect(day.level).toBe(4);
  expect(calendar.find((d) => d.date === "2026-10-01")?.future).toBe(true);
  expect(
    spendingCalendar([purchase, second], 2026, true, "2026-09-17").find(
      (d) => d.date === "2026-09-07",
    )?.amountOre,
  ).toBe(2331);
});

it("keeps leap days, empty dates and negative totals without colouring refunds as spending", () => {
  const calendar = spendingCalendar(
    [receipt("2024-02-29", -1000)],
    2024,
    false,
    "2025-01-01",
  );

  expect(calendar).toHaveLength(366);
  expect(calendar.find((d) => d.date === "2024-02-29")).toMatchObject({
    amountOre: Ore.of(-1000),
    level: 0,
  });
  expect(calendar[0]).toMatchObject({
    amountOre: Ore.of(0),
    level: 0,
    contributions: [],
  });
});

it("uses stronger calendar colours for larger daily amounts", () => {
  const days = spendingCalendar(
    [
      receipt("2026-01-01", 100),
      receipt("2026-01-02", 500),
      receipt("2026-01-03", 1000),
      receipt("2026-01-04", 2000),
    ],
    2026,
    false,
    "2026-09-17",
  );

  expect(days.slice(0, 4).map((day) => day.level)).toEqual([1, 1, 2, 4]);
});
