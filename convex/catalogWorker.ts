"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  searchProducts,
  searchPhysicalStores,
  findProductByEanBarcode,
  findProductById,
} from "./kassalapp/generated/client";
import { CatalogRequestError } from "./kassalapp/transport";
import {
  normalizeProducts,
  normalizeStores,
  normalizePrices,
} from "./kassalapp/normalize";
import {
  emptyCatalogResult,
  type CatalogRequest,
  type CatalogResult,
} from "../src/lib/catalog/model";
import { SearchPhysicalStoresGroup } from "./kassalapp/generated/models";
import { broaderProductSearch } from "../src/lib/catalog/search";
import { compatibleCatalogProduct } from "../src/lib/catalog/matching";

export const execute = internalAction({
  args: { id: v.id("catalogRequests") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const request: CatalogRequest | null = await ctx.runMutation(
      internal.catalogQueue.claim,
      { id },
    );

    if (!request) return null;
    const started = Date.now();

    try {
      let result: CatalogResult = emptyCatalogResult();

      if (request.kind === "products") {
        const search = async (term: string, store?: string) =>
          normalizeProducts(
            await searchProducts({
              search: term,
              store,
              size: 20,
              unique: true,
            }),
          );

        result.products = await search(request.search, request.store);

        const evidence = {
          name: request.search,
          brand: null,
          packageSize: null,
          packageUnit: null,
          attributes: [],
        };

        // Retailer coverage is incomplete. Do not let it hide an otherwise valid product.
        if (
          request.store &&
          !result.products.some((product) =>
            compatibleCatalogProduct(evidence, product),
          )
        )
          result.products = await search(request.search);
        const broaderSearch = broaderProductSearch(request.search);

        if (!result.products.length && broaderSearch)
          result.products = await search(broaderSearch);
      } else if (request.kind === "stores") {
        const group = Object.values(SearchPhysicalStoresGroup).find(
          (value) => value === request.chain,
        );

        if (request.chain && !group) throw new Error("Unknown store group");
        result.stores = normalizeStores(
          await searchPhysicalStores({
            search: request.search,
            size: 20,
            group,
          }),
        );
      } else if (request.kind === "details")
        result.products = normalizeProducts(await findProductById(request.id));
      else
        result = normalizePrices(
          request.ean
            ? await findProductByEanBarcode(request.ean)
            : await findProductById(request.id),
        );
      await ctx.runMutation(internal.catalogQueue.succeed, { id, result });
      console.info("catalog.request_completed", {
        requestId: id,
        kind: request.kind,
        durationMs: Date.now() - started,
        productCount: result.products.length,
        storeCount: result.stores.length,
      });
    } catch (error) {
      console.warn("catalog.request_failed", {
        requestId: id,
        durationMs: Date.now() - started,
        retryAfterMs:
          error instanceof CatalogRequestError ? error.retryAfterMs : 0,
        kind: request.kind,
        status: error instanceof CatalogRequestError ? error.status : null,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      await ctx.runMutation(internal.catalogQueue.fail, {
        id,
        status: error instanceof CatalogRequestError ? error.status : 0,
        retryAfterMs:
          error instanceof CatalogRequestError ? error.retryAfterMs : 0,
      });
    }

    return null;
  },
});
