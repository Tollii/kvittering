import { present, testId } from "../testing/receipts";
import { Ore } from "./ore";
import { spendingExplanations } from "./spending-explanations";
import { expect, it } from "vitest";
import { batteryFixture, emptyLine } from "./receipt";
import type { Receipt } from "./insights";
import {
  productAnalysisVersion,
  purchaseEvidenceKey,
} from "./product-families";
import { analysisPeriod, spendingAnalysis } from "./spending-analysis";
import { attributeInsights } from "./attribute-insights";
import { readAttributes } from "./product-attributes";

function receipt(date: string, ore: number, ml: number | null): Receipt {
  const data = batteryFixture();
  data.purchaseDate = date;
  data.lines = [
    {
      ...emptyLine("cola"),
      name: "Cola",
      categoryId: "drinks.soft-drinks",
      amountOre: Ore.of(ore),
    },
  ];
  data.totalOre = Ore.of(ore);

  const attributes = readAttributes(
    {
      attribute_type: { choice: "cola", confidence: 0.99 },
      attribute_sugar: { choice: "sugar_free", confidence: 0.98 },
    },
    "catalog",
  );

  return {
    _id: testId<"receipts">(date),
    _creationTime: 0,
    householdId: testId<"households">("home"),
    uploadedBy: "test",
    uploaderName: "Test",
    clientId: date,
    imageCount: 1,
    generation: 1,
    revision: 0,
    status: "reviewed",
    data,
    provider: "test",
    duplicateResolved: false,
    excluded: false,
    productAnalysis: {
      state: "complete",
      generation: 1,
      revision: 0,
      version: productAnalysisVersion,
      updatedAt: 0,
      results: [
        {
          lineId: "cola",
          evidenceKey: purchaseEvidenceKey(present(data.lines[0])),
          family: { id: testId<"productFamilies">("cola"), name: "Cola" },
          quantity: { packages: 1, units: null, grams: null, millilitres: ml },
          attributes,
        },
      ],
    },
  };
}

const period = analysisPeriod("2026-09-19", "month", "2026-09-19");

it("separates quantity and unit-price effects and conserves every øre", () => {
  const report = spendingAnalysis(
    [receipt("2026-08-10", 1000, 1000), receipt("2026-09-10", 3000, 2000)],
    period,
  );

  expect(report).toMatchObject({
    currentOre: Ore.of(3000),
    previousOre: Ore.of(1000),
    priceOre: Ore.of(750),
    quantityOre: Ore.of(1250),
    unexplainedOre: Ore.of(0),
  });
  const changed = receipt("2026-09-12", 333, null);
  present(changed.productAnalysis!.results[0]).family = null;

  const expanded = spendingAnalysis(
    [
      receipt("2026-08-10", 1000, 1000),
      receipt("2026-09-10", 3000, 2000),
      changed,
    ],
    period,
  );

  expect(expanded.unexplainedOre).toBe(333);
  expect(
    Ore.sum([expanded.priceOre, expanded.quantityOre, expanded.unexplainedOre]),
  ).toBe(expanded.differenceOre);
});

it("keeps deposits out, includes allocated discounts and adjustments, and excludes duplicates", () => {
  const before = receipt("2026-08-10", 1000, 1000),
    after = receipt("2026-09-10", 1500, 1000);

  after.data!.lines.push(
    {
      ...emptyLine("discount"),
      kind: "receipt_discount",
      amountOre: Ore.of(-500),
      categoryId: null,
    },
    {
      ...emptyLine("deposit"),
      kind: "deposit",
      amountOre: Ore.of(200),
      categoryId: null,
    },
    {
      ...emptyLine("adjust"),
      kind: "adjustment",
      amountOre: Ore.of(7),
      categoryId: null,
    },
  );
  const duplicate = { ...after, duplicateOf: before._id };
  const report = spendingAnalysis([before, after, duplicate], period);
  expect(report).toMatchObject({
    differenceOre: Ore.of(7),
    priceOre: Ore.of(0),
    quantityOre: Ore.of(0),
    unexplainedOre: Ore.of(7),
    currentReceipts: 1,
  });
});

it("does not assign price or quantity effects to stale, incomplete or negative measurements", () => {
  for (const changed of [
    receipt("2026-09-10", 1500, null),
    { ...receipt("2026-09-10", 1500, 1000), revision: 1 },
    receipt("2026-09-10", -1500, 1000),
  ]) {
    const report = spendingAnalysis(
      [receipt("2026-08-10", 1000, 1000), changed],
      period,
    );

    expect(report.effects).toEqual([]);
    expect(report.unexplainedOre).toBe(report.differenceOre);
  }
});

it("compares partial periods and handles Monday, year boundaries, and February", () => {
  expect(analysisPeriod("2026-01-01", "week", "2026-01-01")).toEqual({
    start: "2025-12-29",
    end: "2026-01-01",
    previousStart: "2025-12-22",
    previousEnd: "2025-12-25",
  });
  expect(analysisPeriod("2024-03-30", "month", "2024-03-30").previousEnd).toBe(
    "2024-02-29",
  );
  expect(analysisPeriod("2026-08-01", "month", "2026-09-19")).toEqual({
    start: "2026-08-01",
    end: "2026-08-31",
    previousStart: "2026-07-01",
    previousEnd: "2026-07-31",
  });
});

it("compares counts only when the package identity is the same", () => {
  const before = receipt("2026-08-10", 1000, null);
  const after = receipt("2026-09-10", 1500, null);

  for (const item of [before, after])
    present(item.productAnalysis!.results[0]).quantity.units = 1;
  expect(spendingAnalysis([before, after], period).priceOre).toBe(500);
  present(after.data!.lines[0]).packageSize = 500;
  present(after.data!.lines[0]).packageUnit = "ml";
  present(after.productAnalysis!.results[0]).evidenceKey = purchaseEvidenceKey(
    present(after.data!.lines[0]),
  );
  const report = spendingAnalysis([before, after], period);
  expect(report.effects).toEqual([]);
  expect(report.unexplainedOre).toBe(500);
});

it("groups product attributes across families and keeps weak or stale evidence unknown", () => {
  const a = receipt("2026-09-01", 1000, 1000),
    b = receipt("2026-09-02", 2000, 2000);

  present(b.productAnalysis!.results[0]).family!.id =
    testId<"productFamilies">("other-brand");
  const report = attributeInsights([a, b], "type");
  expect(report).toMatchObject({ known: 2, total: 2 });
  expect(report.groups[0]).toMatchObject({
    id: "cola",
    amountOre: Ore.of(3000),
    quantity: { millilitres: 3000 },
  });
  expect(
    present(attributeInsights([{ ...a, revision: 1 }], "type").groups[0]).id,
  ).toBe("unknown");
  expect(
    readAttributes(
      {
        attribute_sugar: { choice: "sugar_free", confidence: 0.6 },
        attribute_type: { choice: "invented", confidence: 1 },
      },
      "receipt",
    ),
  ).toMatchObject({ sugar: { value: "unknown" }, type: { value: "unknown" } });
});

it("explains offsetting price and quantity changes even when total spending is unchanged", () => {
  const before = receipt("2026-08-10", 2000, 1000);
  const after = receipt("2026-09-10", 2000, 2000);
  const report = spendingAnalysis([before, after], period);
  const explanations = spendingExplanations(report);
  expect(report.differenceOre).toBe(0);
  expect(explanations).toHaveLength(2);
  expect(present(explanations[0]).detail).toContain("lavere");
  expect(present(explanations[1]).detail).toContain("større");
  expect(
    present(explanations[0]).contributions.map((item) => item.receipt._id),
  ).toEqual([after._id, before._id]);
  expect(explanations[0]).toMatchObject({
    name: "Cola · begge perioder",
    amountOre: Ore.of(4000),
  });
});

it("identifies current-only families without calling unlinked purchases new", () => {
  const before = receipt("2026-08-10", 1000, 1000);
  const after = receipt("2026-09-10", 2500, null);
  present(after.productAnalysis!.results[0]).family = {
    id: testId<"productFamilies">("coffee"),
    name: "Kaffe",
  };
  const unknown = { ...receipt("2026-09-11", 800, null), revision: 1 };
  const report = spendingAnalysis([before, after, unknown], period);
  expect(report.currentOnly.map((item) => item.name)).toEqual(["Kaffe"]);
  const explanations = spendingExplanations(report);
  expect(explanations).toHaveLength(1);
  expect(explanations[0]).toMatchObject({
    name: "Kaffe",
    amountOre: Ore.of(2500),
  });
  expect(report.unexplainedOre).toBe(2300);
  expect(spendingExplanations(spendingAnalysis([after], period))).toEqual([]);
  expect(spendingExplanations(spendingAnalysis([before], period))).toEqual([]);
});
