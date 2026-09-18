"use node";
import { v, type Infer } from "convex/values";
import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import { internalAction, env } from "./_generated/server";
import { internal } from "./_generated/api";
import { receiptDataValidator } from "../src/lib/domain/receipt";
import {
  productEvidence,
  matchingInstructions,
} from "../src/lib/domain/product-matching";
import { productDecision } from "./products";

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
      env.TYPESAFE_API_KEY && env.RECEIPT_PROVIDER !== "mock"
        ? new TypeSafeClient({
            apiKey: env.TYPESAFE_API_KEY,
            timeout: 10000,
            retry: { maxRetries: 0 },
          })
        : null;
    const deadline = Date.now() + 45000;
    let available = !!client;
    if (!args.data.store) return decisions;
    for (let offset = 0; offset < lines.length; offset += 12) {
      const batch = lines.slice(offset, offset + 12);
      const prepared = await Promise.all(
        batch.map((line) =>
          ctx.runQuery(internal.products.prepare, {
            id: args.id,
            retailer: args.data.store!,
            line,
          }),
        ),
      );
      const unresolved = batch
        .map((line, index) => ({
          line,
          index,
          candidates: prepared[index].candidates,
        }))
        .filter(({ index }) => {
          if (!prepared[index].saved) return true;
          decisions[offset + index] = {
            lineId: batch[index].id,
            kind: prepared[index].productId ? "match" : "uncertain",
            productId: prepared[index].productId,
          };
          return false;
        });
      if (!unresolved.length || !available || Date.now() >= deadline) continue;
      try {
        const questions = Object.fromEntries(
          unresolved.map((item, index) => {
            const criteria: Record<string, string> = {
              new_product:
                "A clearly identified product distinct from the candidates.",
              uncertain:
                "Insufficient evidence to identify the same product or establish a distinct new product.",
            };
            item.candidates.forEach(
              (_, i) =>
                (criteria[`candidate_${i}`] =
                  `Exactly the same product as items[${index}].candidates[${i}].`),
            );
            return [
              `item_${index}`,
              choice(`For items[${index}]: ${matchingInstructions}`, criteria),
            ];
          }),
        );
        const response = await client!.systemOne({
          model: env.TYPESAFE_MODEL ?? "jev-latest",
          state: {
            items: unresolved.map((item) => ({
              receiptDescription: productEvidence(item.line),
              candidates: item.candidates.map(productEvidence),
            })),
          },
          questions,
        });
        unresolved.forEach((item, index) => {
          const answer = response.answers[`item_${index}`];
          if (!answer || answer.confidence < 0.85) return;
          const candidate = item.candidates.find(
            (_, i) => answer.choice === `candidate_${i}`,
          );
          if (candidate)
            decisions[offset + item.index] = {
              lineId: item.line.id,
              kind: "match",
              productId: candidate._id,
            };
          else if (answer.choice === "new_product")
            decisions[offset + item.index].kind = "new";
        });
      } catch {
        // Keep exact mappings available, but stop model calls after a provider failure.
        available = false;
      }
    }
    return decisions;
  },
});
