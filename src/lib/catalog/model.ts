import { v, type Infer } from "convex/values";

const text = v.union(v.string(), v.null());
const number = v.union(v.number(), v.null());
export const catalogIdentityValidator = v.object({
  key: v.string(),
  ean: text,
  name: v.string(),
  brand: text,
  image: text,
  weight: number,
  weightUnit: text,
});
export const catalogProductValidator = catalogIdentityValidator.extend({
  ids: v.array(v.number()),
  url: text,
  description: text,
  categories: v.array(v.string()),
  ingredients: text,
  nutrition: v.array(
    v.object({ name: v.string(), amount: number, unit: text }),
  ),
  allergens: v.array(v.object({ name: v.string(), status: v.string() })),
  labels: v.array(v.string()),
});
export const physicalStoreValidator = v.object({
  id: v.number(),
  name: v.string(),
  chain: text,
  address: v.string(),
  latitude: number,
  longitude: number,
});
export const catalogPriceValidator = v.object({
  store: v.string(),
  priceOre: v.number(),
  checkedAt: text,
});
export const catalogRequestValidator = v.union(
  v.object({ kind: v.literal("products"), search: v.string() }),
  v.object({ kind: v.literal("stores"), search: v.string(), chain: text }),
  v.object({
    kind: v.literal("details"),
    productKey: v.string(),
    id: v.number(),
  }),
  v.object({
    kind: v.literal("prices"),
    productKey: v.string(),
    id: v.number(),
    ean: text,
  }),
);
export const catalogResultValidator = v.object({
  products: v.array(catalogProductValidator),
  stores: v.array(physicalStoreValidator),
  prices: v.array(catalogPriceValidator),
});
export const catalogResponseValidator = catalogResultValidator.extend({
  status: v.union(v.literal("pending"), v.literal("ready"), v.literal("error")),
  fetchedAt: number,
  retryAt: number,
  message: text,
});
export type CatalogIdentity = Infer<typeof catalogIdentityValidator>;
export type CatalogProduct = Infer<typeof catalogProductValidator>;
export type PhysicalStore = Infer<typeof physicalStoreValidator>;
export type CatalogRequest = Infer<typeof catalogRequestValidator>;
export type CatalogResult = Infer<typeof catalogResultValidator>;
export type CatalogResponse = Infer<typeof catalogResponseValidator>;
export const emptyCatalogResult = (): CatalogResult => ({
  products: [],
  stores: [],
  prices: [],
});
export function catalogIdentity(product: CatalogProduct): CatalogIdentity {
  const { key, ean, name, brand, image, weight, weightUnit } = product;
  return { key, ean, name, brand, image, weight, weightUnit };
}
