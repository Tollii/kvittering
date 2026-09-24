import { z } from "zod";
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { DAY, HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { afterEach, expect, it, vi } from "vitest";
import { api, components, internal } from "./_generated/api";
import schema from "./schema";
import { providerAllowances } from "./rateLimits";
import {
  batteryFixture,
  classificationInputs,
} from "../src/lib/domain/receipt";
import { providerFetch } from "./providerTransport";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-24T12:00:00Z"));
  const t = convexTest(schema, modules);
  registerRateLimiter(t);

  const first = t.withIdentity({
    subject: "first",
    issuer: "https://test.local",
  });

  const second = t.withIdentity({
    subject: "second",
    issuer: "https://test.local",
  });

  const householdId = await first.mutation(api.households.create, {
    name: "Home",
    invitation: "0123456789abcdef0123456789abcdef",
  });

  await second.mutation(api.households.join, {
    invitation: "0123456789abcdef0123456789abcdef",
  });

  return { t, first, second, householdId };
}

it("shares daily quota between members, preserves duplicate reservations, and resets at UTC midnight", async () => {
  const { t, first, second, householdId } = await setup();

  const reserve = (clientId: string) => ({
    householdId,
    clientId,
    imageCount: 1,
  });

  const original = await first.mutation(
    api.receipts.reserve,
    reserve("original-request-0001"),
  );

  for (let index = 1; index < 30; index++) {
    vi.setSystemTime(Date.now() + 60000);
    await (index % 2 ? first : second).mutation(
      api.receipts.reserve,
      reserve(`receipt-request-${index}`),
    );
  }

  await expect(
    first.mutation(api.receipts.reserve, reserve("original-request-0001")),
  ).resolves.toBe(original);
  await expect(
    second.mutation(api.receipts.reserve, reserve("blocked-request-0001")),
  ).rejects.toThrow("Dagens grense");
  await t.run((ctx) =>
    ctx.db.patch("receipts", original, {
      status: "failed",
      error: "Previous failure",
    }),
  );
  await expect(
    second.mutation(api.receipts.retry, { id: original }),
  ).rejects.toThrow("Dagens grense");
  expect(
    (await first.query(api.receipts.detail, { id: original }))?.receipt,
  ).toMatchObject({
    status: "failed",
    generation: 0,
    error: "Previous failure",
  });
  vi.setSystemTime(new Date("2026-09-25T00:00:01Z"));
  await expect(
    second.mutation(api.receipts.reserve, reserve("blocked-request-0001")),
  ).resolves.toBeTruthy();
});

it("keeps user quota after a household change and rolls back all counters on rejection", async () => {
  const { t, first, householdId } = await setup();

  for (let index = 0; index < 30; index++) {
    vi.setSystemTime(Date.now() + 60000);
    await first.mutation(api.receipts.reserve, {
      householdId,
      clientId: `user-quota-request-${index}`,
      imageCount: 1,
    });
  }

  const nextHousehold = await t.run(async (ctx) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .first();

    const id = await ctx.db.insert("households", {
      name: "Next home",
      invitation: "next-household-invitation",
    });

    await ctx.db.patch("members", member!._id, { householdId: id });

    return id;
  });

  await expect(
    first.mutation(api.receipts.reserve, {
      householdId: nextHousehold,
      clientId: "new-household-request",
      imageCount: 1,
    }),
  ).rejects.toThrow("Dagens grense");

  const receipt = await t.run((ctx) =>
    ctx.db
      .query("receipts")
      .withIndex("by_householdId", (q) => q.eq("householdId", nextHousehold))
      .first(),
  );

  expect(receipt).toBeNull();
});

it("rejects a burst without consuming the remaining daily allowance", async () => {
  const { first, householdId } = await setup();

  for (let index = 0; index < 10; index++)
    await first.mutation(api.receipts.reserve, {
      householdId,
      clientId: `burst-request-${index.toString().padStart(4, "0")}`,
      imageCount: 1,
    });
  await expect(
    first.mutation(api.receipts.reserve, {
      householdId,
      clientId: "burst-rejected-request",
      imageCount: 1,
    }),
  ).rejects.toThrow("kort tid");

  for (let index = 10; index < 30; index++) {
    vi.setSystemTime(Date.now() + 60000);
    await first.mutation(api.receipts.reserve, {
      householdId,
      clientId: `burst-request-${index.toString().padStart(4, "0")}`,
      imageCount: 1,
    });
  }

  await expect(
    first.mutation(api.receipts.reserve, {
      householdId,
      clientId: "daily-rejected-request",
      imageCount: 1,
    }),
  ).rejects.toThrow("Dagens grense");
});

it("counts failed outbound attempts and stops network calls at the shared provider allowance", async () => {
  const { t } = await setup();
  const limiter = new RateLimiter(components.rateLimiter);
  await t.run((ctx) =>
    limiter.limit(ctx, `openai:${DAY}`, {
      count: providerAllowances.openai.daily - 1,
      config: {
        kind: "fixed window",
        rate: providerAllowances.openai.daily,
        period: DAY,
        start: 0,
      },
    }),
  );
  let attempts = 0;
  vi.stubGlobal("fetch", async () => {
    attempts++;

    return new Response(null, { status: 503 });
  });
  await t.action(async (ctx) => {
    const request = providerFetch(ctx, "openai");
    expect((await request("https://api.openai.com/v1/responses")).status).toBe(
      503,
    );
    await expect(
      request("https://api.openai.com/v1/responses"),
    ).rejects.toThrow("bruksgrense");
  });
  expect(attempts).toBe(1);
  await expect(
    t.mutation(internal.rateLimits.consumeProvider, { provider: "typesafe" }),
  ).resolves.toBeNull();
});

it("enforces the longer provider allowance without consuming daily quota on rejection", async () => {
  const { t } = await setup();
  const limiter = new RateLimiter(components.rateLimiter);
  const period = 30 * DAY;
  await t.run((ctx) =>
    limiter.limit(ctx, `typesafe:${period}`, {
      count: providerAllowances.typesafe.thirtyDays,
      config: {
        kind: "fixed window",
        rate: providerAllowances.typesafe.thirtyDays,
        period,
        start: 0,
      },
    }),
  );
  await expect(
    t.mutation(internal.rateLimits.consumeProvider, { provider: "typesafe" }),
  ).rejects.toThrow("bruksgrense");

  const result = await t.run((ctx) =>
    limiter.check(ctx, `typesafe:${DAY}`, {
      count: providerAllowances.typesafe.daily,
      config: {
        kind: "fixed window",
        rate: providerAllowances.typesafe.daily,
        period: DAY,
        start: 0,
      },
    }),
  );

  expect(result.ok).toBe(true);
});

it("retains unknown categories without network I/O when TypeSafe quota is exhausted", async () => {
  const { t } = await setup();
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  vi.stubEnv("RECEIPT_PROVIDER", "openai");
  const limiter = new RateLimiter(components.rateLimiter);
  await t.run((ctx) =>
    limiter.limit(ctx, `typesafe:${DAY}`, {
      count: providerAllowances.typesafe.daily,
      config: {
        kind: "fixed window",
        rate: providerAllowances.typesafe.daily,
        period: DAY,
        start: 0,
      },
    }),
  );
  let attempts = 0;
  vi.stubGlobal("fetch", async () => {
    attempts++;

    return new Response(null, { status: 503 });
  });
  const products = classificationInputs(batteryFixture());
  const result = await t.action(internal.providers.classify, { products });
  expect(result.classifications).toEqual(
    products.map((product) => ({
      id: product.id,
      categoryId: "fallback.unclear",
      confidence: 0,
    })),
  );
  expect(attempts).toBe(0);
});

it("admits only the remaining allowance when reservations arrive concurrently", async () => {
  const { first, householdId } = await setup();

  for (let index = 0; index < 28; index++) {
    vi.setSystemTime(Date.now() + 60000);
    await first.mutation(api.receipts.reserve, {
      householdId,
      clientId: `concurrent-seed-${index}`,
      imageCount: 1,
    });
  }

  vi.setSystemTime(Date.now() + 60000);

  const results = await Promise.allSettled(
    Array.from({ length: 5 }, (_, index) =>
      first.mutation(api.receipts.reserve, {
        householdId,
        clientId: `concurrent-request-${index}`,
        imageCount: 1,
      }),
    ),
  );

  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(2);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(
    3,
  );
});

it("charges background provider attempts to their source and leaves allowance for another household", async () => {
  const { t, first, householdId } = await setup();

  const id = await first.mutation(api.receipts.reserve, {
    householdId,
    clientId: "provider-source-request",
    imageCount: 1,
  });

  const receipt = (await first.query(api.receipts.detail, { id }))!.receipt;
  const limiter = new RateLimiter(components.rateLimiter);
  await t.run((ctx) =>
    limiter.limit(ctx, `provider:kassalapp:${HOUR}`, {
      key: `user:${receipt.uploadedBy}`,
      count: 599,
      config: { kind: "fixed window", rate: 600, period: HOUR, start: 0 },
    }),
  );

  const other = t.withIdentity({
    subject: "provider-other",
    issuer: "https://test.local",
  });

  const otherHousehold = await other.mutation(api.households.create, {
    name: "Other",
    invitation: "fedcba9876543210fedcba9876543210",
  });

  const otherId = await other.mutation(api.receipts.reserve, {
    householdId: otherHousehold,
    clientId: "provider-other-request",
    imageCount: 1,
  });

  const transport = vi.fn<typeof fetch>(
    async () => new Response(null, { status: 503 }),
  );

  vi.stubGlobal("fetch", transport);
  await t.action(async (ctx) => {
    const request = providerFetch(ctx, "kassalapp", { kind: "receipt", id });
    await request("https://kassal.app/api/v1/products");
    await expect(request("https://kassal.app/api/v1/products")).rejects.toThrow(
      "Bruksgrensen",
    );
    await providerFetch(ctx, "kassalapp", { kind: "receipt", id: otherId })(
      "https://kassal.app/api/v1/products",
    );
  });
  expect(transport).toHaveBeenCalledTimes(2);

  const remaining = await t.run((ctx) =>
    limiter.check(ctx, `kassalapp:${DAY}`, {
      count: providerAllowances.kassalapp.daily - 2,
      config: {
        kind: "fixed window",
        rate: providerAllowances.kassalapp.daily,
        period: DAY,
        start: 0,
      },
    }),
  );

  expect(remaining.ok).toBe(true);
  vi.setSystemTime(Date.now() + HOUR);
  await t.action(async (ctx) => {
    await providerFetch(ctx, "kassalapp", { kind: "receipt", id })(
      "https://kassal.app/api/v1/products",
    );
  });
  expect(transport).toHaveBeenCalledTimes(3);
});

it("sends five images and counts the OpenAI SDK retry before network I/O", async () => {
  const { t, first, householdId } = await setup();
  // Fix the quota clock while the SDK uses its real, short retry timeout.
  const now = Date.now();
  vi.useRealTimers();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("RECEIPT_PROVIDER", "openai");

  const receiptId = await first.mutation(api.receipts.reserve, {
    householdId,
    clientId: "five-image-provider-request",
    imageCount: 5,
  });

  const receipt = (await first.query(api.receipts.detail, { id: receiptId }))!
    .receipt;

  const storageIds = await t.run(async (ctx) => {
    const ids = [];

    for (let index = 0; index < 5; index++)
      ids.push(
        await ctx.storage.store(
          new Blob([String(index)], { type: "image/jpeg" }),
        ),
      );

    return ids;
  });

  const limiter = new RateLimiter(components.rateLimiter);
  await t.run((ctx) =>
    limiter.limit(ctx, `provider:openai:${HOUR}`, {
      key: `user:${receipt.uploadedBy}`,
      count: 29,
      config: { kind: "fixed window", rate: 30, period: HOUR, start: 0 },
    }),
  );
  let images = 0;

  const transport = vi.fn<typeof fetch>(async (_url, init) => {
    const body = z
      .object({
        input: z.array(
          z.object({
            content: z.union([
              z.string().transform(() => []),
              z.array(z.object({ type: z.string() })),
            ]),
          }),
        ),
      })
      .parse(JSON.parse(z.string().parse(init?.body)));

    images = body.input
      .flatMap((item) => item.content)
      .filter((item: { type: string }) => item.type === "input_image").length;

    return new Response(null, {
      status: 503,
      headers: { "retry-after-ms": "1" },
    });
  });

  vi.stubGlobal("fetch", transport);

  await expect(
    t.action(internal.providers.extract, { receiptId, storageIds }),
  ).rejects.toThrow(/Connection|Bruksgrensen/);
  expect(images).toBe(5);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(
    (await first.query(api.receipts.detail, { id: receiptId }))?.receipt
      .imageCount,
  ).toBe(5);
});
