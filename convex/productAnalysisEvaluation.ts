"use node";

import { v } from "convex/values";
import { attributeQuestions } from "../src/lib/domain/product-attribute-classification";
import {
  productAttributesValidator,
  readAttributes,
} from "../src/lib/domain/product-attributes";
import { TypeSafeClient, type Questions } from "@typesafe-ai/sdk";
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
    if (!env.TYPESAFE_API_KEY)
      throw new Error("Produktanalysetesten er ikke tilgjengelig.");

    const client = new TypeSafeClient({
      apiKey: env.TYPESAFE_API_KEY,
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

/** Fixed attribute cases use one parallel request and do not change receipt data. */
export const evaluateAttributes = internalAction({
  args: {},
  returns: v.array(
    v.object({
      name: v.string(),
      expectedType: v.string(),
      expectedSugar: v.string(),
      attributes: productAttributesValidator,
    }),
  ),
  handler: async () => {
    if (!env.TYPESAFE_API_KEY)
      throw new Error("Product analysis is unavailable.");

    const cases = [
      {
        name: "Coca-Cola Zero 500ml",
        expectedType: "cola",
        expectedSugar: "sugar_free",
      },
      {
        name: "Pepsi Max 1.5l",
        expectedType: "cola",
        expectedSugar: "sugar_free",
      },
      {
        name: "BATTERY WHIRL",
        expectedType: "energy",
        expectedSugar: "unknown",
      },
      {
        name: "KYLLINGFILET 900G",
        expectedType: "chicken",
        expectedSugar: "unknown",
      },
      {
        name: "BIGONE BBQ CHICKEN",
        expectedType: "prepared_meal",
        expectedSugar: "unknown",
      },
      { name: "VARE", expectedType: "unknown", expectedSugar: "unknown" },
    ];

    const questions: Questions = {};
    cases.forEach((_, index) => {
      for (const [key, question] of Object.entries(
        attributeQuestions(`products[${index}]`),
      ))
        questions[`${key}_${index}`] = question;
    });

    const client = new TypeSafeClient({
      apiKey: env.TYPESAFE_API_KEY,
      timeout: 30000,
      retry: { maxRetries: 0 },
    });

    const response = await client.systemOne({
      model: env.TYPESAFE_MODEL ?? "jev-latest",
      state: { products: cases.map(({ name }) => ({ name })) },
      questions,
    });

    return cases.map((item, index) => ({
      ...item,
      attributes: readAttributes(
        Object.fromEntries(
          Object.keys(attributeQuestions()).map((key) => {
            const answer = response.answers[`${key}_${index}`];

            return [key, answer?.type === "choice" ? answer : {}];
          }),
        ),
        "receipt",
      ),
    }));
  },
});
