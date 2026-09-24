# Executable review reproductions

Baseline: `96331941a84ca8fcb23da55b06478afacfce3eac`.

To reproduce, copy the following code into a temporary
`convex/applicationRiskReview.test.ts` in the audited checkout and run:

```sh
npx vitest run convex/applicationRiskReview.test.ts --sequence.seed=1790257949372
```

Expected baseline result: four failing assertions and one passing size check.
The first three are existing defects. The fourth is the new five-image
requirement. The fifth demonstrates accepted payload sizes; it does not emulate
Convex transaction limits. The HTTP transport is mocked, so these checks do not
call a paid API. Remove the temporary file after the review, or move the checks
to their owning tests while implementing the relevant plan.

```ts
import { getConvexSize } from "convex/values";
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import {
  aliasKey,
  batteryFixture,
  checkReceipt,
} from "../src/lib/domain/receipt";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function setup() {
  vi.stubEnv("TYPESAFE_API_KEY", "");
  const t = convexTest(schema, modules);
  const user = t.withIdentity({ subject: "review", issuer: "test" });
  const householdId = await user.mutation(api.households.create, {
    name: "Review household",
    invitation: "11111111111111111111111111111111",
  });
  const ids = [];
  for (let index = 0; index < 2; index++) {
    const id = await user.mutation(api.receipts.reserve, {
      householdId,
      clientId: `review-receipt-${index.toString().padStart(4, "0")}`,
      imageCount: 1,
    });
    const data = batteryFixture();
    data.lines[0]!.categoryId = "other-purchases.batteries";
    await t.run((ctx) =>
      ctx.db.patch("receipts", id, { data, status: "reviewed" }),
    );
    ids.push(id);
  }
  await user.mutation(api.receipts.save, {
    id: ids[0]!,
    revision: 0,
    data: batteryFixture(),
    reviewed: true,
    rememberLineIds: [],
    duplicateResolved: false,
    excluded: false,
  });
  const correction = (await user.query(api.corrections.list, {})).entries[0]!;
  return { t, user, householdId, ids, correction };
}

it("removes deleted receipt lines from correction batch responses", async () => {
  const { t, user, ids, correction } = await setup();
  const preview = await user.query(api.corrections.preview, {
    id: correction._id,
  });
  await user.mutation(api.corrections.apply, {
    id: correction._id,
    targets: preview.targets.map(({ receiptId, revision, lineId }) => ({
      receiptId,
      revision,
      lineId,
    })),
  });
  const id = ids[1]!;
  await user.mutation(api.receipts.remove, { id, revision: 1 });
  await t.mutation(internal.receipts.cleanupDeleted, { id });
  expect(await user.query(api.receipts.detail, { id })).toBeNull();
  const batches = await user.query(api.corrections.batches, {});
  expect(
    batches
      .flatMap((batch) => batch.changes)
      .filter((change) => change.receiptId === id),
  ).toEqual([]);
});

it("blocks new evaluation calls when every paid service is paused", async () => {
  const { t, user } = await setup();
  for (const platform of ["ios", "android"] as const) {
    let revision = 0;
    for (const name of [
      "receiptProcessing",
      "productLookup",
      "automaticProductMatching",
      "spendingAnalysis",
    ] as const) {
      await t.mutation(internal.featureFlags.set, {
        platform,
        name,
        enabled: false,
        expectedRevision: revision++,
        operator: "review",
        reason: "Pause paid work",
      });
    }
  }
  vi.stubEnv("TYPESAFE_API_KEY", "review-placeholder");
  const transport = vi.fn(async () =>
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
  await user.action(api.correctionEvaluation.evaluate, {}).catch(() => {});
  expect(transport).not.toHaveBeenCalled();
});

it("does not finish an active extraction when an alias is propagated", async () => {
  const { t, user, householdId, ids } = await setup();
  const id = ids[1]!;
  const data = batteryFixture();
  const key = aliasKey(data, data.lines[0]!)!;
  await t.run(async (ctx) => {
    await ctx.db.patch("receipts", id, { status: "processing", generation: 1 });
    await ctx.db.insert("aliases", {
      householdId,
      key,
      categoryId: "drinks.soft-drinks",
      confirmedBy: "test|review",
    });
  });
  await t.mutation(internal.aliases.applyToMatching, {
    householdId,
    key,
    cursor: null,
  });
  expect((await user.query(api.receipts.detail, { id }))!.receipt.status).toBe(
    "processing",
  );
});

it("rejects a new receipt with more than the requested five images", async () => {
  const { user, householdId } = await setup();
  await expect(
    user.mutation(api.receipts.reserve, {
      householdId,
      clientId: "review-six-images-0001",
      imageCount: 6,
    }),
  ).rejects.toThrow();
});

it("demonstrates that 50 legal receipt payloads exceed the read byte budget", () => {
  const data = batteryFixture();
  data.originalText = "a".repeat(60000);
  data.lines = Array.from({ length: 300 }, (_, index) => ({
    ...data.lines[0]!,
    id: `line-${index}`,
    name: "a".repeat(500),
    originalText: "a".repeat(1500),
  }));
  expect(checkReceipt(data).kind).toBe("valid");
  const bytes = getConvexSize(data);
  expect(bytes).toBeLessThan(1024 * 1024);
  expect(bytes * 50).toBeGreaterThan(16 * 1024 * 1024);
  console.info(
    "Accepted receipt payload bytes:",
    bytes,
    "Fifty payloads:",
    bytes * 50,
  );
});
```
