import { userError } from "./userErrors";
import {
  withProductReference,
  type ProductReference,
} from "../src/lib/domain/product-reference";
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
  receiptLineNameLimit,
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
        (product && compatibleProduct(args.line, product))
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
  reference?: ProductReference,
) {
  const existing = await findMapping(ctx, householdId, retailer, line);

  const values = {
    revision: (existing?.revision ?? 0) + 1,
    householdId,
    retailer,
    key: matchingKey(line.receiptName ?? line.name),
    productId,
    reference,
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
  if (!line.name.trim() || line.name.length > receiptLineNameLimit)
    throw userError(`Varen må ha et navn på 1–${receiptLineNameLimit} tegn.`);

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
  provenance: "manual" | "automatic" = "automatic",
): Promise<ReceiptLine> {
  const product = id ? await ctx.db.get("products", id) : null;

  if (
    id &&
    (!product ||
      product.householdId !== householdId ||
      product.retailer !== retailer)
  )
    throw userError("Varen er ikke tilgjengelig i denne butikken.");

  return withProductReference(
    line,
    product
      ? { kind: "household", id: product._id, name: product.name, provenance }
      : provenance === "manual"
        ? { kind: "separate", provenance }
        : { kind: "unresolved" },
  );
}
