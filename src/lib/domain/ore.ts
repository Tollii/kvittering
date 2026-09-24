import { v, type VFloat64 } from "convex/values";

declare const oreBrand: unique symbol;

/**
 * A whole number of øre, the hundredth part of a Norwegian krone.
 *
 * Amounts are persisted and sent to clients as plain numbers, so the type is a
 * compile-time brand rather than a wrapper object. Create values with
 * `Ore.of`, `Ore.fromKroner`, or `Ore.parse`, and combine them with the
 * operations below: `+` and `-` produce a plain number, not an amount.
 */
export type Ore = number & { readonly [oreBrand]: true };

/** Amounts a person can enter: up to one million kroner either way. */
const inputLimit = 100_000_000;

const numberFormat = new Intl.NumberFormat("nb-NO", {
  style: "currency",
  currency: "NOK",
});

function of(value: number): Ore {
  if (!Number.isSafeInteger(value))
    throw new RangeError(`Øre must be a whole number, not ${value}.`);

  // SAFETY: The value was checked to be a safe integer immediately above.
  return value as Ore;
}

const zero = of(0);

// The type and its operations share one name, as with Date or Number.
// eslint-disable-next-line @typescript-eslint/no-redeclare -- A companion object names the operations on the Ore type.
export const Ore = {
  zero,

  /** A whole number of øre from a trusted integer, such as a stored amount. */
  of,

  /** Rounds a computed, possibly fractional number of øre to whole øre. */
  round: (value: number): Ore => of(Math.round(value)),

  /** A receipt amount read by a machine: whole øre within the input limit, or unknown. */
  parseAmount(value: number | null, message: string): Ore | null {
    if (value === null) return null;

    if (!Number.isSafeInteger(value) || Math.abs(value) > inputLimit)
      throw new Error(message);

    return of(value);
  },

  /** Rounds kroner to the nearest øre, for providers that report kroner. */
  fromKroner: (kroner: number): Ore => of(Math.round(kroner * 100)),

  /** Parses a Norwegian amount such as "12,50" or "-3"; empty text is unknown. */
  parse(text: string): Ore | null {
    const value = text
      .trim()
      .replaceAll(/\s/g, "")
      .replace("−", "-")
      .replace(",", ".");

    if (!value) return null;

    if (!/^-?\d+(\.\d{1,2})?$/.test(value))
      throw new Error("Bruk et beløp med høyst to desimaler.");
    const [whole, fraction = ""] = value.replace("-", "").split(".");

    const result =
      (Number(whole) * 100 + Number(fraction.padEnd(2, "0"))) *
      (value.startsWith("-") ? -1 : 1);

    if (!Number.isSafeInteger(result) || Math.abs(result) > inputLimit)
      throw new Error("Beløpet er for stort.");

    return of(result);
  },

  add: (a: Ore, b: Ore): Ore => of(a + b),

  subtract: (a: Ore, b: Ore): Ore => of(a - b),

  negate: (amount: Ore): Ore => of(-amount),

  abs: (amount: Ore): Ore => of(Math.abs(amount)),

  sum(amounts: Iterable<Ore>): Ore {
    let total = 0;

    for (const amount of amounts) total += amount;

    return of(total);
  },

  /** The largest amount, or zero when there are none or all are negative. */
  max: (amounts: Iterable<Ore>): Ore => of(Math.max(0, ...amounts)),

  /** The smallest of at least one amount. */
  min: (amounts: readonly Ore[]): Ore => of(Math.min(...amounts)),

  /** The middle amount, averaging the two middle ones; null when empty. */
  median(amounts: Iterable<Ore>): Ore | null {
    const sorted = [...amounts].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (!sorted.length) return null;

    return sorted.length % 2
      ? sorted[middle]
      : of(Math.round((sorted[middle - 1] + sorted[middle]) / 2));
  },

  /** Multiplies by a factor, such as a quantity or share, rounding to whole øre. */
  scale: (amount: Ore, factor: number): Ore => of(Math.round(amount * factor)),

  /** One of `parts` equal shares, rounded down to whole øre. */
  divide: (amount: Ore, parts: number): Ore => of(Math.floor(amount / parts)),

  /** Price per unit of `quantity`, in fractional øre; a rate, not an amount. */
  per: (amount: Ore, quantity: number): number => amount / quantity,

  /** How many times `divisor` fits in `amount`, as a plain number. */
  ratio: (amount: Ore, divisor: Ore): number => amount / divisor,

  toKroner: (amount: Ore): number => amount / 100,

  /** Ascending order, for `Array.prototype.sort`. */
  compare: (a: Ore, b: Ore): number => a - b,

  /** "kr 12,50", or "Ukjent" when the amount is not known. */
  format: (amount: Ore | null): string =>
    amount === null ? "Ukjent" : numberFormat.format(amount / 100),

  /** "12,50" for an editable input; empty when the amount is not known. */
  formatInput: (amount: Ore | null): string =>
    amount === null ? "" : (amount / 100).toFixed(2).replace(".", ","),

  /** Rounded kroner without a currency sign, for compact labels. */
  formatWholeKroner: (amount: Ore): string => String(Math.round(amount / 100)),
};

// SAFETY: Convex stores a number; writes are parsed with Ore.of or Ore.parse.
export const oreValidator = v.number() as VFloat64<Ore>;
