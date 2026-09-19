"use node";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { v } from "convex/values";
import { internalAction, env } from "./_generated/server";
import {
  receiptDataValidator,
  batteryFixture,
} from "../src/lib/domain/receipt";
import {
  extractionSchema,
  extractionInstructions,
  overlapInstructions,
  uncertaintyInstructions,
  prepareExtraction,
} from "../src/lib/domain/receipt-extraction";
import { categories } from "../src/lib/domain/categories";
import {
  classificationQuestion,
  classificationEvidence,
  classificationProductValidator,
} from "../src/lib/domain/classification";
export const extract = internalAction({
  args: {
    storageIds: v.array(v.id("_storage")),
    receiptId: v.id("receipts").optional(),
    generation: v.number().optional(),
  },
  returns: v.object({
    data: receiptDataValidator,
    provider: v.string(),
    durationMs: v.number(),
  }),
  handler: async (ctx, args) => {
    const started = Date.now();
    if (env.RECEIPT_PROVIDER === "mock" || !env.OPENAI_API_KEY)
      return {
        data: batteryFixture(),
        provider: "mock: Battery fixture; photo not read",
        durationMs: 0,
      };
    const images = await Promise.all(
      args.storageIds.map(async (id) => {
        const blob = await ctx.storage.get(id);
        if (!blob) throw new Error("Et kvitteringsbilde mangler.");
        return {
          type: "input_image" as const,
          image_url: `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`,
          detail: "original" as const,
        };
      }),
    );
    const model = env.OPENAI_RECEIPT_MODEL ?? "gpt-5.6-luna";
    const client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: 120000,
      maxRetries: 1,
    });
    const response = await client.responses.parse({
      model,
      store: false,
      input: [
        {
          role: "system",
          content: `${extractionInstructions}\n\n${overlapInstructions}\n\n${uncertaintyInstructions}`,
        },
        {
          role: "user",
          content: images.flatMap((image, index) => [
            { type: "input_text" as const, text: `Image ${index + 1}` },
            image,
          ]),
        },
      ],
      text: { format: zodTextFormat(extractionSchema, "grocery_receipt") },
    });
    if (!response.output_parsed || response.status !== "completed")
      throw new Error(
        "Modellen kunne ikke lese kvitteringen. Prøv et tydeligere bilde.",
      );
    const data = prepareExtraction(response.output_parsed, images.length);
    console.info("receipt.extraction_completed", {
      receiptId: args.receiptId,
      generation: args.generation,
      model,
      durationMs: Date.now() - started,
      imageCount: images.length,
      lineCount: data.lines.length,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    });
    return { data, provider: model, durationMs: Date.now() - started };
  },
});
export const classify = internalAction({
  args: {
    products: v.array(classificationProductValidator),
    receiptId: v.id("receipts").optional(),
    generation: v.number().optional(),
  },
  returns: v.object({
    classifications: v.array(
      v.object({
        id: v.string(),
        categoryId: v.string(),
        confidence: v.number(),
      }),
    ),
    provider: v.string(),
    durationMs: v.number(),
  }),
  handler: async (_ctx, args) => {
    const started = Date.now();
    if (!args.products.length)
      return {
        classifications: [],
        provider: "confirmed aliases",
        durationMs: 0,
      };
    if (env.RECEIPT_PROVIDER === "mock" || !env.TYPESAFE_API_KEY)
      return {
        classifications: args.products.map((p) => ({
          id: p.id,
          categoryId: "fallback.unclear",
          confidence: 0,
        })),
        provider: "mock: classification unavailable",
        durationMs: 0,
      };
    const client = new TypeSafeClient({ apiKey: env.TYPESAFE_API_KEY });
    const results: { id: string; categoryId: string; confidence: number }[] =
      [];
    const model = env.TYPESAFE_MODEL ?? "jev-latest";
    for (let offset = 0; offset < args.products.length; offset += 12) {
      const batch = args.products.slice(offset, offset + 12);
      const questions = Object.fromEntries(
        batch.map((_, index) => [
          `item_${index}`,
          classificationQuestion(index),
        ]),
      );
      const response = await client.systemOne({
        model,
        state: {
          products: batch.map((p) => classificationEvidence(p)),
        },
        questions,
      });
      batch.forEach((product, index) => {
        const answer = response.answers[`item_${index}`];
        if (!answer || !categories.some((c) => c.id === answer.choice))
          throw new Error("Kategoriseringen ga et ugyldig svar.");
        results.push({
          id: product.id,
          categoryId: answer.choice,
          confidence: answer.confidence,
        });
      });
    }
    console.info("receipt.classification_completed", {
      receiptId: args.receiptId,
      generation: args.generation,
      model,
      durationMs: Date.now() - started,
      itemCount: results.length,
      batchCount: Math.ceil(args.products.length / 12),
    });
    return {
      classifications: results,
      provider: model,
      durationMs: Date.now() - started,
    };
  },
});
