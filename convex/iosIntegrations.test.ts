import { present } from "../src/lib/testing/receipts";
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register } from "@convex-dev/workflow/test";
import { expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { batteryFixture } from "../src/lib/domain/receipt";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  register(t);

  const owner = t.withIdentity({
    subject: "owner",
    issuer: "https://test.local",
  });

  const outsider = t.withIdentity({
    subject: "other",
    issuer: "https://test.local",
  });

  const householdId = await owner.mutation(api.households.create, {
    name: "Home",
    invitation: "0123456789abcdef0123456789abcdef",
  });

  await outsider.mutation(api.households.create, {
    name: "Other",
    invitation: "fedcba9876543210fedcba9876543210",
  });

  const ids = await Promise.all(
    [1, 2].map((n) =>
      owner.mutation(api.receipts.reserve, {
        householdId,
        clientId: `capture-background-${n}`,
        imageCount: 2,
        backgroundUpload: true,
      }),
    ),
  );

  return { t, owner, outsider, householdId, ids };
}

it("starts server processing only after the last background image and keeps completion idempotent", async () => {
  const { t, owner, ids } = await setup();

  const storageIds = await t.run(async (ctx) =>
    Promise.all(
      [1, 2, 3].map((n) =>
        ctx.storage.store(new Blob([String(n)], { type: "image/jpeg" })),
      ),
    ),
  );

  await owner.mutation(internal.receipts.attachImage, {
    id: present(ids[0]),
    position: 0,
    storageId: present(storageIds[0]),
  });
  expect(
    (await owner.query(api.receipts.detail, { id: present(ids[0]) }))?.receipt
      .status,
  ).toBe("uploading");
  await owner.mutation(internal.receipts.attachImage, {
    id: present(ids[0]),
    position: 1,
    storageId: present(storageIds[1]),
  });
  expect(
    (await owner.query(api.receipts.detail, { id: present(ids[0]) }))?.receipt,
  ).toMatchObject({ status: "uploaded", generation: 1 });
  await owner.mutation(internal.receipts.attachImage, {
    id: present(ids[0]),
    position: 1,
    storageId: present(storageIds[2]),
  });
  await owner.mutation(api.receipts.completeUpload, { id: present(ids[0]) });
  expect(
    (await owner.query(api.receipts.detail, { id: present(ids[0]) }))?.images,
  ).toHaveLength(2);
  expect(
    await t.run((ctx) => ctx.storage.get(present(storageIds[2]))),
  ).toBeNull();
});

it("restricts activity registration, progress, and token replacement to the owning account", async () => {
  const { t, owner, outsider, ids } = await setup();
  await owner.mutation(api.liveActivities.register, {
    activityId: "activity-one",
    receiptIds: ids,
  });
  expect(
    await owner.query(api.liveActivities.current, {
      activityId: "activity-one",
    }),
  ).toMatchObject({ total: 2, completed: 0 });
  expect(
    await outsider.query(api.liveActivities.current, {
      activityId: "activity-one",
    }),
  ).toBeNull();
  await expect(
    outsider.mutation(api.liveActivities.register, {
      activityId: "activity-two",
      receiptIds: ids,
    }),
  ).rejects.toThrow("ikke tilgjengelig");
  await owner.mutation(api.liveActivities.setToken, {
    activityId: "activity-one",
    token: "a".repeat(64),
    environment: "development",
  });
  await outsider.mutation(api.liveActivities.setToken, {
    activityId: "activity-one",
    token: "b".repeat(64),
    environment: "production",
  });
  expect(
    await t.run(
      async (ctx) => (await ctx.db.query("receiptActivities").first())?.token,
    ),
  ).toBe("a".repeat(64));
  await outsider.mutation(api.liveActivities.stop, {
    activityId: "activity-one",
  });
  expect(
    await owner.query(api.liveActivities.current, {
      activityId: "activity-one",
    }),
  ).not.toBeNull();
  await expect(
    owner.mutation(api.liveActivities.register, {
      activityId: "duplicate",
      receiptIds: [present(ids[0]), present(ids[0])],
    }),
  ).rejects.toThrow("Ugyldig");
});

it("keeps Spotlight records within the household and removes excluded receipts", async () => {
  const { t, owner, outsider, ids } = await setup();
  await t.run(async (ctx) => {
    await ctx.db.patch("receipts", present(ids[0]), {
      data: batteryFixture(),
      status: "reviewed",
    });
    await ctx.db.patch("receipts", present(ids[1]), {
      data: batteryFixture(),
      status: "reviewed",
      excluded: true,
    });
  });
  expect(
    (await owner.query(api.spotlight.recent, {})).map((item) => item.id),
  ).toEqual([ids[0]]);
  expect(await outsider.query(api.spotlight.recent, {})).toEqual([]);
});

it("keeps explicit completion for legacy uploads", async () => {
  const { t, owner, householdId } = await setup();

  const id = await owner.mutation(api.receipts.reserve, {
    householdId,
    clientId: "capture-legacy-upload",
    imageCount: 1,
  });

  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["image"], { type: "image/jpeg" })),
  );

  await owner.mutation(internal.receipts.attachImage, {
    id,
    position: 0,
    storageId,
  });
  expect((await owner.query(api.receipts.detail, { id }))?.receipt.status).toBe(
    "uploading",
  );
  await owner.mutation(api.receipts.completeUpload, { id });
  expect((await owner.query(api.receipts.detail, { id }))?.receipt.status).toBe(
    "uploaded",
  );
});

it("publishes expiry without a receipt change and rejects stale cleanup", async () => {
  const { t, owner, ids } = await setup();
  await owner.mutation(api.liveActivities.register, {
    activityId: "activity-expiry",
    receiptIds: ids,
  });

  const activity = await t.run((ctx) =>
    ctx.db
      .query("receiptActivities")
      .withIndex("by_activityId", (q) => q.eq("activityId", "activity-expiry"))
      .unique(),
  );

  if (!activity) throw new Error("Expected a registered activity.");
  await t.mutation(internal.liveActivities.expire, { id: activity._id });
  expect(
    await owner.query(api.liveActivities.current, {
      activityId: activity.activityId,
    }),
  ).toMatchObject({ total: 2, completed: 0, failed: 0, ended: true });
  await t.mutation(internal.liveActivities.remove, {
    id: activity._id,
    updatedAt: activity.updatedAt,
  });
  expect(
    await owner.query(api.liveActivities.current, {
      activityId: activity.activityId,
    }),
  ).not.toBeNull();
});
