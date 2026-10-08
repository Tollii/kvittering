import { ConvexError } from "convex/values";
import { z } from "zod";
import type { HttpRouter } from "convex/server";
import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { sha256Hex } from "./tokens";
import {
  errorCodes,
  jsonRpcError,
  jsonRpcResult,
  modernResult,
  parseMcpMessage,
  serverInfo,
  supportedVersions,
  type Era,
  type McpMessage,
} from "../src/lib/mcp/protocol";
import {
  parseToolCall,
  toolList,
  type ParsedToolCall,
} from "../src/lib/mcp/tools";
import { errorDetails } from "../src/lib/diagnostics";

const instructions =
  "Kvitto holds a Norwegian household's grocery receipts. Use spending_summary for totals, list_receipts and get_receipt for individual shops, and find_purchases to look for an item. Item names are often abbreviated Norwegian receipt text. Report purchases, never consumption, and say when data is incomplete.";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: true };

const toolResult = <Value>(value: Value): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

const toolError = (message: string): ToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

async function runTool(
  ctx: ActionCtx,
  householdId: Id<"households">,
  call: ParsedToolCall,
): Promise<ToolResult> {
  const paginationOpts = (cursor: string | undefined) => ({
    cursor: cursor ?? null,
    numItems: 50,
  });

  switch (call.name) {
    case "list_receipts": {
      const { cursor, ...filters } = call.arguments;

      return toolResult(
        await ctx.runQuery(internal.mcp.listReceipts, {
          householdId,
          ...filters,
          paginationOpts: paginationOpts(cursor),
        }),
      );
    }

    case "get_receipt": {
      const receipt = await ctx.runQuery(internal.mcp.getReceipt, {
        householdId,
        receiptId: call.arguments.receiptId,
      });

      return receipt
        ? toolResult(receipt)
        : toolError("No receipt with that id in this household.");
    }

    case "spending_summary": {
      const summary = await ctx.runQuery(internal.mcp.spendingSummary, {
        householdId,
        ...call.arguments,
      });

      return summary
        ? toolResult(summary)
        : toolError("Spending totals are being rebuilt. Try again later.");
    }

    case "find_purchases": {
      const { cursor, ...search } = call.arguments;

      return toolResult(
        await ctx.runQuery(internal.mcp.findPurchases, {
          householdId,
          ...search,
          paginationOpts: paginationOpts(cursor),
        }),
      );
    }
  }
}

const noStore = { "Cache-Control": "no-store" };

const json = <Body>(body: Body, status = 200) =>
  Response.json(body, { status, headers: noStore });

const convexMessage = z.string();

/** Undefined for an unknown tool, which is a protocol error. */
async function callTool(
  ctx: ActionCtx,
  householdId: Id<"households">,
  message: Extract<McpMessage, { kind: "callTool" }>,
): Promise<ToolResult | undefined> {
  const parsed = parseToolCall(message.name, message.arguments);

  if (parsed.kind === "unknown") return undefined;

  if (parsed.kind === "invalid") return toolError(parsed.message);

  try {
    return await runTool(ctx, householdId, parsed.call);
  } catch (error) {
    console.warn("mcp.tool_failed", {
      tool: parsed.call.name,
      ...errorDetails(error),
    });

    const expected =
      error instanceof ConvexError
        ? convexMessage.safeParse(error.data).data
        : undefined;

    return toolError(
      expected ?? "The tool failed. Try again, or with a narrower request.",
    );
  }
}

/** Tool lists are the same for every caller and change only with a deploy. */
const cacheHint = { ttlMs: 60 * 60 * 1000, cacheScope: "public" as const };

const eraResult = <Result extends object>(era: Era, result: Result) =>
  era === "modern" ? modernResult(result) : result;

async function respond(
  ctx: ActionCtx,
  householdId: Id<"households">,
  message: McpMessage,
) {
  switch (message.kind) {
    case "acknowledge":
      return new Response(null, { status: 202, headers: noStore });

    case "invalid":
      return json(
        jsonRpcError(message.id, message.code, message.message, message.data),
        400,
      );

    case "unknownMethod":
      return json(
        jsonRpcError(
          message.id,
          errorCodes.methodNotFound,
          `Unknown method ${message.method}.`,
        ),
        message.era === "modern" ? 404 : 200,
      );

    case "initialize":
      return json(
        jsonRpcResult(message.id, {
          protocolVersion: message.protocolVersion,
          capabilities: { tools: {} },
          serverInfo,
          instructions,
        }),
      );

    case "discover":
      return json(
        jsonRpcResult(
          message.id,
          modernResult({
            supportedVersions,
            capabilities: { tools: {} },
            instructions,
            ...cacheHint,
          }),
        ),
      );

    case "ping":
      return json(jsonRpcResult(message.id, {}));

    case "listTools":
      return json(
        jsonRpcResult(
          message.id,
          eraResult(message.era, { tools: toolList(), ...cacheHint }),
        ),
      );

    case "callTool": {
      const result = await callTool(ctx, householdId, message);

      return json(
        result
          ? jsonRpcResult(message.id, eraResult(message.era, result))
          : jsonRpcError(
              message.id,
              errorCodes.invalidParams,
              `Unknown tool ${message.name}.`,
            ),
      );
    }
  }
}

/**
 * Stateless Streamable HTTP: every POST carries one message and gets JSON
 * back. Serves 2026-07-28 clients and session-era clients side by side.
 */
const endpoint = httpAction(async (ctx, request) => {
  // Browsers send Origin; MCP clients call from their own servers or processes.
  if (request.headers.get("Origin"))
    return new Response("Forbidden", { status: 403, headers: noStore });

  if (request.method !== "POST")
    return new Response(null, {
      status: 405,
      headers: { ...noStore, Allow: "POST" },
    });

  const bearer = /^Bearer (\S+)$/i.exec(
    request.headers.get("Authorization") ?? "",
  )?.[1];

  const access = bearer
    ? await ctx.runMutation(internal.mcp.authorize, {
        tokenHash: await sha256Hex(bearer),
      })
    : ({ kind: "denied" } as const);

  switch (access.kind) {
    case "denied":
      return new Response("Unauthorized", {
        status: 401,
        headers: { ...noStore, "WWW-Authenticate": 'Bearer realm="kvitto"' },
      });

    case "limited":
      return new Response("Too many requests", {
        status: 429,
        headers: {
          ...noStore,
          "Retry-After": String(Math.ceil(access.retryAfter / 1000)),
        },
      });

    case "allowed":
      return respond(
        ctx,
        access.householdId,
        parseMcpMessage(await request.text(), request.headers),
      );
  }
});

export function registerMcpRoutes(http: HttpRouter) {
  for (const method of ["POST", "GET", "DELETE"] as const)
    http.route({ path: "/mcp", method, handler: endpoint });
}
