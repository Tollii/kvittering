import {
  extractionSchema,
  prepareExtraction,
} from "../src/lib/domain/receipt-extraction";
import type { FoundationResult } from "../src/lib/domain/processing-engine";
import { categoryById } from "../src/lib/domain/categories";

/** Validate native output before it can enter the shared receipt workflow. */
export function prepareFoundationResult(
  result: FoundationResult,
  imageCount: number,
) {
  if (
    !Number.isFinite(result.durationMs) ||
    result.durationMs < 0 ||
    result.systemVersion.length > 40 ||
    result.extraction.length > 500000
  )
    throw new Error("Ugyldig resultat fra Foundation Models.");
  const original = prepareExtraction(
    extractionSchema.parse(JSON.parse(result.extraction)),
    imageCount,
  );
  const data = structuredClone(original);
  const products = data.lines.filter((line) => line.kind === "product");
  if (
    new Set(result.classifications.map((item) => item.id)).size !==
      result.classifications.length ||
    products.length !== result.classifications.length
  )
    throw new Error(
      "Kategoriseringen mangler varer eller inneholder duplikater.",
    );
  for (const line of products) {
    const category = result.classifications.find((item) => item.id === line.id);
    if (!category || !categoryById.has(category.categoryId))
      throw new Error("Ugyldig kategori fra Foundation Models.");
    line.categoryId = category.categoryId;
    // This is an application review decision, not a calibrated model probability.
    line.confidence =
      category.uncertain || category.categoryId === "fallback.unclear" ? 0 : 1;
    if (line.confidence === 0) line.issues.push("Kategorien er usikker.");
  }
  return {
    original,
    data,
    provider: `Apple Vision + Foundation Models / iOS ${result.systemVersion}`,
  };
}
