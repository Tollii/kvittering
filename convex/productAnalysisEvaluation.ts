"use node";
import { v } from "convex/values";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { internalAction, env } from "./_generated/server";
import { familyQuestion } from "./productAnalysisWorker";
export const evaluate = internalAction({
  args: {},
  returns: v.array(
    v.object({
      name: v.string(),
      expected: v.string(),
      choice: v.string(),
      confidence: v.number(),
    }),
  ),
  handler: async () => {
    const client = new TypeSafeClient({
      apiKey: env.TYPESAFE_API_KEY!,
      timeout: 20000,
      retry: { maxRetries: 0 },
    });
    const candidates = [
      { name: "Coca-Cola 500ml" },
      { name: "Coca-Cola Zero 500ml" },
      { name: "Stratos Helt Sprøtt 150g" },
      { name: "Battery Peachberry 500ml" },
    ];
    const cases = [
      { name: "COCA-COLA10PK BX", expected: "family_0" },
      { name: "Coca-Cola Zero 10x330ml", expected: "family_1" },
      { name: "Coca-Cola uten sukker 1.5l", expected: "family_1" },
      { name: "Coca-Cola Cherry 330ml", expected: "new" },
      { name: "STRATOS SPRØTT", expected: "family_2" },
      { name: "BATTERY WHIRL", expected: "new" },
    ];
    const results = [];
    for (const item of cases) {
      const result = await client.systemOne({
        model: env.TYPESAFE_MODEL ?? "jev-latest",
        state: {
          product: {
            name: item.name,
            brand: null,
            attributes: [],
            catalog: null,
          },
          candidates,
        },
        questions: { family: familyQuestion(candidates) },
      });
      results.push({
        ...item,
        choice: result.answers.family.choice,
        confidence: result.answers.family.confidence,
      });
    }
    return results;
  },
});
