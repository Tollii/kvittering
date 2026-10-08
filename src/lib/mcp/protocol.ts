import { z } from "zod";
import { parseToolCall, type JsonValue, type ParsedToolCall } from "./tools";

/**
 * The stateless revision: every request names its version in _meta, and
 * there is no initialize handshake or session.
 */
export const protocolVersion = "2026-07-28";

const metaKey = {
  protocolVersion: "io.modelcontextprotocol/protocolVersion",
  serverInfo: "io.modelcontextprotocol/serverInfo",
} as const;

const requestId = z.union([z.string(), z.number()]);

export type RequestId = z.infer<typeof requestId>;

const message = z.object({
  jsonrpc: z.literal("2.0"),
  id: requestId.optional(),
  method: z.string().optional(),
  params: z.json().optional(),
});

const requestParams = z.object({
  _meta: z.object({ [metaKey.protocolVersion]: z.string() }).optional(),
  /** Session-era clients name their version in initialize instead. */
  protocolVersion: z.string().optional(),
  name: z.string().optional(),
  arguments: z.record(z.string(), z.json()).optional(),
});

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

/** One message from a Streamable HTTP client, with its answer decided. */
export type McpMessage =
  | { kind: "discover"; id: RequestId }
  | { kind: "listTools"; id: RequestId }
  | { kind: "callTool"; id: RequestId; call: ParsedToolCall }
  /** Bad tool arguments are a tool result the model can correct. */
  | { kind: "toolInputError"; id: RequestId; message: string }
  | { kind: "acknowledge" }
  | { kind: "error"; status: number; body: JsonRpcError };

type JsonRpcError = ReturnType<typeof jsonRpcError>;

const failure = (
  status: number,
  ...error: Parameters<typeof jsonRpcError>
): McpMessage => ({ kind: "error", status, body: jsonRpcError(...error) });

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
  const params = requestParams.safeParse(parsed.data.params ?? {});

  if (!params.success)
    return failure(
      400,
      id,
      errorCodes.invalidParams,
      "params must be an object.",
    );

  const requested =
    params.data._meta?.[metaKey.protocolVersion] ?? params.data.protocolVersion;

  if (requested !== protocolVersion)
    return failure(
      400,
      id,
      errorCodes.unsupportedVersion,
      "Unsupported protocol version",
      { supported: [protocolVersion], requested: requested ?? null },
    );
  const mismatch = headerMismatch(headers, method, params.data.name);

  if (mismatch) return failure(400, id, errorCodes.headerMismatch, mismatch);

  switch (method) {
    case "server/discover":
      return { kind: "discover", id };

    case "tools/list":
      return { kind: "listTools", id };

    case "tools/call":
      return toolCall(id, params.data);

    default:
      return failure(
        404,
        id,
        errorCodes.methodNotFound,
        `Unknown method ${method}.`,
      );
  }
}

function toolCall(
  id: RequestId,
  params: z.infer<typeof requestParams>,
): McpMessage {
  if (params.name === undefined)
    return failure(
      400,
      id,
      errorCodes.invalidParams,
      "tools/call needs a tool name.",
    );
  const parsed = parseToolCall(params.name, params.arguments ?? {});

  switch (parsed.kind) {
    case "parsed":
      return { kind: "callTool", id, call: parsed.call };

    case "invalid":
      return { kind: "toolInputError", id, message: parsed.message };

    case "unknown":
      return failure(
        400,
        id,
        errorCodes.invalidParams,
        `Unknown tool ${params.name}.`,
      );
  }
}

/** Requests repeat routing fields in headers so proxies need not read the body. */
function headerMismatch(
  headers: Headers,
  method: string,
  name: string | undefined,
): string | undefined {
  if (headers.get("MCP-Protocol-Version") !== protocolVersion)
    return "MCP-Protocol-Version must match the protocolVersion in _meta.";

  if (headerValue(headers.get("Mcp-Method")) !== method)
    return "Mcp-Method must match the request method.";

  if (method === "tools/call" && headerValue(headers.get("Mcp-Name")) !== name)
    return "Mcp-Name must match the tool name.";
}

const base64Sentinel = /^=\?base64\?([A-Za-z0-9+/]*={0,2})\?=$/;

/** Decodes the =?base64?…?= form clients use for values headers can't carry. */
function headerValue(value: string | null): string | null {
  const encoded = value === null ? undefined : base64Sentinel.exec(value)?.[1];

  if (encoded === undefined) return value;

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)),
    );
  } catch {
    // Handled: an undecodable value cannot match the body.
    return null;
  }
}

const serverInfo = { name: "kvitto", version: "0.1.0" };

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
