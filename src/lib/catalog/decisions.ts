import { v, type Infer } from "convex/values";
import type { ReceiptLine } from "../domain/receipt";
import type { CatalogProduct } from "./model";
import { compatibleCatalogProduct } from "./matching";

export const catalogMatchThreshold = 0.8;
export const catalogCandidateScore = v.object({
  key: v.string(),
  name: v.string(),
  probability: v.union(v.number(), v.null()),
  compatible: v.boolean(),
});
export const catalogDecision = v.object({
  lineId: v.string(),
  evidenceKey: v.string(),
  productKey: v.union(v.string(), v.null()),
  categoryId: v.union(v.string(), v.null()),
  categoryConfidence: v.number(),
  // Optional so completed steps in existing workflows can still be applied.
  candidates: v.array(catalogCandidateScore).optional(),
  equivalentKeys: v.array(v.string()).optional(),
  reason: v
    .union(
      v.literal("saved_match"),
      v.literal("exact_match"),
      v.literal("model_match"),
      v.literal("equivalent_match"),
      v.literal("no_candidates"),
      v.literal("below_threshold"),
      v.literal("ambiguous"),
      v.literal("conflict"),
      v.literal("unavailable"),
      v.literal("provider_error"),
    )
    .optional(),
});
export type CatalogDecision = Infer<typeof catalogDecision>;

/** Accept one supported identity. Competing matches and explicit conflicts remain unresolved. */
export function selectCatalogMatch(
  line: ReceiptLine,
  products: CatalogProduct[],
  probabilities: (number | null)[],
) {
  const candidates = products.map((product, index) => ({
    key: product.key,
    name: product.name,
    probability: probabilities[index] ?? null,
    compatible: compatibleCatalogProduct(line, product),
  }));
  const above = candidates.filter(
    (candidate) =>
      candidate.probability !== null &&
      candidate.probability >= catalogMatchThreshold &&
      candidate.probability <= 1,
  );
  const supported = above.filter((candidate) => candidate.compatible);
  const eligible = [
    ...new Map(
      supported.map((candidate) => [candidate.key, candidate]),
    ).values(),
  ];
  const selected =
    eligible.length === 1
      ? products.find((product) => product.key === eligible[0].key)
      : undefined;
  return {
    candidates,
    productKey: selected?.key ?? null,
    equivalentKeys: selected?.equivalence?.candidateKeys,
    reason:
      eligible.length === 1
        ? selected?.equivalence
          ? ("equivalent_match" as const)
          : ("model_match" as const)
        : eligible.length > 1
          ? ("ambiguous" as const)
          : above.length
            ? ("conflict" as const)
            : ("below_threshold" as const),
  };
}
