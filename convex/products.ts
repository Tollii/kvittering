import { v } from "convex/values";
import {
  query,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { requireReceipt } from "./access";
import {
  lineValidator,
  type ReceiptData,
  type ReceiptLine,
} from "../src/lib/domain/receipt";
import {
  matchingKey,
  compatibleProduct,
  productEvidence,
  similarProducts,
} from "../src/lib/domain/product-matching";

export const productDecision = v.object({
  lineId: v.string(),
  kind: v.union(v.literal("match"), v.literal("new"), v.literal("uncertain")),
  productId: v.union(v.id("products"), v.null()),
});
export const productChange = v.object({
  lineId: v.string(),
  productId: v.union(v.id("products"), v.null()),
  createNew: v.boolean(),
});
export async function findMapping(
  ctx: QueryCtx,
  householdId: Id<"households">,
  retailer: string,
  line: ReceiptLine,
) {
  return ctx.db
    .query("productMappings")
    .withIndex("by_householdId_and_retailer_and_key", (q) =>
      q
        .eq("householdId", householdId)
        .eq("retailer", retailer)
        .eq("key", matchingKey(line.receiptName ?? line.name)),
    )
    .unique();
}
async function candidates(
  ctx: QueryCtx,
  householdId: Id<"households">,
  retailer: string,
  name: string,
) {
  const tokens = [
    ...new Set(
      matchingKey(name)
        .split(/[^\p{L}\p{N}]+/u)
        .filter((word) => word.length > 2),
    ),
  ].slice(0, 3);
  const results = await Promise.all(
    tokens.map((token) =>
      ctx.db
        .query("products")
        .withSearchIndex("search_name", (q) =>
          q
            .search("name", token)
            .eq("householdId", householdId)
            .eq("retailer", retailer),
        )
        .take(8),
    ),
  );
  return [...new Map(results.flat().map((p) => [p._id, p])).values()];
}
export const search = query({
  args: {
    receiptId: v.id("receipts"),
    retailer: v.string(),
    search: v.string(),
  },
  returns: v.array(schema.doc("products")),
  handler: async (ctx, args) => {
    const { member } = await requireReceipt(ctx, args.receiptId);
    const retailer = matchingKey(args.retailer);
    if (args.search.trim())
      return (
        await candidates(
          ctx,
          member.householdId,
          retailer,
          args.search.slice(0, 200),
        )
      ).slice(0, 20);
    return ctx.db
      .query("products")
      .withIndex("by_householdId_and_retailer", (q) =>
        q.eq("householdId", member.householdId).eq("retailer", retailer),
      )
      .order("desc")
      .take(20);
  },
});
export const prepare = internalQuery({
  args: { id: v.id("receipts"), retailer: v.string(), line: lineValidator },
  returns: v.object({
    saved: v.boolean(),
    productId: v.union(v.id("products"), v.null()),
    candidates: v.array(schema.doc("products")),
  }),
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get("receipts", args.id);
    if (!receipt) throw new Error("Kvitteringen mangler.");
    const retailer = matchingKey(args.retailer);
    const mapping = await findMapping(
      ctx,
      receipt.householdId,
      retailer,
      args.line,
    );
    if (mapping) {
      const product = mapping.productId
        ? await ctx.db.get("products", mapping.productId)
        : null;
      if (
        !mapping.productId ||
        (product &&
          compatibleProduct(args.line, product, mapping.confirmedBy !== null))
      )
        return { saved: true, productId: mapping.productId, candidates: [] };
      return { saved: true, productId: null, candidates: [] };
    }
    return {
      saved: false,
      productId: null,
      candidates: similarProducts(
        args.line,
        await candidates(ctx, receipt.householdId, retailer, args.line.name),
      ),
    };
  },
});
export async function saveMapping(
  ctx: MutationCtx,
  householdId: Id<"households">,
  retailer: string,
  line: ReceiptLine,
  productId: Id<"products"> | null,
  confirmedBy: string | null,
) {
  const existing = await findMapping(ctx, householdId, retailer, line);
  const values = {
    householdId,
    retailer,
    key: matchingKey(line.receiptName ?? line.name),
    productId,
    confirmedBy,
  };
  if (existing) await ctx.db.replace("productMappings", existing._id, values);
  else await ctx.db.insert("productMappings", values);
}
export async function createProduct(
  ctx: MutationCtx,
  householdId: Id<"households">,
  retailer: string,
  line: ReceiptLine,
) {
  if (!line.name.trim() || line.name.length > 300)
    throw new Error("Varen må ha et navn på 1–300 tegn.");
  return ctx.db.insert("products", {
    householdId,
    retailer,
    ...productEvidence(line),
    name: line.name.trim(),
  });
}
export async function linkProduct(
  ctx: MutationCtx,
  householdId: Id<"households">,
  retailer: string,
  line: ReceiptLine,
  id: Id<"products"> | null,
) {
  const product = id ? await ctx.db.get("products", id) : null;
  if (
    id &&
    (!product ||
      product.householdId !== householdId ||
      product.retailer !== retailer)
  )
    throw new Error("Varen er ikke tilgjengelig i denne butikken.");
  line.productId = id;
  line.productName = product?.name ?? "";
  line.productKey = null;
}
/** Corrections and mappings are written in the same transaction as the receipt edit. */
export async function correctProducts(
  ctx: MutationCtx,
  householdId: Id<"households">,
  editor: string,
  data: ReceiptData,
  changes: {
    lineId: string;
    productId: Id<"products"> | null;
    createNew: boolean;
  }[],
) {
  if (new Set(changes.map((change) => change.lineId)).size !== changes.length)
    throw new Error("En vare kan bare kobles én gang per lagring.");
  const retailer = matchingKey(data.store ?? "");
  for (const change of changes) {
    const line = data.lines.find(
      (l) => l.id === change.lineId && l.kind === "product",
    );
    if (!line || !retailer || !matchingKey(line.receiptName ?? line.name))
      throw new Error("Butikk og varenavn kreves for produktkobling.");
    const id = change.createNew
      ? await createProduct(ctx, householdId, retailer, line)
      : change.productId;
    await linkProduct(ctx, householdId, retailer, line, id);
  line.productMatchManual = true;
    line.catalogProduct = null;
    await saveMapping(ctx, householdId, retailer, line, id, editor);
  }
}
