import type { CatalogRequest, CatalogResult } from "./model";
import { normalizeSearch, productSearch } from "./search";

export { normalizeSearch } from "./search";

export const day = 86_400_000;

export const catalogDetailsTtl = 30 * day;

const minute = 60_000;

/** A provider's Retry-After is honored up to this, so three attempts fit well inside matching's deadline. */
export const catalogRetryAfterCapMs = 10 * minute;

/**
 * An in-flight lookup scheduled this long ago lost its worker, for example to a
 * crash that never reported back, so the next request queues it again.
 */
export const catalogRequestStaleMs = 30 * minute;

/**
 * A matching run older than this is stalled: it is well past three capped
 * retries, queueing, and one requeue of a stale lookup.
 */
export const catalogMatchingDeadlineMs = 2 * 60 * minute;

export function normalizeRequest(request: CatalogRequest): CatalogRequest {
  if (request.kind === "details") return request;

  const search =
    request.kind === "products"
      ? productSearch(request.search)
      : normalizeSearch(request.search);

  if (search.length < 3 || search.length > 120)
    throw new Error("Søk med 3–120 tegn.");

  return { ...request, search };
}

export function requestKey(request: CatalogRequest) {
  const value = normalizeRequest(request);

  if (value.kind === "details")
    return JSON.stringify([value.kind, value.productKey]);

  // New searches must not reuse empty results from the previous retrieval rules.
  if (value.kind === "products")
    return JSON.stringify([value.kind, value.search, value.store ?? null, 2]);

  return JSON.stringify([value.kind, value.search, value.chain]);
}

export function resultLifetime(request: CatalogRequest, result: CatalogResult) {
  if (!result.products.length && !result.stores.length) return 7 * day;

  return request.kind === "stores" || request.kind === "details"
    ? catalogDetailsTtl
    : day;
}
