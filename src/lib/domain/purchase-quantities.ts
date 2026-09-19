import type { ReceiptLine } from "./receipt";
import {
  emptyPurchaseQuantity,
  type PackageProfile,
  type PurchaseQuantity,
} from "./product-families";
import {
  measure,
  parseProductEvidence,
  type Measure,
  type ParsedProductEvidence,
} from "./product-evidence";

export { measure, type Measure } from "./product-evidence";

export type QuantityEvidence = {
  receipt: ParsedProductEvidence;
  catalog:
    | { kind: "absent" }
    | { kind: "usable" | "pack-conflict"; evidence: ParsedProductEvidence };
};

/** Select usable quantity facts without changing the stored catalog identity. */
export function quantityEvidence(line: ReceiptLine): QuantityEvidence {
  const receipt = parseProductEvidence({ ...line, source: "receipt" });

  if (!line.catalogProduct) return { receipt, catalog: { kind: "absent" } };

  const catalog = parseProductEvidence({
    source: "catalog",
    name: line.catalogProduct.name,
    packageSize: line.catalogProduct.weight,
    packageUnit: line.catalogProduct.weightUnit,
  });

  const conflict =
    receipt.counts.length > 0 &&
    catalog.counts.length > 0 &&
    (receipt.counts.length !== 1 ||
      catalog.counts.length !== 1 ||
      receipt.counts[0] !== catalog.counts[0]);

  return {
    receipt,
    catalog: { kind: conflict ? "pack-conflict" : "usable", evidence: catalog },
  };
}

/** Collect candidates; the classifier decides what the source values describe. */
export function packageCandidates(
  evidence: QuantityEvidence,
  description: string | null = null,
) {
  const sources = [evidence.receipt];

  if (evidence.catalog.kind === "usable")
    sources.unshift(evidence.catalog.evidence);

  if (description && evidence.catalog.kind !== "pack-conflict")
    sources.push(
      parseProductEvidence({ source: "description", name: description }),
    );
  const counts = new Set<number>([1]);
  const measures: Measure[] = [];

  for (const source of sources) {
    source.counts.forEach((count) => counts.add(count));

    for (const { amount, unit } of source.measures) {
      if (
        !measures.some((item) => item.amount === amount && item.unit === unit)
      )
        measures.push({ amount, unit });
    }
  }

  return { counts: [...counts].slice(0, 30), measures: measures.slice(0, 40) };
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
