/// <reference types="vite/client" />
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { separateHouseholds } from "../src/lib/testing/households";
import { date } from "../src/lib/testing/calendar";
import { receiptFixture } from "../src/lib/testing/receipts";
import { weeklyShopFixture } from "../src/lib/mock-receipts";
import { updateReceiptReadModel } from "./receiptReadModel";
import type { JsonValue } from "../src/lib/mcp/json";

const modules = import.meta.glob("./**/*.ts");

const toolText = z.object({
  result: z.object({
    content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
    isError: z.boolean().optional(),
  }),
});

async function setup() {
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  const { householdId } = await separateHouseholds(t);

  const members = await t.run((ctx) => ctx.db.query("members").collect());

  const memberOf = (identity: string) =>
    members.find((member) => member.identity === identity)!;

  const first = memberOf("https://test.local|first");
  const other = memberOf("https://test.local|other");

  const insertReceipt = (
    household: Id<"households">,
    purchaseDate: string,
    store: string,
    status: "reviewed" | "needs_review" = "reviewed",
  ) =>
    t.run(async (ctx) => {
      const { _id, _creationTime, ...fields } = receiptFixture({
        householdId: household,
        status,
        data: {
          ...weeklyShopFixture(),
          store,
          purchaseDate: date(purchaseDate),
        },
      });

      const id = await ctx.db.insert("receipts", fields);
      const receipt = await ctx.db.get("receipts", id);

      // Raw inserts skip the triggers that keep the summaries current.
      if (receipt) await updateReceiptReadModel(ctx, receipt);

      return id;
    });

  const own = await insertReceipt(householdId, "2026-09-12", "REMA 1000");
  await insertReceipt(householdId, "2026-08-02", "KIWI");

  const foreign = await insertReceipt(
    other.householdId,
    "2026-09-13",
    "Other shop",
  );

  await t.mutation(internal.receiptSync.backfill, {});

  const { token } = await t.action(internal.mcp.createToken, {
    member: { memberId: first._id },
    label: "Claude",
  });

  const post = (body: JsonValue, headers: Record<string, string> = {}) =>
    t.fetch("/mcp", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });

  const body = (
    method: string,
    params: { name?: string; arguments?: Record<string, JsonValue> } = {},
  ) => ({
    jsonrpc: "2.0",
    id: 1,
    method,
    params: {
      ...params,
      _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientCapabilities": {},
      },
    },
  });

  /** A 2026-07-28 request with the headers that must match its body. */
  const request = (
    method: string,
    params: { name?: string; arguments?: Record<string, JsonValue> } = {},
    headers: Record<string, string> = {},
  ) => {
    const routing = new Headers({
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": method,
    });

    if (params.name !== undefined) routing.set("Mcp-Name", params.name);

    return post(body(method, params), {
      ...Object.fromEntries(routing),
      ...headers,
    });
  };

  const call = async (name: string, args: Record<string, JsonValue>) => {
    const response = await request("tools/call", { name, arguments: args });

    expect(response.status).toBe(200);
    const { result } = toolText.parse(await response.json());
    const text = result.content[0]!.text;

    return result.isError
      ? { error: text }
      : { value: z.json().parse(JSON.parse(text)) };
  };

  return {
    t,
    token,
    post,
    body,
    request,
    call,
    own,
    foreign,
    first,
    insertReceipt,
    householdId,
  };
}

it("answers only requests that carry a live token", async () => {
  const { t, token, request, first } = await setup();

  expect((await request("tools/list")).status).toBe(200);
  expect(
    (await request("tools/list", {}, { Authorization: "Bearer wrong" })).status,
  ).toBe(401);
  expect((await request("tools/list", {}, { Authorization: "" })).status).toBe(
    401,
  );
  expect(
    (await request("tools/list", {}, { Origin: "https://evil.example" }))
      .status,
  ).toBe(403);

  const [stored] = await t.query(internal.mcp.listTokens, {
    memberId: first._id,
  });

  await t.mutation(internal.mcp.revokeToken, { tokenId: stored!._id });

  const revoked = await t.fetch("/mcp", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: "{}",
  });

  expect(revoked.status).toBe(401);
});

it("loses access when the member leaves the household", async () => {
  const { t, request, first } = await setup();

  await t.run((ctx) => ctx.db.delete("members", first._id));

  expect((await request("tools/list")).status).toBe(401);
});

it("serves stateless 2026-07-28 requests and lists read-only tools", async () => {
  const { t, token, post, request } = await setup();

  const serverInfo = {
    "io.modelcontextprotocol/serverInfo": { name: "kvitto" },
  };

  expect(await (await request("server/discover")).json()).toMatchObject({
    result: {
      resultType: "complete",
      supportedVersions: ["2026-07-28"],
      capabilities: { tools: {} },
      _meta: serverInfo,
    },
  });

  const listed = z
    .object({
      result: z.object({
        resultType: z.literal("complete"),
        cacheScope: z.literal("public"),
        tools: z.array(
          z.object({
            name: z.string(),
            annotations: z.object({ readOnlyHint: z.literal(true) }),
          }),
        ),
      }),
    })
    .parse(await (await request("tools/list")).json());

  expect(listed.result.tools.map((tool) => tool.name).sort()).toEqual([
    "find_purchases",
    "get_receipt",
    "list_receipts",
    "spending_summary",
  ]);

  expect(
    await (
      await request("tools/call", {
        name: "get_receipt",
        arguments: { receiptId: "missing" },
      })
    ).json(),
  ).toMatchObject({
    result: { isError: true, resultType: "complete", _meta: serverInfo },
  });

  const unknownTool = await request("tools/call", { name: "delete_all" });

  expect(unknownTool.status).toBe(400);
  expect(await unknownTool.json()).toMatchObject({ error: { code: -32602 } });

  // The stateless revision removed the session handshake and ping.
  const ping = await request("ping");

  expect(ping.status).toBe(404);
  expect(await ping.json()).toMatchObject({ error: { code: -32601 } });

  const unversioned = await post(
    { jsonrpc: "2.0", id: 3, method: "tools/list", params: {} },
    { "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/list" },
  );

  expect(unversioned.status).toBe(400);
  expect(await unversioned.json()).toMatchObject({ error: { code: -32602 } });

  const sessionEra = await post({
    jsonrpc: "2.0",
    id: 2,
    method: "initialize",
    params: { protocolVersion: "2025-11-25", capabilities: {} },
  });

  expect(sessionEra.status).toBe(400);
  expect(await sessionEra.json()).toMatchObject({
    error: {
      code: -32022,
      data: { supported: ["2026-07-28"], requested: "2025-11-25" },
    },
  });

  expect(
    (await post({ jsonrpc: "2.0", method: "notifications/cancelled" })).status,
  ).toBe(202);

  const methodless = await post({ jsonrpc: "2.0", id: 4 });

  expect(methodless.status).toBe(400);
  expect(await methodless.json()).toMatchObject({
    id: 4,
    error: { code: -32600 },
  });

  const malformed = await t.fetch("/mcp", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: "{",
  });

  expect(malformed.status).toBe(400);
  expect(await malformed.json()).toMatchObject({ error: { code: -32700 } });
});

it("runs a tool only when the routing headers match the body", async () => {
  const { post, body, own } = await setup();

  const readOwn = body("tools/call", {
    name: "get_receipt",
    arguments: { receiptId: own },
  });

  const routing = {
    "MCP-Protocol-Version": "2026-07-28",
    "Mcp-Method": "tools/call",
    "Mcp-Name": "get_receipt",
  };

  const encode = (text: string) =>
    `=?base64?${btoa(String.fromCharCode(...new TextEncoder().encode(text)))}?=`;

  expect((await post(readOwn, routing)).status).toBe(200);
  expect(
    (
      await post(readOwn, {
        ...routing,
        "Mcp-Name": encode("get_receipt"),
      })
    ).status,
  ).toBe(200);

  const mismatches: Record<string, string>[] = [
    { ...routing, "Mcp-Name": "list_receipts" },
    { "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/call" },
    { "Mcp-Method": "tools/call", "Mcp-Name": "get_receipt" },
    { ...routing, "MCP-Protocol-Version": "2025-11-25" },
    { ...routing, "Mcp-Method": "tools/list" },
    // Only names may be base64-encoded.
    { ...routing, "Mcp-Method": encode("tools/call") },
    { ...routing, "Mcp-Name": "=?base64?@@?=" },
  ];

  for (const headers of mismatches) {
    const response = await post(readOwn, headers);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: -32020 } });
  }

  // A non-ASCII name decodes and reaches the tool lookup.
  const unknown = await post(body("tools/call", { name: "kjøp" }), {
    ...routing,
    "Mcp-Name": encode("kjøp"),
  });

  expect(await unknown.json()).toMatchObject({
    error: { code: -32602, message: "Unknown tool kjøp." },
  });
});

it("reads only the token holder's household", async () => {
  const { call, own, foreign } = await setup();

  expect(await call("list_receipts", {})).toEqual({
    value: {
      items: [
        expect.objectContaining({ receiptId: own, store: "REMA 1000" }),
        expect.objectContaining({ store: "KIWI", purchaseDate: "2026-08-02" }),
      ],
      hasMore: false,
      nextCursor: null,
    },
  });

  expect(
    await call("list_receipts", { from: "2026-09-01", store: "rema" }),
  ).toMatchObject({ value: { items: [{ receiptId: own }] } });

  expect(await call("get_receipt", { receiptId: foreign })).toEqual({
    error: "No receipt with that id in this household.",
  });

  const receipt = await call("get_receipt", { receiptId: own });

  const detail = z
    .object({
      value: z.object({
        store: z.string(),
        totalNok: z.number(),
        lines: z.array(
          z.object({
            name: z.string(),
            amountNok: z.number().nullable(),
            packageSize: z.number().nullable(),
          }),
        ),
      }),
    })
    .parse(receipt).value;

  expect(detail).toMatchObject({ store: "REMA 1000", totalNok: 419.8 });
  expect(
    detail.lines.find((line) => line.name === "KYLLINGFILET 900G"),
  ).toEqual({ name: "KYLLINGFILET 900G", amountNok: 149.9, packageSize: 900 });
  expect(detail.lines.find((line) => line.name === "KAFFE EVERGOOD")).toEqual({
    name: "KAFFE EVERGOOD",
    amountNok: null,
    packageSize: null,
  });
});

it("summarizes spending with the report rules and finds purchases", async () => {
  const { call } = await setup();

  const september = await call("spending_summary", {
    from: "2026-09-01",
    to: "2026-09-30",
  });

  const both = await call("spending_summary", {
    from: "2026-08-01",
    to: "2026-09-30",
  });

  expect(september).toMatchObject({
    value: { receipts: 1, notIncluded: { linesWithoutAmount: 1 } },
  });
  const purchases = z.object({ value: z.object({ purchasesNok: z.number() }) });
  expect(purchases.parse(both).value.purchasesNok).toBeCloseTo(
    purchases.parse(september).value.purchasesNok * 2,
  );

  expect(
    await call("spending_summary", { from: "2026-09-30", to: "2026-09-01" }),
  ).toHaveProperty("error");

  expect(
    await call("find_purchases", {
      text: "kaffe",
      from: "2026-01-01",
      to: "2026-12-31",
    }),
  ).toMatchObject({
    value: {
      items: [
        { name: "KAFFE EVERGOOD", store: "REMA 1000" },
        { name: "KAFFE EVERGOOD", store: "KIWI" },
      ],
      hasMore: false,
    },
  });
});

it("counts receipts awaiting review in the totals and says so", async () => {
  const { call, insertReceipt, householdId } = await setup();

  await insertReceipt(householdId, "2026-09-20", "MENY", "needs_review");

  // Each weekly shop: products 355.00 kr less 42.20 kr of discounts.
  expect(
    await call("spending_summary", { from: "2026-09-01", to: "2026-09-30" }),
  ).toMatchObject({
    value: {
      receipts: 2,
      purchasesNok: 625.6,
      included: { receiptsNeedingReview: 1, suspectedDuplicateReceipts: 0 },
      notIncluded: { linesWithoutAmount: 2 },
    },
  });
});

it("pages through more receipts than one read covers", async () => {
  const { call, insertReceipt, householdId } = await setup();

  for (let day = 1; day <= 120; day++)
    await insertReceipt(
      householdId,
      `2025-${String(Math.ceil(day / 28)).padStart(2, "0")}-${String(((day - 1) % 28) + 1).padStart(2, "0")}`,
      "COOP",
    );

  const page = z.object({
    value: z.object({
      items: z.array(z.object({ receiptId: z.string() })),
      hasMore: z.boolean(),
      nextCursor: z.string().nullable(),
    }),
  });

  const seen: string[] = [];
  let cursor: string | null = null;
  let pages = 0;

  do {
    const result: z.infer<typeof page>["value"] = page.parse(
      await call("list_receipts", cursor ? { cursor } : {}),
    ).value;

    seen.push(...result.items.map((item) => item.receiptId));
    cursor = result.nextCursor;
    pages++;
  } while (cursor);

  expect(pages).toBeGreaterThan(1);
  expect(seen).toHaveLength(122);
  expect(new Set(seen).size).toBe(122);
});

it("rate limits a looping client", async () => {
  const { request } = await setup();
  const statuses: number[] = [];

  for (let attempt = 0; attempt < 61; attempt++)
    statuses.push((await request("tools/list")).status);

  expect(statuses.slice(0, 60).every((status) => status === 200)).toBe(true);
  expect(statuses[60]).toBe(429);
});
