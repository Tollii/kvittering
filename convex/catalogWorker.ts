"use node";

import { providerFetch } from "./providerTransport";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  searchProducts,
  searchPhysicalStores,
  findProductById,
} from "./kassalapp/generated/client";
import { CatalogRequestError } from "./kassalapp/transport";
import { normalizeProducts, normalizeStores } from "./kassalapp/normalize";
import {
  emptyCatalogResult,
  type CatalogRequest,
  type CatalogResult,
} from "../src/lib/catalog/model";
import { SearchPhysicalStoresGroup } from "./kassalapp/generated/models";
import { broaderProductSearch } from "../src/lib/catalog/search";
import { compatibleCatalogProduct } from "../src/lib/catalog/matching";

type CatalogFetchOptions = { fetch: typeof fetch };

/** Searches products, and widens the search when retailer coverage or the exact term finds no usable product. */
async function searchCatalogProducts(
  request: Extract<CatalogRequest, { kind: "products" }>,
  options: CatalogFetchOptions,
): Promise<CatalogResult["products"]> {
  const search = async (term: string, store?: string) =>
    normalizeProducts(
      await searchProducts(
        {
          search: term,
          store,
          size: 20,
          unique: true,
        },
        options,
      ),
    );

  let products = await search(request.search, request.store);

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
    !products.some((product) => compatibleCatalogProduct(evidence, product))
  )
    products = await search(request.search);
  const broaderSearch = broaderProductSearch(request.search);

  if (!products.length && broaderSearch) products = await search(broaderSearch);

  return products;
}

async function searchCatalogStores(
  request: Extract<CatalogRequest, { kind: "stores" }>,
  options: CatalogFetchOptions,
): Promise<CatalogResult["stores"]> {
  const group = Object.values(SearchPhysicalStoresGroup).find(
    (value) => value === request.chain,
  );

  if (request.chain && !group) throw new Error("Unknown store group");

  return normalizeStores(
    await searchPhysicalStores(
      {
        search: request.search,
        size: 20,
        group,
      },
      options,
    ),
  );
}

/** Sends the provider requests for one claimed catalog request and returns the normalized result. */
async function fetchCatalogResult(
  request: CatalogRequest,
  options: CatalogFetchOptions,
): Promise<CatalogResult> {
  const result = emptyCatalogResult();

  switch (request.kind) {
    case "products":
      result.products = await searchCatalogProducts(request, options);

      return result;
    case "stores":
      result.stores = await searchCatalogStores(request, options);

      return result;
    case "details":
      result.products = normalizeProducts(
        await findProductById(request.id, options),
      );

      return result;
    // Store prices were removed; a request queued before then resolves empty.
    case "prices":
      return result;
  }
}

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

    const options = {
      fetch: providerFetch(ctx, "kassalapp", { kind: "catalog", id }),
    };

    try {
      const result = await fetchCatalogResult(request, options);

      await ctx.runMutation(internal.catalogQueue.succeed, { id, result });
      console.info("catalog.request_completed", {
        requestId: id,
        kind: request.kind,
        durationMs: Date.now() - started,
        productCount: result.products.length,
        storeCount: result.stores.length,
      });
    } catch (error) {
      const requestError = error instanceof CatalogRequestError ? error : null;

      console.warn("catalog.request_failed", {
        requestId: id,
        durationMs: Date.now() - started,
        retryAfterMs: requestError ? requestError.retryAfterMs : 0,
        kind: request.kind,
        status: requestError ? requestError.status : null,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      await ctx.runMutation(internal.catalogQueue.fail, {
        id,
        status: requestError ? requestError.status : 0,
        retryAfterMs: requestError ? requestError.retryAfterMs : 0,
      });
    }

    return null;
  },
});
