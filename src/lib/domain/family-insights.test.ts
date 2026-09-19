import { receiptFixture, testId } from "../testing/receipts";
import { expect, it } from "vitest";
import { batteryFixture, emptyLine } from "./receipt";
import type { Receipt } from "./insights";
import {
  emptyPurchaseQuantity,
  productAnalysisVersion,
  purchaseEvidenceKey,
} from "./product-families";
import {
  familyInsights,
  formatPurchaseQuantity,
  partialQuantity,
} from "./family-insights";

function receipt(): Receipt {
  const data = batteryFixture();
  data.lines = [
    { ...emptyLine("pack"), name: "Coca-Cola 10pk", amountOre: 10000 },
    { ...emptyLine("bottle"), name: "Coca-Cola 500ml", amountOre: 2500 },
    { ...emptyLine("zero"), name: "Coca-Cola Zero 500ml", amountOre: 2500 },
    { ...emptyLine("deposit"), kind: "deposit" as const, amountOre: 2400 },
  ];

  return receiptFixture({
    _id: "receipt",
    generation: 1,
    revision: 2,
    status: "reviewed",
    data,
    productAnalysis: {
      version: productAnalysisVersion,
      generation: 1,
      revision: 2,
      state: "complete",
      updatedAt: 0,
      results: data.lines.slice(0, 3).map((line, index) => ({
        lineId: line.id,
        evidenceKey: purchaseEvidenceKey(line),
        family: {
          id: testId<"productFamilies">(index === 2 ? "zero" : "original"),
          name: index === 2 ? "Coca-Cola Zero" : "Coca-Cola",
        },
        quantity: {
          packages: index === 0 ? 2 : 1,
          units: index === 0 ? 20 : 1,
          grams: null,
          millilitres: index === 0 ? 6600 : 500,
        },
      })),
    },
  });
}

it("combines package sizes, keeps variants separate, and excludes deposits", () => {
  const report = familyInsights([receipt()]);
  expect(report.total).toBe(3);
  expect(report.families).toHaveLength(2);
  expect(report.families[0].quantity).toMatchObject({
    units: 21,
    millilitres: 7100,
  });
  expect(report.families[0].amountOre).toBe(12500);
  expect(formatPurchaseQuantity(report.families[0].quantity)).toBe(
    "21 stk · 7,1 l",
  );
});

it("marks partial quantities and ignores stale or excluded receipt analysis", () => {
  const value = receipt();
  value.productAnalysis!.results[1].quantity = emptyPurchaseQuantity();
  expect(partialQuantity(familyInsights([value]).families[0])).toBe(true);
  expect(familyInsights([{ ...value, revision: 3 }]).linked).toBe(0);
  expect(familyInsights([{ ...value, excluded: true }]).total).toBe(0);
});
