import { present } from "../src/lib/testing/receipts";
import {
  readModelRequest,
  type ModelRequest,
} from "../src/lib/testing/model-requests";
/// <reference types="vite/client" />
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { batteryFixture } from "../src/lib/domain/receipt";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setup() {
  vi.stubEnv("TYPESAFE_API_KEY", "");
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  const first = t.withIdentity({ subject: "first", issuer: "test" });
  const other = t.withIdentity({ subject: "other", issuer: "test" });

  const householdId = await first.mutation(api.households.create, {
    name: "Home",
    invitation: "11111111111111111111111111111111",
  });

  await other.mutation(api.households.create, {
    name: "Other",
    invitation: "22222222222222222222222222222222",
  });
  const ids = [];

  for (let index = 0; index < 3; index++) {
    const id = await first.mutation(api.receipts.reserve, {
      householdId,
      clientId: `correction-test-${index}`,
      imageCount: 1,
    });

    const data = batteryFixture();
    present(data.lines[0]).categoryId = "other-purchases.batteries";
    present(data.lines[0]).manual = index === 2;
    await t.run((ctx) =>
      ctx.db.patch("receipts", id, { data, status: "reviewed" }),
    );
    ids.push(id);
  }

  await first.mutation(api.receipts.save, {
    id: present(ids[0]),
    revision: 0,
    data: batteryFixture(),
    reviewed: true,
    rememberLineIds: [],
    duplicateResolved: false,
    excluded: false,
  });
  const history = await first.query(api.corrections.list, {});

  return { t, first, other, ids, correction: present(history.entries[0]) };
}

it("records a human correction and keeps examples private to the household", async () => {
  const { t, first, other, correction } = await setup();
  expect(correction).toMatchObject({
    field: "category",
    previous: "other-purchases.batteries",
    expected: "drinks.soft-drinks",
  });
  expect(correction.classificationEvidence?.name).toBe("BATTERY REMIX");
  expect((await other.query(api.corrections.list, {})).entries).toEqual([]);
  await expect(t.query(api.corrections.list, {})).rejects.toThrow("Logg inn");
  await expect(
    other.query(api.corrections.preview, { id: correction._id }),
  ).rejects.toThrow("ikke tilgjengelig");
  expect(
    (await first.query(api.corrections.preview, { id: correction._id }))
      .targets,
  ).toHaveLength(1);
});

it("applies only previewed unedited items and can undo without teaching from the batch", async () => {
  const { first, other, ids, correction } = await setup();

  const preview = await first.query(api.corrections.preview, {
    id: correction._id,
  });

  const targets = preview.targets.map(({ receiptId, revision, lineId }) => ({
    receiptId,
    revision,
    lineId,
  }));

  await expect(
    other.mutation(api.corrections.apply, { id: correction._id, targets }),
  ).rejects.toThrow("ikke tilgjengelig");

  const batch = await first.mutation(api.corrections.apply, {
    id: correction._id,
    targets,
  });

  expect(
    (await first.query(api.receipts.detail, { id: present(ids[1]) }))?.receipt
      .data?.lines[0],
  ).toMatchObject({ categoryId: "drinks.soft-drinks", manual: true });
  expect(
    present(
      (await first.query(api.receipts.detail, { id: present(ids[2]) }))?.receipt
        .data?.lines[0],
    ).categoryId,
  ).toBe("other-purchases.batteries");
  expect((await first.query(api.corrections.list, {})).entries).toHaveLength(1);
  await expect(
    other.mutation(api.corrections.undo, { id: batch }),
  ).rejects.toThrow("ikke tilgjengelig");
  await first.mutation(api.corrections.undo, { id: batch });
  await first.mutation(api.corrections.undo, { id: batch });
  expect(
    (await first.query(api.receipts.detail, { id: present(ids[1]) }))?.receipt
      .data?.lines[0],
  ).toMatchObject({ categoryId: "other-purchases.batteries", manual: false });
});

it("rejects stale previews and never undoes a later edit", async () => {
  const { t, first, ids, correction } = await setup();

  const preview = await first.query(api.corrections.preview, {
    id: correction._id,
  });

  const targets = preview.targets.map(({ receiptId, revision, lineId }) => ({
    receiptId,
    revision,
    lineId,
  }));

  await t.run((ctx) =>
    ctx.db.patch("receipts", present(ids[1]), { revision: 1 }),
  );
  await expect(
    first.mutation(api.corrections.apply, { id: correction._id, targets }),
  ).rejects.toMatchObject({
    data: {
      code: "RECEIPT_CHANGED",
      message: "Kvitteringene er endret. Åpne forhåndsvisningen på nytt.",
    },
  });

  const batch = await first.mutation(api.corrections.apply, {
    id: correction._id,
    targets: targets.map((target) => ({ ...target, revision: 1 })),
  });

  await t.run((ctx) =>
    ctx.db.patch("receipts", present(ids[1]), { revision: 3 }),
  );
  await expect(
    first.mutation(api.corrections.undo, { id: batch }),
  ).rejects.toThrow("endret");
});

it("evaluates only the caller's latest category decisions in one request", async () => {
  const { t, first, other, correction } = await setup();
  await t.run(async (ctx) => {
    await ctx.db.insert("corrections", {
      householdId: correction.householdId,
      receiptId: correction.receiptId,
      revision: 2,
      lineId: correction.lineId,
      store: correction.store,
      name: correction.name,
      field: "category",
      previous: correction.expected,
      expected: "drinks.sports-drinks",
      description: correction.description,
      evidence: correction.evidence,
    });
  });
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");

  const requests: ModelRequest[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const request = readModelRequest(init);
      requests.push(request);

      return new Response(
        JSON.stringify({
          model: "jev-latest",
          usage: { input_tokens: 20, output_tokens: 20 },
          answers: Object.fromEntries(
            Object.keys(request.questions).map((key) => [
              key,
              {
                type: "choice",
                choice: "drinks.sports-drinks",
                confidence: 0.95,
                probabilities: { "drinks.sports-drinks": 1 },
              },
            ]),
          ),
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }),
  );

  try {
    await expect(
      t.action(api.correctionEvaluation.evaluate, {}),
    ).rejects.toThrow("Logg inn");
    expect(
      (await other.action(api.correctionEvaluation.evaluate, {})).checked,
    ).toBe(0);
    const result = await first.action(api.correctionEvaluation.evaluate, {});
    expect(result).toMatchObject({ checked: 1, matched: 1 });
    expect(requests).toHaveLength(1);
    expect(present(requests[0]).state?.products).toHaveLength(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("keeps every matching line when a preview receipt exceeds the selection limit", async () => {
  const { t, first, ids, correction } = await setup();
  await t.run(async (ctx) => {
    const receipt = (await ctx.db.get("receipts", present(ids[1])))!;
    await ctx.db.patch("receipts", present(ids[1]), {
      data: {
        ...receipt.data!,
        lines: Array.from({ length: 25 }, (_, index) => ({
          ...present(receipt.data!.lines[0]),
          id: `line-${index}`,
        })),
      },
    });
  });

  const page = await first.query(api.corrections.previewPage, {
    id: correction._id,
    paginationOpts: { cursor: null, numItems: 20 },
  });

  expect(page.page.flatMap((group) => group.targets)).toHaveLength(25);
  await expect(
    first.mutation(api.corrections.apply, {
      id: correction._id,
      targets: page.page
        .flatMap((group) => group.targets)
        .map(({ receiptId, revision, lineId }) => ({
          receiptId,
          revision,
          lineId,
        })),
    }),
  ).rejects.toThrow("20");
});

it("blocks category evaluation during a pause for legacy and other-platform callers", async () => {
  const { t, first } = await setup();
  vi.stubEnv("TYPESAFE_API_KEY", "test-placeholder");

  const transport = vi.fn<typeof fetch>(async () =>
    Response.json({
      answers: {
        category_0: {
          type: "choice",
          choice: "drinks.soft-drinks",
          confidence: 1,
        },
      },
    }),
  );

  vi.stubGlobal("fetch", transport);
  await t.mutation(internal.featureFlags.set, {
    platform: "ios",
    name: "receiptProcessing",
    enabled: false,
    expectedRevision: 0,
    operator: "test",
    reason: "Pause classification",
  });

  for (const client of [
    undefined,
    {
      version: "1.0.0",
      build: "15",
      platform: "android" as const,
      channel: "development" as const,
      apiVersion: 1,
      updateId: null,
      runtimeVersion: null,
    },
  ]) {
    await expect(
      first.action(api.correctionEvaluation.evaluate, { client }),
    ).rejects.toThrow("SERVICE_PAUSED");
  }

  expect(transport).not.toHaveBeenCalled();
  await t.mutation(internal.featureFlags.set, {
    platform: "ios",
    name: "receiptProcessing",
    enabled: true,
    expectedRevision: 1,
    operator: "test",
    reason: "Resume classification",
  });
  const result = await first.action(api.correctionEvaluation.evaluate, {});
  expect(result).toMatchObject({ checked: 1, matched: 1 });
  expect(transport).toHaveBeenCalledTimes(1);
});

it("removes deleted receipt payloads from mixed batches and preserves surviving undo", async () => {
  const { t, first, other, ids, correction } = await setup();
  await t.run(async (ctx) => {
    const receipt = await ctx.db.get("receipts", ids[2]);
    const data = receipt!.data!;
    data.lines[0].manual = false;
    await ctx.db.patch("receipts", ids[2], { data });
  });

  const preview = await first.query(api.corrections.preview, {
    id: correction._id,
  });

  const batchId = await first.mutation(api.corrections.apply, {
    id: correction._id,
    targets: preview.targets.map(({ receiptId, revision, lineId }) => ({
      receiptId,
      revision,
      lineId,
    })),
  });

  expect(preview.targets).toHaveLength(2);
  await first.mutation(api.receipts.remove, { id: ids[1], revision: 1 });

  const scheduled = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );

  expect(
    scheduled.some(
      (job) =>
        job.name === "retention:deletedReceiptBatches" &&
        job.args[0].receiptId === ids[1],
    ),
  ).toBe(true);
  await t.mutation(internal.retention.deletedReceiptBatches, {
    householdId: correction.householdId,
    receiptId: ids[1],
  });
  await t.mutation(internal.retention.deletedReceiptBatches, {
    householdId: correction.householdId,
    receiptId: ids[1],
  });
  const batches = await first.query(api.corrections.batches, {});
  expect(batches[0].changes.map((change) => change.receiptId)).toEqual([
    ids[2],
  ]);
  expect(
    (await t.run((ctx) => ctx.db.get("correctionBatches", batchId)))?.changes,
  ).toEqual(batches[0].changes);
  expect(await other.query(api.corrections.batches, {})).toEqual([]);
  await first.mutation(api.corrections.undo, { id: batchId });
  expect(
    (await first.query(api.receipts.detail, { id: ids[2] }))?.receipt.data
      ?.lines[0].categoryId,
  ).toBe("other-purchases.batteries");
  expect(await first.query(api.receipts.detail, { id: ids[1] })).toBeNull();
});

it("repairs historical orphan batches without changing live receipt history", async () => {
  const { t, first, ids, correction } = await setup();

  const batchId = await first.mutation(api.corrections.apply, {
    id: correction._id,
    targets: [
      { receiptId: ids[1], revision: 0, lineId: batteryFixture().lines[0].id },
    ],
  });

  await t.mutation(internal.retention.orphanedCorrection, {
    batchId,
    receiptId: ids[1],
  });
  expect(
    await t.run((ctx) => ctx.db.get("correctionBatches", batchId)),
  ).not.toBeNull();
  await t.run((ctx) => ctx.db.delete("receipts", ids[1]));
  await t.mutation(internal.retention.orphanedCorrectionBatches, {});

  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );

  expect(
    jobs.some(
      (job) =>
        job.name === "retention:orphanedCorrection" &&
        job.args[0].batchId === batchId,
    ),
  ).toBe(true);
  await t.mutation(internal.retention.orphanedCorrection, {
    batchId,
    receiptId: ids[1],
  });
  await t.mutation(internal.retention.orphanedCorrection, {
    batchId,
    receiptId: ids[1],
  });
  expect(await first.query(api.corrections.batches, {})).toEqual([]);
  expect(
    await t.run((ctx) => ctx.db.get("correctionBatches", batchId)),
  ).toBeNull();
});

it("admits six evaluations per hour and denies extra provider calls until recovery", async () => {
  vi.useFakeTimers();

  try {
    const { t, first } = await setup();
    const second = t.withIdentity({ subject: "second", issuer: "test" });
    await second.mutation(api.households.join, {
      invitation: "11111111111111111111111111111111",
    });
    vi.stubEnv("TYPESAFE_API_KEY", "test-placeholder");

    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({
        answers: {
          category_0: {
            type: "choice",
            choice: "drinks.soft-drinks",
            confidence: 1,
          },
        },
      }),
    );

    vi.stubGlobal("fetch", transport);

    for (let index = 0; index < 5; index++)
      await first.action(api.correctionEvaluation.evaluate, {});

    const attempts = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        first.action(api.correctionEvaluation.evaluate, {}),
      ),
    );

    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    expect(transport).toHaveBeenCalledTimes(6);
    await expect(
      second.action(api.correctionEvaluation.evaluate, {}),
    ).rejects.toThrow("Bruksgrensen");
    expect(transport).toHaveBeenCalledTimes(6);
    vi.setSystemTime(Date.now() + 60 * 60_000);
    await first.action(api.correctionEvaluation.evaluate, {});
    expect(transport).toHaveBeenCalledTimes(7);
  } finally {
    vi.useRealTimers();
  }
});
