import { notifyReceiptActivities } from "./liveActivities";
import type { Id } from "./_generated/dataModel";
import {
  productIdentityKey,
  productSelectionValidator,
  productReference,
  withProductReference,
  type ProductSelection,
} from "../src/lib/domain/product-reference";
import { commitReceiptChange, receiptCommitValidator } from "./receiptChanges";
import { requireCompatibleClient } from "./releasePolicy";
import { clientValidator } from "../src/lib/releases/policy";
import { clientMutation as mutation } from "./clientFunctions";
import { recordCorrections } from "./corrections";
import { lineEvidenceKey } from "../src/lib/catalog/matching";
import { productChange } from "./products";
import { resolveProductSelections } from "./catalogLinks";
import { v } from "convex/values";
import {
  type PaginationOptions,
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import {
  query,
  internalQuery,
  internalMutation,
  type QueryCtx,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import schema, { statusValidator } from "./schema";
import { requireMember, requireReceipt } from "./access";
import {
  reconcile,
  receiptDataValidator,
  validateReceipt,
  aliasKey,
} from "../src/lib/domain/receipt";
import { canAcceptReceipt } from "../src/lib/domain/receipt-review";
import { isReceiptProcessing } from "../src/lib/domain/receipt-state";
import { learnCategories } from "./aliases";
import { start } from "@convex-dev/workflow";

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("receipts")),
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);

    return ctx.db
      .query("receipts")
      .withIndex("by_householdId", (q) =>
        q.eq("householdId", member.householdId),
      )
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const detail = query({
  // Route and notification values are untrusted strings until normalized below.
  args: { id: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      receipt: schema.doc("receipts"),
      images: v.array(schema.doc("images")),
    }),
  ),
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);
    const id = ctx.db.normalizeId("receipts", args.id);

    if (!id) return null;
    const receipt = await ctx.db.get("receipts", id);

    if (!receipt || receipt.householdId !== member.householdId) return null;

    return {
      receipt,
      images: await ctx.db
        .query("images")
        .withIndex("by_receiptId", (q) => q.eq("receiptId", id))
        .take(8),
    };
  },
});

export const reserve = mutation({
  service: "receiptProcessing",
  args: {
    clientId: v.string(),
    imageCount: v.number(),
    backgroundUpload: v.boolean().optional(),
    householdId: v.id("households"),
  },
  returns: v.id("receipts"),
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);

    if (member.householdId !== args.householdId)
      throw new Error("Husstanden er endret. Logg inn på nytt.");

    if (
      !/^[\w-]{16,80}$/.test(args.clientId) ||
      !Number.isInteger(args.imageCount) ||
      args.imageCount < 1 ||
      args.imageCount > 8
    )
      throw new Error("Ugyldig opplasting.");

    const existing = await ctx.db
      .query("receipts")
      .withIndex("by_householdId_and_clientId", (q) =>
        q.eq("householdId", member.householdId).eq("clientId", args.clientId),
      )
      .unique();

    if (existing) {
      if (args.backgroundUpload && existing.status === "uploading")
        await ctx.db.patch("receipts", existing._id, {
          backgroundUpload: true,
        });

      return existing._id;
    }

    return ctx.db.insert("receipts", {
      householdId: member.householdId,
      uploadedBy: member.identity,
      uploaderName: member.name,
      clientId: args.clientId,
      imageCount: args.imageCount,
      backgroundUpload: args.backgroundUpload,
      status: "uploading",
      revision: 0,
      generation: 0,
      data: null,
      provider: "pending",
      duplicateResolved: false,
      excluded: false,
    });
  },
});

async function beginUploadedReceipt(
  ctx: MutationCtx,
  id: Id<"receipts">,
  imageCount: number,
) {
  await ctx.db.patch("receipts", id, { status: "uploaded", generation: 1 });
  await start(ctx, internal.processing.processReceipt, { id, generation: 1 });
  console.info("receipt.upload_completed", {
    receiptId: id,
    generation: 1,
    imageCount,
  });
}

/** All images are in storage: hand the receipt to the server workflow. The phone is done. */
export const completeUpload = mutation({
  service: "receiptProcessing",
  args: { id: v.id("receipts") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { receipt } = await requireReceipt(ctx, id);

    if (receipt.status !== "uploading") return null;

    const images = await ctx.db
      .query("images")
      .withIndex("by_receiptId", (q) => q.eq("receiptId", id))
      .take(8);

    if (images.length !== receipt.imageCount)
      throw new Error("Noen bilder er ikke lastet opp.");
    await beginUploadedReceipt(ctx, id, images.length);

    return null;
  },
});

export const retry = mutation({
  service: "receiptProcessing",
  args: { id: v.id("receipts") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const { receipt } = await requireReceipt(ctx, id);

    if (isReceiptProcessing(receipt.status))
      throw new Error("Kvitteringen behandles allerede.");
    const generation = receipt.generation + 1;
    await ctx.db.patch("receipts", id, {
      status: "uploaded",
      generation,
      error: undefined,
    });
    await start(ctx, internal.processing.processReceipt, { id, generation });
    console.info("receipt.processing_retried", { receiptId: id, generation });

    return null;
  },
});

export const save = mutation({
  args: {
    id: v.id("receipts"),
    revision: v.number(),
    data: receiptDataValidator,
    reviewed: v.boolean(),
    rememberLineIds: v.array(v.string()),
    selections: v.array(productSelectionValidator).optional(),
    productChanges: v.array(productChange).optional(),
    catalogChanges: v
      .array(
        v.object({ lineId: v.string(), key: v.union(v.string(), v.null()) }),
      )
      .optional(),
    physicalStoreId: v.union(v.number(), v.null()).optional(),
    duplicateResolved: v.boolean(),
    excluded: v.boolean(),
  },
  returns: receiptCommitValidator,
  handler: async (ctx, args) => {
    const { member, receipt } = await requireReceipt(ctx, args.id);

    if (receipt.revision !== args.revision)
      throw new Error("Kvitteringen ble endret av en annen. Åpne den på nytt.");

    if (
      receipt.status === "processing" ||
      receipt.status === "uploaded" ||
      receipt.status === "uploading"
    )
      throw new Error("Vent til behandlingen er ferdig.");
    args = { ...args, data: structuredClone(args.data) };
    validateReceipt(args.data);

    const acceptable = canAcceptReceipt(
      args.data,
      !!receipt.duplicateOf && !args.duplicateResolved,
    );

    if (args.reviewed && !acceptable)
      throw new Error("Kontroller avvik og uklare felt før godkjenning.");

    for (const line of args.data.lines) {
      const previous = receipt.data?.lines.find((old) => old.id === line.id);

      // Compatibility fields added below are not manual receipt edits.
      if (!previous || JSON.stringify(previous) !== JSON.stringify(line))
        line.manual = true;

      if (previous) line.originalText = previous.originalText;
      line.receiptName = previous?.receiptName ?? previous?.name ?? line.name;

      const reference =
        previous &&
        line.kind === "product" &&
        args.data.store === receipt.data?.store
          ? productReference(previous)
          : { kind: "unresolved" as const };

      Object.assign(
        line,
        withProductReference(
          line,
          reference.kind === "catalog" &&
            previous &&
            lineEvidenceKey(previous) !== lineEvidenceKey(line)
            ? { kind: "unresolved" }
            : reference,
        ),
      );
    }

    args.data.physicalStore =
      args.data.store === receipt.data?.store &&
      args.data.branch === receipt.data?.branch
        ? (receipt.data?.physicalStore ?? null)
        : null;
    args.data.physicalStoreManual =
      args.data.store === receipt.data?.store &&
      args.data.branch === receipt.data?.branch
        ? (receipt.data?.physicalStoreManual ?? false)
        : false;
    // Translate installed-client commands once; the resolver consumes one selection union.
    const selections = new Map<string, ProductSelection>();

    if (
      args.selections &&
      (args.productChanges?.length || args.catalogChanges?.length)
    )
      throw new Error("Velg én kommandoform.");

    for (const change of args.productChanges ?? []) {
      if (selections.has(change.lineId))
        throw new Error("Velg ett produkt per varelinje.");
      selections.set(
        change.lineId,
        change.createNew
          ? { kind: "new_household", lineId: change.lineId }
          : change.productId
            ? {
                kind: "household",
                lineId: change.lineId,
                productId: change.productId,
              }
            : { kind: "separate", lineId: change.lineId },
      );
    }

    for (const change of args.catalogChanges ?? []) {
      const previous = selections.get(change.lineId);

      if (previous && (previous.kind !== "separate" || change.key !== null))
        throw new Error("Velg ett produkt per varelinje.");
      selections.set(
        change.lineId,
        change.key
          ? { kind: "catalog", lineId: change.lineId, key: change.key }
          : { kind: "separate", lineId: change.lineId },
      );
    }

    args.data = await resolveProductSelections(
      ctx,
      member.householdId,
      member.identity,
      args.data,
      args.selections ?? [...selections.values()],
      args.physicalStoreId,
    );

    for (const line of args.data.lines) {
      line.categoryAliasKey = line.categoryAliasKey ?? line.productKey;

      if (
        line.categoryAliasKey &&
        line.categoryAliasKey !== aliasKey(args.data, line)
      )
        line.categoryAliasKey = null;
      line.productKey = line.categoryAliasKey ?? null;

      if (
        args.rememberLineIds.includes(line.id) &&
        line.kind === "product" &&
        line.categoryId
      ) {
        const key = aliasKey(args.data, line);

        if (!key)
          throw new Error(
            "Butikk og originaltekst kreves for å huske en vare.",
          );

        const existing = await ctx.db
          .query("aliases")
          .withIndex("by_householdId_and_key", (q) =>
            q.eq("householdId", member.householdId).eq("key", key),
          )
          .unique();

        if (existing)
          await ctx.db.patch("aliases", existing._id, {
            categoryId: line.categoryId,
            confirmedBy: member.identity,
          });
        else
          await ctx.db.insert("aliases", {
            householdId: member.householdId,
            key,
            categoryId: line.categoryId,
            confirmedBy: member.identity,
          });
        line.categoryAliasKey = key;
        line.productKey = key;
        await ctx.scheduler.runAfter(0, internal.aliases.applyToMatching, {
          householdId: member.householdId,
          key,
          cursor: null,
        });
      }
    }

    await recordCorrections(ctx, receipt, args.data);

    if (args.reviewed)
      await learnCategories(
        ctx,
        member.householdId,
        member.identity,
        args.data,
        args.rememberLineIds,
      );

    return commitReceiptChange(ctx, {
      receiptId: receipt._id,
      expected: receipt,
      data: args.data,
      origin: {
        kind: "human",
        editor: member.identity,
        reviewed: args.reviewed,
      },
      duplicate: {
        duplicateOf: receipt.duplicateOf,
        resolved: args.duplicateResolved,
      },
      excluded: args.excluded,
    });
  },
});

export const imageAccess = internalQuery({
  args: { id: v.id("receipts"), position: v.number() },
  returns: v.object({
    receipt: schema.doc("receipts"),
    image: v.union(schema.doc("images"), v.null()),
  }),
  handler: async (ctx, args) => {
    const { receipt } = await requireReceipt(ctx, args.id);

    if (
      !Number.isInteger(args.position) ||
      args.position < 0 ||
      args.position >= receipt.imageCount
    )
      throw new Error("Ugyldig bilde.");

    return {
      receipt,
      image: await ctx.db
        .query("images")
        .withIndex("by_receiptId_and_position", (q) =>
          q.eq("receiptId", args.id).eq("position", args.position),
        )
        .unique(),
    };
  },
});

export const attachImage = internalMutation({
  args: {
    id: v.id("receipts"),
    position: v.number(),
    storageId: v.id("_storage"),
    client: clientValidator.optional(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireCompatibleClient(ctx, args.client, "receiptProcessing");
    const { receipt } = await requireReceipt(ctx, args.id);

    if (
      receipt.status !== "uploading" ||
      !Number.isInteger(args.position) ||
      args.position < 0 ||
      args.position >= receipt.imageCount
    ) {
      await ctx.storage.delete(args.storageId);

      return null;
    }

    const existing = await ctx.db
      .query("images")
      .withIndex("by_receiptId_and_position", (q) =>
        q.eq("receiptId", args.id).eq("position", args.position),
      )
      .unique();

    if (existing) {
      await ctx.storage.delete(args.storageId);

      return null;
    }

    const metadata = await ctx.db.system.get("_storage", args.storageId);

    if (!metadata) throw new Error("Bildet mangler.");

    const matches = await ctx.db
      .query("images")
      .withIndex("by_sha256", (q) => q.eq("sha256", metadata.sha256))
      .take(10);

    for (const match of matches) {
      const other = await ctx.db.get("receipts", match.receiptId);

      if (
        other &&
        other._id !== receipt._id &&
        other.householdId === receipt.householdId
      ) {
        await ctx.db.patch("receipts", receipt._id, { duplicateOf: other._id });
        break;
      }
    }

    await ctx.db.insert("images", {
      receiptId: args.id,
      position: args.position,
      storageId: args.storageId,
      sha256: metadata.sha256,
    });

    if (receipt.backgroundUpload) {
      const images = await ctx.db
        .query("images")
        .withIndex("by_receiptId", (q) => q.eq("receiptId", receipt._id))
        .take(8);

      if (images.length === receipt.imageCount)
        await beginUploadedReceipt(ctx, receipt._id, images.length);
    }

    return null;
  },
});

/** Delete only a household receipt that has finished uploading. Processing cannot recreate it. */
export const remove = mutation({
  args: { id: v.id("receipts"), revision: v.number() },
  returns: v.null(),
  handler: async (ctx, { id, revision }) => {
    const member = await requireMember(ctx);
    const receipt = await ctx.db.get("receipts", id);

    if (!receipt) return null;

    if (receipt.householdId !== member.householdId)
      throw new Error("Kvitteringen er ikke tilgjengelig.");

    if (receipt.status === "uploading")
      throw new Error("Vent til bildene er lastet opp.");

    if (receipt.revision !== revision)
      throw new Error(
        "Kvitteringen er endret. Hent siste versjon før du sletter.",
      );
    await ctx.db.delete("receipts", id);
    await notifyReceiptActivities(ctx, receipt.householdId);
    await ctx.runMutation(internal.receipts.cleanupDeleted, { id });

    return null;
  },
});

/** Remove dependent records in bounded transactions; shared products and mappings remain. */
export const cleanupDeleted = internalMutation({
  args: { id: v.id("receipts") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    if (await ctx.db.get("receipts", id))
      throw new Error("Kvitteringen er ikke slettet.");
    let remaining = false;

    for (const table of [
      "images",
      "extractions",
      "revisions",
      "corrections",
    ] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_receiptId", (q) => q.eq("receiptId", id))
        .take(3);

      for (const row of rows) {
        if ("storageId" in row) await ctx.storage.delete(row.storageId);
        await ctx.db.delete(table, row._id);
      }

      remaining ||= rows.length === 3;
    }

    const duplicates = await ctx.db
      .query("receipts")
      .withIndex("by_duplicateOf", (q) => q.eq("duplicateOf", id))
      .take(5);

    for (const receipt of duplicates)
      await ctx.db.patch("receipts", receipt._id, {
        duplicateOf: undefined,
        duplicateResolved: false,
      });

    if (remaining || duplicates.length === 5)
      await ctx.scheduler.runAfter(0, internal.receipts.cleanupDeleted, { id });

    return null;
  },
});

/** Summary pages omit OCR text, catalog decisions, and analysis payloads. */
export const history = query({
  returns: paginationResultValidator(
    v.object({
      _id: v.id("receipts"),
      _creationTime: v.number(),
      status: statusValidator,
      store: v.union(v.string(), v.null()),
      purchaseDate: v.union(v.string(), v.null()),
      totalOre: v.union(v.number(), v.null()),
      spendingOre: v.number(),
      excluded: v.boolean(),
    }),
  ),
  args: { search: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { search, paginationOpts }) => {
    const member = await requireMember(ctx);

    const page = await ctx.db
      .query("receipts")
      .withIndex("by_householdId_and_purchaseDate", (q) =>
        q.eq("householdId", member.householdId),
      )
      .order("desc")
      .paginate({ ...paginationOpts, maximumRowsRead: 100 });

    const term = search.trim().toLocaleLowerCase("nb-NO");

    return {
      ...page,
      page: page.page
        .filter((receipt) =>
          [
            receipt.data?.store,
            receipt.data?.purchaseDate,
            ...(receipt.data?.lines.flatMap((line) => [
              line.name,
              line.originalText,
              ...line.tags,
            ]) ?? []),
          ]
            .join(" ")
            .toLocaleLowerCase("nb-NO")
            .includes(term),
        )
        .map((receipt) => ({
          _id: receipt._id,
          _creationTime: receipt._creationTime,
          status: receipt.status,
          store: receipt.data?.store ?? null,
          purchaseDate: receipt.data?.purchaseDate ?? null,
          totalOre: receipt.data?.totalOre ?? null,
          spendingOre:
            receipt.data && !receipt.excluded
              ? reconcile(receipt.data).productSpending
              : 0,
          excluded: receipt.excluded,
        })),
    };
  },
});

const readScopeValidator = v.union(
  v.object({ kind: v.literal("period"), start: v.string(), end: v.string() }),
  v.object({ kind: v.literal("product"), key: v.string() }),
  v.object({ kind: v.literal("priceHistory"), receiptId: v.id("receipts") }),
  v.object({ kind: v.literal("allProducts") }),
  v.object({ kind: v.literal("undated") }),
  v.object({ kind: v.literal("inbox") }),
);

/** Complete consumers must exhaust these bounded pages before publishing totals. */
export const readPage = query({
  args: { scope: readScopeValidator, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("receipts")),
  handler: async (ctx, { scope, paginationOpts }) => {
    const member = await requireMember(ctx);
    const options = { ...paginationOpts, maximumRowsRead: 100 };

    if (scope.kind === "undated")
      return ctx.db
        .query("receipts")
        .withIndex("by_householdId_and_purchaseDate", (q) =>
          q
            .eq("householdId", member.householdId)
            .lte("data.purchaseDate", null),
        )
        .paginate(options);

    if (scope.kind === "period") {
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(scope.start) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(scope.end) ||
        scope.start > scope.end
      )
        throw new Error("Invalid report period.");

      return receiptPeriodPage(
        ctx,
        member.householdId,
        scope.start,
        scope.end,
        options,
      );
    }

    const keys = new Set<string>();

    if (scope.kind === "priceHistory") {
      const { receipt } = await requireReceipt(ctx, scope.receiptId);

      for (const line of receipt.data?.lines ?? []) {
        const key = productIdentityKey(line);

        if (key) keys.add(key);
      }
    }

    const page = await ctx.db
      .query("receipts")
      .withIndex("by_householdId", (q) =>
        q.eq("householdId", member.householdId),
      )
      .order("desc")
      .paginate(options);

    return {
      ...page,
      page: page.page.filter((receipt) => {
        if (scope.kind === "inbox")
          return receipt.status !== "reviewed" && !receipt.excluded;

        if (scope.kind === "product")
          return receipt.data?.lines.some(
            (line) =>
              line.catalogProduct?.key === scope.key ||
              productIdentityKey(line) === scope.key,
          );

        if (scope.kind === "priceHistory")
          return receipt.data?.lines.some((line) =>
            keys.has(productIdentityKey(line) ?? ""),
          );

        return true;
      }),
    };
  },
});

export const editorContext = query({
  returns: v.object({
    recentCategories: v.array(v.string()),
    nextPendingId: v.union(v.id("receipts"), v.null()),
  }),
  args: { id: v.id("receipts") },
  handler: async (ctx, { id }) => {
    const { member } = await requireReceipt(ctx, id);

    const recent = await ctx.db
      .query("receipts")
      .withIndex("by_householdId", (q) =>
        q.eq("householdId", member.householdId),
      )
      .order("desc")
      .take(50);

    const pending = await Promise.all(
      (["needs_review", "failed"] as const).map((status) =>
        ctx.db
          .query("receipts")
          .withIndex("by_householdId_and_status", (q) =>
            q.eq("householdId", member.householdId).eq("status", status),
          )
          .filter((q) =>
            q.and(q.neq(q.field("_id"), id), q.eq(q.field("excluded"), false)),
          )
          .order("desc")
          .first(),
      ),
    );

    return {
      recentCategories: recent.flatMap(
        (receipt) =>
          receipt.data?.lines.flatMap((line) =>
            line.categoryId ? [line.categoryId] : [],
          ) ?? [],
      ),
      nextPendingId:
        pending
          .filter((item) => item !== null)
          .sort((a, b) => b._creationTime - a._creationTime)[0]?._id ?? null,
    };
  },
});

export const attentionCount = query({
  returns: v.object({ count: v.number(), capped: v.boolean() }),
  args: {},
  handler: async (ctx) => {
    const member = await requireMember(ctx);

    const pages = await Promise.all(
      (["needs_review", "failed"] as const).map((status) =>
        ctx.db
          .query("receipts")
          .withIndex("by_householdId_and_status", (q) =>
            q.eq("householdId", member.householdId).eq("status", status),
          )
          .filter((q) => q.eq(q.field("excluded"), false))
          .take(100),
      ),
    );

    return {
      count: pages.reduce((sum, page) => sum + page.length, 0),
      capped: pages.some((page) => page.length === 100),
    };
  },
});

/** Shared indexed period contract for interactive reports and bounded background reads. */
export function receiptPeriodPage(
  ctx: QueryCtx,
  householdId: Id<"households">,
  start: string,
  end: string,
  paginationOpts: PaginationOptions,
) {
  return ctx.db
    .query("receipts")
    .withIndex("by_householdId_and_purchaseDate", (q) =>
      q
        .eq("householdId", householdId)
        .gte("data.purchaseDate", start)
        .lte("data.purchaseDate", end),
    )
    .paginate({ ...paginationOpts, maximumRowsRead: 100 });
}
