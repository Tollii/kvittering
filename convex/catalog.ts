import { clientMutation as mutation } from "./clientFunctions";
import { v } from "convex/values";
import { requireMember, requireReceipt } from "./access";
import { ensureRequest } from "./catalogQueue";
import {
  catalogResponseValidator,
  emptyCatalogResult,
  type CatalogResponse,
} from "../src/lib/catalog/model";
import { catalogDetailsTtl } from "../src/lib/catalog/policy";
import type { Doc } from "./_generated/dataModel";
import { retailerCode } from "../src/lib/catalog/matching";

export function requestResponse(
  request: Doc<"catalogRequests">,
): CatalogResponse {
  return {
    ...request.result,
    status:
      request.state === "ready"
        ? "ready"
        : request.state === "error"
          ? "error"
          : "pending",
    fetchedAt: request.fetchedAt,
    retryAt:
      request.state === "ready"
        ? undefined
        : request.state === "error"
          ? request.expiresAt
          : request.scheduledAt,
    message: request.error,
  };
}
export const searchProducts = mutation({
  service: "productLookup",
  args: { search: v.string() },
  returns: catalogResponseValidator,
  handler: async (ctx, args) => {
    await requireMember(ctx);
    return requestResponse(
      await ensureRequest(ctx, { kind: "products", search: args.search }),
    );
  },
});
export const searchStores = mutation({
  service: "productLookup",
  args: { receiptId: v.id("receipts"), search: v.string() },
  returns: catalogResponseValidator,
  handler: async (ctx, args) => {
    const { receipt } = await requireReceipt(ctx, args.receiptId);
    return requestResponse(
      await ensureRequest(ctx, {
        kind: "stores",
        search: args.search,
        chain: retailerCode(receipt.data?.store ?? null) ?? undefined,
      }),
    );
  },
});
export const prices = mutation({
  service: "productLookup",
  args: { productKey: v.string() },
  returns: catalogResponseValidator,
  handler: async (ctx, args) => {
    await requireMember(ctx);
    const record = await ctx.db
      .query("catalogProducts")
      .withIndex("by_key", (q) => q.eq("key", args.productKey))
      .unique();
    if (!record)
      return {
        ...emptyCatalogResult(),
        status: "error" as const,
        message: "Produktet finnes ikke i den lagrede katalogen.",
      };
    return requestResponse(
      await ensureRequest(ctx, {
        kind: "prices",
        productKey: record.key,
        id: record.product.ids[0],
        ean: record.product.ean,
      }),
    );
  },
});
export const product = mutation({
  service: "productLookup",
  args: { key: v.string() },
  returns: catalogResponseValidator,
  handler: async (ctx, { key }) => {
    await requireMember(ctx);
    const record = await ctx.db
      .query("catalogProducts")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (!record)
      return {
        ...emptyCatalogResult(),
        status: "error" as const,
        message: "Produktet finnes ikke i den lagrede katalogen.",
      };
    if (record.fetchedAt + catalogDetailsTtl > Date.now())
      return {
        ...emptyCatalogResult(),
        products: [record.product],
        status: "ready" as const,
        fetchedAt: record.fetchedAt,
      };
    const response = requestResponse(
      await ensureRequest(ctx, {
        kind: "details",
        productKey: key,
        id: record.product.ids[0],
      }),
    );
    return {
      ...response,
      products: response.products.length ? response.products : [record.product],
    };
  },
});
