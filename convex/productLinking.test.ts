import { present } from "../src/lib/testing/receipts";
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { batteryFixture, emptyLine } from "../src/lib/domain/receipt";
import {
  productReference,
  withProductReference,
} from "../src/lib/domain/product-reference";
import { catalogIdentity, type CatalogProduct } from "../src/lib/catalog/model";
import { lineEvidenceKey } from "../src/lib/catalog/matching";
import { matchingKey } from "../src/lib/domain/product-matching";
import type { Doc } from "./_generated/dataModel";
import type { FunctionReturnType } from "convex/server";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => vi.useRealTimers());

async function setup() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "member", issuer: "test" });
  const other = t.withIdentity({ subject: "other", issuer: "test" });

  const householdId = await user.mutation(api.households.create, {
    name: "Home",
    invitation: "12345678901234567890123456789012",
  });

  await other.mutation(api.households.create, {
    name: "Other",
    invitation: "98765432109876543210987654321098",
  });

  const product: CatalogProduct = {
    key: "ean:7037710000001",
    ean: "7037710000001",
    name: "Battery Remix 500ml",
    image: "https://example.com/product.jpg",
    ids: [1],
    categories: [],
    nutrition: [],
    labels: [],
    allergens: [],
  };

  await t.run((ctx) =>
    ctx.db.insert("catalogProducts", {
      key: product.key,
      product,
      fetchedAt: Date.now(),
    }),
  );

  async function create(overrides: Partial<Doc<"receipts">> = {}) {
    const id = await user.mutation(api.receipts.reserve, {
      householdId,
      clientId: crypto.randomUUID(),
      imageCount: 1,
    });

    await t.run((ctx) =>
      ctx.db.patch("receipts", id, {
        data: batteryFixture(),
        status: "reviewed",
        provider: "real",
        ...overrides,
      }),
    );

    return id;
  }

  const page = () =>
    user.query(api.productLinking.page, {
      paginationOpts: { cursor: null, numItems: 30 },
    });

  return { t, user, other, householdId, product, create, page };
}

it("includes unresolved products in approved receipts and omits dismissed, linked and ineligible purchases", async () => {
  const { create, page, product } = await setup();
  const data = batteryFixture();
  data.lines.push(
    withProductReference(
      { ...emptyLine("dismissed"), name: "Bag" },
      { kind: "separate", provenance: "manual" },
    ),
    withProductReference(
      { ...emptyLine("linked"), name: "Drink" },
      {
        kind: "catalog",
        product: catalogIdentity(product),
        provenance: "manual",
      },
    ),
    {
      ...emptyLine("legacy-dismissed"),
      name: "Bread",
      productMatchManual: true,
    },
  );
  const id = await create({ data });
  await create({ excluded: true });
  await create({ status: "processing" });
  await create({ catalogStatus: "pending" });
  await create({ data: { ...data, store: null } });
  await create({ duplicateOf: id });
  const result = await page();
  expect(result.page).toHaveLength(1);
  expect(present(result.page[0]).receiptId).toBe(id);
  expect(present(result.page[0]).lines.map((line) => line.id)).toEqual([
    "battery",
  ]);
  expect(result.page[0]).not.toHaveProperty("data");
  expect(present(result.page[0]).lines[0]).not.toHaveProperty("originalText");
});

it("continues across empty pages instead of treating a bounded page as the complete queue", async () => {
  const { create, user } = await setup();
  const id = await create();

  for (let index = 0; index < 3; index++) await create({ excluded: true });
  let cursor: string | null = null;
  const found: string[] = [];
  let pages = 0;

  do {
    const result: FunctionReturnType<typeof api.productLinking.page> =
      await user.query(api.productLinking.page, {
        paginationOpts: { cursor, numItems: 1 },
      });

    found.push(...result.page.map((receipt) => receipt.receiptId));
    pages++;

    if (result.isDone) break;
    cursor = result.continueCursor;
  } while (pages < 10);

  expect(pages).toBeGreaterThan(1);
  expect(found).toEqual([id]);
});

it.each(["reviewed", "needs_review"] as const)(
  "saves a catalog choice without changing %s approval, then restores it with Undo",
  async (status) => {
    const { t, user, create, product, page } = await setup();
    const id = await create({ status, autoAccepted: status === "reviewed" });
    const before = (await user.query(api.receipts.detail, { id }))!.receipt;

    const commit = await user.mutation(api.productLinking.choose, {
      receiptId: id,
      revision: 0,
      generation: 0,
      lineId: "battery",
      choice: { kind: "catalog", key: product.key },
    });

    const saved = (await user.query(api.receipts.detail, { id }))!.receipt;
    expect(saved.status).toBe(status);
    expect(saved.autoAccepted).toBe(before.autoAccepted);
    expect(productReference(present(saved.data!.lines[0]))).toMatchObject({
      kind: "catalog",
      provenance: "manual",
      product: { key: product.key },
    });
    expect(saved.data!.lines[1]).toEqual(before.data!.lines[1]);
    expect(saved.data!.totalOre).toBe(before.data!.totalOre);
    expect((await page()).page).toEqual([]);
    expect(
      (await t.run((ctx) => ctx.db.query("productMappings").take(10)))[0],
    ).toMatchObject({ revision: 1, reference: { kind: "catalog" } });
    await user.mutation(api.productLinking.undo, commit);
    const restored = (await user.query(api.receipts.detail, { id }))!.receipt;
    expect(productReference(present(restored.data!.lines[0]))).toEqual({
      kind: "unresolved",
    });
    expect(restored.status).toBe(status);
    expect(present(present((await page()).page[0]).lines[0]).id).toBe(
      "battery",
    );
    expect(
      await t.run((ctx) => ctx.db.query("productMappings").take(10)),
    ).toEqual([]);
    await expect(
      user.mutation(api.productLinking.undo, commit),
    ).rejects.toThrow("endret");
  },
);

it("persists a dismissal and restores a pre-existing mapping when it is undone", async () => {
  const { t, user, create, householdId, page } = await setup();
  const data = batteryFixture();

  const prior = {
    householdId,
    retailer: matchingKey(data.store!),
    key: matchingKey(present(data.lines[0]).name),
    productId: null,
    confirmedBy: "prior",
  };

  const mappingId = await t.run((ctx) =>
    ctx.db.insert("productMappings", prior),
  );

  const id = await create();

  const commit = await user.mutation(api.productLinking.choose, {
    receiptId: id,
    revision: 0,
    generation: 0,
    lineId: "battery",
    choice: { kind: "separate" },
  });

  expect((await page()).page).toEqual([]);
  const saved = (await user.query(api.receipts.detail, { id }))!.receipt;
  expect(productReference(present(saved.data!.lines[0]))).toEqual({
    kind: "separate",
    provenance: "manual",
  });
  // An installed receipt editor submits no new command; the dismissal must survive.
  expect(present(saved.data!.lines[0]).productMatchManual).toBe(true);
  await user.mutation(api.productLinking.undo, commit);
  expect(
    await t.run((ctx) => ctx.db.get("productMappings", mappingId)),
  ).toMatchObject({ ...prior, revision: 2 });
});

it("rejects stale selections, missing catalog products and cross-household access without writes", async () => {
  const { t, user, other, create, product } = await setup();
  const id = await create();

  const args = {
    receiptId: id,
    revision: 0,
    generation: 0,
    lineId: "battery",
    choice: { kind: "catalog" as const, key: product.key },
  };

  await expect(
    t.query(api.productLinking.page, {
      paginationOpts: { cursor: null, numItems: 30 },
    }),
  ).rejects.toThrow("Logg inn");
  expect(
    (
      await other.query(api.productLinking.page, {
        paginationOpts: { cursor: null, numItems: 30 },
      })
    ).page,
  ).toEqual([]);
  await expect(
    other.query(api.productLinking.candidates, {
      receiptId: id,
      lineId: "battery",
    }),
  ).rejects.toThrow("ikke tilgjengelig");
  await expect(other.mutation(api.productLinking.choose, args)).rejects.toThrow(
    "ikke tilgjengelig",
  );
  await expect(
    user.mutation(api.productLinking.choose, { ...args, generation: 1 }),
  ).rejects.toThrow("endret");
  await expect(
    user.mutation(api.productLinking.choose, {
      ...args,
      choice: { kind: "catalog", key: "missing" },
    }),
  ).rejects.toThrow("katalogen");
  expect(
    await t.run((ctx) => ctx.db.query("productMappings").take(10)),
  ).toEqual([]);
  const commit = await user.mutation(api.productLinking.choose, args);
  await expect(user.mutation(api.productLinking.choose, args)).rejects.toThrow(
    "endret",
  );
  await expect(other.mutation(api.productLinking.undo, commit)).rejects.toThrow(
    "ikke tilgjengelig",
  );
});

it("does not undo a newer receipt edit or overwrite a newer mapping decision", async () => {
  const { t, user, create, product } = await setup();
  const firstId = await create();
  const secondId = await create();

  const choose = (id: typeof firstId) =>
    user.mutation(api.productLinking.choose, {
      receiptId: id,
      revision: 0,
      generation: 0,
      lineId: "battery",
      choice: { kind: "catalog", key: product.key },
    });

  const first = await choose(firstId);
  await choose(secondId);
  await expect(user.mutation(api.productLinking.undo, first)).rejects.toThrow(
    "endret senere",
  );
  expect(
    productReference(
      present(
        (await user.query(api.receipts.detail, { id: firstId }))!.receipt.data!
          .lines[0],
      ),
    ).kind,
  ).toBe("catalog");
  await t.run((ctx) => ctx.db.patch("receipts", secondId, { revision: 2 }));
  await expect(
    user.mutation(api.productLinking.undo, {
      receiptId: secondId,
      revision: 1,
    }),
  ).rejects.toThrow("endret");
});

it("returns ranked stored candidates with images only while their evidence is current", async () => {
  const { t, user, create, product } = await setup();

  const id = await create({
    catalogDecisions: [
      {
        lineId: "battery",
        evidenceKey: lineEvidenceKey(present(batteryFixture().lines[0])),
        productKey: null,
        categoryId: null,
        categoryConfidence: 0,
        candidates: [
          {
            key: product.key,
            name: product.name,
            probability: 0.65,
            compatible: true,
          },
        ],
      },
    ],
  });

  expect(
    await user.query(api.productLinking.candidates, {
      receiptId: id,
      lineId: "battery",
    }),
  ).toEqual([product]);
  const data = batteryFixture();
  present(data.lines[0]).name = "Another product";
  await t.run((ctx) => ctx.db.patch("receipts", id, { data }));
  expect(
    await user.query(api.productLinking.candidates, {
      receiptId: id,
      lineId: "battery",
    }),
  ).toEqual([]);
});
