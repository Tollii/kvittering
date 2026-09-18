import { v, type Infer } from "convex/values";

export const productTypes = {
  cola: "Cola",
  energy: "Energidrikk",
  water: "Vann",
  other_drink: "Annen drikke",
  chicken: "Kylling",
  pork: "Svin",
  beef: "Storfe",
  fish: "Fisk",
  prepared_meal: "Ferdigrett",
  snack: "Snacks",
  other: "Annen vare",
  unknown: "Ukjent",
} as const;
export const sugarVariants = {
  sugar_free: "Sukkerfri variant",
  regular: "Vanlig variant",
  unknown: "Ukjent sukkervariant",
} as const;
export const preparationTypes = {
  ready: "Klar til å spise",
  heat: "Må varmes",
  cook: "Til matlaging",
  unknown: "Ukjent tilberedning",
} as const;
const decision = <T extends string>(values: T[]) =>
  v.object({
    value: v.union(...values.map((value) => v.literal(value))),
    confidence: v.number(),
  });
export const productAttributesValidator = v.object({
  type: decision(Object.keys(productTypes) as (keyof typeof productTypes)[]),
  sugar: decision(Object.keys(sugarVariants) as (keyof typeof sugarVariants)[]),
  preparation: decision(
    Object.keys(preparationTypes) as (keyof typeof preparationTypes)[],
  ),
  source: v.union(v.literal("catalog"), v.literal("receipt")),
});
export type ProductAttributes = Infer<typeof productAttributesValidator>;

export function readAttributes(
  answers: Record<string, { choice?: string; confidence?: number }>,
  source: ProductAttributes["source"],
): ProductAttributes {
  function read<T extends string>(key: string, options: Record<T, string>) {
    const answer = answers[key];
    const confidence = answer?.confidence;
    const valid =
      typeof confidence === "number" &&
      Number.isFinite(confidence) &&
      confidence >= 0.8 &&
      confidence <= 1 &&
      answer?.choice &&
      Object.hasOwn(options, answer.choice);
    return {
      value: (valid ? answer.choice : "unknown") as T,
      confidence: valid ? confidence : 0,
    };
  }
  return {
    type: read("attribute_type", productTypes),
    sugar: read("attribute_sugar", sugarVariants),
    preparation: read("attribute_preparation", preparationTypes),
    source,
  };
}
