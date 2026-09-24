/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { DAY, RateLimiter } from "@convex-dev/rate-limiter";
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
