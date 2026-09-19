import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { clientMutation as mutation } from "./clientFunctions";
import { requireMember, requireReceipt } from "./access";
import {
  matchingLine,
  matchingReceiptValidator,
  needsProductLink,
} from "../src/lib/domain/product-linking";
import {
  productReference,
  withProductReference,
} from "../src/lib/domain/product-reference";
import { matchingKey } from "../src/lib/domain/product-matching";
import { lineEvidenceKey } from "../src/lib/catalog/matching";
import { catalogProductValidator } from "../src/lib/catalog/model";
import { findMapping } from "./products";
import { resolveProductSelections } from "./catalogLinks";
import { commitReceiptChange, receiptCommitValidator } from "./receiptChanges";

function eligible(receipt: Doc<"receipts">) {
  return (
    (receipt.status === "reviewed" || receipt.status === "needs_review") &&
    !receipt.excluded &&
    (!receipt.duplicateOf || receipt.duplicateResolved) &&
    receipt.catalogStatus !== "pending" &&
    !!receipt.data?.store?.trim()
  );
}

/** Read bounded history pages but send only unresolved product evidence to the queue. */
export const page = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(matchingReceiptValidator),
  handler: async (ctx, { paginationOpts }) => {
    const member = await requireMember(ctx);

    const result = await ctx.db
      .query("receipts")
      .withIndex("by_householdId", (q) =>
        q.eq("householdId", member.householdId),
      )
      .order("desc")
      .paginate({
        ...paginationOpts,
        numItems: Math.min(30, paginationOpts.numItems),
        maximumRowsRead: 30,
        maximumBytesRead: 500_000,
      });

    return {
      ...result,
      page: result.page.flatMap((receipt) => {
        if (!eligible(receipt)) return [];

        const lines = receipt
          .data!.lines.filter(needsProductLink)
          .map(matchingLine);

        return lines.length
          ? [
              {
                receiptId: receipt._id,
                revision: receipt.revision,
                generation: receipt.generation,
                store: receipt.data!.store!,
                date: receipt.data!.purchaseDate,
                lines,
              },
            ]
          : [];
      }),
    };
  },
});

/** Reuse candidates from automatic matching when their receipt evidence still agrees. */
export const candidates = query({
  args: { receiptId: v.id("receipts"), lineId: v.string() },
  returns: v.array(catalogProductValidator),
  handler: async (ctx, { receiptId, lineId }) => {
    const { receipt } = await requireReceipt(ctx, receiptId);
    const line = receipt.data?.lines.find((item) => item.id === lineId);

    if (!eligible(receipt) || !line || !needsProductLink(line)) return [];

    const decision = receipt.catalogDecisions?.find(
      (item) =>
        item.lineId === lineId && item.evidenceKey === lineEvidenceKey(line),
    );

    const keys = [
      ...new Set(
        [...(decision?.candidates ?? [])]
          .filter((candidate) => candidate.compatible)
          .sort((a, b) => (b.probability ?? 0) - (a.probability ?? 0))
          .map((candidate) => candidate.key),
      ),
    ].slice(0, 4);

    const rows = await Promise.all(
      keys.map((key) =>
        ctx.db
          .query("catalogProducts")
          .withIndex("by_key", (q) => q.eq("key", key))
          .unique(),
      ),
    );

    return rows.flatMap((row) => (row ? [row.product] : []));
  },
});

export const choose = mutation({
  args: {
    receiptId: v.id("receipts"),
    revision: v.number(),
    generation: v.number(),
    lineId: v.string(),
    choice: v.union(
      v.object({ kind: v.literal("catalog"), key: v.string() }),
      v.object({ kind: v.literal("separate") }),
    ),
  },
  returns: receiptCommitValidator,
  handler: async (ctx, args) => {
    const { receipt, member } = await requireReceipt(ctx, args.receiptId);

    if (
      receipt.revision !== args.revision ||
      receipt.generation !== args.generation
    )
      throw new Error("Kvitteringen er endret. Prøv igjen med siste versjon.");
    const line = receipt.data?.lines.find((item) => item.id === args.lineId);

    if (!eligible(receipt) || !line || !needsProductLink(line))
      throw new Error("Varen er ikke lenger klar for produktkobling.");
    const retailer = matchingKey(receipt.data!.store!);
    const before = await findMapping(ctx, member.householdId, retailer, line);

    const data = await resolveProductSelections(
      ctx,
      member.householdId,
      member.identity,
      receipt.data!,
      [{ ...args.choice, lineId: line.id }],
    );

    const mapping = await findMapping(ctx, member.householdId, retailer, line);

    if (!mapping?.revision) throw new Error("Produktvalget kunne ikke lagres.");

    const commit = await commitReceiptChange(ctx, {
      receiptId: receipt._id,
      expected: receipt,
      data,
      origin: { kind: "product_link", editor: member.identity },
    });

    await ctx.db.patch("receipts", receipt._id, {
      productLinkUndo: {
        editor: member.identity,
        revision: commit.revision,
        generation: receipt.generation,
        lineId: line.id,
        reference: productReference(line),
        mappingId: mapping._id,
        mappingRevision: mapping.revision,
        previousMapping: before
          ? {
              productId: before.productId,
              reference: before.reference,
              confirmedBy: before.confirmedBy,
            }
          : null,
      },
    });

    return commit;
  },
});

/** Restore only our latest decision. Never overwrite a later receipt edit or saved mapping. */
export const undo = mutation({
  args: { receiptId: v.id("receipts"), revision: v.number() },
  returns: v.null(),
  handler: async (ctx, { receiptId, revision }) => {
    const { receipt, member } = await requireReceipt(ctx, receiptId);
    const undo = receipt.productLinkUndo;

    if (
      !undo ||
      undo.editor !== member.identity ||
      receipt.revision !== revision ||
      undo.revision !== revision ||
      undo.generation !== receipt.generation ||
      !eligible(receipt)
    )
      throw new Error("Valget kan ikke angres fordi kvitteringen er endret.");
    const mapping = await ctx.db.get("productMappings", undo.mappingId);

    if (
      !mapping ||
      mapping.householdId !== member.householdId ||
      mapping.revision !== undo.mappingRevision
    )
      throw new Error("Produktvalget er endret senere og kan ikke angres.");

    if (undo.previousMapping)
      await ctx.db.replace("productMappings", mapping._id, {
        householdId: mapping.householdId,
        retailer: mapping.retailer,
        key: mapping.key,
        ...undo.previousMapping,
        revision: mapping.revision + 1,
      });
    else await ctx.db.delete("productMappings", mapping._id);
    await commitReceiptChange(ctx, {
      receiptId,
      expected: receipt,
      data: {
        ...receipt.data!,
        lines: receipt.data!.lines.map((line) =>
          line.id === undo.lineId
            ? withProductReference(line, undo.reference)
            : line,
        ),
      },
      origin: { kind: "product_link", editor: member.identity },
    });

    return null;
  },
});
