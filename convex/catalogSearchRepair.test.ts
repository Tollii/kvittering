/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { batteryFixture } from "../src/lib/domain/receipt";
import { emptyCatalogResult } from "../src/lib/catalog/model";
import { requestKey } from "../src/lib/catalog/policy";
import { lineEvidenceKey } from "../src/lib/catalog/matching";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.unstubAllEnvs());

async function setup() {
  vi.stubEnv("KASSALAPP_API_KEY", "");
  const t = convexTest(schema, modules);
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
  const id = await first.mutation(api.receipts.reserve, {
    householdId,
    clientId: "search-repair-0001",
    imageCount: 1,
  });
  const data = batteryFixture();
  data.lines = [
    {
      ...data.lines[0],
      name: "BURGERBR BRIOCHE",
      receiptName: "BURGERBR BRIOCHE",
    },
  ];
  const line = data.lines[0];
  const requestId = await t.run(async (ctx) => {
    await ctx.db.patch("receipts", id, {
      data,
      status: "reviewed",
      catalogStatus: "complete",
    });
    return ctx.db.insert("catalogRequests", {
      key: requestKey({ kind: "products", search: line.name }),
      request: { kind: "products", search: line.name },
      state: "ready",
      result: emptyCatalogResult(),
      fetchedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      attempts: 1,
      scheduledAt: 0,
      error: null,
    });
  });
  const repair = {
    lineId: line.id,
    evidenceKey: lineEvidenceKey(line),
    search: "burgerbrød brioche",
  };
  const args = { id, generation: 0, store: data.store, repairs: [repair] };
  return { t, first, other, id, data, requestId, args, householdId };
}

it("repairs a failed query without changing receipt data and reuses the household suggestion", async () => {
  const { t, first, id, data, args, householdId } = await setup();
  expect(
    (await first.query(api.catalogSearchRepair.pending, { id })).items,
  ).toHaveLength(1);
  await first.mutation(api.catalogSearchRepair.submit, args);
  const saved = await t.run((ctx) => ctx.db.get("receipts", id));
  expect(saved?.data).toEqual(data);
  expect(saved?.revision).toBe(0);
  expect(
    (await first.query(api.catalogSearchRepair.pending, { id })).items,
  ).toEqual([]);
  const inputs = await t.query(internal.catalogMatching.inputs, {
    id,
    generation: 0,
  });
  expect(inputs[0].search).toBe("burgerbrød brioche");
  expect(inputs[0].line.name).toBe("BURGERBR BRIOCHE");
  const next = await first.mutation(api.receipts.reserve, {
    householdId,
    clientId: "search-repair-0002",
    imageCount: 1,
  });
  await t.run((ctx) =>
    ctx.db.patch("receipts", next, {
      data,
      status: "reviewed",
      catalogStatus: "complete",
    }),
  );
  expect(
    (await first.query(api.catalogSearchRepair.pending, { id: next })).items[0],
  ).toMatchObject({ cached: true, search: "burgerbrød brioche" });
});

it("rejects other households and ignores stale or manually rejected lines", async () => {
  const { t, first, other, id, data, args } = await setup();
  await expect(
    other.query(api.catalogSearchRepair.pending, { id }),
  ).rejects.toThrow("ikke tilgjengelig");
  await expect(
    other.mutation(api.catalogSearchRepair.submit, args),
  ).rejects.toThrow("ikke tilgjengelig");
  await first.mutation(api.catalogSearchRepair.submit, {
    ...args,
    generation: 1,
  });
  await first.mutation(api.catalogSearchRepair.submit, {
    ...args,
    store: "Other",
  });
  await first.mutation(api.catalogSearchRepair.submit, {
    ...args,
    repairs: [{ ...args.repairs[0], evidenceKey: "stale" }],
  });
  expect(
    (await first.query(api.catalogSearchRepair.pending, { id })).items,
  ).toHaveLength(1);
  data.lines[0].productMatchManual = true;
  await t.run((ctx) => ctx.db.patch("receipts", id, { data }));
  await first.mutation(api.catalogSearchRepair.submit, args);
  expect(
    (await first.query(api.catalogSearchRepair.pending, { id })).items,
  ).toEqual([]);
  expect(
    await t.run((ctx) => ctx.db.query("catalogSearchSuggestions").take(10)),
  ).toEqual([]);
});

it("does not repair network failures or accept invented package information", async () => {
  const { t, first, id, requestId, args } = await setup();
  await t.run((ctx) =>
    ctx.db.patch("catalogRequests", requestId, {
      state: "error",
      error: "429",
    }),
  );
  expect(
    (await first.query(api.catalogSearchRepair.pending, { id })).items,
  ).toEqual([]);
  await first.mutation(api.catalogSearchRepair.submit, args);
  expect(
    await t.run((ctx) => ctx.db.query("catalogSearchSuggestions").take(10)),
  ).toEqual([]);
  await t.run((ctx) =>
    ctx.db.patch("catalogRequests", requestId, { state: "ready", error: null }),
  );
  await first.mutation(api.catalogSearchRepair.submit, {
    ...args,
    repairs: [{ ...args.repairs[0], search: "burgerbrød brioche 6pk" }],
  });
  expect(
    (await t.run((ctx) => ctx.db.get("receipts", id)))
      ?.catalogSearchRepairs?.[0].search,
  ).toBeNull();
  expect(
    (await first.query(api.catalogSearchRepair.pending, { id })).items,
  ).toEqual([]);
});
