/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { batteryFixture } from "../src/lib/domain/receipt";
const modules = import.meta.glob("./**/*.ts");
async function setup() {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({
    subject: "member",
    issuer: "test",
    name: "Member",
  });
  const householdId = await user.mutation(api.households.create, {
    name: "Home",
    invitation: "12345678901234567890123456789012",
  });
  async function receipt() {
    const id = await user.mutation(api.receipts.reserve, {
      householdId,
      clientId: crypto.randomUUID(),
      imageCount: 1,
    });
    await t.run((ctx) =>
      ctx.db.patch("receipts", id, {
        data: batteryFixture(),
        status: "needs_review",
      }),
    );
    return id;
  }
  return { t, user, householdId, receipt };
}
it("saves a product correction, reuses the retailer mapping and preserves the original text", async () => {
  const { t, user, receipt } = await setup();
  const id = await receipt();
  const data = batteryFixture();
  data.lines[0].originalText = "attempted replacement";
  await user.mutation(api.receipts.save, {
    id,
    revision: 0,
    data,
    reviewed: false,
    rememberLineIds: [],
    duplicateResolved: false,
    excluded: false,
    productChanges: [{ lineId: "battery", productId: null, createNew: true }],
  });
  const saved = (await user.query(api.receipts.detail, { id }))!.receipt;
  const line = saved.data!.lines[0];
  expect(line.productId).toBeTruthy();
  expect(line.originalText).toBe(batteryFixture().lines[0].originalText);
  const repeated = {
    ...line,
    receiptName: "  battery   remix ",
    productId: null,
  };
  const prepared = await t.query(internal.products.prepare, {
    id,
    retailer: " EKSEMPELBUTIKK ",
    line: repeated,
  });
  expect(prepared.saved).toBe(true);
  expect(prepared.productId).toBe(line.productId);
  expect(
    (
      await t.query(internal.products.prepare, {
        id,
        retailer: "Another",
        line: repeated,
      })
    ).saved,
  ).toBe(false);
  await t.run((ctx) =>
    ctx.db.patch("receipts", id, { status: "processing", generation: 2 }),
  );
  await t.mutation(internal.processing.finish, {
    id,
    generation: 2,
    data: batteryFixture(),
    original: batteryFixture(),
    provider: "test",
    matches: [{ lineId: "battery", kind: "new", productId: null }],
  });
  expect(
    (await user.query(api.receipts.detail, { id }))!.receipt.data!.lines[0]
      .productId,
  ).toBe(line.productId);
});
it("keeps an explicit separation for future receipts and refuses foreign household products", async () => {
  const { t, user, receipt } = await setup();
  const id = await receipt();
  const args = {
    id,
    revision: 0,
    data: batteryFixture(),
    reviewed: false,
    rememberLineIds: [],
    duplicateResolved: false,
    excluded: false,
  };
  await user.mutation(api.receipts.save, {
    ...args,
    productChanges: [{ lineId: "battery", productId: null, createNew: false }],
  });
  expect(
    await t.query(internal.products.prepare, {
      id,
      retailer: "Eksempelbutikk",
      line: batteryFixture().lines[0],
    }),
  ).toMatchObject({ saved: true, productId: null });
  const outsider = t.withIdentity({ subject: "other", issuer: "test" });
  const other = await outsider.mutation(api.households.create, {
    name: "Other",
    invitation: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });
  const productId = await t.run((ctx) =>
    ctx.db.insert("products", {
      householdId: other,
      retailer: "eksempelbutikk",
      name: "Battery",
      brand: null,
      packageSize: null,
      packageUnit: null,
      attributes: [],
    }),
  );
  await expect(
    user.mutation(api.receipts.save, {
      ...args,
      revision: 1,
      productChanges: [{ lineId: "battery", productId, createNew: false }],
    }),
  ).rejects.toThrow("ikke tilgjengelig");
  await expect(
    outsider.query(api.products.search, {
      receiptId: id,
      retailer: "Eksempelbutikk",
      search: "",
    }),
  ).rejects.toThrow("ikke tilgjengelig");
});
it("finishes uncertain processing and atomically reuses new product mappings on retries", async () => {
  const { t, user, receipt, householdId } = await setup();
  const first = await receipt();
  const second = await receipt();
  for (const id of [first, second]) {
    await t.run((ctx) =>
      ctx.db.patch("receipts", id, { status: "processing", generation: 1 }),
    );
    await t.mutation(internal.processing.finish, {
      id,
      generation: 1,
      data: batteryFixture(),
      original: batteryFixture(),
      provider: "test",
      matches: [{ lineId: "battery", kind: "new", productId: null }],
    });
  }
  const one = (await user.query(api.receipts.detail, { id: first }))!.receipt
    .data!.lines[0];
  const two = (await user.query(api.receipts.detail, { id: second }))!.receipt
    .data!.lines[0];
  expect(two.productId).toBe(one.productId);
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("products")
        .withIndex("by_householdId_and_retailer", (q) =>
          q.eq("householdId", householdId),
        )
        .take(10),
    ),
  ).toHaveLength(1);
  const third = await receipt();
  await t.run((ctx) =>
    ctx.db.patch("receipts", third, { status: "processing", generation: 1 }),
  );
  const data = batteryFixture();
  data.lines[0].name = "Unreadable";
  await t.mutation(internal.processing.finish, {
    id: third,
    generation: 1,
    data,
    original: data,
    provider: "test",
    matches: [{ lineId: "battery", kind: "uncertain", productId: null }],
  });
  const uncertain = (await user.query(api.receipts.detail, { id: third }))!
    .receipt;
  expect(uncertain.status).toBe("reviewed");
  expect(uncertain.autoAccepted).toBe(true);
  expect(uncertain.data!.lines[0].productId).toBeNull();
});

it("continues with separate items when the matching provider fails", async () => {
  const { t, receipt } = await setup();
  const id = await receipt();
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  vi.stubEnv("RECEIPT_PROVIDER", "");
  const fetch = vi.fn().mockRejectedValue(new Error("Network unavailable"));
  vi.stubGlobal("fetch", fetch);
  try {
    const matches = await t.action(internal.productMatching.match, {
      id,
      data: batteryFixture(),
    });
    expect(matches).toEqual([
      { lineId: "battery", kind: "uncertain", productId: null },
    ]);
    expect(fetch).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

it("accepts a clear Jev candidate and refuses low confidence without creating a link", async () => {
  const { t, receipt, householdId } = await setup();
  const id = await receipt();
  const productId = await t.run((ctx) =>
    ctx.db.insert("products", {
      householdId,
      retailer: "eksempelbutikk",
      name: "Battery Remix",
      brand: null,
      packageSize: null,
      packageUnit: null,
      attributes: [],
    }),
  );
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  vi.stubEnv("RECEIPT_PROVIDER", "");
  let confidence = 0.95;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "jev-latest",
            answers: {
              item_0: {
                type: "choice",
                choice: "candidate_0",
                confidence,
                probabilities: {
                  candidate_0: 0.95,
                  new_product: 0.01,
                  uncertain: 0.04,
                },
              },
            },
            usage: { input_tokens: 10, output_tokens: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ),
  );
  try {
    expect(
      await t.action(internal.productMatching.match, {
        id,
        data: batteryFixture(),
      }),
    ).toEqual([{ lineId: "battery", kind: "match", productId }]);
    confidence = 0.4;
    expect(
      await t.action(internal.productMatching.match, {
        id,
        data: batteryFixture(),
      }),
    ).toEqual([{ lineId: "battery", kind: "uncertain", productId: null }]);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

it("links catalog identity without creating a second household product and reuses the choice", async () => {
  const { t, user, receipt, householdId } = await setup();
  const id = await receipt();
  const data = batteryFixture();
  await t.run((ctx) =>
    ctx.db.patch("receipts", id, { status: "processing", generation: 1 }),
  );
  await t.mutation(internal.processing.finish, {
    id,
    generation: 1,
    data,
    original: data,
    provider: "test",
    matches: [{ lineId: "battery", kind: "new", productId: null }],
  });
  const { normalizeProducts } = await import("./kassalapp/normalize");
  const product = normalizeProducts({
    data: [{ id: 71, name: "Battery Remix" }],
  })[0];
  await t.run((ctx) =>
    ctx.db.insert("catalogProducts", {
      key: product.key,
      product,
      fetchedAt: 1,
    }),
  );
  await user.mutation(api.receipts.save, {
    id,
    revision: 0,
    data,
    reviewed: false,
    rememberLineIds: [],
    duplicateResolved: false,
    excluded: false,
    selections: [{ kind: "catalog", lineId: "battery", key: product.key }],
  });
  const saved = (await user.query(api.receipts.detail, { id }))!.receipt.data!
    .lines[0];
  expect(saved.productReference).toMatchObject({
    kind: "catalog",
    provenance: "manual",
    product: { key: product.key },
  });
  expect(saved.productId).toBeNull();
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("products")
        .withIndex("by_householdId_and_retailer", (q) =>
          q.eq("householdId", householdId),
        )
        .take(10),
    ),
  ).toHaveLength(1);
  const next = await receipt();
  await t.run((ctx) =>
    ctx.db.patch("receipts", next, { status: "processing", generation: 1 }),
  );
  await t.mutation(internal.processing.finish, {
    id: next,
    generation: 1,
    data,
    original: data,
    provider: "test",
  });
  expect(
    (await user.query(api.receipts.detail, { id: next }))!.receipt.data!
      .lines[0].productReference,
  ).toEqual(saved.productReference);
});
