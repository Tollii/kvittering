import { date as calendarDate } from "../src/lib/testing/calendar";
import { present, receiptFixture } from "../src/lib/testing/receipts";
import type { FunctionReturnType } from "convex/server";
import { getConvexSize } from "convex/values";
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { parseReceipt } from "../src/lib/domain/receipt";
import { weeklyShopFixture } from "../src/lib/mock-receipts";
import { weeklyDigest } from "../src/lib/domain/budget";
import { updateReceiptReadModel } from "./receiptReadModel";

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
      data: {
        ...weeklyShopFixture(),
        purchaseDate: calendarDate("2026-09-14"),
      },
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
    data: { ...weeklyShopFixture(), purchaseDate: calendarDate("2026-08-14") },
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
        duplicateOf: index === 3 ? present(result[0])._id : undefined,
        data: {
          ...weeklyShopFixture(),
          purchaseDate: calendarDate(date),
          currency: index === 4 ? "SEK" : "NOK",
        },
      });

      const id = await ctx.db.insert("receipts", fields);
      result.push((await ctx.db.get("receipts", id))!);
    }

    return result;
  });

  await t.mutation(internal.receiptSync.backfill, {});
  const expected = weeklyDigest(receipts, null, calendarDate("2026-09-18"));
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
  await user.mutation(api.receipts.remove, {
    id: present(ids[30]),
    revision: 0,
  });
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
  ).toEqual([{ id: present(ids[30]), receipt: null }]);
  expect(
    (
      await user.query(api.receiptSync.changes, {
        after: latest.sequence,
        through: latest.sequence,
      })
    ).changes,
  ).toEqual([]);
});

// Allow hosted runners to serialize the multi-megabyte fixture across all read paths.
it("keeps large receipt pages bounded without dropping totals or synchronization entries", async () => {
  const { t, user, householdId } = await setup();
  const data = weeklyShopFixture();
  data.originalText = "a".repeat(60_000);
  data.lines = Array.from({ length: 300 }, (_, index) => ({
    ...present(data.lines[0]),
    id: `large-line-${index}`,
    name: "a".repeat(500),
    originalText: "a".repeat(1500),
  }));
  data.purchaseDate = calendarDate("2026-09-18");
  expect(parseReceipt(data).kind).toBe("parsed");
  expect(getConvexSize(data)).toBeLessThan(1024 * 1024);
  expect(getConvexSize(data) * 50).toBeGreaterThan(16 * 1024 * 1024);

  const receipts = await t.run(async (ctx) => {
    const result = [];

    for (let index = 0; index < 8; index++) {
      const { _id, _creationTime, ...fields } = receiptFixture({
        householdId,
        data,
        clientId: `large-${index}`,
      });

      const id = await ctx.db.insert("receipts", fields);
      result.push((await ctx.db.get("receipts", id))!);
    }

    return result;
  });

  let cursor: string | null = null;
  const seen = new Set<string>();

  while (true) {
    const page: FunctionReturnType<typeof api.receipts.list> = await user.query(
      api.receipts.list,
      {
        paginationOpts: {
          cursor,
          numItems: 100,
          maximumBytesRead: 100_000_000,
        },
      },
    );

    expect(page.page.length).toBeLessThanOrEqual(2);

    for (const receipt of page.page) {
      expect(seen.has(receipt._id)).toBe(false);
      seen.add(receipt._id);
    }

    if (page.isDone) break;
    expect(page.continueCursor).not.toBe(cursor);
    cursor = page.continueCursor;
  }

  expect(seen.size).toBe(8);

  const filtered = await user.query(api.receipts.readPage, {
    scope: { kind: "inbox" },
    paginationOpts: { cursor: null, numItems: 100 },
  });

  expect(filtered.page).toEqual([]);
  expect(filtered.isDone).toBe(false);
  expect(
    (
      await user.query(api.receipts.editorContext, {
        id: present(receipts[0])._id,
      })
    ).recentCategories.length,
  ).toBeLessThanOrEqual(600);
  const expected = weeklyDigest(receipts, null, calendarDate("2026-09-18"));
  expect(
    await t.action(internal.digest.forHousehold, {
      householdId,
      today: "2026-09-18",
    }),
  ).toEqual({ title: expected.title, body: expected.body });

  while (!(await t.mutation(internal.receiptSync.backfill, {})).ready) {
    /* Complete the bounded migration. */
  }

  const head = await user.query(api.receiptSync.head, {});
  let after = 0;
  const synchronized = new Set<string>();

  while (true) {
    const page = await user.query(api.receiptSync.changes, {
      after,
      through: head.sequence,
    });

    expect(getConvexSize(page)).toBeLessThan(8 * 1024 * 1024);
    page.changes.forEach((change) => synchronized.add(change.id));

    if (page.done) break;
    expect(page.through).toBeGreaterThan(after);
    after = page.through;
  }

  expect(synchronized).toEqual(seen);
  expect(
    await t.query(internal.digest.summary, {
      householdId,
      today: "2026-09-18",
    }),
  ).toEqual({ title: expected.title, body: expected.body });
}, 15_000);
