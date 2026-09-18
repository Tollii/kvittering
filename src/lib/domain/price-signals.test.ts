import { expect, it } from "vitest";
import {
  monthPriceSignals,
  priceSignalLabel,
  priceSignals,
} from "./price-signals";
import { weeklyShopFixture } from "./receipt";
import type { Receipt } from "./insights";

const receipt = (id: string, purchaseDate: string, colaOre: number) => {
  const data = weeklyShopFixture();
  data.purchaseDate = purchaseDate;
  const cola = data.lines.find((line) => line.id === "cola")!;
  cola.amountOre = colaOre;
  cola.catalogProduct = {
    key: "ean:5000112637380",
    name: "Coca-Cola 330ml Sleek X 10pk bx",
    brand: null,
    ean: "5000112637380",
    image: null,
    weight: 330,
    weightUnit: "ml",
  };
  return {
    _id: id,
    _creationTime: 0,
    excluded: false,
    status: "reviewed",
    data,
  } as unknown as Receipt;
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
  expect(cola.typicalOre).toBeGreaterThan(9000);
  expect(cola.typicalOre).toBeLessThan(9490);
  expect(cola.observations).toBe(3);
  expect(priceSignalLabel(cola)).toMatch(/^\+3\d % vs vanlig$/);
  // Unlinked lines and lines within the band are silent.
  expect(signals.has("milk")).toBe(false);
  expect(
    priceSignals([...history, receipt("e", "2026-09-13", 9790)], history[0])
      .size,
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
  expect(priceSignalLabel(month[1])).toMatch(/^−2\d % vs vanlig$/);
});
