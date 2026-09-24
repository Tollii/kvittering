import { present, receiptFixture } from "../testing/receipts";
import { Ore } from "./ore";
import {
  productAnalysisVersion,
  purchaseEvidenceKey,
} from "./product-families";
import { expect, it } from "vitest";
import {
  monthPriceSignals,
  priceSignalLabel,
  priceSignals,
} from "./price-signals";
import { weeklyShopFixture } from "./receipt";

const receipt = (id: string, purchaseDate: string, colaOre: number) => {
  const data = weeklyShopFixture();
  data.purchaseDate = purchaseDate;
  const cola = data.lines.find((line) => line.id === "cola")!;
  cola.amountOre = Ore.of(colaOre);
  cola.catalogProduct = {
    key: "ean:5000112637380",
    name: "Coca-Cola 330ml Sleek X 10pk bx",
    ean: "5000112637380",
    weight: 330,
    weightUnit: "ml",
  };

  return receiptFixture({
    _id: id,
    _creationTime: 0,
    excluded: false,
    status: "reviewed",
    revision: 0,
    generation: 0,
    data,
    productAnalysis: {
      version: productAnalysisVersion,
      revision: 0,
      generation: 0,
      state: "complete",
      updatedAt: 0,
      results: [
        {
          lineId: cola.id,
          evidenceKey: purchaseEvidenceKey(cola),
          family: null,
          quantity: { packages: 1, units: 10, grams: null, millilitres: 3300 },
        },
      ],
    },
  });
};

it("flags a linked product priced well above what the household usually pays", () => {
  const history = [
    receipt("a", "2026-07-02", 9490),
    receipt("b", "2026-07-16", 9490),
    receipt("c", "2026-08-03", 8990),
  ];

  const today = receipt("d", "2026-09-12", 12900);
  const signals = priceSignals([...history, today], today);
  const cola = signals.get("cola")!;
  expect(cola).toBeDefined();
  // Net of the allocated receipt discount, so a little under the printed 94,90.
  expect(cola.typicalUnitPrice).toBeGreaterThan(9000);
  expect(cola.typicalUnitPrice).toBeLessThan(9490);
  expect(cola.observations).toBe(3);
  expect(priceSignalLabel(cola)).toMatch(/^\+3\d % vs vanlig$/);
  // Unlinked lines and lines within the band are silent.
  expect(signals.has("milk")).toBe(false);
  expect(
    priceSignals(
      [...history, receipt("e", "2026-09-13", 9790)],
      present(history[0]),
    ).size,
  ).toBe(0);
});

it("needs three other observations before it speaks", () => {
  const few = [
    receipt("a", "2026-07-02", 9490),
    receipt("b", "2026-07-16", 9490),
  ];

  const today = receipt("d", "2026-09-12", 12900);
  expect(priceSignals([...few, today], today).size).toBe(0);
});

it("does not report exact-product price changes for equivalent catalog matches", () => {
  const history = [
    receipt("a", "2026-07-02", 9490),
    receipt("b", "2026-07-16", 9490),
    receipt("c", "2026-08-03", 8990),
  ];

  const today = receipt("d", "2026-09-12", 12900);

  for (const purchase of [...history, today]) {
    const line = purchase.data!.lines.find((item) => item.id === "cola")!;
    line.catalogProduct = {
      key: "equivalent:cola",
      name: "Coca-Cola",
      equivalence: {
        representativeKey: "ean:111",
        candidateKeys: ["ean:111", "ean:222"],
      },
    };
    present(purchase.productAnalysis!.results[0]).evidenceKey =
      purchaseEvidenceKey(line);
  }

  expect(priceSignals([...history, today], today).size).toBe(0);
});

it("lists a month's surprises, largest overspend first", () => {
  const history = [
    receipt("a", "2026-07-02", 9490),
    receipt("b", "2026-07-16", 9490),
    receipt("c", "2026-08-03", 9490),
  ];

  const cheap = receipt("cheap", "2026-09-02", 6990);
  const dear = receipt("dear", "2026-09-20", 12900);
  const month = monthPriceSignals([...history, cheap, dear], "2026-09");
  expect(month.map((signal) => signal.receipt._id)).toEqual(["dear", "cheap"]);
  expect(priceSignalLabel(present(month[1]))).toMatch(/^−2\d % vs vanlig$/);
});

it("omits excluded warning targets", () => {
  const history = [
    receipt("a", "2026-07-01", 9490),
    receipt("b", "2026-07-02", 9490),
    receipt("c", "2026-07-03", 9490),
  ];

  const target = { ...receipt("d", "2026-09-01", 20000), excluded: true };
  expect(monthPriceSignals([...history, target], "2026-09")).toEqual([]);
});

it("uses interpreted packages for equivalent raw unit quantities", () => {
  const history = [
    receipt("a", "2026-07-01", 9490),
    receipt("b", "2026-07-02", 9490),
    receipt("c", "2026-07-03", 9490),
  ];

  const target = receipt("d", "2026-09-01", 9490);
  target.data!.lines.find((line) => line.id === "cola")!.quantity = 10;
  present(target.productAnalysis!.results[0]).evidenceKey = purchaseEvidenceKey(
    target.data!.lines.find((line) => line.id === "cola")!,
  );
  expect(priceSignals([...history, target], target).size).toBe(0);
});

it("does not invent a denominator for missing or stale analysis", () => {
  const history = [
    receipt("a", "2026-07-01", 9490),
    receipt("b", "2026-07-02", 9490),
    receipt("c", "2026-07-03", 9490),
  ];

  const target = receipt("d", "2026-09-01", 20000);
  target.revision++;
  expect(priceSignals(history, target).size).toBe(0);
  delete target.productAnalysis;
  expect(priceSignals(history, target).size).toBe(0);
});
