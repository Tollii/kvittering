"use node";

import { generateText, NoObjectGeneratedError, Output } from "ai";
import { languageModel, productJudgments } from "./aiModels";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import {
  reasoningValidator,
  receiptProductModel,
  receiptReader,
} from "./providerConfig";
import { receiptDataValidator } from "../src/lib/domain/receipt";
import { batteryFixture } from "../src/lib/mock-receipts";
import {
  extractionSchema,
  extractionInstructions,
  overlapInstructions,
  uncertaintyInstructions,
  prepareExtraction,
} from "../src/lib/domain/receipt-extraction";
import { categories, unclearCategoryId } from "../src/lib/domain/categories";
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
    /** Evaluations read with another `provider:model` than production. */
    model: v.string().optional(),
    /** Evaluations can ask the reader to think harder than production does. */
    reasoning: reasoningValidator.optional(),
  },
  returns: v.object({
    data: receiptDataValidator,
    provider: v.string(),
    durationMs: v.number(),
  }),
  handler: async (ctx, args) => {
    const started = Date.now();

    // An evaluation's model replaces the production reader, key check included.
    const reader = args.model
      ? { kind: "model" as const, model: args.model }
      : receiptReader();

    if (reader.kind === "mock")
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
          type: "image" as const,
          image: new Uint8Array(await blob.arrayBuffer()),
          mediaType: blob.type,
          providerOptions: { openai: { imageDetail: "original" } },
        };
      }),
    );

    const { model } = reader;

    const request = generateText({
      model: languageModel(
        ctx,
        model,
        args.receiptId ? { kind: "receipt", id: args.receiptId } : undefined,
      ),
      maxOutputTokens: 32000,
      ...(args.reasoning && { reasoning: args.reasoning }),
      maxRetries: 1,
      // Extra reasoning takes longer; an action may still run ten minutes.
      abortSignal: AbortSignal.timeout(args.reasoning ? 300000 : 120000),
      providerOptions: { openai: { store: false } },
      instructions: `${extractionInstructions}\n\n${overlapInstructions}\n\n${uncertaintyInstructions}`,
      messages: [
        {
          role: "user",
          content: images.flatMap((image, index) => [
            { type: "text" as const, text: `Image ${index + 1}` },
            image,
          ]),
        },
      ],
      output: Output.object({
        schema: extractionSchema,
        name: "grocery_receipt",
      }),
    });

    // A truncated or unparsable answer is a failed reading, not a crash.
    const response = await request.catch((error: Error) => {
      throw NoObjectGeneratedError.isInstance(error)
        ? new Error(
            "Modellen kunne ikke lese kvitteringen. Prøv et tydeligere bilde.",
            { cause: error },
          )
        : error;
    });

    const data = prepareExtraction(response.output, images.length);
    console.info("receipt.extraction_completed", {
      receiptId: args.receiptId,
      generation: args.generation,
      model,
      durationMs: Date.now() - started,
      imageCount: images.length,
      lineCount: data.lines.length,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
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
  handler: async (ctx, args) => {
    const started = Date.now();

    if (!args.products.length)
      return {
        classifications: [],
        provider: "confirmed aliases",
        durationMs: 0,
      };

    const productModel = receiptProductModel();

    if (productModel.kind === "disabled")
      return {
        classifications: args.products.map((p) => ({
          id: p.id,
          categoryId: unclearCategoryId,
          confidence: 0,
        })),
        provider: "classification disabled",
        durationMs: 0,
      };

    const client = productJudgments(ctx, {
      ...(args.receiptId && {
        source: { kind: "receipt" as const, id: args.receiptId },
      }),
      timeoutMs: 10000,
    });

    if (!client) throw new Error("Kategoriseringen er ikke tilgjengelig.");

    const results: { id: string; categoryId: string; confidence: number }[] =
      [];

    const { model } = productModel;
    let provider = model;
    let batchCount = 0;

    for (let offset = 0; offset < args.products.length; offset += 12) {
      const batch = args.products.slice(offset, offset + 12);

      const questions = Object.fromEntries(
        batch.map((_, index) => [
          `item_${index}`,
          classificationQuestion(index),
        ]),
      );

      batchCount++;

      const response = await client
        .systemOne({
          state: {
            products: batch.map((p) => classificationEvidence(p)),
          },
          questions,
        })
        .catch(() => {
          console.warn("receipt.classification_unavailable", {
            receiptId: args.receiptId,
            generation: args.generation,
            model,
          });

          return null;
        });

      if (!response) {
        provider = `${model}: classification unavailable`;
        results.push(
          ...args.products.slice(offset).map((product) => ({
            id: product.id,
            categoryId: "fallback.unclear",
            confidence: 0,
          })),
        );
        break;
      }

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
      batchCount,
      provider,
    });

    return {
      classifications: results,
      provider,
      durationMs: Date.now() - started,
    };
  },
});
