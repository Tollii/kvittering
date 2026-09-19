import { parseProductEvidence } from "../../src/lib/domain/product-evidence";
import { z } from "zod";
import type {
  CatalogProduct,
  CatalogResult,
  PhysicalStore,
} from "../../src/lib/catalog/model";
import { emptyCatalogResult } from "../../src/lib/catalog/model";

const nullableText = z.string().nullish();
const nullableNumber = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^-?\d+(?:\.\d+)?$/)
      .transform(Number),
  ])
  .nullish();
const productSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  ean: nullableText,
  brand: nullableText,
  image: nullableText,
  url: nullableText,
  description: nullableText,
  ingredients: nullableText,
  weight: nullableNumber,
  weight_unit: nullableText,
  category: z.array(z.object({ name: z.string() })).nullish(),
  nutrition: z
    .array(
      z.object({
        display_name: z.string(),
        amount: nullableNumber,
        unit: nullableText,
      }),
    )
    .nullish(),
  allergens: z
    .array(z.object({ display_name: z.string(), contains: z.string() }))
    .nullish(),
  labels: z.array(z.object({ display_name: z.string() })).nullish(),
});
const string = (value: string | null | undefined, limit = 5000) =>
  value?.trim().slice(0, limit) || undefined;
const imageUrl = (value: string | null | undefined) =>
  value?.startsWith("https://") ? value : undefined;
export function normalizeProducts(response: unknown): CatalogProduct[] {
  const rows = z
    .object({ data: z.union([z.array(productSchema), productSchema]) })
    .parse(response).data;
  const products = new Map<string, CatalogProduct>();
  for (const row of (Array.isArray(rows) ? rows : [rows]).slice(0, 24)) {
    const ean = row.ean && /^\d{8,14}$/.test(row.ean) ? row.ean : undefined;
    const key = ean ? `ean:${ean}` : `kassalapp:${row.id}`;
    const namedSize = parseProductEvidence({
      source: "catalog",
      name: row.name,
    }).measures[0];
    const namedWeight = namedSize?.rawAmount;
    const weightUnit =
      string(row.weight_unit, 20) ??
      (namedWeight && (!row.weight || row.weight === namedWeight)
        ? namedSize.rawUnit
        : undefined);
    const product: CatalogProduct = {
      key,
      ids: [row.id],
      ean,
      name: row.name.slice(0, 300),
      brand: string(row.brand, 200),
      image: imageUrl(row.image),
      url: imageUrl(row.url),
      description: string(row.description),
      categories: row.category?.map((value) => value.name).slice(0, 12) ?? [],
      ingredients: string(row.ingredients),
      weight: row.weight && row.weight > 0 ? row.weight : namedWeight,
      weightUnit,
      nutrition:
        row.nutrition?.slice(0, 30).map((value) => ({
          name: value.display_name,
          amount: value.amount ?? undefined,
          unit: value.unit ?? undefined,
        })) ?? [],
      allergens:
        row.allergens?.slice(0, 30).map((value) => ({
          name: value.display_name,
          status: value.contains,
        })) ?? [],
      labels: row.labels?.map((value) => value.display_name).slice(0, 30) ?? [],
    };
    const previous = products.get(key);
    if (!previous) products.set(key, product);
    else
      products.set(key, {
        ...previous,
        ids: [...new Set([...previous.ids, row.id])],
        image: previous.image ?? product.image,
        brand: previous.brand ?? product.brand,
        ingredients: previous.ingredients ?? product.ingredients,
        nutrition: previous.nutrition.length
          ? previous.nutrition
          : product.nutrition,
        categories: previous.categories.length
          ? previous.categories
          : product.categories,
      });
  }
  return [...products.values()];
}
export function normalizeStores(response: unknown): PhysicalStore[] {
  const schema = z.object({
    data: z.array(
      z.object({
        id: z.number().int(),
        name: z.string(),
        group: nullableText,
        address: z.string(),
        position: z
          .object({ lat: nullableNumber, lng: nullableNumber })
          .nullish(),
      }),
    ),
  });
  return schema
    .parse(response)
    .data.slice(0, 24)
    .map((row) => ({
      id: row.id,
      name: row.name,
      chain: row.group ?? undefined,
      address: row.address,
      latitude: row.position?.lat ?? undefined,
      longitude: row.position?.lng ?? undefined,
    }));
}
export function normalizePrices(response: unknown): CatalogResult {
  const data = z.object({ data: z.unknown() }).parse(response).data;
  const rows = z.object({ products: z.array(z.unknown()) }).safeParse(data);
  const products = rows.success ? rows.data.products : [data];
  const result = emptyCatalogResult();
  for (const product of products.slice(0, 24)) {
    const value = z
      .object({
        store: z
          .union([
            z.array(z.object({ name: z.string() })),
            z.object({ name: z.string() }),
          ])
          .nullish(),
        current_price: z
          .union([
            z.number(),
            z.array(z.object({ price: z.number(), date: nullableText })),
            z.object({ price: z.number(), date: nullableText }),
          ])
          .nullish(),
        updated_at: nullableText,
      })
      .parse(product);
    const store = Array.isArray(value.store)
      ? value.store[0]?.name
      : value.store?.name;
    const prices =
      typeof value.current_price === "number"
        ? [{ price: value.current_price, date: value.updated_at }]
        : Array.isArray(value.current_price)
          ? value.current_price
          : value.current_price
            ? [value.current_price]
            : [];
    for (const price of prices) {
      if (price.price < 0 || !Number.isFinite(price.price)) continue;
      result.prices.push({
        store: store ?? "Ukjent butikk",
        priceOre: Math.round(price.price * 100),
        checkedAt: price.date ?? undefined,
      });
    }
  }
  result.prices = result.prices.slice(0, 24);
  return result;
}
