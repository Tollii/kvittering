/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { batteryFixture } from "../src/lib/domain/receipt";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => vi.unstubAllEnvs());

async function setup() {
  vi.stubEnv("TYPESAFE_API_KEY", "");
  const t = convexTest(schema, modules);
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
    data.lines[0].categoryId = "other-purchases.batteries";
    data.lines[0].manual = index === 2;
    await t.run((ctx) =>
      ctx.db.patch("receipts", id, { data, status: "reviewed" }),
    );
    ids.push(id);
  }

  await first.mutation(api.receipts.save, {
    id: ids[0],
    revision: 0,
    data: batteryFixture(),
    reviewed: true,
    rememberLineIds: [],
    duplicateResolved: false,
    excluded: false,
  });
  const history = await first.query(api.corrections.list, {});

  return { t, first, other, ids, correction: history.entries[0] };
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
    (await first.query(api.receipts.detail, { id: ids[1] }))?.receipt.data
      ?.lines[0],
  ).toMatchObject({ categoryId: "drinks.soft-drinks", manual: true });
  expect(
    (await first.query(api.receipts.detail, { id: ids[2] }))?.receipt.data
      ?.lines[0].categoryId,
  ).toBe("other-purchases.batteries");
  expect((await first.query(api.corrections.list, {})).entries).toHaveLength(1);
  await expect(
    other.mutation(api.corrections.undo, { id: batch }),
  ).rejects.toThrow("ikke tilgjengelig");
  await first.mutation(api.corrections.undo, { id: batch });
  await first.mutation(api.corrections.undo, { id: batch });
  expect(
    (await first.query(api.receipts.detail, { id: ids[1] }))?.receipt.data
      ?.lines[0],
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

  await t.run((ctx) => ctx.db.patch("receipts", ids[1], { revision: 1 }));
  await expect(
    first.mutation(api.corrections.apply, { id: correction._id, targets }),
  ).rejects.toThrow("endret");

  const batch = await first.mutation(api.corrections.apply, {
    id: correction._id,
    targets: targets.map((target) => ({ ...target, revision: 1 })),
  });

  await t.run((ctx) => ctx.db.patch("receipts", ids[1], { revision: 3 }));
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

  const requests: {
    state: { products: unknown[] };
    questions: Record<string, { type: string }>;
  }[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body);
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
    expect(requests[0].state.products).toHaveLength(1);
  } finally {
    vi.unstubAllGlobals();
  }
});

it("keeps every matching line when a preview receipt exceeds the selection limit", async () => {
  const { t, first, ids, correction } = await setup();
  await t.run(async (ctx) => {
    const receipt = (await ctx.db.get("receipts", ids[1]))!;
    await ctx.db.patch("receipts", ids[1], {
      data: {
        ...receipt.data!,
        lines: Array.from({ length: 25 }, (_, index) => ({
          ...receipt.data!.lines[0],
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
