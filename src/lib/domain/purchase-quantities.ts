import type { ReceiptLine } from "./receipt";
import {
  emptyPurchaseQuantity,
  type PackageProfile,
  type PurchaseQuantity,
} from "./product-families";

export type Measure = { amount: number; unit: "g" | "ml" };
export function measure(amount: number, unit: string | null): Measure | null {
  const units: Record<string, ["g" | "ml", number]> = {
    g: ["g", 1],
    kg: ["g", 1000],
    ml: ["ml", 1],
    cl: ["ml", 10],
    dl: ["ml", 100],
    l: ["ml", 1000],
  };
  const conversion = units[unit?.toLowerCase().trim() ?? ""];
  return conversion && Number.isFinite(amount) && amount > 0
    ? { amount: amount * conversion[1], unit: conversion[0] }
    : null;
}

/** An explicit pack-count conflict makes catalog sizes unsuitable for quantity calculations. */
export function quantityEvidence(line: ReceiptLine): ReceiptLine {
  const count = (name: string) => {
    const match = name.match(
      /(\d+)\s*(?:pk|pack|pakning)\b|(\d+)\s*[x×]\s*\d/iu,
    );
    return match ? Number(match[1] ?? match[2]) : null;
  };
  const receiptCount = /^(pk|pack|pakning)$/i.test(line.packageUnit ?? "")
    ? line.packageSize
    : count(line.name);
  const catalogCount = line.catalogProduct
    ? count(line.catalogProduct.name)
    : null;
  return receiptCount !== null &&
    catalogCount !== null &&
    receiptCount !== catalogCount
    ? { ...line, catalogProduct: null }
    : line;
}

/** Collect source values. The classifier decides what the values describe. */
export function packageCandidates(
  line: ReceiptLine,
  description: string | null = null,
) {
  const text = [line.catalogProduct?.name, line.name, description]
    .filter(Boolean)
    .join(" · ");
  const counts = new Set<number>([1]);
  for (const match of text.matchAll(
    /(?:^|[^\d])(\d{1,3})\s*(?:pk|stk|pack|pakning|[x×])/gi,
  ))
    counts.add(Number(match[1]));
  if (line.packageSize && /^(pk|stk|pack)$/i.test(line.packageUnit ?? ""))
    counts.add(line.packageSize);
  const measures: Measure[] = [];
  const append = (value: Measure | null) => {
    if (
      value &&
      !measures.some(
        (item) => item.amount === value.amount && item.unit === value.unit,
      )
    )
      measures.push(value);
  };
  append(
    measure(
      line.catalogProduct?.weight ?? 0,
      line.catalogProduct?.weightUnit ?? null,
    ),
  );
  append(measure(line.packageSize ?? 0, line.packageUnit));
  for (const match of text.matchAll(
    /(\d+(?:[.,]\d+)?)\s*(kg|ml|cl|dl|g|l)\b/gi,
  ))
    append(measure(Number(match[1].replace(",", ".")), match[2]));
  return {
    counts: [...counts]
      .filter((count) => count > 0 && Number.isInteger(count))
      .slice(0, 30),
    measures: measures.slice(0, 40),
  };
}

export type PurchaseInterpretation = {
  amount: number;
  kind: "packages" | "units" | "g" | "ml";
  source: string;
};
export function purchaseCandidates(
  line: ReceiptLine,
): PurchaseInterpretation[] {
  const candidates: PurchaseInterpretation[] = [
    {
      amount: 1,
      kind: "packages",
      source:
        "One priced receipt line, when no other purchase quantity is stated",
    },
  ];
  if (line.quantity && line.quantity > 0) {
    candidates.push(
      {
        amount: line.quantity,
        kind: "packages",
        source: "Extracted receipt quantity",
      },
      {
        amount: line.quantity,
        kind: "units",
        source: "Extracted receipt quantity counts contained items",
      },
    );
    const value = measure(line.quantity, line.unit);
    if (value)
      candidates.push({
        ...value,
        kind: value.unit,
        source: "Extracted receipt quantity and unit",
      });
  }
  for (const match of line.originalText.matchAll(
    /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|dl|l|stk|[x×])\b/gi,
  )) {
    const amount = Number(match[1].replace(",", "."));
    const value = measure(amount, match[2]);
    if (value)
      candidates.push({
        ...value,
        kind: value.unit,
        source: `Receipt text: ${match[0].trim()}`,
      });
    else if (amount > 0)
      candidates.push({
        amount,
        kind: "packages",
        source: `Receipt text: ${match[0].trim()}`,
      });
  }
  return candidates.slice(0, 40);
}

/** Arithmetic uses selected source values, never a generated quantity. */
export function normalizePurchase(
  profile: PackageProfile,
  selection: PurchaseInterpretation | null,
): PurchaseQuantity {
  const result = emptyPurchaseQuantity();
  if (!selection || !Number.isFinite(selection.amount) || selection.amount <= 0)
    return result;
  const { amount, kind } = selection;
  if (kind === "g") result.grams = amount;
  else if (kind === "ml") result.millilitres = amount;
  else {
    if (kind === "packages") {
      result.packages = amount;
      result.units =
        profile.unitsPerPackage === null
          ? null
          : amount * profile.unitsPerPackage;
    } else result.units = amount;
    const multiplier =
      kind === "packages"
        ? amount
        : profile.unitsPerPackage
          ? amount / profile.unitsPerPackage
          : null;
    if (multiplier !== null && profile.measurePerPackage) {
      const total = multiplier * profile.measurePerPackage.amount;
      if (profile.measurePerPackage.unit === "g") result.grams = total;
      else result.millilitres = total;
    }
  }
  return result;
}
