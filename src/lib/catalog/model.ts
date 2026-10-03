import { oreValidator } from "../domain/ore";
import { v, type Infer } from "convex/values";

const text = v.string().optional();

const number = v.number().optional();

export const catalogIdentityValidator = v.object({
  key: v.string(),
  ean: text,
  name: v.string(),
  brand: text,
  image: text,
  weight: number,
  weightUnit: text,
  equivalence: v
    .object({
      representativeKey: v.string(),
      candidateKeys: v.array(v.string()),
    })
    .optional(),
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

/**
 * Store prices were removed because the provider's prices are stale for large
 * chains. Installed clients and requests stored before the removal still use
 * these shapes, so the backend accepts and returns them without fetching prices.
 */
const legacyCatalogPricesValidator = v.array(
  v.object({ store: v.string(), priceOre: oreValidator, checkedAt: text }),
);

export const legacyPricesLookupValidator = v.object({
  kind: v.literal("prices"),
  productKey: v.string(),
});

export const catalogRequestValidator = v.union(
  v.object({ kind: v.literal("products"), search: v.string(), store: text }),
  v.object({ kind: v.literal("stores"), search: v.string(), chain: text }),
  v.object({
    kind: v.literal("details"),
    productKey: v.string(),
    id: v.number(),
  }),
);

/** Legacy: rows queued before store prices were removed, until they drain. */
export const storedCatalogRequestValidator = v.union(
  ...catalogRequestValidator.members,
  legacyPricesLookupValidator.extend({ id: v.number(), ean: text }),
);

export const catalogResultValidator = v.object({
  products: v.array(catalogProductValidator),
  stores: v.array(physicalStoreValidator),
  /** Legacy: results stored before store prices were removed. */
  prices: legacyCatalogPricesValidator.optional(),
});

export const catalogResponseValidator = catalogResultValidator.extend({
  /** Legacy: always empty. Installed clients read it from every response. */
  prices: legacyCatalogPricesValidator,
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
});

export const emptyCatalogResponse = () => ({
  ...emptyCatalogResult(),
  prices: [] satisfies CatalogResponse["prices"],
});

export function catalogIdentity(product: CatalogProduct): CatalogIdentity {
  const { key, ean, name, brand, image, weight, weightUnit, equivalence } =
    product;

  return { key, ean, name, brand, image, weight, weightUnit, equivalence };
}

/** Product lookups accept a retailer name; provider codes are resolved on the server. */
export const catalogLookupValidator = v.union(
  v.object({ kind: v.literal("products"), search: v.string(), store: text }),
  v.object({
    kind: v.literal("stores"),
    search: v.string(),
    receiptId: v.id("receipts"),
  }),
  v.object({ kind: v.literal("details"), productKey: v.string() }),
);

export type CatalogLookup = Infer<typeof catalogLookupValidator>;
