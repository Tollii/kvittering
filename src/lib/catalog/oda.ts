import type { CatalogProduct } from "./model";

const prefix = "oda:";

/**
 * Oda's own product for a line of an imported Oda order. Kvitto uses only the
 * order data from Oda's MCP API, so the record has no image or nutrition.
 */
export function odaCatalogProduct(product: {
  id: number;
  name: string;
  brand?: string | null;
}): CatalogProduct {
  return {
    key: `${prefix}${product.id}`,
    name: product.name,
    brand: product.brand ?? undefined,
    ids: [],
    url: `https://oda.com/no/products/${product.id}/`,
    categories: [],
    nutrition: [],
    allergens: [],
    labels: [],
  };
}

/** Where the product data shown for a catalog key comes from. */
export function catalogSource(key: string): "Oda" | "Kassalapp" {
  return key.startsWith(prefix) ? "Oda" : "Kassalapp";
}
