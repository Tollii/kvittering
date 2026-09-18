/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register as registerWorkpool } from "@convex-dev/workpool/test";
import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { batteryFixture } from "../src/lib/domain/receipt";
import { emptyCatalogResult } from "../src/lib/catalog/model";
import { normalizeProducts } from "./kassalapp/normalize";
import { lineEvidenceKey } from "../src/lib/catalog/matching";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.useRealTimers());
async function setup() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  registerWorkpool(t, "catalogWorkpool");
  const first = t.withIdentity({
    subject: "first",
    issuer: "https://test.local",
  });
  const other = t.withIdentity({
    subject: "other",
    issuer: "https://test.local",
  });
  const householdId = await first.mutation(api.households.create, {
    name: "First",
    invitation: "11111111111111111111111111111111",
  });
  await other.mutation(api.households.create, {
    name: "Other",
    invitation: "22222222222222222222222222222222",
  });
  return { t, first, other, householdId };
}
it("shares normalized pending and completed lookups across households and rejects anonymous access", async () => {
  const { t, first, other } = await setup();
  await expect(
    t.mutation(api.catalog.searchProducts, { search: "Stratos" }),
  ).rejects.toThrow("Logg inn");
  await first.mutation(api.catalog.searchProducts, { search: " STRATOS " });
  await other.mutation(api.catalog.searchProducts, { search: "stratos" });
  const requests = await t.run((ctx) =>
    ctx.db.query("catalogRequests").take(10),
  );
  expect(requests).toHaveLength(1);
  const id = requests[0]._id;
  await t.mutation(internal.catalogQueue.claim, { id });
  const products = normalizeProducts({
    data: [{ id: 1, name: "Stratos", ean: "7037710000001" }],
  });
  await t.mutation(internal.catalogQueue.succeed, {
    id,
    result: { ...emptyCatalogResult(), products },
  });
  expect(
    (await other.mutation(api.catalog.searchProducts, { search: "STRATOS" }))
      .products,
  ).toEqual(products);
  expect((await t.query(internal.catalogQueue.read, { id }))?.attempts).toBe(1);
});
it("honors Retry-After on 429 and ends repeated failures without caching an empty success", async () => {
  const { t, first } = await setup();
  await first.mutation(api.catalog.searchProducts, { search: "Stratos" });
  const id = (await t.run((ctx) => ctx.db.query("catalogRequests").first()))!
    ._id;
  const start = Date.now();
  await t.mutation(internal.catalogQueue.claim, { id });
  await t.mutation(internal.catalogQueue.fail, {
    id,
    status: 429,
    retryAfterMs: 120000,
  });
  expect(await t.query(internal.catalogQueue.read, { id })).toMatchObject({
    state: "pending",
    scheduledAt: start + 120000,
    attempts: 1,
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    await t.mutation(internal.catalogQueue.claim, { id });
    await t.mutation(internal.catalogQueue.fail, {
      id,
      status: 503,
      retryAfterMs: 0,
    });
  }
  const result = await first.mutation(api.catalog.searchProducts, {
    search: "Stratos",
  });
  expect(result.status).toBe("error");
  expect(result.message).toBeTruthy();
  expect((await t.query(internal.catalogQueue.read, { id }))?.attempts).toBe(3);
});
it("enforces household access for store lookup and catalog edits", async () => {
  const { first, other, householdId } = await setup();
  const id = await first.mutation(api.receipts.reserve, {
    householdId,
    clientId: "catalog-access-0001",
    imageCount: 1,
  });
  await expect(
    other.mutation(api.catalog.searchStores, {
      receiptId: id,
      search: "Majorstuen",
    }),
  ).rejects.toThrow("ikke tilgjengelig");
  await expect(
    other.mutation(api.receipts.save, {
      id,
      revision: 0,
      data: batteryFixture(),
      reviewed: false,
      rememberLineIds: [],
      catalogChanges: [],
      duplicateResolved: false,
      excluded: false,
    }),
  ).rejects.toThrow("ikke tilgjengelig");
});
it("uses category-only evidence but preserves manual edits, stale lines and a changed retailer", async () => {
  const { t, first, householdId } = await setup();
  const id = await first.mutation(api.receipts.reserve, {
    householdId,
    clientId: "catalog-evidence-0001",
    imageCount: 1,
  });
  const data = batteryFixture();
  data.lines[0].categoryId = "fallback.unclear";
  data.lines[0].issues = ["Kategorien er usikker."];
  await t.run((ctx) =>
    ctx.db.patch("receipts", id, { data, status: "needs_review" }),
  );
  const decision = {
    lineId: data.lines[0].id,
    evidenceKey: lineEvidenceKey(data.lines[0]),
    productKey: null,
    categoryId: "drinks.energy-drinks",
    categoryConfidence: 0.95,
    reason: "below_threshold" as const,
    candidates: [],
  };
  const args = { id, generation: 0, store: data.store, decisions: [decision] };
  await t.mutation(internal.catalogMatching.apply, { ...args, store: "Other" });
  expect(
    (await first.query(api.receipts.detail, { id }))!.receipt.revision,
  ).toBe(0);
  await t.mutation(internal.catalogMatching.apply, {
    ...args,
    decisions: [{ ...decision, evidenceKey: "stale" }],
  });
  expect(
    (await first.query(api.receipts.detail, { id }))!.receipt.revision,
  ).toBe(0);
  await t.mutation(internal.catalogMatching.apply, args);
  let saved = (await first.query(api.receipts.detail, { id }))!.receipt;
  expect(saved.data?.lines[0].categoryId).toBe("drinks.energy-drinks");
  expect(saved.data?.lines[0].catalogProduct).toBeUndefined();
  expect(saved.catalogDecisions).toEqual([decision]);
  const manual = saved.data!;
  manual.lines[0].manual = true;
  manual.lines[0].categoryId = "drinks.soft-drinks";
  await t.run((ctx) => ctx.db.patch("receipts", id, { data: manual }));
  await t.mutation(internal.catalogMatching.apply, args);
  saved = (await first.query(api.receipts.detail, { id }))!.receipt;
  expect(saved.data?.lines[0].categoryId).toBe("drinks.soft-drinks");
});

it("refreshes expired searches while retaining the last usable result", async () => {
  const { t, first } = await setup();
  await first.mutation(api.catalog.searchProducts, { search: "Stratos" });
  const id = (await t.run((ctx) => ctx.db.query("catalogRequests").first()))!
    ._id;
  const products = normalizeProducts({
    data: [{ id: 1, name: "Stratos 150g", ean: "7037710000001" }],
  });
  await t.mutation(internal.catalogQueue.claim, { id });
  await t.mutation(internal.catalogQueue.succeed, {
    id,
    result: { ...emptyCatalogResult(), products },
  });
  vi.setSystemTime(Date.now() + 86400001);
  const response = await first.mutation(api.catalog.searchProducts, {
    search: "stratos",
  });
  expect(response).toMatchObject({ status: "pending", products });
  expect(
    await t.run((ctx) => ctx.db.query("catalogRequests").take(10)),
  ).toHaveLength(1);
});
it("saves a selected catalog product and prevents background matching from replacing it", async () => {
  const { t, first, householdId } = await setup();
  const id = await first.mutation(api.receipts.reserve, {
    householdId,
    clientId: "catalog-selection-0001",
    imageCount: 1,
  });
  const data = batteryFixture();
  const products = normalizeProducts({
    data: [
      { id: 1, name: "Battery Original 500ml", ean: "7037710000001" },
      { id: 2, name: "Other drink", ean: "7037710000002" },
    ],
  });
  await t.run(async (ctx) => {
    await ctx.db.patch("receipts", id, { data, status: "needs_review" });
    for (const product of products)
      await ctx.db.insert("catalogProducts", {
        key: product.key,
        product,
        fetchedAt: Date.now(),
      });
  });
  await first.mutation(api.receipts.save, {
    id,
    revision: 0,
    data,
    reviewed: false,
    rememberLineIds: [],
    catalogChanges: [{ lineId: data.lines[0].id, key: products[0].key }],
    duplicateResolved: false,
    excluded: false,
  });
  const saved = (await first.query(api.receipts.detail, { id }))!.receipt.data!;
  expect(saved.lines[0].catalogProduct?.key).toBe(products[0].key);
  expect(saved.lines[0].productMatchManual).toBe(true);
  await t.mutation(internal.catalogMatching.apply, {
    id,
    generation: 0,
    store: data.store,
    decisions: [
      {
        lineId: saved.lines[0].id,
        evidenceKey: lineEvidenceKey(saved.lines[0]),
        productKey: products[1].key,
        categoryId: "drinks.soft-drinks",
        categoryConfidence: 0.99,
      },
    ],
  });
  const current = (await first.query(api.receipts.detail, { id }))!.receipt
    .data!;
  expect(current.lines[0].catalogProduct?.key).toBe(products[0].key);
  expect(current.lines[0].categoryId).toBe(saved.lines[0].categoryId);
});
