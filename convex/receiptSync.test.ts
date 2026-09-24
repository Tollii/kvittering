/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { weeklyShopFixture } from "../src/lib/domain/receipt";
import { weeklyDigest } from "../src/lib/domain/budget";
import { updateReceiptReadModel } from "./receiptReadModel";
import { receiptFixture } from "../src/lib/testing/receipts";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);

  const user = t.withIdentity({
    subject: "reader",
    issuer: "https://test.local",
  });

  const householdId = await user.mutation(api.households.create, {
    name: "Test",
    invitation: "0123456789abcdef0123456789abcdef",
  });

  return { t, user, householdId };
}

it("backfills existing receipts once, includes concurrent reservations, and rejects cross-household reads", async () => {
  const { t, user, householdId } = await setup();

  const legacyId = await t.run((ctx) => {
    const { _id, _creationTime, ...fields } = receiptFixture({
      householdId,
      data: weeklyShopFixture(),
    });

    return ctx.db.insert("receipts", fields);
  });

  expect(await user.query(api.receiptSync.head, {})).toEqual({
    ready: false,
    sequence: 0,
  });
  await expect(
    user.query(api.receiptSync.changes, { after: 0, through: 0 }),
  ).rejects.toThrow("not ready");

  const reserved = await user.mutation(api.receipts.reserve, {
    householdId,
    clientId: "capture-sync-000001",
    imageCount: 1,
  });

  await t.mutation(internal.receiptSync.backfill, {});
  const head = await user.query(api.receiptSync.head, {});
  expect(head).toEqual({ ready: true, sequence: 2 });
  await t.mutation(internal.receiptSync.backfill, {});
  expect(await user.query(api.receiptSync.head, {})).toEqual(head);

  const page = await user.query(api.receiptSync.changes, {
    after: 0,
    through: head.sequence,
  });

  expect(new Set(page.changes.map((row) => row.id))).toEqual(
    new Set([reserved, legacyId]),
  );

  const other = t.withIdentity({
    subject: "other",
    issuer: "https://test.local",
  });

  await other.mutation(api.households.create, {
    name: "Other",
    invitation: "fedcba9876543210fedcba9876543210",
  });
  expect(
    (await other.query(api.receiptSync.changes, { after: 0, through: 0 }))
      .changes,
  ).toEqual([]);
  await expect(
    other.query(api.receiptSync.changes, { after: 0, through: 2 }),
  ).rejects.toThrow("boundary");
});

it("moves aggregate contributions on edits and keeps a deletion marker after removal", async () => {
  const { t, user, householdId } = await setup();

  const id = await user.mutation(api.receipts.reserve, {
    householdId,
    clientId: "capture-sync-000002",
    imageCount: 1,
  });

  // Rehearse legacy persisted data through the same transactional materializer as the receipt trigger.
  await t.run(async (ctx) => {
    await ctx.db.patch("receipts", id, {
      data: { ...weeklyShopFixture(), purchaseDate: "2026-09-14" },
      status: "reviewed",
    });
    await updateReceiptReadModel(ctx, (await ctx.db.get("receipts", id))!);
  });
  await t.mutation(internal.receiptSync.backfill, {});
  const initial = await user.query(api.receiptSync.month, { month: "2026-09" });
  expect(initial?.products).toBe(31280);
  await user.mutation(api.receipts.save, {
    id,
    revision: 0,
    data: { ...weeklyShopFixture(), purchaseDate: "2026-08-14" },
    reviewed: false,
    rememberLineIds: [],
    duplicateResolved: false,
    excluded: false,
  });

  expect(
    (await user.query(api.receiptSync.month, { month: "2026-09" }))?.products,
  ).toBe(0);
  expect(
    (await user.query(api.receiptSync.month, { month: "2026-08" }))?.products,
  ).toBe(31280);
  const before = await user.query(api.receiptSync.head, {});
  await user.mutation(api.receipts.remove, { id, revision: 1 });
  const head = await user.query(api.receiptSync.head, {});
  expect(
    (
      await user.query(api.receiptSync.changes, {
        after: before.sequence,
        through: head.sequence,
      })
    ).changes,
  ).toEqual([{ id, receipt: null }]);
  expect(
    (await user.query(api.receiptSync.month, { month: "2026-08" }))?.products,
  ).toBe(0);
});

it("returns the same digest from daily totals with duplicates, exclusions, foreign currency and unknown amounts", async () => {
  const { t, householdId } = await setup();

  const receipts = await t.run(async (ctx) => {
    const result = [];

    for (const [index, date] of [
      "2026-09-14",
      "2026-09-08",
      "2026-09-17",
      "2026-09-16",
      "2026-09-01",
    ].entries()) {
      const { _id, _creationTime, ...fields } = receiptFixture({
        householdId,
        excluded: index === 2,
        duplicateOf: index === 3 ? result[0]._id : undefined,
        data: {
          ...weeklyShopFixture(),
          purchaseDate: date,
          currency: index === 4 ? "SEK" : "NOK",
        },
      });

      const id = await ctx.db.insert("receipts", fields);
      result.push((await ctx.db.get("receipts", id))!);
    }

    return result;
  });

  await t.mutation(internal.receiptSync.backfill, {});
  const expected = weeklyDigest(receipts, null, "2026-09-18");
  expect(
    await t.query(internal.digest.summary, {
      householdId,
      today: "2026-09-18",
    }),
  ).toEqual({ title: expected.title, body: expected.body });
});

it("continues after concurrent changes move records beyond a bounded synchronization window", async () => {
  const { t, user, householdId } = await setup();

  const ids = await t.run(async (ctx) => {
    const result = [];

    for (let index = 0; index < 45; index++) {
      const { _id, _creationTime, ...fields } = receiptFixture({
        householdId,
        clientId: String(index),
      });

      result.push(await ctx.db.insert("receipts", fields));
    }

    return result;
  });

  expect((await t.mutation(internal.receiptSync.backfill, {})).ready).toBe(
    false,
  );
  await t.mutation(internal.receiptSync.backfill, {});
  await t.mutation(internal.receiptSync.backfill, {});
  const head = await user.query(api.receiptSync.head, {});

  const first = await user.query(api.receiptSync.changes, {
    after: 0,
    through: head.sequence,
  });

  expect(first.changes).toHaveLength(20);
  expect(first.done).toBe(false);
  // This receipt has not yet been delivered. Its deletion must survive the old boundary.
  await user.mutation(api.receipts.remove, { id: ids[30], revision: 0 });
  let cursor = first.through;
  const seen = [...first.changes];

  while (cursor < head.sequence) {
    const page = await user.query(api.receiptSync.changes, {
      after: cursor,
      through: head.sequence,
    });

    seen.push(...page.changes);
    cursor = page.through;
  }

  expect(seen).toHaveLength(44);
  const latest = await user.query(api.receiptSync.head, {});
  expect(
    (
      await user.query(api.receiptSync.changes, {
        after: cursor,
        through: latest.sequence,
      })
    ).changes,
  ).toEqual([{ id: ids[30], receipt: null }]);
  expect(
    (
      await user.query(api.receiptSync.changes, {
        after: latest.sequence,
        through: latest.sequence,
      })
    ).changes,
  ).toEqual([]);
});
