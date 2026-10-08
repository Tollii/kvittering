/// <reference types="vite/client" />
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { register } from "@convex-dev/workflow/test";
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { api } from "./_generated/api";
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

const rpcRequest = z.object({ id: z.number().optional(), method: z.string() });

/** Oda's OAuth server and MCP endpoint, answering as they do in production. */
async function oda(url: string, init?: RequestInit) {
  if (url === "https://oda.com/o/register/")
    return Response.json({ client_id: "kvitto-client" }, { status: 201 });

  if (url === "https://oda.com/o/token/")
    return Response.json({
      access_token: "access",
      refresh_token: "refresh",
      expires_in: 3600,
    });

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

  expect(callback.headers.get("Location")).toBe(
    "kvitto://oda?status=connected",
  );

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
});
