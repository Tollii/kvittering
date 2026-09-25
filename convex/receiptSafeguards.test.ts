import { z } from "zod";

import { present, receiptFixture } from "../src/lib/testing/receipts";

/// <reference types="vite/client" />
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { aliasKey } from "../src/lib/domain/receipt";
import { batteryFixture } from "../src/lib/mock-receipts";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);

  const first = t.withIdentity({
    subject: "first",
    issuer: "https://test.local",
    name: "First",
  });

  const second = t.withIdentity({
    subject: "second",
    issuer: "https://test.local",
    name: "Second",
  });

  const outsider = t.withIdentity({
    subject: "outsider",
    issuer: "https://test.local",
    name: "Outsider",
  });

  const householdId = await first.mutation(api.households.create, {
    name: "Test household",
    invitation: "0123456789abcdef0123456789abcdef",
  });

  await second.mutation(api.households.join, {
    invitation: "0123456789abcdef0123456789abcdef",
  });

  return { t, first, second, outsider, householdId };
}

it("retains an active extraction when remembered categories propagate", async () => {
  const { t, first, householdId } = await setup();

  const id = await first.mutation(api.receipts.reserve, {
    householdId,
    clientId: "alias-processing-request",
    imageCount: 1,
  });

  const data = batteryFixture();
  present(data.lines[0]).categoryId = "fallback.unclear";
  await t.run(async (ctx) => {
    await ctx.db.patch("receipts", id, {
      data,
      status: "processing",
      generation: 1,
    });
    await ctx.db.insert("aliases", {
      householdId,
      key: aliasKey(data, present(data.lines[0]))!,
      categoryId: "drinks.soft-drinks",
      confirmedBy: "test|first",
    });
  });
  await t.mutation(internal.aliases.applyToMatching, {
    householdId,
    key: aliasKey(data, present(data.lines[0]))!,
    cursor: null,
  });
  expect((await first.query(api.receipts.detail, { id }))?.receipt.status).toBe(
    "processing",
  );
  const extracted = { ...data, receiptNumber: "new-extraction" };

  const completion = {
    id,
    generation: 1,
    data: extracted,
    original: extracted,
    provider: "test",
  };

  await t.mutation(internal.processing.finish, completion);
  await t.mutation(internal.processing.finish, completion);
  const result = await first.query(api.receipts.detail, { id });
  expect(result?.receipt.data).toMatchObject({
    receiptNumber: "new-extraction",
  });
  expect(result?.receipt.data?.lines[0]?.categoryId).toBe("drinks.soft-drinks");
  expect(
    await t.run((ctx) => ctx.db.query("extractions").collect()),
  ).toHaveLength(1);
});

it("propagates changed aliases in one finite scan and skips unchanged decisions", async () => {
  vi.useFakeTimers();

  try {
    const { t, first, householdId } = await setup();
    const data = batteryFixture();
    data.lines = [
      present(data.lines[0]),
      { ...present(data.lines[0]), id: "second", name: "Second product" },
    ];

    const ids = await t.run(async (ctx) => {
      const result = [];

      for (let index = 0; index < 13; index++) {
        const copy = structuredClone(data);
        copy.lines.forEach((line) => {
          line.categoryId = "other-purchases.batteries";
        });
        present(copy.lines[0]).manual = index === 1;

        const { _id, _creationTime, ...fields } = receiptFixture({
          householdId,
          data: copy,
          status: "needs_review",
          clientId: `alias-batch-${index}`,
        });

        result.push(await ctx.db.insert("receipts", fields));
      }

      return result;
    });

    vi.setSystemTime(Date.now() + 100);

    const save = {
      id: present(ids[0]),
      revision: 0,
      data,
      reviewed: false,
      rememberLineIds: data.lines.map((line) => line.id),
      duplicateResolved: false,
      excluded: false,
    };

    await first.mutation(api.receipts.save, save);

    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );

    const propagation = jobs.filter((job) => job.name.startsWith("aliases:"));
    expect(propagation).toHaveLength(1);
    await t.mutation(internal.aliases.applyChanges, {
      householdId,
      ...z
        .object({
          keys: z.array(z.string()),
          cursor: z.string().nullable(),
          through: z.number(),
        })
        .parse(present(propagation[0]).args[0]),
    });
    vi.setSystemTime(Date.now() + 100);

    const newId = await t.run((ctx) => {
      const { _id, _creationTime, ...fields } = receiptFixture({
        householdId,
        data,
        status: "needs_review",
        clientId: "after-alias-boundary",
      });

      return ctx.db.insert("receipts", fields);
    });

    const allJobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );

    const continuation = allJobs.filter(
      (job) =>
        job.name === "aliases:applyChanges" &&
        job._id !== present(propagation[0])._id,
    );

    expect(continuation).toHaveLength(1);
    await t.mutation(internal.aliases.applyChanges, {
      householdId,
      ...z
        .object({
          keys: z.array(z.string()),
          cursor: z.string().nullable(),
          through: z.number(),
        })
        .parse(present(continuation[0]).args[0]),
    });
    await t.mutation(internal.aliases.applyChanges, {
      householdId,
      ...z
        .object({
          keys: z.array(z.string()),
          cursor: z.string().nullable(),
          through: z.number(),
        })
        .parse(present(continuation[0]).args[0]),
    });

    const receipts = await t.run((ctx) =>
      Promise.all(ids.slice(1).map((id) => ctx.db.get("receipts", id))),
    );

    expect(receipts.every((receipt) => receipt?.revision === 1)).toBe(true);
    expect(
      receipts.every(
        (receipt) =>
          receipt?.data?.lines[1]?.categoryId === "drinks.soft-drinks",
      ),
    ).toBe(true);
    expect(present(receipts[0])?.data?.lines[0]?.categoryId).toBe(
      "other-purchases.batteries",
    );
    expect(
      (await t.run((ctx) => ctx.db.get("receipts", newId)))?.revision,
    ).toBe(0);

    const current = (await first.query(api.receipts.detail, {
      id: present(ids[0]),
    }))!.receipt;

    await first.mutation(api.receipts.save, {
      ...save,
      revision: current.revision,
      data: current.data!,
    });

    const finalJobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );

    expect(
      finalJobs.filter((job) => job.name.startsWith("aliases:")),
    ).toHaveLength(2);
  } finally {
    vi.useRealTimers();
  }
});

it("accepts up to five new images and preserves an existing eight-image reservation", async () => {
  const { t, first, householdId } = await setup();

  for (const [imageCount, message] of [
    [0, /Ugyldig/],
    [1.5, /Ugyldig/],
    [100, /Ugyldig/],
    [6, /Maks 5.*Bildene er beholdt/],
    [8, /Maks 5.*Bildene er beholdt/],
  ] as const)
    await expect(
      first.mutation(api.receipts.reserve, {
        householdId,
        imageCount,
        clientId: `image-limit-${String(imageCount).padStart(8, "0")}`,
      }),
    ).rejects.toThrow(message);

  for (const imageCount of [1, 5]) {
    const id = await first.mutation(api.receipts.reserve, {
      householdId,
      imageCount,
      clientId: `image-valid-${imageCount}-request`,
    });

    expect(
      (await first.query(api.receipts.detail, { id }))?.receipt.imageCount,
    ).toBe(imageCount);
    await expect(
      first.query(internal.receipts.imageAccess, { id, position: imageCount }),
    ).rejects.toThrow(/Ugyldig|Maks 5/);
  }

  const id = await t.run((ctx) => {
    const { _id, _creationTime, ...fields } = receiptFixture({
      householdId,
      imageCount: 8,
      clientId: "legacy-eight-image-request",
      status: "uploading",
    });

    return ctx.db.insert("receipts", fields);
  });

  expect(
    await first.mutation(api.receipts.reserve, {
      householdId,
      imageCount: 8,
      clientId: "legacy-eight-image-request",
    }),
  ).toBe(id);
  expect(
    await first.query(internal.receipts.imageAccess, { id, position: 7 }),
  ).toMatchObject({ receipt: { _id: id } });
});
