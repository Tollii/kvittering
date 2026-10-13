import { date, month } from "../testing/calendar";
import { receiptFixture } from "../testing/receipts";
import { Ore } from "./ore";
import { expect, it } from "vitest";
import { emptyLine } from "./receipt";
import { batteryFixture } from "../mock-receipts";
import type { Receipt } from "./insights";
import { spendingTrend, trendSeries } from "./spending-trend";

function receipt(day: string, lines: [category: string, ore: number][]) {
  const data = batteryFixture();
  data.purchaseDate = date(day);
  data.lines = lines.map(([categoryId, ore], index) => ({
    ...emptyLine(`${day}-${index}`),
    categoryId,
    amountOre: Ore.of(ore),
  }));
  data.totalOre = Ore.of(lines.reduce((sum, [, ore]) => sum + ore, 0));

  return receiptFixture({
    _id: day,
    _creationTime: 0,
    status: "reviewed",
    data,
  }) satisfies Receipt;
}

const receipts = [
  receipt("2025-12-05", [["dairy.cheese", 2000]]),
  receipt("2026-01-10", [
    ["dairy.cheese", 1000],
    ["drinks.coffee", 5000],
  ]),
  receipt("2026-03-02", [["drinks.coffee", 3000]]),
  receipt("2026-03-09", [["dairy.cheese", 4000]]),
];

it("averages whole months on record and leaves months without receipts unknown", () => {
  const trend = spendingTrend(receipts, month("2026-03"), date("2026-03-15"));
  const series = trendSeries(trend, null);

  expect(series.months.map((value) => value.month)).toEqual(
    [
      "2025-04",
      "2025-05",
      "2025-06",
      "2025-07",
      "2025-08",
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
    ].map(month),
  );
  expect(series.months.at(-1)).toMatchObject({
    amountOre: 7000,
    partial: true,
  });
  expect(series.months.at(-2)).toMatchObject({ recorded: false });
  // December and January only: February has no receipts and March is unfinished.
  expect(series).toMatchObject({ averageMonths: 2, averageOre: 4000 });
});

it("follows one category group and counts months on record without it as zero", () => {
  const trend = spendingTrend(receipts, month("2026-03"), date("2026-04-02"));
  const series = trendSeries(trend, "drinks");

  expect(trend.groups.map((group) => [group.id, group.amountOre])).toEqual([
    ["drinks", 8000],
    ["dairy", 7000],
  ]);
  expect(series.months.slice(-4).map((value) => value.amountOre)).toEqual([
    0, 5000, 0, 3000,
  ]);
  expect(series).toMatchObject({ averageMonths: 3, averageOre: 2667 });
});
