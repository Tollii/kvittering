import { v, type Infer } from "convex/values";
import type { ReceiptLine } from "./receipt";
import { productAttributesValidator } from "./product-attributes";
import { productSearch } from "../catalog/search";

export const familyIdentityValidator = v.object({
  id: v.id("productFamilies"),
  name: v.string(),
});
export const packageMeasureValidator = v.object({
  amount: v.number(),
  unit: v.union(v.literal("g"), v.literal("ml")),
});
export const packageProfileValidator = v.object({
  unitsPerPackage: v.union(v.number(), v.null()),
  measurePerPackage: v.union(packageMeasureValidator, v.null()),
});
export type PackageProfile = Infer<typeof packageProfileValidator>;
export const purchaseQuantityValidator = v.object({
  packages: v.union(v.number(), v.null()),
  units: v.union(v.number(), v.null()),
  grams: v.union(v.number(), v.null()),
  millilitres: v.union(v.number(), v.null()),
});
export type PurchaseQuantity = Infer<typeof purchaseQuantityValidator>;
export const productAnalysisResultValidator = v.object({
  lineId: v.string(),
  evidenceKey: v.string(),
  family: v.union(familyIdentityValidator, v.null()),
  quantity: purchaseQuantityValidator,
  attributes: v.optional(productAttributesValidator),
});
export const productAnalysisValidator = v.object({
  version: v.number(),
  generation: v.number(),
  revision: v.number(),
  state: v.union(
    v.literal("pending"),
    v.literal("complete"),
    v.literal("error"),
  ),
  updatedAt: v.number(),
  results: v.array(productAnalysisResultValidator),
});
export type ProductAnalysisResult = Infer<
  typeof productAnalysisResultValidator
>;
export const productAnalysisVersion = 6;

/** A family name removes explicit package notation, while retaining the source's recipe and variant. */
export function familyName(line: ReceiptLine) {
  return normalizeFamilyName(
    line.catalogProduct?.name || line.productName || line.name,
  );
}

export function normalizeFamilyName(name: string) {
  return (
    name
      .replace(
        /([\p{L}])(\d+(?:[.,]\d+)?\s*(?:kg|g|ml|cl|dl|l|stk|pk)\b)/giu,
        "$1 $2",
      )
      .replace(/\b\d+\s*[x×]\s*/gi, " ")
      .replace(
        /\b(?:x\s*)?\d+(?:[.,]\d+)?\s*(?:kg|g|ml|cl|dl|l|stk|pk|pakning|pack|bx)\b/gi,
        " ",
      )
      .replace(
        /\b(?:flaske|boks|bokser|flasker|pet|sleek|bx|multipack|x)\b/gi,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim() || name
  );
}

/** Package profiles can be reused across purchases. Purchase quantities cannot. */
export function productProfileKey(line: ReceiptLine) {
  return JSON.stringify([
    productAnalysisVersion,
    line.catalogProduct
      ? [
          line.catalogProduct.key,
          line.catalogProduct.name,
          line.catalogProduct.brand,
          line.catalogProduct.weight,
          line.catalogProduct.weightUnit,
        ]
      : null,
    {
      name: productSearch(line.name),
      brand: line.brand,
      packageSize: line.packageSize,
      packageUnit: line.packageUnit,
      attributes: [...line.attributes].sort(),
      categoryId: line.categoryId,
      sellingUnit: line.unit,
    },
  ]);
}

/** Reject analysis of a line whose identity, quantity or supporting receipt evidence changed. */
export function purchaseEvidenceKey(line: ReceiptLine) {
  return JSON.stringify([
    productProfileKey(line),
    line.originalText,
    line.name,
    line.receiptName,
    line.quantity,
    line.unit,
    line.amountOre,
    line.unitPriceOre,
    line.packageSize,
    line.packageUnit,
  ]);
}

export const emptyPurchaseQuantity = (): PurchaseQuantity => ({
  packages: null,
  units: null,
  grams: null,
  millilitres: null,
});
