import { present } from "../src/lib/testing/receipts";
import {
  readModelRequest,
  type ModelRequest,
} from "../src/lib/testing/model-requests";
import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
/// <reference types="vite/client" />
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { expect, it, vi, afterEach } from "vitest";
import schema from "./schema";
import { api, components, internal } from "./_generated/api";
import { batteryFixture } from "../src/lib/mock-receipts";
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
  registerRateLimiter(t);

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
  const line = present(data.lines[0]);

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
  expect(prepared?.profile?.familyId).toBe(present(prepared?.families[0])._id);
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
  expect(present(rows[0]).family).not.toBeNull();
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

  const product = {
    ...present(data.lines[0]),
    id: "cola",
    name: "Cola 10x330ml",
    originalText: "Cola 10x330ml",
    quantity: 2,
  };

  data.lines = [
    product,
    { ...product, id: "same-product", quantity: 1 },
    {
      ...product,
      id: "milk",
      name: "Milk 500ml",
      originalText: "Milk 500ml",
      quantity: 3,
    },
  ];
  await t.run((ctx) => ctx.db.patch("receipts", id, { data }));
  const requests: ModelRequest[] = [];

  const profileAnswers = {
    profile_0_family: "new",
    profile_0_count: "count_1",
    profile_0_measure: "each_0",
    profile_0_attribute_type: "unknown",
    profile_0_attribute_sugar: "unknown",
    profile_0_attribute_preparation: "unknown",
    profile_1_family: "new",
    profile_1_count: "count_0",
    profile_1_measure: "total_0",
    profile_1_attribute_type: "unknown",
    profile_1_attribute_sugar: "unknown",
    profile_1_attribute_preparation: "unknown",
  };

  const quantityAnswers = {
    quantity_0: "candidate_1",
    quantity_1: "candidate_1",
    quantity_2: "candidate_1",
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const request = readModelRequest(init);
      requests.push(request);

      return new Response(
        JSON.stringify({
          model: "jev-latest",
          usage: { input_tokens: 1, output_tokens: 1 },
          answers: Object.fromEntries(
            Object.entries(
              "profile_0_family" in request.questions
                ? profileAnswers
                : quantityAnswers,
            ).map(([key, selected]) => [
              key,
              {
                type: "choice",
                choice: selected,
                confidence: 0.9,
                probabilities: { [selected]: 0.9 },
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

    const result = await t.action(
      internal.productAnalysisWorker.analyze,
      snapshot,
    );

    expect(result).toMatchObject([
      {
        lineId: "cola",
        family: { name: "Cola" },
        quantity: { packages: 2, units: 20, grams: null, millilitres: 6600 },
      },
      {
        lineId: "same-product",
        family: { name: "Cola" },
        quantity: { packages: 1, units: 10, grams: null, millilitres: 3300 },
      },
      {
        lineId: "milk",
        family: { name: "Milk" },
        quantity: { packages: 3, units: 3, grams: null, millilitres: 1500 },
      },
    ]);
    expect(result[0]?.family?.id).toBe(result[1]?.family?.id);
    expect(result[0]?.family?.id).not.toBe(result[2]?.family?.id);
    expect(requests).toHaveLength(2);
    requests.length = 0;
    expect(
      await t.action(internal.productAnalysisWorker.analyze, snapshot),
    ).toEqual(result);
    expect(requests).toHaveLength(1);
    expect(
      Object.keys(present(requests[0]).questions).every((key) =>
        key.startsWith("quantity_"),
      ),
    ).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("denies new manual processing at its shared allowance but permits an already completed analysis", async () => {
  const { t, first, id, args } = await setup();
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  vi.stubEnv("KASSALAPP_API_KEY", "test-key");
  const receipt = (await first.query(api.receipts.detail, { id }))!.receipt;
  const limiter = new RateLimiter(components.rateLimiter);
  await t.run((ctx) =>
    limiter.limit(ctx, `work:analysis:${HOUR}`, {
      key: `user:${receipt.uploadedBy}`,
      count: 20,
      config: { kind: "fixed window", rate: 20, period: HOUR, start: 0 },
    }),
  );
  await expect(
    first.mutation(api.productAnalysis.ensure, { ids: [id] }),
  ).rejects.toThrow("Bruksgrensen");
  await expect(
    first.mutation(api.catalogMatching.enrich, { id }),
  ).rejects.toThrow("Bruksgrensen");
  await t.run((ctx) =>
    ctx.db.patch("receipts", id, {
      productAnalysis: {
        version: args.version,
        generation: args.generation,
        revision: args.revision,
        state: "complete",
        updatedAt: Date.now(),
        results: [],
      },
    }),
  );
  await expect(
    first.mutation(api.productAnalysis.ensure, { ids: [id, id] }),
  ).resolves.toBeNull();
  await expect(
    first.mutation(api.catalogMatching.enrich, { id, onlyIfMissing: true }),
  ).resolves.toBeNull();
});
