"use node";

import { providerFetch } from "./providerTransport";

import { v } from "convex/values";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { internalAction, env } from "./_generated/server";
import { classifyCatalogProducts } from "./catalogClassifier";
import { normalizeProducts } from "./kassalapp/normalize";
import { emptyLine } from "../src/lib/domain/receipt";

/** Fixed matching cases exercise the deployed classifier without changing receipts. */
export const evaluate = internalAction({
  args: {},
  returns: v.array(
    v.object({
      name: v.string(),
      expected: v.string(),
      actual: v.string(),
      passed: v.boolean(),
      reason: v.string(),
      probabilities: v.array(v.union(v.number(), v.null())),
    }),
  ),
  handler: async (ctx) => {
    if (!env.TYPESAFE_API_KEY)
      throw new Error("Product matching is unavailable.");

    const cases = [
      {
        name: "SALAT CRISPI",
        expected: "equivalent",
        candidates: [
          "Salat Crispi",
          "Crispi Salat 150g",
          "Crispi Salat 150g pakke",
          "Crispi Salat 150g Flowpk",
          "Crispi Salat 150g Økologisk",
        ],
      },
      {
        name: "STRATOS SPRØTT",
        expected: "equivalent",
        candidates: [
          "Stratos Helt Sprøtt 150g Nidar",
          "Stratos Helt Sprøtt 150g Nidar pose",
        ],
      },
      {
        name: "COCA-COLA 500ML",
        expected: "exact",
        candidates: [
          "Coca-Cola 500ml Flaske",
          "Coca-Cola Light 500ml",
          "Coca-Cola Zero 500ml",
        ],
      },
      {
        name: "BIGONE BBQ CHICKEN",
        expected: "unresolved",
        candidates: ["BigOne BBQ Chicken 560g", "BigOne BBQ Chicken 700g"],
      },
      {
        name: "SALAT CRISPI",
        expected: "unresolved",
        candidates: ["Crispi Salat 150g Økologisk"],
      },
      {
        name: "COCA-COLA 10PK",
        expected: "unresolved",
        candidates: ["Coca-Cola 15pk"],
      },
    ];

    const results = await classifyCatalogProducts(
      cases.map((item, index) => ({
        line: {
          ...emptyLine(`evaluation_${index}`),
          name: item.name,
          manual: true,
        },
        product: null,
        candidates: normalizeProducts({
          data: item.candidates.map((name, candidate) => ({
            id: index * 100 + candidate,
            name,
            ean: `7030000${index}0000${candidate}`,
          })),
        }),
      })),
      new TypeSafeClient({
        fetch: providerFetch(ctx, "typesafe"),
        apiKey: env.TYPESAFE_API_KEY,
        timeout: 30000,
        retry: { maxRetries: 0 },
      }),
    );

    return results.map((result, index) => {
      const testCase = cases[index];

      if (!testCase) throw new Error("Each evaluation case needs a result.");

      const actual = result.productKey
        ? result.equivalentKeys
          ? "equivalent"
          : "exact"
        : "unresolved";

      return {
        name: testCase.name,
        expected: testCase.expected,
        actual,
        passed: actual === testCase.expected,
        reason: result.reason ?? "unspecified",
        probabilities:
          result.candidates?.map((candidate) => candidate.probability) ?? [],
      };
    });
  },
});
