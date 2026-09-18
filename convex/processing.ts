import { v } from "convex/values";
import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { internalMutation, internalQuery, env } from "./_generated/server";
import {
  receiptDataValidator,
  normalizeAlias,
  classificationInputs,
  type ReceiptData,
} from "../src/lib/domain/receipt";
import { applyHouseholdAliases } from "./aliases";
import {
  productDecision,
  findMapping,
  createProduct,
  linkProduct,
  saveMapping,
} from "./products";
import {
  matchingKey,
  compatibleProduct,
} from "../src/lib/domain/product-matching";
import {
  canAcceptReceipt,
  categoryReviewThreshold,
} from "../src/lib/domain/receipt-review";
const workflow = new WorkflowManager(components.workflow);
export const processReceipt = workflow
  .define({
    args: { id: v.id("receipts"), generation: v.number() },
    returns: v.null(),
  })
  .handler(async (step, args): Promise<null> => {
    try {
      const storageIds = await step.runMutation(
        internal.processing.begin,
        args,
      );
      if (!storageIds) return null;
      const extraction: {
        data: ReceiptData;
        provider: string;
        durationMs: number;
      } = await step.runAction(
        internal.providers.extract,
        { storageIds },
        { retry: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 } },
      );
      const prepared = await step.runQuery(internal.processing.applyAliases, {
        id: args.id,
        data: extraction.data,
      });
      const classification = await step.runAction(
        internal.providers.classify,
        { products: classificationInputs(prepared) },
        { retry: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 } },
      );
      for (const result of classification.classifications) {
        const line = prepared.lines.find((line) => line.id === result.id);
        if (line) {
          line.categoryId = result.categoryId;
          line.confidence = result.confidence;
          if (
            result.confidence < categoryReviewThreshold ||
            result.categoryId === "fallback.unclear"
          )
            line.issues.push("Kategorien er usikker.");
        }
      }
      const matches = await step.runAction(internal.productMatching.match, {
        id: args.id,
        data: prepared,
      });
      await step.runMutation(internal.processing.finish, {
        matches,
        durationMs: extraction.durationMs + classification.durationMs,
        ...args,
        data: prepared,
        original: extraction.data,
        provider: `${extraction.provider} / ${classification.provider}`,
      });
    } catch (error) {
      await step.runMutation(internal.processing.fail, {
        ...args,
        error:
          error instanceof Error ? error.message : "Behandlingen mislyktes.",
      });
    }
    return null;
  });
export const begin = internalMutation({
  args: { id: v.id("receipts"), generation: v.number() },
  returns: v.union(v.array(v.id("_storage")), v.null()),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get("receipts", args.id);
    if (
      !receipt ||
      receipt.generation !== args.generation ||
      receipt.status !== "uploaded"
    )
      return null;
    await ctx.db.patch("receipts", args.id, { status: "processing" });
    const images = await ctx.db
      .query("images")
      .withIndex("by_receiptId", (q) => q.eq("receiptId", args.id))
      .take(8);
    return images
      .sort((a, b) => a.position - b.position)
      .map((image) => image.storageId);
  },
});
export const applyAliases = internalQuery({
  args: { id: v.id("receipts"), data: receiptDataValidator },
  returns: receiptDataValidator,
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get("receipts", args.id);
    if (!receipt) throw new Error("Kvitteringen mangler.");
    return applyHouseholdAliases(ctx, receipt.householdId, args.data);
  },
});
export const finish = internalMutation({
  args: {
    id: v.id("receipts"),
    generation: v.number(),
    data: receiptDataValidator,
    original: receiptDataValidator,
    matches: v.optional(v.array(productDecision)),
    provider: v.string(),
    durationMs: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get("receipts", args.id);
    if (
      !receipt ||
      receipt.generation !== args.generation ||
      receipt.status !== "processing"
    )
      return null;
    const existing = await ctx.db
      .query("extractions")
      .withIndex("by_receiptId_and_generation", (q) =>
        q.eq("receiptId", args.id).eq("generation", args.generation),
      )
      .unique();
    if (existing) return null;
    await ctx.db.insert("extractions", {
      receiptId: args.id,
      generation: args.generation,
      data: args.original,
      provider: args.provider,
      classifiedData: args.data,
      ...(args.durationMs !== undefined ? { durationMs: args.durationMs } : {}),
    });
    let duplicateOf = receipt.duplicateOf;
    if (
      !duplicateOf &&
      args.data.store &&
      args.data.purchaseDate &&
      args.data.totalOre !== null
    ) {
      const others = await ctx.db
        .query("receipts")
        .withIndex("by_householdId", (q) =>
          q.eq("householdId", receipt.householdId),
        )
        .order("desc")
        .take(250);
      const duplicate = others.find(
        (other) =>
          other._id !== receipt._id &&
          other.data?.store &&
          normalizeAlias(other.data.store) ===
            normalizeAlias(args.data.store!) &&
          other.data.purchaseDate === args.data.purchaseDate &&
          other.data.totalOre === args.data.totalOre &&
          ((args.data.receiptNumber &&
            other.data.receiptNumber === args.data.receiptNumber) ||
            (args.data.purchaseTime &&
              other.data.purchaseTime === args.data.purchaseTime)),
      );
      duplicateOf = duplicate?._id ?? null;
    }
    // A new extraction is kept for comparison. It never replaces a user's edits.
    const data =
      receipt.revision > 0 && receipt.data ? receipt.data : args.data;
    if (data === args.data) {
      // Remembered household decisions settle categories for every engine.
      await applyHouseholdAliases(ctx, receipt.householdId, data);
      const retailer = matchingKey(data.store ?? "");
      for (const line of data.lines) {
        if (line.kind !== "product" || !retailer) continue;
        line.receiptName ??= line.name;
        const mapping = await findMapping(
          ctx,
          receipt.householdId,
          retailer,
          line,
        );
        let productId = null;
        if (mapping) {
          const product = mapping.productId
            ? await ctx.db.get("products", mapping.productId)
            : null;
          if (
            !mapping.productId ||
            (product &&
              compatibleProduct(line, product, mapping.confirmedBy !== null))
          ) {
            await linkProduct(
              ctx,
              receipt.householdId,
              retailer,
              line,
              mapping.productId,
            );
            continue;
          }
        }
        const decision = args.matches?.find(
          (match) => match.lineId === line.id,
        );
        if (decision?.kind === "new")
          productId = await createProduct(
            ctx,
            receipt.householdId,
            retailer,
            line,
          );
        if (decision?.kind === "match" && decision.productId) {
          const product = await ctx.db.get("products", decision.productId);
          if (
            product &&
            product.householdId === receipt.householdId &&
            product.retailer === retailer &&
            compatibleProduct(line, product)
          )
            productId = product._id;
        }
        await linkProduct(ctx, receipt.householdId, retailer, line, productId);
        if (productId)
          await saveMapping(
            ctx,
            receipt.householdId,
            retailer,
            line,
            productId,
            null,
          );
      }
    }
    const autoAccepted =
      canAcceptReceipt(data, !!duplicateOf && !receipt.duplicateResolved) &&
      !args.provider.includes("mock") &&
      receipt.revision === 0;
    await ctx.db.patch("receipts", args.id, {
      data,
      autoAccepted,
      provider: args.provider,
      status: autoAccepted ? "reviewed" : "needs_review",
      error: null,
      duplicateOf,
      catalogStatus: undefined,
      catalogWorkflowId: undefined,
    });
    if (env.KASSALAPP_API_KEY)
      await ctx.scheduler.runAfter(0, internal.catalogMatching.start, {
        id: args.id,
        generation: args.generation,
      });
    else if (env.TYPESAFE_API_KEY)
      await ctx.scheduler.runAfter(0, internal.productAnalysis.start, {
        id: args.id,
      });
    if (!receipt.receiptReadyNotified) {
      await ctx.db.patch("receipts", args.id, { receiptReadyNotified: true });
      const subscriptions = await ctx.db
        .query("deviceSubscriptions")
        .withIndex("by_identity", (q) => q.eq("identity", receipt.uploadedBy))
        .take(10);
      for (const subscription of subscriptions) {
        if (subscription.householdId === receipt.householdId)
          await ctx.scheduler.runAfter(0, internal.pushDelivery.send, {
            receiptId: args.id,
            subscriptionId: subscription._id,
            attempt: 0,
          });
      }
    }

    return null;
  },
});
export const fail = internalMutation({
  args: { id: v.id("receipts"), generation: v.number(), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get("receipts", args.id);
    if (
      receipt &&
      receipt.generation === args.generation &&
      ["uploaded", "processing"].includes(receipt.status)
    )
      await ctx.db.patch("receipts", args.id, {
        status: "failed",
        error: args.error.slice(0, 400),
      });
    return null;
  },
});
