import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
/// <reference types="vite/client" />
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { register as registerWorkpool } from "@convex-dev/workpool/test";
import { afterEach, expect, it, vi } from "vitest";
import { api, components, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function setup() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  registerWorkpool(t, "catalogWorkpool");

  const first = t.withIdentity({
    subject: "first",
    issuer: "https://test.local",
  });

  const other = t.withIdentity({
    subject: "other",
    issuer: "https://test.local",
  });

  const householdId = await first.mutation(api.households.create, {
    name: "First",
    invitation: "11111111111111111111111111111111",
  });

  await other.mutation(api.households.create, {
    name: "Other",
    invitation: "22222222222222222222222222222222",
  });

  return { t, first, other, householdId };
}

it("limits new catalog work across household members while cached requests and other households remain available", async () => {
  const { t, first, other } = await setup();

  const second = t.withIdentity({
    subject: "second",
    issuer: "https://test.local",
  });

  await second.mutation(api.households.join, {
    invitation: "11111111111111111111111111111111",
  });

  const search = (index: number) =>
    `Quota product ${String.fromCharCode(65 + Math.floor(index / 26))}${String.fromCharCode(65 + (index % 26))}`;

  for (let index = 0; index < 119; index++)
    await first.mutation(api.catalog.ensure, {
      lookup: { kind: "products", search: search(index) },
    });

  const attempts = await Promise.allSettled(
    Array.from({ length: 4 }, (_, index) =>
      first.mutation(api.catalog.ensure, {
        lookup: { kind: "products", search: search(119 + index) },
      }),
    ),
  );

  expect(
    attempts.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(
    await t.run((ctx) => ctx.db.query("catalogRequests").collect()),
  ).toHaveLength(120);
  await expect(
    second.mutation(api.catalog.searchProducts, { search: search(200) }),
  ).rejects.toThrow("Bruksgrensen");
  await first.mutation(api.catalog.ensure, {
    lookup: { kind: "products", search: search(0) },
  });
  await expect(
    other.mutation(api.catalog.searchProducts, { search: search(200) }),
  ).resolves.toMatchObject({ status: "pending" });
  vi.setSystemTime(Date.now() + 60 * 60_000);
  await expect(
    first.mutation(api.catalog.searchProducts, { search: search(201) }),
  ).resolves.toMatchObject({ status: "pending" });
});

it("charges catalog worker retries to the requester without blocking another household", async () => {
  const { t, first, other } = await setup();
  vi.stubEnv("KASSALAPP_API_KEY", "test-key");
  await first.mutation(api.catalog.ensure, {
    lookup: { kind: "products", search: "Quota chocolate" },
  });
  await other.mutation(api.catalog.ensure, {
    lookup: { kind: "products", search: "Other chocolate" },
  });

  const requests = await t.run((ctx) =>
    ctx.db.query("catalogRequests").collect(),
  );

  const blocked = requests.find(
    (request) =>
      request.request.kind === "products" &&
      request.request.search.includes("quota"),
  )!;

  const available = requests.find((request) => request._id !== blocked._id)!;
  const limiter = new RateLimiter(components.rateLimiter);
  await t.run((ctx) =>
    limiter.limit(ctx, `provider:kassalapp:${HOUR}`, {
      key: `user:${blocked.payer!.identity}`,
      count: 600,
      config: { kind: "fixed window", rate: 600, period: HOUR, start: 0 },
    }),
  );

  const transport = vi.fn<typeof fetch>(async () =>
    Response.json({ data: [] }),
  );

  vi.stubGlobal("fetch", transport);
  await t.action(internal.catalogWorker.execute, { id: blocked._id });
  expect(transport).not.toHaveBeenCalled();
  await t.action(internal.catalogWorker.execute, { id: available._id });
  expect(transport).toHaveBeenCalled();
  expect(
    (await t.query(internal.catalogQueue.read, { id: blocked._id }))?.state,
  ).toBe("pending");
});
