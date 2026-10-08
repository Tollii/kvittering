import type { CatalogIdentity, CatalogProduct } from "./model";

const prefix = "oda:";

/** Oda's own product id identifies each line of an imported Oda order. */
export function odaCatalogIdentity(product: {
  id: number;
  name: string;
  brand?: string | null;
}): CatalogIdentity {
  return {
    key: `${prefix}${product.id}`,
    name: product.name,
    brand: product.brand ?? undefined,
  };
}

export function isOdaCatalogKey(key: string) {
  return key.startsWith(prefix);
}

/** The stored record for an Oda identity. Oda has no catalog API Kvitto may fetch details from. */
export function odaCatalogProduct(
  identity: CatalogIdentity,
): CatalogProduct | null {
  const id = identity.key.slice(prefix.length);

  if (!isOdaCatalogKey(identity.key) || !/^\d+$/.test(id)) return null;

  return {
    key: identity.key,
    name: identity.name,
    brand: identity.brand,
    ids: [],
    url: `https://oda.com/no/products/${id}/`,
    categories: [],
    nutrition: [],
    allergens: [],
    labels: [],
  };
}
