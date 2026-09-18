import type { CatalogRequest, CatalogResult } from "./model";

export const day = 86_400_000;
export const catalogDetailsTtl = 30 * day;
export function normalizeSearch(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("nb-NO")
    .replace(/\s+/g, " ")
    .trim();
}
export function normalizeRequest(request: CatalogRequest): CatalogRequest {
  if (request.kind === "prices" || request.kind === "details") return request;
  const search = normalizeSearch(request.search);
  if (search.length < 3 || search.length > 120)
    throw new Error("Søk med 3–120 tegn.");
  return { ...request, search };
}
export function requestKey(request: CatalogRequest) {
  const value = normalizeRequest(request);
  if (value.kind === "prices" || value.kind === "details")
    return JSON.stringify([value.kind, value.productKey]);
  return JSON.stringify([
    value.kind,
    value.search,
    value.kind === "stores" ? value.chain : null,
  ]);
}
export function resultLifetime(request: CatalogRequest, result: CatalogResult) {
  const count =
    result.products.length + result.stores.length + result.prices.length;
  if (!count) return 7 * day;
  return request.kind === "prices"
    ? 6 * 60 * 60 * 1000
    : request.kind === "stores" || request.kind === "details"
      ? catalogDetailsTtl
      : day;
}
