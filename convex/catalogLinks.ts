import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { ReceiptData, ReceiptLine } from "../src/lib/domain/receipt";
import { catalogIdentity, type CatalogProduct } from "../src/lib/catalog/model";
import { matchingKey } from "../src/lib/domain/product-matching";
import { saveMapping } from "./products";

export async function linkCatalogProduct(
  ctx: MutationCtx,
  householdId: Id<"households">,
  retailer: string,
  line: ReceiptLine,
  product: CatalogProduct,
  editor: string | null,
) {
  const store = matchingKey(retailer);
  const existing = await ctx.db
    .query("products")
    .withIndex("by_householdId_and_retailer_and_catalogKey", (q) =>
      q
        .eq("householdId", householdId)
        .eq("retailer", store)
        .eq("catalogKey", product.key),
    )
    .unique();
  const productId =
    existing?._id ??
    (await ctx.db.insert("products", {
      householdId,
      retailer: store,
      catalogKey: product.key,
      name: product.name,
      brand: product.brand ?? null,
      packageSize: product.weight ?? null,
      packageUnit: product.weightUnit ?? null,
      attributes: [],
    }));
  line.catalogProduct = catalogIdentity(product);
  line.productId = productId;
  line.productName = product.name;
  line.productMatchManual = editor !== null;
  await saveMapping(ctx, householdId, store, line, productId, editor);
}
export async function correctCatalogLinks(
  ctx: MutationCtx,
  householdId: Id<"households">,
  editor: string,
  data: ReceiptData,
  changes: { lineId: string; key: string | null }[],
  physicalStoreId?: number | null,
) {
  if (new Set(changes.map((change) => change.lineId)).size !== changes.length)
    throw new Error("Velg ett produkt per varelinje.");
  for (const change of changes) {
    const line = data.lines.find(
      (line) => line.id === change.lineId && line.kind === "product",
    );
    if (!line || !data.store) throw new Error("Varen eller butikken mangler.");
    if (!change.key) {
      line.catalogProduct = null;
      line.productId = null;
      line.productName = "";
      line.productMatchManual = true;
      await saveMapping(
        ctx,
        householdId,
        matchingKey(data.store),
        line,
        null,
        editor,
      );
      continue;
    }
    const record = await ctx.db
      .query("catalogProducts")
      .withIndex("by_key", (q) => q.eq("key", change.key!))
      .unique();
    if (!record)
      throw new Error("Produktet finnes ikke i katalogen. Søk på nytt.");
    await linkCatalogProduct(
      ctx,
      householdId,
      data.store,
      line,
      record.product,
      editor,
    );
  }
  if (physicalStoreId !== undefined) {
    const record =
      physicalStoreId === null
        ? null
        : await ctx.db
            .query("catalogStores")
            .withIndex("by_externalId", (q) =>
              q.eq("externalId", physicalStoreId),
            )
            .unique();
    if (physicalStoreId !== null && !record)
      throw new Error("Butikken finnes ikke i katalogen.");
    data.physicalStore = record?.store ?? null;
    data.physicalStoreManual = true;
  }
}
