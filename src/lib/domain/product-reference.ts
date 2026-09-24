import { v, type Infer } from "convex/values";
import {
  catalogIdentityValidator,
  catalogProductValidator,
} from "../catalog/model";
import type { ReceiptLine } from "./receipt";

const provenance = v.union(v.literal("manual"), v.literal("automatic"));

export const productReferenceValidator = v.union(
  v.object({ kind: v.literal("unresolved") }),
  v.object({ kind: v.literal("separate"), provenance: v.literal("manual") }),
  v.object({
    kind: v.literal("household"),
    id: v.id("products"),
    name: v.string(),
    provenance,
  }),
  v.object({
    kind: v.literal("catalog"),
    product: catalogIdentityValidator,
    provenance,
  }),
);

export type ProductReference = Infer<typeof productReferenceValidator>;

export const productSelectionValidator = v.union(
  v.object({ kind: v.literal("catalog"), lineId: v.string(), key: v.string() }),
  v.object({
    kind: v.literal("household"),
    lineId: v.string(),
    productId: v.id("products"),
  }),
  v.object({ kind: v.literal("new_household"), lineId: v.string() }),
  v.object({ kind: v.literal("separate"), lineId: v.string() }),
);

export type ProductSelection = Infer<typeof productSelectionValidator>;

/** Editable selection retains the catalog description until the server accepts it. */
export const productChoiceValidator = v.union(
  productSelectionValidator.members[0]
    .omit("lineId")
    .extend({ product: catalogProductValidator }),
  productSelectionValidator.members[1].omit("lineId"),
  productSelectionValidator.members[2].omit("lineId"),
  productSelectionValidator.members[3].omit("lineId"),
);

export type ProductChoice = Infer<typeof productChoiceValidator>;

/** Read old serialized lines through one compatibility boundary. */
export function productReference(line: ReceiptLine): ProductReference {
  if (line.productReference) return line.productReference;
  const provenance = line.productMatchManual ? "manual" : "automatic";

  if (line.catalogProduct)
    return { kind: "catalog", product: line.catalogProduct, provenance };

  if (line.productId)
    return {
      kind: "household",
      id: line.productId,
      name: line.productName || line.name,
      provenance,
    };

  return line.productMatchManual
    ? { kind: "separate", provenance: "manual" }
    : { kind: "unresolved" };
}

/** Legacy fields are output projections for installed clients, never separate decisions. */
export function withProductReference(
  line: ReceiptLine,
  reference: ProductReference,
): ReceiptLine {
  return {
    ...line,
    productReference: reference,
    productId: reference.kind === "household" ? reference.id : null,
    productName:
      reference.kind === "household"
        ? reference.name
        : reference.kind === "catalog"
          ? reference.product.name
          : "",
    catalogProduct: reference.kind === "catalog" ? reference.product : null,
    productMatchManual:
      reference.kind !== "unresolved" && reference.provenance === "manual",
  };
}

export function productIdentityKey(line: ReceiptLine): string | null {
  const reference = productReference(line);

  return reference.kind === "catalog"
    ? reference.product.key
    : reference.kind === "household"
      ? reference.id
      : null;
}
