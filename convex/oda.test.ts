/// <reference types="vite/client" />
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { register } from "@convex-dev/workflow/test";
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const order = {
  orderNumber: "r2fy3e",
  deliveryDate: "2026-03-22",
  currency: "NOK",
  grossAmount: 100,
  products: [
    {
      product: { id: 430, name: "Tine Lettmelk 1% fett", unitPrice: "21.40" },
      quantity: 2,
      totalGrossAmount: "42.80",
    },
  ],
};

let refreshes = 0;

const rpcRequest = z.object({ id: z.number().optional(), method: z.string() });

/** Oda's OAuth server and MCP endpoint, answering as they do in production. */
async function oda(url: string, init?: RequestInit) {
  if (url === "https://oda.com/o/register/")
    return Response.json({ client_id: "kvitto-client" }, { status: 201 });

  if (url === "https://oda.com/o/token/") {
    // Like Oda, each refresh replaces the refresh token and refuses the old one.
    const used = z
      .instanceof(URLSearchParams)
      .parse(init?.body)
      .get("refresh_token");

    if (used !== null && used !== `refresh-${refreshes}`)
      return Response.json({ error: "invalid_grant" }, { status: 400 });
    refreshes += used === null ? 0 : 1;

    return Response.json({
      access_token: "access",
      refresh_token: `refresh-${refreshes}`,
      expires_in: 3600,
    });
  }

  if (url !== "https://oda.com/mcp") throw new Error(`Unexpected ${url}`);

  const message = rpcRequest.parse(JSON.parse(z.string().parse(init?.body)));

  if (message.id === undefined) return new Response(null, { status: 202 });

  const result =
    message.method === "initialize"
      ? { protocolVersion: "2025-06-18", capabilities: {} }
      : {
          content: [
            { type: "text", text: JSON.stringify({ orders: [order] }) },
          ],
        };

  return new Response(
    `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: message.id, result })}\n\n`,
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Mcp-Session-Id": "session",
      },
    },
  );
}

it("signs in at Oda once and imports a delivered order as one receipt", async () => {
  vi.useFakeTimers();
  vi.stubEnv("RECEIPT_PROVIDER", "mock");
  vi.stubEnv("CONVEX_SITE_URL", "https://kvitto.convex.site");
  vi.stubGlobal("fetch", vi.fn(oda));
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  register(t);

  const user = t.withIdentity({
    subject: "owner",
    issuer: "https://test.local",
  });

  await user.mutation(api.households.create, {
    name: "Home",
    invitation: "0123456789abcdef0123456789abcdef",
  });
  expect(await user.query(api.oda.status, {})).toBeNull();

  const started = new URL(
    await user.mutation(api.oda.start, {
      request: "0123456789abcdef0123456789abcdef",
      returnUrl: "kvitto://oda",
    }),
  );

  const authorize = await t.fetch(`${started.pathname}${started.search}`);
  const signIn = new URL(authorize.headers.get("Location")!);
  expect(signIn.origin + signIn.pathname).toBe("https://oda.com/o/authorize/");
  expect(signIn.searchParams.get("redirect_uri")).toBe(
    "https://kvitto.convex.site/oda/callback",
  );

  // The link the app opened works once.
  expect((await t.fetch(`${started.pathname}${started.search}`)).status).toBe(
    400,
  );

  const callback = await t.fetch(
    `/oda/callback?code=code&state=${signIn.searchParams.get("state")}`,
  );

  const answer = new URL(callback.headers.get("Location")!);
  expect(answer.searchParams.get("status")).toBe("connected");
  const confirmation = answer.searchParams.get("confirmation")!;

  // Only the person who started the sign-in can finish it, so a forwarded
  // sign-in link cannot put someone else's Oda orders in this household.
  const stranger = t.withIdentity({
    subject: "stranger",
    issuer: "https://test.local",
  });

  await stranger.mutation(api.households.create, {
    name: "Elsewhere",
    invitation: "fedcba9876543210fedcba9876543210",
  });
  await expect(
    stranger.mutation(api.oda.confirm, { confirmation }),
  ).rejects.toThrow("Innloggingen hos Oda er utløpt");
  expect(await user.query(api.oda.status, {})).toBeNull();

  await user.mutation(api.oda.confirm, { confirmation });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  await user.mutation(api.oda.sync, {});
  vi.advanceTimersByTime(2 * 60 * 1000);
  await user.mutation(api.oda.sync, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(await user.query(api.oda.status, {})).toMatchObject({
    expired: false,
    importedCount: 1,
    error: null,
  });

  const receipts = await t.run((ctx) => ctx.db.query("receipts").collect());
  expect(receipts).toHaveLength(1);
  expect(receipts[0]).toMatchObject({
    clientId: "oda-r2fy3e",
    imageCount: 0,
    data: { store: "Oda", totalOre: 10000, receiptNumber: "r2fy3e" },
  });

  // Two syncs at once refresh the sign-in only once, so it stays valid.
  const [connection] = await t.run((ctx) =>
    ctx.db.query("odaConnections").collect(),
  );

  await t.run((ctx) =>
    ctx.db.patch("odaConnections", connection!._id, { accessExpiresAt: 0 }),
  );
  await Promise.all([
    t.action(internal.oda.syncConnection, { id: connection!._id }),
    t.action(internal.oda.syncConnection, { id: connection!._id }),
  ]);
  expect(await user.query(api.oda.status, {})).toMatchObject({
    expired: false,
  });

  // A retry reads the order again, since there are no images to read.
  const id = receipts[0]!._id;
  await t.run((ctx) =>
    ctx.db.patch("receipts", id, { status: "failed", data: null }),
  );
  await user.mutation(api.receipts.retry, { id });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(await t.run((ctx) => ctx.db.get("receipts", id))).toMatchObject({
    generation: 2,
    data: { store: "Oda", receiptNumber: "r2fy3e" },
  });

  const { revision } = (await t.run((ctx) => ctx.db.get("receipts", id)))!;
  await user.mutation(api.receipts.remove, { id, revision });

  // A deleted order stays deleted.
  vi.advanceTimersByTime(2 * 60 * 1000);
  await user.mutation(api.oda.sync, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.run((ctx) => ctx.db.query("receipts").collect())).toEqual([]);
});
