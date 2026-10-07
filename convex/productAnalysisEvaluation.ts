"use node";

import { v } from "convex/values";
import { attributeQuestions } from "../src/lib/domain/product-attribute-classification";
import {
  productAttributesValidator,
  readAttributes,
} from "../src/lib/domain/product-attributes";
import type { Questions } from "@typesafe-ai/sdk";
import { internalAction } from "./_generated/server";
import { productJudgments } from "./aiModels";
import { familyQuestion } from "./productAnalysisWorker";
import type { JudgmentClient } from "./decisions";

const familyCandidates = [
  { name: "Coca-Cola 500ml" },
  { name: "Coca-Cola Zero 500ml" },
  { name: "Stratos Helt Sprøtt 150g" },
  { name: "Battery Peachberry 500ml" },
];

const familyCases = [
  { name: "COCA-COLA10PK BX", expected: "family_0" },
  { name: "Coca-Cola Zero 10x330ml", expected: "family_1" },
  { name: "Coca-Cola uten sukker 1.5l", expected: "family_1" },
  { name: "Coca-Cola Cherry 330ml", expected: "new" },
  { name: "STRATOS SPRØTT", expected: "family_2" },
  { name: "BATTERY WHIRL", expected: "new" },
];

/** One request per case, as the worker asks about one product at a time. */
export async function evaluateFamilies(client: JudgmentClient) {
  const results = [];

  for (const item of familyCases) {
    const result = await client.systemOne({
      state: {
        product: {
          name: item.name,
          brand: null,
          attributes: [],
          catalog: null,
        },
        candidates: familyCandidates,
      },
      questions: { family: familyQuestion(familyCandidates) },
    });

    const answer = result.answers.family;

    results.push({
      ...item,
      choice: answer.choice,
      confidence: answer.confidence,
    });
  }

  return results;
}

const attributeCases = [
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

/** All attribute cases share one request, as a receipt's products do. */
export async function evaluateAttributeCases(client: JudgmentClient) {
  const questions: Questions = {};
  attributeCases.forEach((_, index) => {
    for (const [key, question] of Object.entries(
      attributeQuestions(`products[${index}]`),
    ))
      questions[`${key}_${index}`] = question;
  });

  const response = await client.systemOne({
    state: { products: attributeCases.map(({ name }) => ({ name })) },
    questions,
  });

  return attributeCases.map((item, index) => ({
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
}

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
  handler: async (ctx) => {
    const client = productJudgments(ctx, { timeoutMs: 20000 });

    if (!client) throw new Error("Produktanalysetesten er ikke tilgjengelig.");

    return evaluateFamilies(client);
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
  handler: async (ctx) => {
    const client = productJudgments(ctx, { timeoutMs: 30000 });

    if (!client) throw new Error("Product analysis is unavailable.");

    return evaluateAttributeCases(client);
  },
});
