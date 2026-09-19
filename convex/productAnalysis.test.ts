/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it, vi, afterEach } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { batteryFixture } from "../src/lib/domain/receipt";
import { readAttributes } from "../src/lib/domain/product-attributes";
import {
  purchaseEvidenceKey,
  productAnalysisVersion,
} from "../src/lib/domain/product-families";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
async function setup() {
  vi.stubEnv("TYPESAFE_API_KEY", "");
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
    clientId: "product-analysis-0001",
    imageCount: 1,
  });
  const data = batteryFixture();
  await t.run((ctx) =>
    ctx.db.patch("receipts", id, {
      data,
      status: "reviewed",
      catalogStatus: "complete",
    }),
  );
  const line = data.lines[0];
  return {
    t,
    first,
    other,
    id,
    data,
    args: {
      id,
      version: productAnalysisVersion,
      generation: 0,
      revision: 0,
      lineId: line.id,
      evidenceKey: purchaseEvidenceKey(line),
      family: "new" as const,
      package: { unitsPerPackage: 1, measurePerPackage: null },
      decisions: [],
      attributes: readAttributes(
        { attribute_type: { choice: "energy", confidence: 0.96 } },
        "receipt",
      ),
    },
  };
}
it("rejects access from another household", async () => {
  const { other, id } = await setup();
  await expect(
    other.mutation(api.productAnalysis.ensure, { ids: [id] }),
  ).rejects.toThrow("ikke tilgjengelig");
});
it("persists one family and cached profile for repeated decisions", async () => {
  const { t, args } = await setup();
  await t.mutation(internal.productAnalysis.saveProfile, args);
  await t.mutation(internal.productAnalysis.saveProfile, args);
  const prepared = await t.query(internal.productAnalysis.prepare, {
    id: args.id,
    version: productAnalysisVersion,
    generation: args.generation,
    revision: args.revision,
    lineId: args.lineId,
  });
  expect(prepared?.profile?.package.unitsPerPackage).toBe(1);
  expect(prepared?.families).toHaveLength(1);
  expect(prepared?.profile?.familyId).toBe(prepared?.families[0]._id);
  expect(prepared?.profile?.attributes).toEqual(args.attributes);
});
it("discards stale results after a receipt edit and records failures separately from receipt status", async () => {
  const { t, id, args } = await setup();
  await t.run((ctx) => ctx.db.patch("receipts", id, { revision: 1 }));
  await t.mutation(internal.productAnalysis.saveProfile, args);
  await t.mutation(internal.productAnalysis.finish, {
    id,
    version: productAnalysisVersion,
    generation: 0,
    revision: 0,
    results: [],
    failed: false,
  });
  expect(
    (await t.run((ctx) => ctx.db.get("receipts", id)))?.productAnalysis,
  ).toBeUndefined();
  await t.mutation(internal.productAnalysis.finish, {
    id,
    version: productAnalysisVersion,
    generation: 0,
    revision: 1,
    results: [],
    failed: true,
  });
  const receipt = await t.run((ctx) => ctx.db.get("receipts", id));
  expect(receipt?.status).toBe("reviewed");
  expect(receipt?.productAnalysis?.state).toBe("error");
});

it("continues to analysis when optional catalog work is disabled", async () => {
  const { t, id } = await setup();
  vi.stubEnv("KASSALAPP_API_KEY", "");
  await t.mutation(internal.catalogMatching.start, { id, generation: 0 });
  const scheduled = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(scheduled.some((job) => job.name === "productAnalysis:start")).toBe(
    true,
  );
});

it("starts once, exposes exhausted failure, and permits an explicit manual retry", async () => {
  vi.useFakeTimers();
  const { register } = await import("@convex-dev/workflow/test");
  const { t, first, id, args } = await setup();
  register(t, "productAnalysisWorkflow");
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  await t.mutation(internal.productAnalysis.start, { id });
  const initial = await t.run((ctx) => ctx.db.get("receipts", id));
  expect(initial?.productAnalysis?.state).toBe("pending");
  await t.mutation(internal.productAnalysis.start, { id });
  expect(
    (await t.run((ctx) => ctx.db.get("receipts", id)))?.productAnalysis,
  ).toEqual(initial?.productAnalysis);
  await t.mutation(internal.productAnalysis.finish, {
    id,
    generation: 0,
    revision: 0,
    version: args.version,
    results: [],
    failed: true,
  });
  await t.mutation(internal.productAnalysis.start, { id });
  expect(
    (await t.run((ctx) => ctx.db.get("receipts", id)))?.productAnalysis?.state,
  ).toBe("error");
  await first.mutation(api.productAnalysis.ensure, { ids: [id] });
  expect(
    (await t.run((ctx) => ctx.db.get("receipts", id)))?.productAnalysis?.state,
  ).toBe("pending");
});

it("continues past a paused catalog flag without starting catalog work", async () => {
  const { defaultPolicy } = await import("../src/lib/releases/policy");
  const { t, id } = await setup();
  vi.stubEnv("KASSALAPP_API_KEY", "test-key");
  vi.stubEnv("RELEASE_CHANNEL", "testflight");
  const policy = defaultPolicy("ios", "testflight");
  await t.run((ctx) =>
    ctx.db.insert("releasePolicies", {
      ...policy,
      features: { ...policy.features, automaticProductMatching: false },
    }),
  );
  await t.mutation(internal.catalogMatching.start, { id, generation: 0 });
  expect(
    (await t.run((ctx) => ctx.db.get("receipts", id)))?.catalogStatus,
  ).toBe("complete");
  const scheduled = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );
  expect(scheduled.some((job) => job.name === "productAnalysis:start")).toBe(
    true,
  );
});

it("repairs an older analysis version through the explicit household operation", async () => {
  vi.useFakeTimers();
  const { register } = await import("@convex-dev/workflow/test");
  const { t, id } = await setup();
  register(t, "productAnalysisWorkflow");
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  await t.run((ctx) =>
    ctx.db.patch("receipts", id, {
      productAnalysis: {
        version: productAnalysisVersion - 1,
        generation: 0,
        revision: 0,
        state: "complete",
        updatedAt: 0,
        results: [],
      },
    }),
  );
  const receipt = (await t.run((ctx) => ctx.db.get("receipts", id)))!;
  const result = await t.mutation(internal.productAnalysis.repair, {
    householdId: receipt.householdId,
    cursor: null,
    through: receipt._creationTime,
  });
  expect(result.isDone).toBe(true);
  expect(
    (await t.run((ctx) => ctx.db.get("receipts", id)))?.productAnalysis,
  ).toMatchObject({ version: productAnalysisVersion, state: "pending" });
});

it("commits duplicate profile decisions once and rejects a stale batch", async () => {
  const { t, args } = await setup();
  const { id, generation, revision, version, ...decision } = args;
  const snapshot = { id, generation, revision, version };
  const ids = await t.mutation(internal.productAnalysis.saveProfiles, {
    ...snapshot,
    decisions: [decision, decision],
  });
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  const rows = await t.query(internal.productAnalysis.readProfiles, {
    ...snapshot,
    ids,
  });
  expect(rows).toHaveLength(1);
  expect(rows[0].family).not.toBeNull();
  expect(
    await t.run((ctx) => ctx.db.query("productFamilies").collect()),
  ).toHaveLength(1);
  const prepared = await t.query(internal.productAnalysis.prepareBatch, {
    ...snapshot,
    lineIds: [decision.lineId, decision.lineId],
  });
  expect(prepared?.every((item) => item.profile?._id === ids[0])).toBe(true);
  await t.run((ctx) => ctx.db.patch("receipts", id, { revision: 1 }));
  expect(
    await t.mutation(internal.productAnalysis.saveProfiles, {
      ...snapshot,
      decisions: [decision],
    }),
  ).toEqual([]);
  expect(
    await t.query(internal.productAnalysis.readProfiles, { ...snapshot, ids }),
  ).toEqual([]);
});

it("batches independent profiles and uses only quantity questions for cached profiles", async () => {
  const { t, id, data, args } = await setup();
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  const product = data.lines[0];
  data.lines = [
    product,
    { ...product, id: "same-product" },
    { ...product, id: "different-product", name: "Milk", originalText: "Milk" },
  ];
  await t.run((ctx) => ctx.db.patch("receipts", id, { data }));
  const requests: { questions: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body);
      requests.push(request);
      return new Response(
        JSON.stringify({
          model: "jev-latest",
          usage: { input_tokens: 1, output_tokens: 1 },
          answers: Object.fromEntries(
            Object.keys(request.questions).map((key) => [
              key,
              {
                type: "choice",
                choice: key.endsWith("_family") ? "new" : "unknown",
                confidence: 0.9,
                probabilities: { unknown: 0.9 },
              },
            ]),
          ),
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }),
  );
  try {
    const snapshot = {
      id,
      generation: args.generation,
      revision: args.revision,
      version: args.version,
    };
    expect(
      await t.action(internal.productAnalysisWorker.analyze, snapshot),
    ).toHaveLength(3);
    expect(requests).toHaveLength(2);
    expect(Object.keys(requests[0].questions)).toHaveLength(12);
    expect(Object.keys(requests[1].questions)).toHaveLength(3);
    requests.length = 0;
    expect(
      await t.action(internal.productAnalysisWorker.analyze, snapshot),
    ).toHaveLength(3);
    expect(requests).toHaveLength(1);
    expect(
      Object.keys(requests[0].questions).every((key) =>
        key.startsWith("quantity_"),
      ),
    ).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});
