import { choice } from "@typesafe-ai/sdk";
import { z } from "zod";
import { categories, categoryRules } from "./categories";

const categoryDescriptions: Record<string, string> = {
  "drinks.soft-drinks":
    "Soda and energy drinks / brus og energidrikker, including Coca-Cola, Pepsi, Monster, Red Bull, Battery and Burn.",
  "convenience.sandwiches":
    "Fresh prepared sandwiches, filled baguettes and ready-to-eat wraps, including taco baguettes. Packaged crispbread sandwiches such as Wasa belong to bakery.crispbread.",
  "convenience.frozen-pizza":
    "Frozen pizzas, including BigOne (such as BigOne BBQ Chicken), Grandiosa and Dr. Oetker. Chicken or BBQ in a pizza name describes its topping, not a sandwich or raw meat.",
  "convenience.fresh-meals":
    "Fresh ready-to-eat meals and hot food from a grocery counter, including freshly prepared pizza. Excludes frozen pizza, packaged chilled meals, filled baguettes and prepared salads, which have their own categories.",
  "convenience.salads":
    "Prepared mixed meal salads. Plain lettuce, salad leaves and salad vegetables belong to produce.vegetables.",
  "produce.vegetables":
    "Vegetables, including snack carrots and plain lettuce such as Crispi salad. A vegetable sold as a snack remains a vegetable. Prepared mixed meal salads have their own category.",
  "snacks.ice-cream":
    "Ice cream, frozen yoghurt and yoghurt ice cream, including Dream Yoghurtis. The word yoghurt does not make frozen yoghurt ice cream an ordinary dairy yoghurt.",
  "bakery.crispbread":
    "Crispbread and packaged crispbread sandwiches, including Wasa Sandwich. Fresh filled baguettes and soft bread sandwiches belong to convenience.sandwiches.",
  "personal-care.supplements":
    "Vitamins and dietary supplements, including melatonin. Keep these non-food grocery purchases in the budget.",
  "personal-care.oral":
    "Toothbrushes, toothpaste, dental floss and mouthwash, including Jordan Individual toothbrushes.",
  "bakery.rolls":
    "Plain bread rolls and unfilled baguettes. Filled baguettes belong to prepared sandwiches.",
  "other-purchases.batteries":
    "Electrical batteries and light bulbs. Battery brand drinks belong to drinks.soft-drinks.",
};
const criteria = Object.fromEntries(
  categories.map((category) => [
    category.id,
    categoryDescriptions[category.id] ??
      `${category.groupName}: ${category.name}`,
  ]),
);

/** Keep structured product evidence and omit absent details that cannot help category selection. */
export function classificationState(description: string) {
  const evidence = z
    .record(z.string(), z.json())
    .parse(JSON.parse(description));
  return Object.fromEntries(
    Object.entries(evidence).filter(
      ([, value]) =>
        value !== null && !(Array.isArray(value) && value.length === 0),
    ),
  );
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
