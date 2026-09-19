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
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
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
it("isolates retailer search results while sharing equivalent retailer names", async () => {
  const { t, first, other } = await setup();
  const lookup = { kind: "products" as const, search: "Cheez Doodles XL" };
  await first.mutation(api.catalog.ensure, {
    lookup: { ...lookup, store: "KIWI Majorstuen" },
  });
  await other.mutation(api.catalog.ensure, {
    lookup: { ...lookup, store: "Kiwi" },
  });
  await first.mutation(api.catalog.ensure, {
    lookup: { ...lookup, store: "Meny" },
  });
  await first.mutation(api.catalog.ensure, { lookup });
  await first.mutation(api.catalog.ensure, {
    lookup: { ...lookup, store: "Unknown retailer" },
  });
  const requests = await t.run((ctx) =>
    ctx.db.query("catalogRequests").take(10),
  );
  expect(requests).toHaveLength(3);
  const kiwi = requests.find(
    (row) => row.request.kind === "products" && row.request.store === "KIWI",
  )!;
  await t.mutation(internal.catalogQueue.claim, { id: kiwi._id });
  const products = normalizeProducts({
    data: [{ id: 1, name: "Cheez Doodles XL" }],
  });
  await t.mutation(internal.catalogQueue.succeed, {
    id: kiwi._id,
    result: { ...emptyCatalogResult(), products },
  });
  const observed = await other.query(api.catalog.observe, {
    lookup: { ...lookup, store: "KIWI" },
  });
  expect(observed.status).toBe("ready");
  expect(observed.products).toEqual(products);
  expect(
    await first.query(api.catalog.observe, {
      lookup: { ...lookup, store: "Meny" },
    }),
  ).toMatchObject({ status: "pending", products: [] });
  expect(await first.query(api.catalog.observe, { lookup })).toMatchObject({
    status: "pending",
    products: [],
  });
  await expect(t.mutation(api.catalog.ensure, { lookup })).rejects.toThrow(
    "Logg inn",
  );
});

it("refreshes cached searches made before the retrieval rules changed", async () => {
  const { t, first } = await setup();
  await t.run((ctx) =>
    ctx.db.insert("catalogRequests", {
      key: JSON.stringify(["products", "cheez doodles xl", null]),
      request: { kind: "products", search: "cheez doodles xl" },
      state: "ready",
      result: emptyCatalogResult(),
      fetchedAt: Date.now(),
      expiresAt: Date.now() + 7 * 86400000,
      scheduledAt: Date.now(),
      attempts: 1,
    }),
  );
  const lookup = { kind: "products" as const, search: "cheez doodles xl" };
  expect(await first.query(api.catalog.observe, { lookup })).toMatchObject({
    status: "ready",
  });
  await first.mutation(api.catalog.ensure, { lookup });
  expect(await first.query(api.catalog.observe, { lookup })).toMatchObject({
    status: "pending",
  });
});

it("includes the receipt retailer in matching inputs without changing line evidence", async () => {
  const { t, first, householdId } = await setup();
  const id = await first.mutation(api.receipts.reserve, {
    householdId,
    clientId: "catalog-retailer-0001",
    imageCount: 1,
  });
  const data = { ...batteryFixture(), store: "KIWI Majorstuen" };
  await t.run((ctx) =>
    ctx.db.patch("receipts", id, { data, status: "needs_review" }),
  );
  const inputs = await t.query(internal.catalogMatching.inputs, {
    id,
    generation: 0,
  });
  expect(inputs.length).toBeGreaterThan(0);
  expect(inputs.every((input) => input.store === "KIWI")).toBe(true);
  expect(inputs[0].line).toEqual(
    data.lines.find((line) => line.kind === "product"),
  );
});

it.each([
  {
    name: "broader search after empty retailer and global results",
    search: "CHEEZ DOODLES XL",
    store: "KIWI",
    responses: [[], [], [{ id: 1, name: "Cheez Doodles 120g" }]],
    searches: ["cheez doodles xl", "cheez doodles xl", "cheez doodles"],
    status: 200,
    state: "ready",
    count: 1,
  },
  {
    name: "retailer result needs no fallback",
    search: "CHEEZ DOODLES XL",
    store: "KIWI",
    responses: [[{ id: 1, name: "Cheez Doodles XL" }]],
    searches: ["cheez doodles xl"],
    status: 200,
    state: "ready",
    count: 1,
  },
  {
    name: "retailer variant conflict falls back to the original global search",
    search: "Coca-Cola 500ml",
    store: "REMA 1000",
    responses: [
      [{ id: 1, name: "Coca-Cola Light 500ml" }],
      [{ id: 2, name: "Coca-Cola 500ml" }],
    ],
    searches: ["coca-cola 500ml", "coca-cola 500ml"],
    status: 200,
    state: "ready",
    count: 1,
  },
  {
    name: "broader search without a retailer",
    search: "CHEEZ DOODLES XL",
    store: undefined,
    responses: [[], [{ id: 1, name: "Cheez Doodles 120g" }]],
    searches: ["cheez doodles xl", "cheez doodles"],
    status: 200,
    state: "ready",
    count: 1,
  },
  {
    name: "all searches empty",
    search: "CHEEZ DOODLES XL",
    store: "KIWI",
    responses: [[], [], []],
    searches: ["cheez doodles xl", "cheez doodles xl", "cheez doodles"],
    status: 200,
    state: "ready",
    count: 0,
  },
  {
    name: "rate limit follows the queue retry policy",
    search: "CHEEZ DOODLES XL",
    store: "KIWI",
    responses: [[]],
    searches: ["cheez doodles xl"],
    status: 429,
    state: "pending",
    count: 0,
  },
])(
  "bounds catalog requests: $name",
  async ({ search, store, responses, searches, status, state, count }) => {
    const { t, first } = await setup();
    vi.stubEnv("KASSALAPP_API_KEY", "test-key");
    const urls: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL | string) => {
        urls.push(new URL(url));
        return new Response(
          JSON.stringify({ data: responses[urls.length - 1] }),
          {
            status,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": "60",
            },
          },
        );
      }),
    );
    const lookup = { kind: "products" as const, search, store };
    await first.mutation(api.catalog.ensure, { lookup });
    const request = (await t.run((ctx) =>
      ctx.db.query("catalogRequests").first(),
    ))!;
    await t.action(internal.catalogWorker.execute, { id: request._id });
    expect(urls.map((url) => url.searchParams.get("search"))).toEqual(searches);
    expect(urls[0].searchParams.get("store")).toBe(
      store === "REMA 1000" ? "REMA_1000" : (store ?? null),
    );
    expect(urls.slice(1).every((url) => !url.searchParams.has("store"))).toBe(
      true,
    );
    const completed = await t.query(internal.catalogQueue.read, {
      id: request._id,
    });
    expect(completed?.state).toBe(state);
    expect(completed?.request).toEqual(request.request);
    expect(completed?.result.products).toHaveLength(count);
  },
);

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
    categoryId: "drinks.soft-drinks",
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
  expect(saved.data?.lines[0].categoryId).toBe("drinks.soft-drinks");
  expect(saved.data?.lines[0].catalogProduct).toBeUndefined();
  expect(saved.catalogDecisions).toEqual([decision]);
  const manual = saved.data!;
  manual.lines[0].manual = true;
  manual.lines[0].categoryId = "drinks.sports-drinks";
  await t.run((ctx) => ctx.db.patch("receipts", id, { data: manual }));
  await t.mutation(internal.catalogMatching.apply, args);
  saved = (await first.query(api.receipts.detail, { id }))!.receipt;
  expect(saved.data?.lines[0].categoryId).toBe("drinks.sports-drinks");
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
  expect(response.status).toBe("pending");
  expect(response.products).toEqual(products);
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

it("fetches details after a summary and retains detail freshness across later summaries", async () => {
  const { t, first } = await setup();
  const product = normalizeProducts({
    data: [{ id: 31, name: "Cola 500ml" }],
  })[0];
  await t.run((ctx) =>
    ctx.db.insert("catalogProducts", {
      key: product.key,
      product,
      fetchedAt: Date.now(),
    }),
  );
  expect(
    (await first.mutation(api.catalog.product, { key: product.key })).status,
  ).toBe("pending");
  await first.mutation(api.catalog.product, { key: product.key });
  const requests = await t.run((ctx) =>
    ctx.db.query("catalogRequests").take(10),
  );
  expect(requests).toHaveLength(1);
  await t.mutation(internal.catalogQueue.claim, { id: requests[0]._id });
  await t.mutation(internal.catalogQueue.succeed, {
    id: requests[0]._id,
    result: { ...emptyCatalogResult(), products: [product] },
  });
  expect(
    (await first.mutation(api.catalog.product, { key: product.key })).status,
  ).toBe("ready");
  const fetched = await t.run((ctx) => ctx.db.query("catalogProducts").first());
  vi.setSystemTime(Date.now() + 1000);
  await first.mutation(api.catalog.searchProducts, { search: "Cola" });
  const search = (
    await t.run((ctx) => ctx.db.query("catalogRequests").take(10))
  ).find((row) => row.request.kind === "products")!;
  await t.mutation(internal.catalogQueue.claim, { id: search._id });
  await t.mutation(internal.catalogQueue.succeed, {
    id: search._id,
    result: { ...emptyCatalogResult(), products: [product] },
  });
  const later = await t.run((ctx) => ctx.db.query("catalogProducts").first());
  expect(later?.fetchedAt).toBeGreaterThan(fetched!.fetchedAt);
  expect(later?.detailsFetchedAt).toBe(fetched!.detailsFetchedAt);
});

it("merges summary fields without erasing rich detail data or mutating inputs", async () => {
  const { mergeCatalogProduct } = await import("./catalogQueue");
  const product = normalizeProducts({
    data: [
      {
        id: 31,
        name: "Cola",
        nutrition: [{ display_name: "Energy", amount: 10, unit: "kcal" }],
      },
    ],
  })[0];
  const previous = {
    key: product.key,
    product,
    fetchedAt: 1,
    detailsFetchedAt: 1,
  };
  const before = structuredClone(previous);
  const summary = { ...product, nutrition: [] };
  expect(
    mergeCatalogProduct(previous, { kind: "summary", product: summary }, 100),
  ).toMatchObject({
    detailsFetchedAt: 1,
    product: { nutrition: product.nutrition },
  });
  expect(previous).toEqual(before);
  expect(
    mergeCatalogProduct(previous, { kind: "details", product: summary }, 100),
  ).toMatchObject({ detailsFetchedAt: 100, product: { nutrition: [] } });
});

it("observes delayed catalog completion without queuing more work", async () => {
  const { t, first } = await setup();
  const lookup = { kind: "products" as const, search: "Stratos" };
  await first.mutation(api.catalog.ensure, { lookup });
  const initial = await t.run((ctx) =>
    ctx.db.query("catalogRequests").collect(),
  );
  expect(await first.query(api.catalog.observe, { lookup })).toMatchObject({
    status: "pending",
  });
  expect(await first.query(api.catalog.observe, { lookup })).toMatchObject({
    status: "pending",
  });
  expect(
    await t.run((ctx) => ctx.db.query("catalogRequests").collect()),
  ).toEqual(initial);
  await t.run((ctx) =>
    ctx.db.patch("catalogRequests", initial[0]._id, {
      state: "ready",
      fetchedAt: Date.now(),
      expiresAt: Date.now() + 10000,
    }),
  );
  expect(await first.query(api.catalog.observe, { lookup })).toMatchObject({
    status: "ready",
  });
  await expect(t.query(api.catalog.observe, { lookup })).rejects.toThrow(
    "Logg inn",
  );
});
it("keeps receipt-owned store observation inside its household", async () => {
  const { first, other, householdId } = await setup();
  const receiptId = await first.mutation(api.receipts.reserve, {
    householdId,
    clientId: "store-observation-001",
    imageCount: 1,
  });
  await expect(
    other.query(api.catalog.observe, {
      lookup: { kind: "stores", receiptId, search: "Oslo" },
    }),
  ).rejects.toThrow("ikke tilgjengelig");
});
