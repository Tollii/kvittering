import type { CalendarDate } from "./calendar";
import { month } from "../testing/calendar";
import { present, receiptFixture } from "../testing/receipts";
import { Ore } from "./ore";
import { describe, it, expect } from "vitest";
import {
  reconcile,
  emptyLine,
  spendingLines,
  validateReceipt,
  checkReceipt,
  parseReceipt,
  aliasKey,
  classificationInputs,
} from "./receipt";
import { batteryFixture } from "../mock-receipts";
import { monthlyInsights } from "./insights";

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
      { ...emptyLine("summary"), kind: "summary", amountOre: Ore.of(-259) },
      { ...emptyLine("vat"), kind: "vat", amountOre: Ore.of(304) },
    );
    expect(reconcile(receipt).calculated).toBe(2531);
  });
  it("reconciles printed line amounts against the receipt total", () => {
    const receipt = batteryFixture();
    receipt.lines = [
      {
        ...emptyLine("weighted"),
        name: "BANAN",
        amountOre: Ore.of(1222),
        quantity: 0.427,
        unit: "kg",
        unitPriceOre: Ore.of(2862),
      },
    ];
    receipt.totalOre = Ore.of(1222);
    expect(reconcile(receipt).issues).toEqual([]);
    present(receipt.lines[0]).amountOre = Ore.of(1400);
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
    receipt.totalOre = Ore.of(2600);
    expect(reconcile(receipt).difference).toBe(-69);
    expect(receipt.totalOre).toBe(2600);
  });
  it("allocates receipt discounts without losing øre and retains unlinked discounts", () => {
    const receipt = batteryFixture();
    receipt.lines.push(
      { ...emptyLine("second"), amountOre: Ore.of(101) },
      {
        ...emptyLine("receipt-discount"),
        kind: "receipt_discount",
        amountOre: Ore.of(-101),
      },
      {
        ...emptyLine("unlinked"),
        kind: "item_discount",
        amountOre: Ore.of(-17),
      },
    );
    const result = spendingLines(receipt);
    expect(
      Ore.sum([...result.products.map((p) => p.netOre), result.unallocated]),
    ).toBe(reconcile(receipt).productSpending);
    expect(result.unallocated).toBe(-17);
  });
  it("does not match aliases by abbreviated names or across stores", () => {
    const receipt = batteryFixture();
    const key = aliasKey(receipt, present(receipt.lines[0]));
    receipt.store = "Other";
    expect(aliasKey(receipt, present(receipt.lines[0]))).not.toBe(key);
    receipt.store = "Eksempelbutikk";
    present(receipt.lines[0]).name = "BATTERY";
    expect(aliasKey(receipt, present(receipt.lines[0]))).not.toBe(key);
  });
  it("rejects fractional øre and duplicate line IDs", () => {
    const receipt = batteryFixture();
    // SAFETY: A fractional amount is built deliberately to test the receipt boundary.
    present(receipt.lines[0]).amountOre = 1.1 as Ore;
    expect(checkReceipt(receipt)).toEqual({
      kind: "invalid",
      message: "Beløp må være hele øre.",
    });
    present(receipt.lines[0]).amountOre = Ore.of(2590);
    receipt.lines.push(present(receipt.lines[0]));
    expect(() => validateReceipt(receipt)).toThrow(
      "Varelinjene må ha ulike ID-er.",
    );
  });
  it.each(["2026-02-30", "2026-13-01", "26-01-01"])(
    "rejects the impossible purchase date %s with a readable reason",
    (text) => {
      // SAFETY: Unparsed input can hold any string; the check must reject it.
      const purchaseDate = text as CalendarDate;
      expect(checkReceipt({ ...batteryFixture(), purchaseDate })).toEqual({
        kind: "invalid",
        message: "Ugyldig dato.",
      });
    },
  );
  it("accepts the retired energy-drink category without changing the source receipt", () => {
    const receipt = batteryFixture();
    present(receipt.lines[0]).categoryId = "drinks.energy-drinks";
    const parsed = parseReceipt(receipt);
    expect(parsed.kind).toBe("parsed");

    if (parsed.kind !== "parsed") throw new Error(parsed.issue.message);
    expect(present(parsed.receipt.lines[0]).categoryId).toBe(
      "drinks.soft-drinks",
    );
    expect(parsed.receipt.totalOre).toBe(receipt.totalOre);
    expect(present(receipt.lines[0]).categoryId).toBe("drinks.energy-drinks");
    present(receipt.lines[0]).categoryId = "unknown.category";
    expect(parseReceipt(receipt).kind).toBe("rejected");
  });
  it("keeps undated receipts visible and excluded receipts out of spending", () => {
    const base = receiptFixture({
      _id: "receipt",
      _creationTime: 0,
      data: batteryFixture(),
      status: "needs_review",
      excluded: false,
    });

    const undated = receiptFixture({
      ...base,
      _id: "undated",
      data: { ...batteryFixture(), purchaseDate: null },
    });

    const excluded = receiptFixture({
      ...base,
      _id: "excluded",
      excluded: true,
    });

    const totals = monthlyInsights([base, undated, excluded], month("2026-09"));
    expect(totals.products).toBe(2331);
    expect(totals.undated).toHaveLength(1);
    expect(totals.provisional).toBe(1);
  });
});

it("uses linked product evidence without sending prices or payment details to Jev", () => {
  const data = batteryFixture();
  present(data.lines[1]).name = "10% Battery energidrikk";
  const input = classificationInputs(data);
  expect(JSON.stringify(present(input[0]).evidence)).toContain(
    "Battery energidrikk",
  );
  expect(JSON.stringify(present(input[0]).evidence)).not.toContain("2590");
  expect(JSON.stringify(present(input[0]).evidence)).not.toContain("25,90");
});

it("flags repeated discount lines instead of subtracting them silently", () => {
  const data = batteryFixture();
  data.lines.push({ ...present(data.lines[1]), id: "repeated" });
  expect(reconcile(data).issues).toContain(
    "Like rabattlinjer må kontrolleres.",
  );
});

it("keeps unknown and foreign currencies out of NOK totals", () => {
  const receipt = receiptFixture({
    _id: "foreign",
    data: { ...batteryFixture(), currency: "SEK" },
    status: "needs_review",
    excluded: false,
  });

  const totals = monthlyInsights([receipt], month("2026-09"));
  expect(totals.paid).toBe(0);
  expect(totals.products).toBe(0);
  expect(totals.unconverted).toEqual([receipt]);
});

it("provides structured category evidence without unknown package fields or accounting data", async () => {
  const data = batteryFixture();
  present(data.lines[0]).name = "MONSTER PIPELINE PUNCH";
  present(data.lines[0]).brand = null;
  present(data.lines[0]).packageSize = null;
  present(data.lines[0]).packageUnit = null;
  const state = present(classificationInputs(data)[0]).evidence;
  expect(state.name).toBe("MONSTER PIPELINE PUNCH");
  expect(state).not.toHaveProperty("packageSize");
  expect(state).not.toHaveProperty("brand");
  expect(state).not.toHaveProperty("amountOre");
  expect(state).toHaveProperty("relatedProductDescriptions");
});
