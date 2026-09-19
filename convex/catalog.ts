import { query, type QueryCtx } from "./_generated/server";
import { requireCompatibleClient } from "./releasePolicy";
import { clientValidator } from "../src/lib/releases/policy";
import { requestKey } from "../src/lib/catalog/policy";
import {
  catalogLookupValidator,
  type CatalogLookup,
} from "../src/lib/catalog/model";
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
    if (
      record.detailsFetchedAt !== undefined &&
      record.detailsFetchedAt + catalogDetailsTtl > Date.now()
    )
      return {
        ...emptyCatalogResult(),
        products: [record.product],
        status: "ready" as const,
        fetchedAt: record.detailsFetchedAt,
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

async function lookupContext(
  ctx: QueryCtx,
  lookup: CatalogLookup,
) {
  if (lookup.kind === "stores") {
    const { receipt } = await requireReceipt(ctx, lookup.receiptId);
    return {
      request: {
        kind: "stores" as const,
        search: lookup.search,
        chain: retailerCode(receipt.data?.store ?? null) ?? undefined,
      },
      record: null,
    };
  }
  await requireMember(ctx);
  if (lookup.kind === "products") return { request: lookup, record: null };
  const record = await ctx.db
    .query("catalogProducts")
    .withIndex("by_key", (q) => q.eq("key", lookup.productKey))
    .unique();
  return {
    request: record
      ? {
          ...lookup,
          id: record.product.ids[0],
          ...(lookup.kind === "prices" ? { ean: record.product.ean } : {}),
        }
      : null,
    record,
  };
}
export const ensure = mutation({
  service: "productLookup",
  args: { lookup: catalogLookupValidator },
  returns: v.null(),
  handler: async (ctx, { lookup }) => {
    const { request, record } = await lookupContext(ctx, lookup);
    if (!request) return null;
    if (
      lookup.kind === "details" &&
      record?.detailsFetchedAt !== undefined &&
      record.detailsFetchedAt + catalogDetailsTtl > Date.now()
    )
      return null;
    await ensureRequest(ctx, request);
    return null;
  },
});
export const observe = query({
  args: { lookup: catalogLookupValidator, client: clientValidator.optional() },
  returns: catalogResponseValidator,
  handler: async (ctx, { lookup, client }) => {
    await requireCompatibleClient(ctx, client, "productLookup");
    const { request, record } = await lookupContext(ctx, lookup);
    if (!request)
      return {
        ...emptyCatalogResult(),
        status: "error" as const,
        message: "Produktet finnes ikke i den lagrede katalogen.",
      };
    if (
      lookup.kind === "details" &&
      record?.detailsFetchedAt !== undefined &&
      record.detailsFetchedAt + catalogDetailsTtl > Date.now()
    )
      return {
        ...emptyCatalogResult(),
        products: [record.product],
        status: "ready" as const,
        fetchedAt: record.detailsFetchedAt,
      };
    const row = await ctx.db
      .query("catalogRequests")
      .withIndex("by_key", (q) => q.eq("key", requestKey(request)))
      .unique();
    const response: CatalogResponse = row
      ? requestResponse(row)
      : {
          ...emptyCatalogResult(),
          status: "error",
          message: "Søket er ikke startet. Prøv igjen.",
        };
    return lookup.kind === "details" && record && !response.products.length
      ? { ...response, products: [record.product] }
      : response;
  },
});
