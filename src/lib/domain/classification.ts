import { z } from "zod";
import { choice } from "@typesafe-ai/sdk";
import { v, type Infer } from "convex/values";
import { parse } from "convex-helpers/validators";
import { categories, categoryRules } from "./categories";

const criteria = Object.fromEntries(
  categories.map((category) => [
    category.id,
    category.classifierDescription ?? `${category.groupName}: ${category.name}`,
  ]),
);

export const classificationEvidenceValidator = v.object({
  name: v.string(),
  brand: v.string().optional(),
  packageSize: v.number().optional(),
  packageUnit: v.string().optional(),
  attributes: v.array(v.string()).optional(),
  relatedProductDescriptions: v.array(v.string()).optional(),
});

export type ClassificationEvidence = Infer<
  typeof classificationEvidenceValidator
>;

export const classificationProductValidator = v.union(
  v.object({ id: v.string(), evidence: classificationEvidenceValidator }),
  v.object({ id: v.string(), description: v.string() }),
);

/** Compatibility reader for persisted correction records and existing workflow journals. */
export function parseLegacyClassification(
  description: string,
  fallbackName?: string,
): ClassificationEvidence {
  const input = z
    .record(z.string(), z.unknown())
    .parse(JSON.parse(description));

  const fields = Object.fromEntries(
    Object.entries(input).filter(
      ([key, value]) =>
        key in classificationEvidenceValidator.fields &&
        value !== null &&
        !(Array.isArray(value) && value.length === 0),
    ),
  );

  if (fallbackName && !("name" in fields)) fields.name = fallbackName;

  return parse(classificationEvidenceValidator, fields);
}

export function classificationEvidence(
  product: Infer<typeof classificationProductValidator>,
): ClassificationEvidence {
  return "evidence" in product
    ? product.evidence
    : parseLegacyClassification(product.description);
}

export function classificationQuestion(index: number) {
  return choice(
    {
      question: `Which grocery category best describes the product in \`products[${index}]\`?`,
      evidence:
        "Use the product name, recognizable brands and general product knowledge. Missing package size, ingredients or a separate brand field do not prevent category classification. Classify the kind of product, not its exact package or nutritional content. Related product descriptions provide supporting evidence.",
      rules: categoryRules,
    },
    criteria,
  );
}
