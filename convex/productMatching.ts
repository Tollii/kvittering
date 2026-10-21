"use node";

import { v, type Infer } from "convex/values";
import { choice } from "@typesafe-ai/sdk";
import { internalAction } from "./_generated/server";
import { productJudgments } from "./aiModels";
import { contextBatches } from "./decisions";
import { receiptProductModel } from "./providerConfig";
import { internal } from "./_generated/api";
import { receiptDataValidator } from "../src/lib/domain/receipt";
import {
  productEvidence,
  matchingInstructions,
} from "../src/lib/domain/product-matching";
import { productDecision } from "./products";

/** Whether items[index] is one of its saved candidates, a new product, or unclear. */
export function linkingQuestion(index: number, candidateCount: number) {
  const criteria: Record<
    "new_product" | "uncertain" | `candidate_${number}`,
    string
  > = {
    new_product: "A clearly identified product distinct from the candidates.",
    uncertain:
      "Insufficient evidence to identify the same product or establish a distinct new product.",
  };

  for (let i = 0; i < candidateCount; i++)
    criteria[`candidate_${i}`] =
      `Exactly the same product as items[${index}].candidates[${i}].`;

  return choice(`For items[${index}]: ${matchingInstructions}`, criteria);
}

export const match = internalAction({
  args: { id: v.id("receipts"), data: receiptDataValidator },
  returns: v.array(productDecision),
  handler: async (ctx, args): Promise<Infer<typeof productDecision>[]> => {
    const lines = args.data.lines.filter((line) => line.kind === "product");

    const decisions: Infer<typeof productDecision>[] = lines.map((line) => ({
      lineId: line.id,
      kind: "uncertain",
      productId: null,
    }));

    const client =
      receiptProductModel().kind === "model"
        ? productJudgments(ctx, {
            source: { kind: "receipt", id: args.id },
            timeoutMs: 10000,
          })
        : null;

    const retailer = args.data.store;

    if (!retailer) return decisions;

    const prepared = await Promise.all(
      lines.map(async (line, position) => ({
        line,
        position,
        ...(await ctx.runQuery(internal.products.prepare, {
          id: args.id,
          retailer,
          line,
        })),
      })),
    );

    const unresolved = prepared.filter((item) => {
      if (!item.saved) return true;
      decisions[item.position] = {
        lineId: item.line.id,
        kind: item.productId ? "match" : "uncertain",
        productId: item.productId,
      };

      return false;
    });

    if (!unresolved.length || !client) return decisions;

    const request = (items: typeof unresolved) => ({
      state: {
        items: items.map((item) => ({
          receiptDescription: productEvidence(item.line),
          candidates: item.candidates.map(productEvidence),
        })),
      },
      questions: Object.fromEntries(
        items.map((item, index) => [
          `item_${index}`,
          linkingQuestion(index, item.candidates.length),
        ]),
      ),
    });

    await Promise.all(
      contextBatches(unresolved, request).map(async (batch) => {
        // Handled: saved mappings stay available when the provider fails.
        const response = await client
          .systemOne(request(batch))
          .catch(() => null);

        batch.forEach((item, index) => {
          const answer = response?.answers[`item_${index}`];

          if (!answer || answer.confidence < 0.85) return;

          const candidate = item.candidates.find(
            (_, i) => answer.choice === `candidate_${i}`,
          );

          if (candidate)
            decisions[item.position] = {
              lineId: item.line.id,
              kind: "match",
              productId: candidate._id,
            };
          else if (answer.choice === "new_product")
            decisions[item.position] = {
              lineId: item.line.id,
              kind: "new",
              productId: null,
            };
        });
      }),
    );

    return decisions;
  },
});
