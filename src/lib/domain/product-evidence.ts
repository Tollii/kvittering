export type Measure = { amount: number; unit: "g" | "ml" };

export type EvidenceSource = "receipt" | "catalog" | "description";

export type ProductEvidenceInput = {
  source: EvidenceSource;
  name: string;
  packageSize?: number | null;
  packageUnit?: string | null;
  attributes?: readonly string[];
};

export type ParsedProductEvidence = {
  source: EvidenceSource;
  measures: (Measure & {
    origin: "field" | "text";
    rawAmount: number;
    rawUnit: string;
  })[];
  counts: number[];
  ambiguousMultiplier: boolean;
  variants: { zero: boolean; light: boolean; caffeineFree: boolean };
};

const measurePattern = /(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(kg|ml|cl|dl|g|l)\b/gi;

// The three alternatives preserve left-to-right, non-overlapping package counts.
const packPattern =
  // eslint-disable-next-line sonarjs/regex-complexity -- Recognize count suffixes, trailing multipliers, and leading multipliers in one scan.
  /(?<!\d)(\d+)\s*(?:pk|stk|pack|pakning|bx)\b|\b[x×]\s*(\d+)\b|(?<!\d)(\d+)\s*[x×]\s*(?=\d)/gi;

export function measure(amount: number, unit: string | null): Measure | null {
  const units = new Map<string, ["g" | "ml", number]>([
    ["g", ["g", 1]],
    ["kg", ["g", 1000]],
    ["ml", ["ml", 1]],
    ["cl", ["ml", 10]],
    ["dl", ["ml", 100]],
    ["l", ["ml", 1000]],
  ]);

  const conversion = units.get(unit?.toLowerCase().trim() ?? "");

  return conversion && Number.isFinite(amount) && amount > 0
    ? { amount: amount * conversion[1], unit: conversion[0] }
    : null;
}

/** Parse source facts. Multipliers remain candidates, not proof of a consumer package. */
export function parseProductEvidence(
  input: ProductEvidenceInput,
): ParsedProductEvidence {
  const measures: ParsedProductEvidence["measures"] = [];

  const append = (
    rawAmount: number,
    rawUnit: string,
    origin: "field" | "text",
  ) => {
    const value = measure(rawAmount, rawUnit);

    if (value) measures.push({ ...value, rawAmount, rawUnit, origin });
  };

  append(input.packageSize ?? 0, input.packageUnit ?? "", "field");

  for (const [, amount = "", unit = ""] of input.name.matchAll(measurePattern))
    append(Number(amount.replace(",", ".")), unit.toLowerCase(), "text");
  const counts = new Set<number>();

  if (
    /^(pk|stk|pack|pakning|bx)$/i.test(input.packageUnit?.trim() ?? "") &&
    input.packageSize
  )
    counts.add(input.packageSize);

  for (const match of input.name.matchAll(packPattern))
    counts.add(Number(match[1] ?? match[2] ?? match[3]));

  const text = [input.name, ...(input.attributes ?? [])]
    .join(" ")
    .toLowerCase();

  return {
    source: input.source,
    measures,
    counts: [...counts].filter((count) => count > 0 && Number.isInteger(count)),
    ambiguousMultiplier: /\d\s*[x×]\s*\d/i.test(input.name),
    variants: {
      zero: /\b(zero|sukkerfri|sugar free|uten sukker)\b/.test(text),
      light: /\b(light|lett)\b/.test(text),
      caffeineFree: /\b(koffeinfri|caffeine free|zero caffeine)\b/.test(text),
    },
  };
}

export function normalizeMeasureText(text: string): string {
  return text.replace(
    measurePattern,
    (original, amount: string, unit: string) => {
      const value = measure(Number(amount.replace(",", ".")), unit);

      return value
        ? ` ${Math.round(value.amount * 1000) / 1000}${value.unit} `
        : original;
    },
  );
}

export function removePackageText(text: string): string {
  return text.replace(packPattern, " ").replace(measurePattern, " ");
}
