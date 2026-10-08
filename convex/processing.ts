import { isReceiptBeingRead } from "../src/lib/domain/receipt-state";
import { notifyReceiptActivities } from "./liveActivities";
import { linkCatalogProduct } from "./catalogLinks";
import { compatibleCatalogProduct } from "../src/lib/catalog/matching";
import { commitReceiptChange } from "./receiptChanges";
import { v, type Infer, type ObjectType } from "convex/values";
import { errorDetails } from "../src/lib/diagnostics";
import { WorkflowManager } from "@convex-dev/workflow";
import { components, internal } from "./_generated/api";
import { internalQuery, env, type MutationCtx } from "./_generated/server";
import { hasProductModel } from "./providerConfig";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./serverFunctions";
import {
  receiptDataValidator,
  normalizeAlias,
  classificationInputs,
  type ReceiptData,
  type ReceiptLine,
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
  applyClassifications,
  canAcceptReceipt,
} from "../src/lib/domain/receipt-review";

const workflow = new WorkflowManager(components.workflow);

export const processReceipt = workflow
  .define({
    args: { id: v.id("receipts"), generation: v.number() },
    returns: v.null(),
  })
  .handler(async (step, args): Promise<null> => {
    let stage = "begin";

    try {
      const storageIds = await step.runMutation(
        internal.processing.begin,
        args,
      );

      if (!storageIds) return null;
      stage = "extraction";

      // A receipt without images was imported from a store's own order data.
      const imported =
        storageIds.length === 0
          ? await step.runQuery(internal.processing.importedEvidence, {
              id: args.id,
            })
          : null;

      const extraction: {
        data: ReceiptData;
        provider: string;
        durationMs: number;
      } = imported
        ? { ...imported, durationMs: 0 }
        : await step.runAction(
            internal.providers.extract,
            { storageIds, receiptId: args.id, generation: args.generation },
            // Receipt IDs are diagnostic metadata; older journals do not include them.
            {
              unstableArgs: true,
              retry: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 },
            },
          );

      stage = "aliases";

      const prepared = await step.runQuery(internal.processing.applyAliases, {
        id: args.id,
        data: extraction.data,
      });

      stage = "classification";

      const classification = await step.runAction(
        internal.providers.classify,
        {
          products: classificationInputs(prepared),
          receiptId: args.id,
          generation: args.generation,
        },
        // Structured evidence retains the old JSON evidence; stored step results remain valid.
        {
          unstableArgs: true,
          retry: { maxAttempts: 3, initialBackoffMs: 2000, base: 2 },
        },
      );

      applyClassifications(prepared, classification.classifications);

      stage = "product_matching";

      const matches = await step.runAction(internal.productMatching.match, {
        id: args.id,
        data: prepared,
      });

      stage = "finish";
      await step.runMutation(internal.processing.finish, {
        matches,
        durationMs: extraction.durationMs + classification.durationMs,
        ...args,
        data: prepared,
        original: extraction.data,
        provider: `${extraction.provider} / ${classification.provider}`,
      });
    } catch (error) {
      await step.runMutation(
        internal.processing.fail,
        {
          ...args,
          stage,
          errorType: errorDetails(error).errorType,
          error:
            error instanceof Error ? error.message : "Behandlingen mislyktes.",
        },
        { unstableArgs: true },
      );
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
    await notifyReceiptActivities(ctx, receipt.householdId);

    const images = await ctx.db
      .query("images")
      .withIndex("by_receiptId", (q) => q.eq("receiptId", args.id))
      .take(8);

    console.info("receipt.processing_started", {
      receiptId: args.id,
      generation: args.generation,
      imageCount: images.length,
    });

    images.sort((a, b) => a.position - b.position);

    return images.map((image) => image.storageId);
  },
});

export const importedEvidence = internalQuery({
  args: { id: v.id("receipts") },
  returns: v.union(
    v.null(),
    v.object({ data: receiptDataValidator, provider: v.string() }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("receiptImports")
      .withIndex("by_receiptId", (q) => q.eq("receiptId", args.id))
      .unique();

    return row?.data ? { data: row.data, provider: row.provider } : null;
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

const finishArgs = {
  id: v.id("receipts"),
  generation: v.number(),
  data: receiptDataValidator,
  original: receiptDataValidator,
  matches: v.array(productDecision).optional(),
  provider: v.string(),
  durationMs: v.number().optional(),
  duplicateCursor: v.string().optional(),
  duplicateThrough: v.number().optional(),
};

type FinishArgs = ObjectType<typeof finishArgs>;

type ProductDecision = Infer<typeof productDecision>;

/** Tell if another receipt records the same purchase as the extracted data. */
function isDuplicateReceipt(
  other: Doc<"receipts">,
  receiptId: Id<"receipts">,
  data: ReceiptData,
) {
  const sameIdentifier =
    (data.receiptNumber && other.data?.receiptNumber === data.receiptNumber) ||
    (data.purchaseTime && other.data?.purchaseTime === data.purchaseTime);

  return (
    other._id !== receiptId &&
    other.data?.store &&
    normalizeAlias(other.data.store) === normalizeAlias(data.store ?? "") &&
    other.data.purchaseDate === data.purchaseDate &&
    other.data.totalOre === data.totalOre &&
    sameIdentifier
  );
}

/**
 * Search one page of the household's receipts for a duplicate. When the page
 * has no duplicate and more pages remain, schedule `finish` again for the next page.
 */
async function findDuplicate(
  ctx: MutationCtx,
  receipt: Doc<"receipts">,
  args: FinishArgs,
): Promise<
  | { kind: "resolved"; duplicateOf: Id<"receipts"> | undefined }
  | { kind: "rescheduled" }
> {
  const { store, purchaseDate } = args.data;

  if (
    receipt.duplicateOf ||
    !store ||
    !purchaseDate ||
    args.data.totalOre === null
  )
    return { kind: "resolved", duplicateOf: receipt.duplicateOf };

  const through = args.duplicateThrough ?? Date.now();

  const page = await ctx.db
    .query("receipts")
    .withIndex("by_householdId_and_purchaseDate", (q) =>
      q
        .eq("householdId", receipt.householdId)
        .eq("data.purchaseDate", purchaseDate)
        .lte("_creationTime", through),
    )
    .order("desc")
    .paginate({
      cursor: args.duplicateCursor ?? null,
      numItems: 100,
      maximumRowsRead: 100,
      maximumBytesRead: 500_000,
    });

  const duplicateOf = page.page.find((other) =>
    isDuplicateReceipt(other, receipt._id, args.data),
  )?._id;

  if (!duplicateOf && !page.isDone) {
    await ctx.scheduler.runAfter(0, internal.processing.finish, {
      ...args,
      duplicateCursor: page.continueCursor,
      duplicateThrough: through,
    });

    return { kind: "rescheduled" };
  }

  return { kind: "resolved", duplicateOf };
}

/**
 * Link a line through the household's saved mapping for its receipt name.
 * Returns null when the mapped product is not compatible.
 */
async function linkMappedLine(
  ctx: MutationCtx,
  householdId: Id<"households">,
  retailer: string,
  line: ReceiptLine,
  mapping: Doc<"productMappings">,
): Promise<ReceiptLine | null> {
  if (mapping.reference?.kind === "catalog") {
    const reference = mapping.reference;

    const catalog = await ctx.db
      .query("catalogProducts")
      .withIndex("by_key", (q) => q.eq("key", reference.product.key))
      .unique();

    if (!catalog || !compatibleCatalogProduct(line, catalog.product))
      return null;

    return linkCatalogProduct(
      ctx,
      householdId,
      retailer,
      line,
      catalog.product,
      mapping.confirmedBy,
    );
  }

  const product = mapping.productId
    ? await ctx.db.get("products", mapping.productId)
    : null;

  if (mapping.productId && !(product && compatibleProduct(line, product)))
    return null;

  return linkProduct(
    ctx,
    householdId,
    retailer,
    line,
    mapping.productId,
    mapping.confirmedBy !== null ? "manual" : "automatic",
  );
}

/** Get the product that the matching step chose for a line, or create a new one. */
async function decidedProductId(
  ctx: MutationCtx,
  householdId: Id<"households">,
  retailer: string,
  line: ReceiptLine,
  decision: ProductDecision | undefined,
): Promise<Id<"products"> | null> {
  if (decision?.kind === "new")
    return createProduct(ctx, householdId, retailer, line);

  if (decision?.kind !== "match" || !decision.productId) return null;

  const product = await ctx.db.get("products", decision.productId);

  const usable =
    product &&
    product.householdId === householdId &&
    product.retailer === retailer &&
    compatibleProduct(line, product);

  return usable ? product._id : null;
}

/** Keep the catalog link an imported line arrived with, from the store's own order data. */
async function linkImportedLine(
  ctx: MutationCtx,
  householdId: Id<"households">,
  retailer: string,
  line: ReceiptLine,
): Promise<ReceiptLine | null> {
  const reference = line.productReference;

  if (reference?.kind !== "catalog") return null;

  const record = await ctx.db
    .query("catalogProducts")
    .withIndex("by_key", (q) => q.eq("key", reference.product.key))
    .unique();

  return record
    ? linkCatalogProduct(ctx, householdId, retailer, line, record.product, null)
    : null;
}

/**
 * Link one extracted product line. A person's saved choice comes first, then the
 * store's own product, then an automatic mapping, then the matching decision.
 */
async function linkExtractedLine(
  ctx: MutationCtx,
  householdId: Id<"households">,
  retailer: string,
  line: ReceiptLine,
  matches: ProductDecision[] | undefined,
) {
  line.receiptName ??= line.name;

  const mapping = await findMapping(ctx, householdId, retailer, line);
  const confirmed = mapping?.confirmedBy ? mapping : null;

  const linked =
    (confirmed &&
      (await linkMappedLine(ctx, householdId, retailer, line, confirmed))) ??
    (await linkImportedLine(ctx, householdId, retailer, line)) ??
    (mapping &&
      !confirmed &&
      (await linkMappedLine(ctx, householdId, retailer, line, mapping)));

  if (linked) {
    Object.assign(line, linked);

    return;
  }

  const productId = await decidedProductId(
    ctx,
    householdId,
    retailer,
    line,
    matches?.find((match) => match.lineId === line.id),
  );

  Object.assign(
    line,
    await linkProduct(ctx, householdId, retailer, line, productId),
  );

  if (productId)
    await saveMapping(ctx, householdId, retailer, line, productId, null);
}

/** Get the enrichment step that follows extraction for the configured providers. */
function nextEnrichment(): "catalog" | "analysis" | "none" {
  if (env.KASSALAPP_API_KEY) return "catalog";

  if (hasProductModel()) return "analysis";

  return "none";
}

/** Send a push notification to the uploader's devices in the receipt's household, one time. */
async function notifyReceiptReady(ctx: MutationCtx, receipt: Doc<"receipts">) {
  if (receipt.receiptReadyNotified) return;

  await ctx.db.patch("receipts", receipt._id, { receiptReadyNotified: true });

  const subscriptions = await ctx.db
    .query("deviceSubscriptions")
    .withIndex("by_identity", (q) => q.eq("identity", receipt.uploadedBy))
    .take(10);

  for (const subscription of subscriptions) {
    if (subscription.householdId === receipt.householdId)
      await ctx.scheduler.runAfter(0, internal.pushDelivery.send, {
        receiptId: receipt._id,
        subscriptionId: subscription._id,
        attempt: 0,
      });
  }
}

export const finish = internalMutation({
  args: finishArgs,
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

    const duplicate = await findDuplicate(ctx, receipt, args);

    if (duplicate.kind === "rescheduled") return null;
    const { duplicateOf } = duplicate;

    await ctx.db.insert("extractions", {
      receiptId: args.id,
      generation: args.generation,
      data: args.original,
      provider: args.provider,
      classifiedData: args.data,
      durationMs: args.durationMs,
    });

    // A new extraction is kept for comparison. It never replaces a user's edits.
    const data =
      receipt.revision > 0 && receipt.data ? receipt.data : args.data;

    // Propagation skips active receipts. Apply decisions made while this run was active.
    await applyHouseholdAliases(ctx, receipt.householdId, data);

    const retailer = data === args.data ? matchingKey(data.store ?? "") : "";

    // Only a new extraction gets automatic product links. Lines without a retailer stay unlinked.
    for (const line of retailer ? data.lines : []) {
      if (line.kind === "product")
        await linkExtractedLine(
          ctx,
          receipt.householdId,
          retailer,
          line,
          args.matches,
        );
    }

    const autoAccepted =
      canAcceptReceipt(data, !!duplicateOf && !receipt.duplicateResolved) &&
      !args.provider.includes("mock") &&
      receipt.revision === 0;

    console.info("receipt.processing_completed", {
      receiptId: args.id,
      generation: args.generation,
      provider: args.provider,
      providerDurationMs: args.durationMs,
      lineCount: data.lines.length,
      uncertainLineCount: data.lines.filter((line) => line.issues.length > 0)
        .length,
      autoAccepted,
      duplicate: !!duplicateOf,
    });
    await commitReceiptChange(ctx, {
      receiptId: receipt._id,
      expected: receipt,
      data,
      origin: {
        kind: "extraction",
        provider: args.provider,
        next: nextEnrichment(),
      },
      duplicate: { duplicateOf, resolved: receipt.duplicateResolved },
    });

    if (!autoAccepted) await notifyReceiptReady(ctx, receipt);

    return null;
  },
});

export const fail = internalMutation({
  args: {
    id: v.id("receipts"),
    generation: v.number(),
    error: v.string(),
    stage: v.string().optional(),
    errorType: v.string().optional(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get("receipts", args.id);

    if (
      receipt &&
      receipt.generation === args.generation &&
      isReceiptBeingRead(receipt.status)
    ) {
      // The original failure stays on the receipt; do not duplicate OCR/provider text in logs.
      console.error("receipt.processing_failed", {
        receiptId: args.id,
        generation: args.generation,
        stage: args.stage,
        errorType: args.errorType,
      });
      await ctx.db.patch("receipts", args.id, {
        status: "failed",
        error: args.error.slice(0, 400),
      });
      await notifyReceiptActivities(ctx, receipt.householdId);
    }

    return null;
  },
});
