import { describe, expect, it } from "vitest";
import { Ore } from "./ore";

describe("Ore", () => {
  it("parses Norwegian amounts exactly and rejects extra decimals", () => {
    expect(Ore.parse("−2,59")).toBe(-259);
    expect(Ore.parse("1 250,10")).toBe(125010);
    expect(Ore.parse("12")).toBe(1200);
    expect(Ore.parse("")).toBeNull();
    expect(() => Ore.parse("1,234")).toThrow("høyst to desimaler");
    expect(() => Ore.parse("2000000")).toThrow("for stort");
  });

  it("accepts only whole øre", () => {
    expect(Ore.of(2590)).toBe(2590);
    expect(() => Ore.of(25.9)).toThrow(RangeError);
    expect(Ore.parseAmount(null, "Ugyldig")).toBeNull();
    expect(() => Ore.parseAmount(1.5, "Beløp må være hele øre.")).toThrow(
      "Beløp må være hele øre.",
    );
  });

  it("converts between kroner and øre", () => {
    expect(Ore.fromKroner(24.9)).toBe(2490);
    expect(Ore.fromKroner(0.125)).toBe(13);
    expect(Ore.toKroner(Ore.of(2490))).toBeCloseTo(24.9);
  });

  it("combines amounts in whole øre", () => {
    const price = Ore.of(2590);
    const discount = Ore.of(-259);

    expect(Ore.add(price, discount)).toBe(2331);
    expect(Ore.subtract(price, discount)).toBe(2849);
    expect(Ore.negate(discount)).toBe(259);
    expect(Ore.abs(discount)).toBe(259);
    expect(Ore.sum([price, discount, Ore.zero])).toBe(2331);
    expect(Ore.scale(Ore.of(999), 1 / 3)).toBe(333);
    expect(Ore.divide(Ore.of(1000), 3)).toBe(333);
    expect(Ore.round(332.6)).toBe(333);
  });

  it("describes a set of amounts", () => {
    const amounts = [Ore.of(300), Ore.of(100), Ore.of(200), Ore.of(400)];

    expect(Ore.min(amounts)).toBe(100);
    expect(Ore.max(amounts)).toBe(400);
    expect(Ore.max([])).toBe(0);
    expect(Ore.median(amounts)).toBe(250);
    expect(Ore.median(amounts.slice(0, 3))).toBe(200);
    expect(Ore.median([])).toBeNull();
    expect([...amounts].sort(Ore.compare)).toEqual([100, 200, 300, 400]);
  });

  it("relates amounts to each other and to quantities", () => {
    expect(Ore.ratio(Ore.of(450), Ore.of(600))).toBe(0.75);
    expect(Ore.per(Ore.of(2990), 500)).toBeCloseTo(5.98);
  });

  it("formats amounts for reading and editing", () => {
    expect(Ore.format(Ore.of(125010))).toBe(
      new Intl.NumberFormat("nb-NO", {
        style: "currency",
        currency: "NOK",
      }).format(1250.1),
    );
    expect(Ore.format(null)).toBe("Ukjent");
    expect(Ore.formatInput(Ore.of(-259))).toBe("-2,59");
    expect(Ore.formatInput(null)).toBe("");
    expect(Ore.formatWholeKroner(Ore.of(2590))).toBe("26");
  });
});
