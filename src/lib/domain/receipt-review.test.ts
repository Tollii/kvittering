import { expect, it } from "vitest";
import { batteryFixture } from "./receipt";
import {
  canAcceptReceipt,
  confirmLineCategory,
  lineReviewIssues,
} from "./receipt-review";

it("accepts balanced receipts without optional package details or product links", () => {
  const data = batteryFixture();
  expect(data.lines[0].productId).toBeUndefined();
  expect(data.lines[0].packageSize).toBeNull();
  expect(canAcceptReceipt(data, false)).toBe(true);
  expect(canAcceptReceipt(data, true)).toBe(false);
});
it("requires review for amounts, identity, overlap and missing receipt information", () => {
  for (const modify of [
    (data: ReturnType<typeof batteryFixture>) => {
      data.totalOre! += 1;
    },
    (data: ReturnType<typeof batteryFixture>) => {
      data.purchaseDate = null;
    },
    (data: ReturnType<typeof batteryFixture>) => {
      data.store = null;
    },
    (data: ReturnType<typeof batteryFixture>) => {
      data.lines[0].name = "";
    },
    (data: ReturnType<typeof batteryFixture>) => {
      data.lines[0].amountOre = null;
    },
    (data: ReturnType<typeof batteryFixture>) => {
      data.lines[0].issues = ["Mulig overlapp."];
    },
    (data: ReturnType<typeof batteryFixture>) => {
      data.issues = ["Kvitteringen er ufullstendig."];
    },
  ]) {
    const data = batteryFixture();
    modify(data);
    expect(canAcceptReceipt(data, false)).toBe(false);
  }
});
it("keeps a missing amount visible after a general warning is acknowledged", () => {
  const line = batteryFixture().lines[0];
  line.amountOre = null;
  expect(lineReviewIssues(line)).toEqual(["Beløpet mangler."]);
});

it("resolves category uncertainty without dismissing other review requirements", () => {
  const line = batteryFixture().lines[0];
  line.issues = ["Kategorien er usikker.", "Mulig overlapp."];
  line.amountOre = null;
  const corrected = confirmLineCategory(line, "drinks.energy-drinks");
  expect(corrected.categoryId).toBe("drinks.energy-drinks");
  expect(corrected.manual).toBe(true);
  expect(lineReviewIssues(corrected)).toEqual([
    "Mulig overlapp.",
    "Beløpet mangler.",
  ]);
  expect(line.issues).toContain("Kategorien er usikker.");
  expect(confirmLineCategory(line, "fallback.unclear").issues).toContain(
    "Kategorien er usikker.",
  );
  expect(() => confirmLineCategory(line, "not-a-category")).toThrow();
});
