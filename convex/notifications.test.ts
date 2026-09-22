/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { batteryFixture } from "../src/lib/domain/receipt";
import { validPushToken } from "./notifications";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => vi.unstubAllEnvs());

const subscription = {
  token: "ExpoPushToken[abcdefghijklmnop]",
};

async function setup() {
  const t = convexTest(schema, modules);

  const uploader = t.withIdentity({
    subject: "uploader",
    issuer: "https://test.local",
  });

  const partner = t.withIdentity({
    subject: "partner",
    issuer: "https://test.local",
  });

  const householdId = await uploader.mutation(api.households.create, {
    name: "Home",
    invitation: "0123456789abcdef0123456789abcdef",
  });

  await partner.mutation(api.households.join, {
    invitation: "0123456789abcdef0123456789abcdef",
  });

  return { t, uploader, partner, householdId };
}

it("keeps each device subscription private to its account and supports disabling it", async () => {
  const { t, uploader, partner } = await setup();
  await expect(
    t.mutation(api.notifications.subscribe, subscription),
  ).rejects.toThrow("Logg inn");
  await uploader.mutation(api.notifications.subscribe, subscription);
  await uploader.mutation(api.notifications.subscribe, subscription);
  expect(
    await uploader.query(api.notifications.enabled, {
      token: subscription.token,
    }),
  ).toBe(true);
  expect(
    await partner.query(api.notifications.enabled, {
      token: subscription.token,
    }),
  ).toBe(false);
  await expect(
    partner.mutation(api.notifications.subscribe, subscription),
  ).rejects.toThrow("forrige konto");
  await partner.mutation(api.notifications.unsubscribe, {
    token: subscription.token,
  });
  expect(
    await uploader.query(api.notifications.enabled, {
      token: subscription.token,
    }),
  ).toBe(true);
  await uploader.mutation(api.notifications.unsubscribe, {
    token: subscription.token,
  });
  expect(
    await uploader.query(api.notifications.enabled, {
      token: subscription.token,
    }),
  ).toBe(false);
});

it("schedules only the uploader once, and skips delivery after review, unsubscribe or deletion", async () => {
  const { t, uploader, partner, householdId } = await setup();
  await uploader.mutation(api.notifications.subscribe, subscription);
  await partner.mutation(api.notifications.subscribe, {
    ...subscription,
    token: "ExpoPushToken[partnerabcdefghijk]",
  });

  const id = await uploader.mutation(api.receipts.reserve, {
    clientId: "notification-receipt-001",
    imageCount: 1,
    householdId,
  });

  await t.run((ctx) =>
    ctx.db.patch("receipts", id, { status: "processing", generation: 1 }),
  );
  const data = batteryFixture();
  const args = { id, generation: 1, data, original: data, provider: "fixture" };
  await t.mutation(internal.processing.finish, args);
  expect(
    (await uploader.query(api.receipts.detail, { id }))!.receipt.autoAccepted,
  ).toBe(true);
  await t.mutation(internal.processing.finish, args);

  const deliveries = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").take(10),
  );

  expect(deliveries).toHaveLength(1);
  const sendArgs = deliveries[0].args[0];
  expect(sendArgs.receiptId).toBe(id);

  const target = await t.query(internal.notifications.delivery, {
    receiptId: id,
    subscriptionId: sendArgs.subscriptionId,
  });

  expect(target?.subscription.token).toBe(subscription.token);
  expect(target?.title).toBe("Eksempelbutikk");
  expect(target?.body).toContain("25,31");
  await t.run((ctx) =>
    ctx.db.patch("receipts", id, { status: "processing", generation: 2 }),
  );
  await t.mutation(internal.processing.finish, { ...args, generation: 2 });
  expect(
    await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(10)),
  ).toHaveLength(1);
  await uploader.mutation(api.receipts.save, {
    id,
    revision: 0,
    data,
    reviewed: true,
    rememberLineIds: [],
    duplicateResolved: false,
    excluded: false,
  });
  expect(
    await t.query(internal.notifications.delivery, {
      receiptId: id,
      subscriptionId: sendArgs.subscriptionId,
    }),
  ).toBeNull();
  await t.run((ctx) =>
    ctx.db.patch("receipts", id, { status: "needs_review" }),
  );
  await uploader.mutation(api.notifications.unsubscribe, {
    token: subscription.token,
  });
  expect(
    await t.query(internal.notifications.delivery, {
      receiptId: id,
      subscriptionId: sendArgs.subscriptionId,
    }),
  ).toBeNull();
  await uploader.mutation(api.receipts.remove, { id, revision: 1 });
  expect(
    await t.query(internal.notifications.delivery, {
      receiptId: id,
      subscriptionId: sendArgs.subscriptionId,
    }),
  ).toBeNull();
});

it("accepts only Expo push tokens", () => {
  for (const token of [
    "",
    "https://example.com",
    "ExpoPushToken[x]",
    "ExpoPushToken[abc defghijk]",
  ])
    expect(validPushToken(token)).toBe(false);
  expect(validPushToken(subscription.token)).toBe(true);
});

async function reviewReminder() {
  const context = await setup();
  await context.uploader.mutation(api.notifications.subscribe, subscription);

  const receiptId = await context.uploader.mutation(api.receipts.reserve, {
    clientId: "reminder-receipt-001",
    imageCount: 1,
    householdId: context.householdId,
  });

  await context.t.run((ctx) =>
    ctx.db.patch("receipts", receiptId, {
      status: "needs_review",
      data: batteryFixture(),
    }),
  );

  return {
    ...context,
    receiptId,
    args: { receiptId, token: subscription.token, at: Date.now() + 60000 },
  };
}

it("authorizes reminders before scheduling and replaces repeated requests", async () => {
  const { t, uploader, partner, args } = await reviewReminder();
  await expect(t.mutation(api.notifications.remindLater, args)).rejects.toThrow(
    "Logg inn",
  );
  await expect(
    partner.mutation(api.notifications.remindLater, args),
  ).rejects.toThrow("denne kontoen");
  await expect(
    uploader.mutation(api.notifications.remindLater, { ...args, at: 0 }),
  ).rejects.toThrow("tidspunkt");
  await expect(
    uploader.mutation(api.notifications.remindLater, {
      ...args,
      at: Date.now() + 49 * 3600000,
    }),
  ).rejects.toThrow("tidspunkt");
  expect(
    await t.run((ctx) => ctx.db.query("receiptReminders").collect()),
  ).toEqual([]);
  await uploader.mutation(api.notifications.remindLater, args);
  const first = await t.run((ctx) => ctx.db.query("receiptReminders").unique());
  await uploader.mutation(api.notifications.remindLater, {
    ...args,
    at: args.at + 1000,
  });

  const reminders = await t.run((ctx) =>
    ctx.db.query("receiptReminders").collect(),
  );

  expect(reminders).toHaveLength(1);
  expect(reminders[0].scheduledId).not.toBe(first!.scheduledId);
  expect(
    await t.run((ctx) =>
      ctx.db.system.get("_scheduled_functions", first!.scheduledId),
    ),
  ).toMatchObject({ state: { kind: "canceled" } });
});

it("rejects a reminder for another household's receipt", async () => {
  const { t, args } = await reviewReminder();

  const other = t.withIdentity({
    subject: "other",
    issuer: "https://test.local",
  });

  await other.mutation(api.households.create, {
    name: "Other",
    invitation: "abcdef0123456789abcdef0123456789",
  });
  await other.mutation(api.notifications.subscribe, {
    token: "ExpoPushToken[otherabcdefghijk]",
  });
  await expect(
    other.mutation(api.notifications.remindLater, {
      ...args,
      token: "ExpoPushToken[otherabcdefghijk]",
    }),
  ).rejects.toThrow("ikke tilgjengelig");
});

it("delivers a due reminder once and keeps receipt delivery private", async () => {
  const { t, uploader, args } = await reviewReminder();
  await uploader.mutation(api.notifications.remindLater, args);

  const reminder = await t.run((ctx) =>
    ctx.db.query("receiptReminders").unique(),
  );

  const due = {
    receiptId: args.receiptId,
    subscriptionId: reminder!.subscriptionId,
  };

  await t.mutation(internal.notifications.sendReminder, due);
  await t.mutation(internal.notifications.sendReminder, due);
  expect(
    await t.run((ctx) => ctx.db.query("receiptReminders").collect()),
  ).toEqual([]);

  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );

  expect(jobs.filter((job) => job.args[0]?.reviewOnly)).toHaveLength(1);
  expect(await t.query(internal.notifications.delivery, due)).not.toBeNull();
  await uploader.mutation(api.notifications.unsubscribe, subscription);
  expect(await t.query(internal.notifications.delivery, due)).toBeNull();
});

it("drops reminders after review, exclusion, or deletion", async () => {
  for (const change of ["reviewed", "excluded", "deleted"] as const) {
    const { t, uploader, receiptId, args } = await reviewReminder();
    await uploader.mutation(api.notifications.remindLater, args);

    const reminder = await t.run((ctx) =>
      ctx.db.query("receiptReminders").unique(),
    );

    await t.run(async (ctx) => {
      if (change === "deleted") await ctx.db.delete("receipts", receiptId);
      else
        await ctx.db.patch(
          "receipts",
          receiptId,
          change === "reviewed" ? { status: "reviewed" } : { excluded: true },
        );
    });
    await t.mutation(internal.notifications.sendReminder, {
      receiptId,
      subscriptionId: reminder!.subscriptionId,
    });
    expect(
      await t.run((ctx) => ctx.db.query("receiptReminders").collect()),
    ).toEqual([]);

    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );

    expect(jobs.filter((job) => job.args[0]?.reviewOnly)).toEqual([]);
  }
});
