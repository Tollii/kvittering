import {
  withProductReference,
  type ProductSelection,
} from "../src/lib/domain/product-reference";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { ReceiptData, ReceiptLine } from "../src/lib/domain/receipt";
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
  if (!decision.productKey) return null;

  const existing = await ctx.db
    .query("catalogProducts")
    .withIndex("by_key", (q) => q.eq("key", decision.productKey!))
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

  if (
    records.some(
      (record) => !record || !compatibleCatalogProduct(line, record.product),
    )
  )
    return null;

  const group = groupCatalogProducts(
    records.map((record) => record!.product),
  ).find(
    (candidate) =>
      candidate.key === decision.productKey && candidate.equivalence,
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
    throw new Error("Velg ett produkt per varelinje.");
  const data = structuredClone(source);
  const retailer = matchingKey(data.store ?? "");

  for (const selection of selections) {
    const index = data.lines.findIndex(
      (line) => line.id === selection.lineId && line.kind === "product",
    );

    const line = data.lines[index];

    if (!line || !retailer || !matchingKey(line.receiptName ?? line.name))
      throw new Error("Butikk og varenavn kreves for produktkobling.");

    if (selection.kind === "catalog") {
      const record = await ctx.db
        .query("catalogProducts")
        .withIndex("by_key", (q) => q.eq("key", selection.key))
        .unique();

      if (!record)
        throw new Error("Produktet finnes ikke i katalogen. Søk på nytt.");
      data.lines[index] = await linkCatalogProduct(
        ctx,
        householdId,
        retailer,
        line,
        record.product,
        editor,
      );
    } else {
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

      data.lines[index] = linked;
      await saveMapping(
        ctx,
        householdId,
        retailer,
        line,
        id,
        editor,
        linked.productReference,
      );
    }
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

  return data;
}
