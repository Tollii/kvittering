import { z } from "zod";
import type { JsonValue } from "./json";
import {
  parseToolCall,
  toolError,
  toolList,
  type ParsedToolCall,
} from "./tools";

/**
 * The stateless revision: every request names its version in _meta, and
 * there is no initialize handshake or session.
 */
export const protocolVersion = "2026-07-28";

const metaKey = {
  protocolVersion: "io.modelcontextprotocol/protocolVersion",
  serverInfo: "io.modelcontextprotocol/serverInfo",
} as const;

const serverInfo = { name: "kvitto", version: "0.1.0" };

const instructions =
  "Kvitto holds a Norwegian household's grocery receipts. Use spending_summary for totals, list_receipts and get_receipt for individual shops, and find_purchases to look for an item. Item names are often abbreviated Norwegian receipt text. Report purchases, never consumption, and say when data is incomplete.";

/** Discovery and the tool list are the same for every caller until a deploy. */
const cacheHint = { ttlMs: 60 * 60 * 1000, cacheScope: "public" as const };

const requestId = z.union([z.string(), z.number()]);

export type RequestId = z.infer<typeof requestId>;

const message = z.object({
  jsonrpc: z.literal("2.0"),
  id: requestId.optional(),
  method: z.string().optional(),
  params: z.json().optional(),
});

const requestParams = z.object({
  _meta: z
    .object({ [metaKey.protocolVersion]: z.string().optional() })
    .optional(),
  name: z.string().optional(),
  arguments: z.record(z.string(), z.json()).optional(),
});

/** Session-era clients name their version here, in initialize. */
const initializeParams = z.object({ protocolVersion: z.string() });

type JsonBody = { kind: "json"; value: JsonValue } | { kind: "malformed" };

function readJson(text: string): JsonBody {
  try {
    return { kind: "json", value: z.json().parse(JSON.parse(text)) };
  } catch {
    // Handled: the caller answers with a JSON-RPC parse error.
    return { kind: "malformed" };
  }
}

const errorCodes = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  headerMismatch: -32020,
  unsupportedVersion: -32022,
} as const;

type JsonRpcBody =
  | ReturnType<typeof jsonRpcResult>
  | ReturnType<typeof jsonRpcError>;

/** One message from a Streamable HTTP client, with its answer decided. */
export type McpMessage =
  | { kind: "acknowledge" }
  | { kind: "answer"; status: number; body: JsonRpcBody }
  /** The one answer that needs the household's data. */
  | { kind: "callTool"; id: RequestId; call: ParsedToolCall };

const answer = <Result extends object>(
  id: RequestId,
  result: Result,
): McpMessage => ({
  kind: "answer",
  status: 200,
  body: jsonRpcResult(id, result),
});

function failure(
  status: number,
  id: RequestId | null,
  code: (typeof errorCodes)[keyof typeof errorCodes],
  message: string,
  data?: JsonValue,
): McpMessage {
  return {
    kind: "answer",
    status,
    body: jsonRpcError(id, code, message, data),
  };
}

/** Reads one POST body and checks the routing headers that must match it. */
export function parseMcpMessage(text: string, headers: Headers): McpMessage {
  const json = readJson(text);

  if (json.kind === "malformed")
    return failure(400, null, errorCodes.parse, "Body is not JSON.");
  const parsed = message.safeParse(json.value);

  if (!parsed.success)
    return failure(
      400,
      null,
      errorCodes.invalidRequest,
      "Send one JSON-RPC 2.0 message per request.",
    );
  const { id, method } = parsed.data;

  // This server sends no requests, so every message must name a method.
  if (method === undefined)
    return failure(
      400,
      id ?? null,
      errorCodes.invalidRequest,
      "A JSON-RPC request needs a method.",
    );

  // Notifications need no answer.
  if (id === undefined) return { kind: "acknowledge" };

  if (method === "initialize")
    return unsupportedVersion(
      id,
      initializeParams.safeParse(parsed.data.params).data?.protocolVersion ??
        "",
    );
  const params = requestParams.safeParse(parsed.data.params ?? {});

  if (!params.success)
    return failure(400, id, errorCodes.invalidParams, "Invalid params.");
  const requested = params.data._meta?.[metaKey.protocolVersion];

  if (requested === undefined)
    return failure(
      400,
      id,
      errorCodes.invalidParams,
      `Requests need _meta["${metaKey.protocolVersion}"].`,
    );

  if (requested !== protocolVersion) return unsupportedVersion(id, requested);
  const { name } = params.data;

  if (method === "tools/call" && name === undefined)
    return failure(
      400,
      id,
      errorCodes.invalidParams,
      "tools/call needs a tool name.",
    );
  const mismatch = headerMismatch(headers, { requested, method, name });

  if (mismatch) return failure(400, id, errorCodes.headerMismatch, mismatch);

  switch (method) {
    case "server/discover":
      return answer(id, {
        supportedVersions: [protocolVersion],
        capabilities: { tools: {} },
        instructions,
        ...cacheHint,
      });

    case "tools/list":
      return answer(id, { tools: toolList(), ...cacheHint });

    case "tools/call":
      return toolCall(id, name ?? "", params.data.arguments ?? {});

    default:
      return failure(
        404,
        id,
        errorCodes.methodNotFound,
        `Unknown method ${method}.`,
      );
  }
}

/** Names the supported version, so an older client can explain why it failed. */
const unsupportedVersion = (id: RequestId, requested: string) =>
  failure(
    400,
    id,
    errorCodes.unsupportedVersion,
    "Unsupported protocol version",
    {
      supported: [protocolVersion],
      requested,
    },
  );

function toolCall(
  id: RequestId,
  name: string,
  input: Record<string, JsonValue>,
): McpMessage {
  const parsed = parseToolCall(name, input);

  switch (parsed.kind) {
    case "parsed":
      return { kind: "callTool", id, call: parsed.call };

    // Bad arguments are a tool result the model can correct.
    case "invalid":
      return answer(id, toolError(parsed.message));

    case "unknown":
      return failure(
        400,
        id,
        errorCodes.invalidParams,
        `Unknown tool ${name}.`,
      );
  }
}

/** Requests repeat routing fields in headers so proxies need not read the body. */
function headerMismatch(
  headers: Headers,
  body: { requested: string; method: string; name: string | undefined },
): string | undefined {
  if (headers.get("MCP-Protocol-Version") !== body.requested)
    return "MCP-Protocol-Version must match the protocolVersion in _meta.";

  // Only names may use the base64 form; the method must be sent as is.
  if (headers.get("Mcp-Method") !== body.method)
    return "Mcp-Method must match the request method.";

  if (body.method === "tools/call" && nameHeader(headers) !== body.name)
    return "Mcp-Name must match the tool name.";
}

const base64Sentinel = /^=\?base64\?([A-Za-z0-9+/]*={0,2})\?=$/;

/** Decodes the =?base64?…?= form clients use for names headers can't carry. */
function nameHeader(headers: Headers): string | null {
  const value = headers.get("Mcp-Name");
  const encoded = value === null ? undefined : base64Sentinel.exec(value)?.[1];

  if (encoded === undefined) return value;

  try {
    return new TextDecoder().decode(
      Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)),
    );
  } catch {
    // Handled: an undecodable value cannot match the body.
    return null;
  }
}

/** Results say they are final and name the server. */
export const jsonRpcResult = <Result extends object>(
  id: RequestId,
  result: Result,
) => ({
  jsonrpc: "2.0" as const,
  id,
  result: {
    ...result,
    resultType: "complete" as const,
    _meta: { [metaKey.serverInfo]: serverInfo },
  },
});

const jsonRpcError = (
  id: RequestId | null,
  code: number,
  message: string,
  data?: JsonValue,
) => ({ jsonrpc: "2.0" as const, id, error: { code, message, data } });
