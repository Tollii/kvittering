"use node";

import { clientValidator } from "../src/lib/releases/policy";
import { v } from "convex/values";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { action, env } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  classificationQuestion,
  parseLegacyClassification,
} from "../src/lib/domain/classification";
import { categoryById } from "../src/lib/domain/categories";
import { categoryMemoryKey } from "../src/lib/domain/category-memory";

export type EvaluationResult = {
  model: string;
  checked: number;
  matched: number;
  results: {
    id: string;
    name: string;
    expected: string;
    actual: string;
    confidence: number;
  }[];
};

/** Evaluate the latest human decision for each product against the current classifier. */
export const evaluate = action({
  args: { client: clientValidator.optional() },
  returns: v.object({
    model: v.string(),
    checked: v.number(),
    matched: v.number(),
    results: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        expected: v.string(),
        actual: v.string(),
        confidence: v.number(),
      }),
    ),
  }),
  handler: async (ctx, { client: release }): Promise<EvaluationResult> => {
    await ctx.runQuery(internal.releasePolicy.check, { client: release });

    const history: { entries: Doc<"corrections">[]; truncated: boolean } =
      await ctx.runQuery(api.corrections.list, {});

    if (!env.TYPESAFE_API_KEY)
      throw new Error("Kategoritesten er ikke tilgjengelig.");
    const seen = new Set<string>();

    const examples = history.entries.filter((entry) => {
      if (
        entry.field !== "category" ||
        !entry.expected ||
        !categoryById.has(entry.expected)
      )
        return false;
      const key = categoryMemoryKey(entry.store, entry.name) ?? entry._id;

      if (seen.has(key)) return false;
      seen.add(key);

      return true;
    });

    const model = env.TYPESAFE_MODEL ?? "jev-latest";

    if (!examples.length) return { model, checked: 0, matched: 0, results: [] };

    const client = new TypeSafeClient({
      apiKey: env.TYPESAFE_API_KEY,
      timeout: 30000,
      retry: { maxRetries: 0 },
    });

    const response = await client.systemOne({
      model,
      state: {
        products: examples.map(
          (entry) =>
            entry.classificationEvidence ??
            parseLegacyClassification(
              entry.description ?? "{}",
              entry.evidence.name,
            ),
        ),
      },
      questions: Object.fromEntries(
        examples.map((_, index) => [
          `category_${index}`,
          classificationQuestion(index),
        ]),
      ),
    });

    const results = examples.map((entry, index) => {
      const answer = response.answers[`category_${index}`];

      if (answer?.type !== "choice" || !categoryById.has(answer.choice))
        throw new Error("Kategoritesten ga et ugyldig svar.");

      return {
        id: entry._id,
        name: entry.name,
        expected: entry.expected!,
        actual: answer.choice,
        confidence: answer.confidence,
      };
    });

    return {
      model,
      checked: results.length,
      matched: results.filter((result) => result.expected === result.actual)
        .length,
      results,
    };
  },
});
