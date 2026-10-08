import { userError } from "./userErrors";
import {
  withProductReference,
  type ProductSelection,
} from "../src/lib/domain/product-reference";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  printedName,
  type ReceiptData,
  type ReceiptLine,
} from "../src/lib/domain/receipt";
import { catalogIdentity, type CatalogProduct } from "../src/lib/catalog/model";
import { matchingKey } from "../src/lib/domain/product-matching";
import { saveMapping, createProduct, linkProduct } from "./products";
import type { CatalogDecision } from "../src/lib/catalog/decisions";
import {
  groupCatalogProducts,
  equivalentCatalogProduct,
} from "../src/lib/catalog/equivalence";
import { compatibleCatalogProduct } from "../src/lib/catalog/matching";

/** Recheck group members before persisting a package-independent catalog identity. */
export async function resolveCatalogMatch(
  ctx: MutationCtx,
  line: ReceiptLine,
  decision: CatalogDecision,
): Promise<CatalogProduct | null> {
  const { productKey } = decision;

  if (!productKey) return null;

  const existing = await ctx.db
    .query("catalogProducts")
    .withIndex("by_key", (q) => q.eq("key", productKey))
    .unique();

  if (!decision.equivalentKeys)
    return existing && compatibleCatalogProduct(line, existing.product)
      ? existing.product
      : null;
  const keys = [...new Set(decision.equivalentKeys)];

  if (keys.length < 2 || keys.length > 24) return null;

  const records = await Promise.all(
    keys.map((key) =>
      ctx.db
        .query("catalogProducts")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique(),
    ),
  );

  const products = records.flatMap((record) =>
    record && compatibleCatalogProduct(line, record.product)
      ? [record.product]
      : [],
  );

  if (products.length !== records.length) return null;

  const group = groupCatalogProducts(products).find(
    (candidate) => candidate.key === productKey && candidate.equivalence,
  );

  if (!group) return null;
  const product = equivalentCatalogProduct(group);

  const values = {
    key: product.key,
    product,
    fetchedAt: Date.now(),
    detailsFetchedAt: Date.now(),
  };

  if (existing) await ctx.db.patch("catalogProducts", existing._id, values);
  else await ctx.db.insert("catalogProducts", values);

  return product;
}

/**
 * Save a store's own product to the shared catalog. Records are shared between
 * households, so an unchanged product is not written again.
 */
export async function saveStoreProduct(
  ctx: MutationCtx,
  product: CatalogProduct,
) {
  const existing = await ctx.db
    .query("catalogProducts")
    .withIndex("by_key", (q) => q.eq("key", product.key))
    .unique();

  if (
    existing &&
    existing.product.name === product.name &&
    existing.product.brand === product.brand
  )
    return;

  const values = {
    key: product.key,
    product,
    fetchedAt: Date.now(),
    detailsFetchedAt: Date.now(),
  };

  if (existing) await ctx.db.patch("catalogProducts", existing._id, values);
  else await ctx.db.insert("catalogProducts", values);
}

export async function linkCatalogProduct(
  ctx: MutationCtx,
  householdId: Id<"households">,
  retailer: string,
  line: ReceiptLine,
  product: CatalogProduct,
  editor: string | null,
) {
  const store = matchingKey(retailer);

  const reference = {
    kind: "catalog" as const,
    product: catalogIdentity(equivalentCatalogProduct(product)),
    provenance: editor !== null ? ("manual" as const) : ("automatic" as const),
  };

  await saveMapping(ctx, householdId, store, line, null, editor, reference);

  return withProductReference(line, reference);
}

/** Links one receipt line to the selected catalog or household product and saves the mapping. */
async function linkSelectedProduct(
  ctx: MutationCtx,
  householdId: Id<"households">,
  editor: string,
  retailer: string,
  line: ReceiptLine,
  selection: ProductSelection,
): Promise<ReceiptLine> {
  if (selection.kind === "catalog") {
    const record = await ctx.db
      .query("catalogProducts")
      .withIndex("by_key", (q) => q.eq("key", selection.key))
      .unique();

    if (!record)
      throw userError("Produktet finnes ikke i katalogen. Søk på nytt.");

    return linkCatalogProduct(
      ctx,
      householdId,
      retailer,
      line,
      record.product,
      editor,
    );
  }

  const id =
    selection.kind === "new_household"
      ? await createProduct(ctx, householdId, retailer, line)
      : selection.kind === "household"
        ? selection.productId
        : null;

  const linked = await linkProduct(
    ctx,
    householdId,
    retailer,
    line,
    id,
    "manual",
  );

  await saveMapping(
    ctx,
    householdId,
    retailer,
    line,
    id,
    editor,
    linked.productReference,
  );

  return linked;
}

/** Returns the selected catalog store, or null when the selection clears it. */
async function selectedPhysicalStore(
  ctx: MutationCtx,
  physicalStoreId: number | null,
): Promise<ReceiptData["physicalStore"]> {
  if (physicalStoreId === null) return null;

  const record = await ctx.db
    .query("catalogStores")
    .withIndex("by_externalId", (q) => q.eq("externalId", physicalStoreId))
    .unique();

  if (!record) throw userError("Butikken finnes ikke i katalogen.");

  return record.store;
}

/** Resolve one explicit selection per line inside the receipt transaction. */
export async function resolveProductSelections(
  ctx: MutationCtx,
  householdId: Id<"households">,
  editor: string,
  source: ReceiptData,
  selections: ProductSelection[],
  physicalStoreId?: number | null,
): Promise<ReceiptData> {
  if (
    new Set(selections.map((selection) => selection.lineId)).size !==
    selections.length
  )
    throw userError("Velg ett produkt per varelinje.");
  const data = structuredClone(source);
  const retailer = matchingKey(data.store ?? "");

  for (const selection of selections) {
    const index = data.lines.findIndex(
      (line) => line.id === selection.lineId && line.kind === "product",
    );

    const line = data.lines[index];

    if (!line || !retailer || !matchingKey(printedName(line)))
      throw userError("Butikk og varenavn kreves for produktkobling.");

    data.lines[index] = await linkSelectedProduct(
      ctx,
      householdId,
      editor,
      retailer,
      line,
      selection,
    );
  }

  if (physicalStoreId !== undefined) {
    data.physicalStore = await selectedPhysicalStore(ctx, physicalStoreId);
    data.physicalStoreManual = true;
  }

  return data;
}
