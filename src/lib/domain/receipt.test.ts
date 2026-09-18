import { describe, it, expect } from "vitest";
import {
  batteryFixture,
  reconcile,
  emptyLine,
  parseOre,
  spendingLines,
  validateReceipt,
  aliasKey,
  classificationInputs,
} from "./receipt";
import { monthlyInsights, type Receipt } from "./insights";
describe("receipt accounting", () => {
  it("separates the Battery purchase, discount and deposit", () => {
    const result = reconcile(batteryFixture());
    expect(result.productSpending).toBe(2331);
    expect(result.calculated).toBe(2531);
    expect(result.difference).toBe(0);
    expect(result.issues).toEqual([]);
  });
  it("does not count repeated savings summaries or included VAT", () => {
    const receipt = batteryFixture();
    receipt.lines.push(
      { ...emptyLine("summary"), kind: "summary", amountOre: -259 },
      { ...emptyLine("vat"), kind: "vat", amountOre: 304 },
    );
    expect(reconcile(receipt).calculated).toBe(2531);
  });
  it("reconciles printed line amounts against the receipt total", () => {
    const receipt = batteryFixture();
    receipt.lines = [
      {
        ...emptyLine("weighted"),
        name: "BANAN",
        amountOre: 1222,
        quantity: 0.427,
        unit: "kg",
        unitPriceOre: 2862,
      },
    ];
    receipt.totalOre = 1222;
    expect(reconcile(receipt).issues).toEqual([]);
    receipt.lines[0].amountOre = 1400;
    expect(reconcile(receipt).issues.join(" ")).toContain("Avvik mot betalt");
  });
  it("flags an unreadable total instead of replacing it with a sum", () => {
    const receipt = batteryFixture();
    receipt.totalOre = null;
    const result = reconcile(receipt);
    expect(result.difference).toBeNull();
    expect(result.issues).toContain("Betalt beløp er ukjent.");
    expect(receipt.totalOre).toBeNull();
  });
  it("keeps a financial discrepancy", () => {
    const receipt = batteryFixture();
    receipt.totalOre = 2600;
    expect(reconcile(receipt).difference).toBe(-69);
    expect(receipt.totalOre).toBe(2600);
  });
  it("parses Norwegian decimals exactly and rejects extra decimals", () => {
    expect(parseOre("−2,59")).toBe(-259);
    expect(parseOre("1 250,10")).toBe(125010);
    expect(parseOre("")).toBeNull();
    expect(() => parseOre("1,234")).toThrow();
  });
  it("allocates receipt discounts without losing øre and retains unlinked discounts", () => {
    const receipt = batteryFixture();
    receipt.lines.push(
      { ...emptyLine("second"), amountOre: 101 },
      {
        ...emptyLine("receipt-discount"),
        kind: "receipt_discount",
        amountOre: -101,
      },
      { ...emptyLine("unlinked"), kind: "item_discount", amountOre: -17 },
    );
    const result = spendingLines(receipt);
    expect(
      result.products.reduce((sum, p) => sum + p.netOre, 0) +
        result.unallocated,
    ).toBe(reconcile(receipt).productSpending);
    expect(result.unallocated).toBe(-17);
  });
  it("does not match aliases by abbreviated names or across stores", () => {
    const receipt = batteryFixture();
    const key = aliasKey(receipt, receipt.lines[0]);
    receipt.store = "Other";
    expect(aliasKey(receipt, receipt.lines[0])).not.toBe(key);
    receipt.store = "Eksempelbutikk";
    receipt.lines[0].name = "BATTERY";
    expect(aliasKey(receipt, receipt.lines[0])).not.toBe(key);
  });
  it("rejects fractional øre and duplicate line IDs", () => {
    const receipt = batteryFixture();
    receipt.lines[0].amountOre = 1.1;
    expect(() => validateReceipt(receipt)).toThrow();
    receipt.lines[0].amountOre = 2590;
    receipt.lines.push(receipt.lines[0]);
    expect(() => validateReceipt(receipt)).toThrow();
  });
  it("keeps undated receipts visible and excluded receipts out of spending", () => {
    const base = {
      _id: "receipt",
      _creationTime: 0,
      data: batteryFixture(),
      status: "needs_review",
      excluded: false,
    } as Receipt;
    const undated = {
      ...base,
      _id: "undated",
      data: { ...batteryFixture(), purchaseDate: null },
    } as Receipt;
    const excluded = { ...base, _id: "excluded", excluded: true } as Receipt;
    const totals = monthlyInsights([base, undated, excluded], "2026-09");
    expect(totals.products).toBe(2331);
    expect(totals.undated).toHaveLength(1);
    expect(totals.provisional).toBe(1);
  });
});

it("uses linked product evidence without sending prices or payment details to Jev", () => {
  const data = batteryFixture();
  data.lines[1].name = "10% Battery energidrikk";
  const input = classificationInputs(data);
  expect(input[0].description).toContain("Battery energidrikk");
  expect(input[0].description).not.toContain("2590");
  expect(input[0].description).not.toContain("25,90");
});
it("flags repeated discount lines instead of subtracting them silently", () => {
  const data = batteryFixture();
  data.lines.push({ ...data.lines[1], id: "repeated" });
  expect(reconcile(data).issues).toContain(
    "Like rabattlinjer må kontrolleres.",
  );
});

it("keeps unknown and foreign currencies out of NOK totals", () => {
  const receipt = {
    _id: "foreign",
    data: { ...batteryFixture(), currency: "SEK" },
    status: "needs_review",
    excluded: false,
  } as Receipt;
  const totals = monthlyInsights([receipt], "2026-09");
  expect(totals.paid).toBe(0);
  expect(totals.products).toBe(0);
  expect(totals.unconverted).toEqual([receipt]);
});

it("provides structured category evidence without unknown package fields or accounting data", async () => {
  const { classificationState } = await import("./classification");
  const data = batteryFixture();
  data.lines[0].name = "MONSTER PIPELINE PUNCH";
  data.lines[0].brand = null;
  data.lines[0].packageSize = null;
  data.lines[0].packageUnit = null;
  const state = classificationState(classificationInputs(data)[0].description);
  expect(state.name).toBe("MONSTER PIPELINE PUNCH");
  expect(state).not.toHaveProperty("packageSize");
  expect(state).not.toHaveProperty("brand");
  expect(state).not.toHaveProperty("amountOre");
  expect(state).toHaveProperty("relatedProductDescriptions");
});
