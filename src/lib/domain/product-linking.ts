import { v, type Infer } from "convex/values";
import { lineValidator, type ReceiptLine } from "./receipt";
import {
  productReference,
  productReferenceValidator,
} from "./product-reference";

export const matchingLineValidator = lineValidator.pick(
  "id",
  "name",
  "receiptName",
  "brand",
  "packageSize",
  "packageUnit",
  "attributes",
  "amountOre",
);

export type MatchingLine = Infer<typeof matchingLineValidator>;

export const matchingReceiptValidator = v.object({
  receiptId: v.id("receipts"),
  revision: v.number(),
  generation: v.number(),
  store: v.string(),
  date: v.union(v.string(), v.null()),
  lines: v.array(matchingLineValidator),
});

export type MatchingReceipt = Infer<typeof matchingReceiptValidator>;

export const productLinkUndoValidator = v.object({
  editor: v.string(),
  revision: v.number(),
  generation: v.number(),
  lineId: v.string(),
  reference: productReferenceValidator,
  mappingId: v.id("productMappings"),
  mappingRevision: v.number(),
  previousMapping: v.union(
    v.null(),
    v.object({
      productId: v.union(v.id("products"), v.null()),
      reference: productReferenceValidator.optional(),
      confirmedBy: v.union(v.string(), v.null()),
    }),
  ),
});

/** A deliberate dismissal is resolved for this queue, even without a product ID. */
export function needsProductLink(line: ReceiptLine) {
  return (
    line.kind === "product" &&
    !!line.name.trim() &&
    !!(line.receiptName ?? line.name).trim() &&
    productReference(line).kind === "unresolved"
  );
}

export function matchingLine(line: ReceiptLine): MatchingLine {
  const {
    id,
    name,
    receiptName,
    brand,
    packageSize,
    packageUnit,
    attributes,
    amountOre,
  } = line;

  return {
    id,
    name,
    receiptName,
    brand,
    packageSize,
    packageUnit,
    attributes,
    amountOre,
  };
}
