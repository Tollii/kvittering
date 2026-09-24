import { Ore } from "../src/lib/domain/ore";
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { batteryFixture, weeklyShopFixture } from "../src/lib/domain/receipt";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);

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

it("allows two household members, refuses a third, and rejects unauthenticated access", async () => {
  const { t, first, second, outsider, householdId } = await setup();
  await expect(
    outsider.mutation(api.households.join, {
      invitation: "0123456789abcdef0123456789abcdef",
    }),
  ).rejects.toThrow("to medlemmer");

  const id = await first.mutation(api.receipts.reserve, {
    clientId: "capture-request-0001",
    householdId,
    imageCount: 1,
  });

  expect((await second.query(api.receipts.detail, { id }))!.receipt._id).toBe(
    id,
  );
  await expect(t.query(api.receipts.detail, { id })).rejects.toThrow(
    "Logg inn",
  );
});

it("renames only the caller's household and rejects invalid or stale names", async () => {
  const { t, first, second, outsider } = await setup();
  await expect(
    t.mutation(api.households.rename, {
      name: "Home",
      previousName: "Test household",
    }),
  ).rejects.toThrow("Logg inn");
  await expect(
    outsider.mutation(api.households.rename, {
      name: "Home",
      previousName: "Test household",
    }),
  ).rejects.toThrow("Velg en husstand");
  await first.mutation(api.households.rename, {
    name: "  Our home  ",
    previousName: "Test household",
  });
  expect((await second.query(api.households.current, {}))!.household.name).toBe(
    "Our home",
  );
  await expect(
    second.mutation(api.households.rename, {
      name: "Second name",
      previousName: "Test household",
    }),
  ).rejects.toThrow("Navnet er endret");

  for (const name of [" ", "x".repeat(81)])
    await expect(
      first.mutation(api.households.rename, { name, previousName: "Our home" }),
    ).rejects.toThrow("1–80");
  await outsider.mutation(api.households.create, {
    name: "Other home",
    invitation: "ffffffffffffffffffffffffffffffff",
  });
  await outsider.mutation(api.households.rename, {
    name: "Other name",
    previousName: "Other home",
  });
  expect((await first.query(api.households.current, {}))!.household.name).toBe(
    "Our home",
  );
});

it("enforces household checks for receipts and image access", async () => {
  const { first, outsider, householdId } = await setup();
  await outsider.mutation(api.households.create, {
    name: "Other home",
    invitation: "ffffffffffffffffffffffffffffffff",
  });

  const id = await first.mutation(api.receipts.reserve, {
    clientId: "capture-request-0001",
    householdId,
    imageCount: 1,
  });

  await expect(outsider.query(api.receipts.detail, { id })).resolves.toBeNull();
  await expect(
    outsider.query(internal.receipts.imageAccess, { id, position: 0 }),
  ).rejects.toThrow("ikke tilgjengelig");

  const result = await outsider.query(api.receipts.list, {
    paginationOpts: { cursor: null, numItems: 20 },
  });

  expect(result.page).toHaveLength(0);
});

it("reserves one receipt for repeated upload requests", async () => {
  const { first, householdId } = await setup();
  const args = { clientId: "capture-request-0001", householdId, imageCount: 2 };
  const firstId = await first.mutation(api.receipts.reserve, args);
  expect(await first.mutation(api.receipts.reserve, args)).toBe(firstId);
  expect(
    (
      await first.query(api.receipts.list, {
        paginationOpts: { cursor: null, numItems: 20 },
      })
    ).page,
  ).toHaveLength(1);
  await expect(
    first.mutation(api.receipts.completeUpload, { id: firstId }),
  ).rejects.toThrow("bilder");
});

it("duplicate processing commits once and preserves all manual edits during reprocessing", async () => {
  const { t, first, householdId } = await setup();

  const id = await first.mutation(api.receipts.reserve, {
    clientId: "capture-request-0001",
    householdId,
    imageCount: 1,
  });

  await t.run(async (ctx) => {
    await ctx.db.patch("receipts", id, { status: "processing", generation: 1 });
  });
  const data = batteryFixture();

  const args = {
    id,
    generation: 1,
    data,
    original: data,
    provider: "test fixture",
  };

  await t.mutation(internal.processing.finish, args);
  await t.mutation(internal.processing.finish, args);

  expect(
    await t.run((ctx) =>
      ctx.db
        .query("extractions")
        .withIndex("by_receiptId", (q) => q.eq("receiptId", id))
        .collect(),
    ),
  ).toHaveLength(1);
  data.lines[0].name = "Corrected product";
  data.lines = data.lines.filter((line) => line.id !== "deposit");
  data.totalOre = Ore.of(2331);
  await first.mutation(api.receipts.save, {
    id,
    revision: 0,
    data,
    reviewed: true,
    rememberLineIds: ["battery"],
    duplicateResolved: false,
    excluded: false,
  });
  await t.run(async (ctx) => {
    await ctx.db.patch("receipts", id, { status: "processing", generation: 2 });
  });
  await t.mutation(internal.processing.finish, {
    ...args,
    generation: 2,
    data: batteryFixture(),
    original: batteryFixture(),
  });
  const detail = (await first.query(api.receipts.detail, { id }))!;
  expect(detail.receipt.data?.lines[0].name).toBe("Corrected product");
  expect(detail.receipt.data?.lines).toHaveLength(2);
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("extractions")
        .withIndex("by_receiptId", (q) => q.eq("receiptId", id))
        .collect(),
    ),
  ).toHaveLength(2);
});

it("rejects stale edits and refuses approval when the total is unreadable", async () => {
  const { t, first, householdId } = await setup();

  const id = await first.mutation(api.receipts.reserve, {
    clientId: "capture-request-0001",
    householdId,
    imageCount: 1,
  });

  await t.run(async (ctx) => {
    await ctx.db.patch("receipts", id, {
      status: "needs_review",
      data: batteryFixture(),
    });
  });
  const data = batteryFixture();
  data.totalOre = null;

  const args = {
    id,
    revision: 0,
    data,
    reviewed: true,
    rememberLineIds: [],
    duplicateResolved: false,
    excluded: false,
  };

  await expect(first.mutation(api.receipts.save, args)).rejects.toThrow(
    "avvik",
  );
  await first.mutation(api.receipts.save, { ...args, reviewed: false });
  await expect(
    first.mutation(api.receipts.save, { ...args, reviewed: false }),
  ).rejects.toThrow("annen");
});

it("refuses to reserve a queued photo for a different household after an account switch", async () => {
  const { first, outsider } = await setup();

  const otherId = await outsider.mutation(api.households.create, {
    name: "Other",
    invitation: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  });

  await expect(
    first.mutation(api.receipts.reserve, {
      clientId: "capture-request-0001",
      imageCount: 1,
      householdId: otherId,
    }),
  ).rejects.toThrow("Husstanden er endret");
});

it("applies confirmed matches while keeping item-only category corrections", async () => {
  const { t, first, householdId } = await setup();
  const ids = [];

  for (let index = 0; index < 3; index++) {
    const id = await first.mutation(api.receipts.reserve, {
      clientId: `capture-request-000${index}`,
      imageCount: 1,
      householdId,
    });

    ids.push(id);
    const data = batteryFixture();
    data.lines[0].categoryId = "fallback.unclear";

    if (index === 2) {
      data.lines[0].manual = true;
      data.lines[0].categoryId = "drinks.sports-drinks";
    }

    await t.run(async (ctx) => {
      await ctx.db.patch("receipts", id, { status: "needs_review", data });
    });
  }

  const data = batteryFixture();
  await first.mutation(api.receipts.save, {
    id: ids[0],
    revision: 0,
    data,
    reviewed: true,
    rememberLineIds: ["battery"],
    duplicateResolved: false,
    excluded: false,
  });

  const aliases = await t.run((ctx) =>
    ctx.db
      .query("aliases")
      .withIndex("by_householdId_and_key", (q) =>
        q.eq("householdId", householdId),
      )
      .take(1),
  );

  await t.mutation(internal.aliases.applyToMatching, {
    householdId,
    key: aliases[0].key,
    cursor: null,
  });
  const matched = (await first.query(api.receipts.detail, { id: ids[1] }))!;
  const manual = (await first.query(api.receipts.detail, { id: ids[2] }))!;
  expect(matched.receipt.data?.lines[0].categoryId).toBe("drinks.soft-drinks");
  expect(matched.receipt.data?.lines[0].productKey).toBe(aliases[0].key);
  expect(manual.receipt.data?.lines[0].categoryId).toBe("drinks.sports-drinks");
  // The remembered item was the only open question, so the receipt is approved.
  expect(matched.receipt.status).toBe("reviewed");
  expect(matched.receipt.autoAccepted).toBe(true);
});

it("settles remembered categories for a newly read receipt from any engine", async () => {
  const { t, first, householdId } = await setup();

  const reviewedId = await first.mutation(api.receipts.reserve, {
    clientId: "capture-request-0001",
    imageCount: 1,
    householdId,
  });

  await t.run(async (ctx) => {
    await ctx.db.patch("receipts", reviewedId, {
      status: "needs_review",
      data: batteryFixture(),
    });
  });
  await first.mutation(api.receipts.save, {
    id: reviewedId,
    revision: 0,
    data: batteryFixture(),
    reviewed: true,
    rememberLineIds: ["battery"],
    duplicateResolved: false,
    excluded: false,
  });

  const id = await first.mutation(api.receipts.reserve, {
    clientId: "capture-request-0002",
    imageCount: 1,
    householdId,
  });

  await t.run(async (ctx) => {
    await ctx.db.patch("receipts", id, { status: "processing", generation: 1 });
  });
  // A reading may arrive with an uncertain category the household has already settled.
  const data = batteryFixture();
  data.lines[0].categoryId = "fallback.unclear";
  data.lines[0].confidence = 0;
  data.lines[0].issues = ["Kategorien er usikker."];
  await t.mutation(internal.processing.finish, {
    id,
    generation: 1,
    data,
    original: batteryFixture(),
    provider: "test reader",
  });
  const detail = (await first.query(api.receipts.detail, { id }))!;
  expect(detail.receipt.data?.lines[0].categoryId).toBe("drinks.soft-drinks");
  expect(detail.receipt.data?.lines[0].issues).toEqual([]);
  expect(detail.receipt.status).toBe("reviewed");
  expect(detail.receipt.autoAccepted).toBe(true);
});

it("ignores an alias whose category is no longer available", async () => {
  const { t, first, householdId } = await setup();

  const id = await first.mutation(api.receipts.reserve, {
    clientId: "retired-category-0001",
    imageCount: 1,
    householdId,
  });

  const data = batteryFixture();
  await t.run(async (ctx) => {
    await ctx.db.insert("aliases", {
      householdId,
      key: JSON.stringify([
        "EKSEMPELBUTIKK",
        "BATTERY REMIX",
        null,
        null,
        null,
        null,
      ]),
      categoryId: "removed.category",
      confirmedBy: "test",
    });
  });
  const result = await t.query(internal.processing.applyAliases, { id, data });
  expect(result.lines[0].categoryId).toBe("drinks.soft-drinks");
  expect(result.lines[0].productKey).toBeNull();
});

it("deletes a household receipt, its images and history without allowing a late processing result", async () => {
  const { t, first, second, outsider, householdId } = await setup();
  await outsider.mutation(api.households.create, {
    name: "Other home",
    invitation: "ffffffffffffffffffffffffffffffff",
  });

  const id = await first.mutation(api.receipts.reserve, {
    clientId: "delete-request-0001",
    householdId,
    imageCount: 1,
  });

  const other = await first.mutation(api.receipts.reserve, {
    clientId: "delete-request-0002",
    householdId,
    imageCount: 1,
  });

  const storageId = await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["receipt"]));
    await ctx.db.insert("images", {
      receiptId: id,
      position: 0,
      storageId,
      sha256: "test",
    });
    await ctx.db.insert("extractions", {
      receiptId: id,
      generation: 1,
      data: batteryFixture(),
      provider: "test",
    });
    await ctx.db.insert("revisions", {
      receiptId: id,
      revision: 0,
      data: batteryFixture(),
      editor: "test",
    });
    await ctx.db.patch("receipts", id, {
      status: "processing",
      generation: 2,
      revision: 1,
    });
    await ctx.db.patch("receipts", other, { duplicateOf: id });

    return storageId;
  });

  await expect(
    outsider.mutation(api.receipts.remove, { id, revision: 1 }),
  ).rejects.toThrow("ikke tilgjengelig");
  await expect(
    t.mutation(api.receipts.remove, { id, revision: 1 }),
  ).rejects.toThrow("Logg inn");
  await expect(
    first.mutation(api.receipts.remove, { id, revision: 0 }),
  ).rejects.toThrow("endret");
  await second.mutation(api.receipts.remove, { id, revision: 1 });
  await second.mutation(api.receipts.remove, { id, revision: 1 });
  await expect(first.query(api.receipts.detail, { id })).resolves.toBeNull();
  await expect(second.query(api.receipts.detail, { id })).resolves.toBeNull();
  await t.mutation(internal.processing.finish, {
    id,
    generation: 2,
    data: batteryFixture(),
    original: batteryFixture(),
    provider: "late result",
  });
  await t.run(async (ctx) => {
    expect(await ctx.db.get("receipts", id)).toBeNull();
    expect(await ctx.storage.get(storageId)).toBeNull();

    for (const table of ["images", "extractions", "revisions"] as const) {
      expect(
        await ctx.db
          .query(table)
          .withIndex("by_receiptId", (q) => q.eq("receiptId", id))
          .take(1),
      ).toEqual([]);
    }

    expect((await ctx.db.get("receipts", other))?.duplicateOf).toBeUndefined();
  });
});

it("requires an upload to finish before deleting it", async () => {
  const { first, householdId } = await setup();

  const id = await first.mutation(api.receipts.reserve, {
    clientId: "delete-request-0001",
    householdId,
    imageCount: 1,
  });

  await expect(
    first.mutation(api.receipts.remove, { id, revision: 0 }),
  ).rejects.toThrow("lastet opp");
  expect((await first.query(api.receipts.detail, { id }))!.receipt.status).toBe(
    "uploading",
  );
});

it("treats malformed receipt links and IDs from other tables as unavailable", async () => {
  const { first, householdId } = await setup();

  for (const id of ["", "not-a-receipt", householdId]) {
    await expect(first.query(api.receipts.detail, { id })).resolves.toBeNull();
  }
});

it("trusts a category after two approvals and settles the next reading without a person", async () => {
  const { t, first, householdId } = await setup();

  const approved = () => {
    const data = weeklyShopFixture();
    data.lines = data.lines.filter((line) => line.id !== "unknown");
    data.totalOre = Ore.of(28980);
    const cheez = data.lines.find((line) => line.id === "cheez")!;
    cheez.issues = [];
    cheez.confidence = 1;

    return data;
  };

  for (let index = 0; index < 2; index++) {
    const id = await first.mutation(api.receipts.reserve, {
      clientId: `weekly-request-000${index}`,
      imageCount: 1,
      householdId,
    });

    await t.run((ctx) =>
      ctx.db.patch("receipts", id, {
        status: "needs_review",
        data: approved(),
      }),
    );
    await first.mutation(api.receipts.save, {
      id,
      revision: 0,
      data: approved(),
      reviewed: true,
      rememberLineIds: [],
      duplicateResolved: false,
      excluded: false,
    });
  }

  const memory = await t.run((ctx) =>
    ctx.db
      .query("categoryMemory")
      .withIndex("by_householdId_and_key", (q) =>
        q.eq("householdId", householdId),
      )
      .collect(),
  );

  expect(
    memory.find((entry) => entry.key.includes("CHEEZ DOODLES")),
  ).toMatchObject({
    categoryId: "snacks.crisps",
    confirmations: 2,
  });

  const id = await first.mutation(api.receipts.reserve, {
    clientId: "weekly-request-0009",
    imageCount: 1,
    householdId,
  });

  await t.run((ctx) =>
    ctx.db.patch("receipts", id, { status: "processing", generation: 1 }),
  );
  const reading = approved();
  // A different visit, so it is not flagged as a duplicate of the approved ones.
  reading.receiptNumber = "9999";
  reading.purchaseTime = "09:12";
  const cheez = reading.lines.find((line) => line.id === "cheez")!;
  cheez.categoryId = "snacks.sweets";
  cheez.confidence = 0.3;
  cheez.issues = ["Kategorien er usikker."];
  await t.mutation(internal.processing.finish, {
    id,
    generation: 1,
    data: reading,
    original: approved(),
    provider: "test reader",
  });
  const detail = (await first.query(api.receipts.detail, { id }))!;

  const settled = detail.receipt.data!.lines.find(
    (line) => line.id === "cheez",
  )!;

  expect(settled.categoryId).toBe("snacks.crisps");
  expect(settled.issues).toEqual([]);
  expect(detail.receipt.status).toBe("reviewed");
  expect(detail.receipt.autoAccepted).toBe(true);
});

it("pages narrow history summaries and includes imported older purchases in complete periods", async () => {
  const { t, first, householdId } = await setup();

  const templateId = await first.mutation(api.receipts.reserve, {
    householdId,
    clientId: "history-page-template",
    imageCount: 1,
  });

  await t.run(async (ctx) => {
    const { _id, _creationTime, ...template } = (await ctx.db.get(
      "receipts",
      templateId,
    ))!;

    for (let index = 0; index < 65; index++) {
      const data = batteryFixture();
      data.purchaseDate = index === 64 ? "2020-01-02" : "2026-09-01";

      if (index === 64) data.lines[0].tags = ["older import"];
      await ctx.db.insert("receipts", {
        ...template,
        clientId: `page-${index}`,
        data,
        status: "reviewed",
      });
    }
  });

  const firstPage = await first.query(api.receipts.history, {
    search: "",
    paginationOpts: { cursor: null, numItems: 30 },
  });

  expect(firstPage.page).toHaveLength(30);
  expect(firstPage.isDone).toBe(false);
  expect(firstPage.page[0]).not.toHaveProperty("data");

  const older = await first.query(api.receipts.readPage, {
    scope: { kind: "period", start: "2020-01-01", end: "2020-01-31" },
    paginationOpts: { cursor: null, numItems: 30 },
  });

  expect(older.isDone).toBe(true);
  expect(older.page).toHaveLength(1);
  expect(older.page[0].data?.purchaseDate).toBe("2020-01-02");

  const undated = await first.query(api.receipts.readPage, {
    scope: { kind: "undated" },
    paginationOpts: { cursor: null, numItems: 30 },
  });

  expect(undated.isDone).toBe(true);
  expect(undated.page.map((receipt) => receipt._id)).toEqual([templateId]);
  let cursor: string | null = null;
  let found = 0;
  let complete = false;

  while (!complete) {
    const page: typeof firstPage = await first.query(api.receipts.history, {
      search: "older import",
      paginationOpts: { cursor, numItems: 30 },
    });

    found += page.page.length;
    cursor = page.continueCursor;
    complete = page.isDone;
  }

  expect(found).toBe(1);
});

it("finds a dated duplicate beyond the former insertion-order limit", async () => {
  const { t, first, householdId } = await setup();

  const originalId = await first.mutation(api.receipts.reserve, {
    householdId,
    clientId: "duplicate-original-001",
    imageCount: 1,
  });

  const data = batteryFixture();
  data.purchaseDate = "2020-01-01";
  data.receiptNumber = "fixed-receipt";
  await t.run(async (ctx) => {
    await ctx.db.patch("receipts", originalId, { data, status: "reviewed" });

    const { _id, _creationTime, ...template } = (await ctx.db.get(
      "receipts",
      originalId,
    ))!;

    for (let index = 0; index < 251; index++)
      await ctx.db.insert("receipts", {
        ...template,
        clientId: `later-${index}`,
        data: { ...data, purchaseDate: "2026-09-19" },
      });
  });

  const id = await first.mutation(api.receipts.reserve, {
    householdId,
    clientId: "duplicate-new-import",
    imageCount: 1,
  });

  await t.run((ctx) =>
    ctx.db.patch("receipts", id, { status: "processing", generation: 1 }),
  );
  await t.mutation(internal.processing.finish, {
    id,
    generation: 1,
    data,
    original: data,
    provider: "test",
  });
  expect(
    (await first.query(api.receipts.detail, { id }))?.receipt.duplicateOf,
  ).toBe(originalId);

  const page = await t.query(internal.digest.periodPage, {
    householdId,
    today: "2020-01-05",
    paginationOpts: { cursor: null, numItems: 100 },
  });

  expect(page.receipts.page.some((receipt) => receipt._id === originalId)).toBe(
    true,
  );
});
