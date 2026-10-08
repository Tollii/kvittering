import { z } from "zod";

/** Stateless revision: every request carries its version, no initialize. */
export const modernVersion = "2026-07-28";

const latestLegacyVersion = "2025-11-25";

/** Session-era revisions that start with initialize. */
const legacyVersions = [latestLegacyVersion, "2025-06-18", "2025-03-26"];

export const supportedVersions = [modernVersion, ...legacyVersions];

const metaKey = {
  protocolVersion: "io.modelcontextprotocol/protocolVersion",
  serverInfo: "io.modelcontextprotocol/serverInfo",
} as const;

const requestId = z.union([z.string(), z.number()]);

export type RequestId = z.infer<typeof requestId>;

export type JsonValue = z.infer<ReturnType<typeof z.json>>;

const message = z.object({
  jsonrpc: z.literal("2.0"),
  id: requestId.optional(),
  method: z.string().optional(),
  params: z.json().optional(),
});

const initializeParams = z.object({ protocolVersion: z.string() });

const modernParams = z.object({
  _meta: z.object({ [metaKey.protocolVersion]: z.string() }),
});

const toolCallParams = z.object({
  name: z.string(),
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

export const errorCodes = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  headerMismatch: -32020,
  unsupportedVersion: -32022,
} as const;

/**
 * "modern" requests follow 2026-07-28 and name their version in _meta;
 * "legacy" requests follow a session-era revision.
 */
export type Era = "legacy" | "modern";

/** One message from a stateless Streamable HTTP client. */
export type McpMessage =
  /** protocolVersion is already negotiated. */
  | { kind: "initialize"; id: RequestId; protocolVersion: string }
  | { kind: "discover"; id: RequestId }
  | { kind: "ping"; id: RequestId }
  | { kind: "listTools"; id: RequestId; era: Era }
  | {
      kind: "callTool";
      id: RequestId;
      era: Era;
      name: string;
      arguments: Record<string, JsonValue>;
    }
  | { kind: "acknowledge" }
  | { kind: "unknownMethod"; id: RequestId; era: Era; method: string }
  | {
      kind: "invalid";
      id: RequestId | null;
      code: (typeof errorCodes)[keyof typeof errorCodes];
      message: string;
      data?: JsonValue;
    };

/** Reads one POST body; headers matter only for 2026-07-28 requests. */
export function parseMcpMessage(text: string, headers: Headers): McpMessage {
  const json = readJson(text);

  if (json.kind === "malformed")
    return {
      kind: "invalid",
      id: null,
      code: errorCodes.parse,
      message: "Body is not JSON.",
    };
  const parsed = message.safeParse(json.value);

  if (!parsed.success)
    return {
      kind: "invalid",
      id: null,
      code: errorCodes.invalidRequest,
      message: "Send one JSON-RPC 2.0 message per request.",
    };
  const { id, method, params } = parsed.data;

  // This server sends no requests, so every message must name a method.
  if (method === undefined)
    return {
      kind: "invalid",
      id: id ?? null,
      code: errorCodes.invalidRequest,
      message: "A JSON-RPC request needs a method.",
    };

  // Notifications need no answer.
  if (id === undefined) return { kind: "acknowledge" };

  const version =
    modernParams.safeParse(params).data?._meta[metaKey.protocolVersion];

  if (version === undefined) return legacyRequest(id, method, params);
  const mismatch = headerMismatch(headers, { version, method, params });

  if (mismatch)
    return {
      kind: "invalid",
      id,
      code: errorCodes.headerMismatch,
      message: mismatch,
    };

  if (version !== modernVersion)
    return {
      kind: "invalid",
      id,
      code: errorCodes.unsupportedVersion,
      message: "Unsupported protocol version",
      data: { supported: supportedVersions, requested: version },
    };

  return request(id, "modern", method, params);
}

function legacyRequest(
  id: RequestId,
  method: string,
  params: JsonValue | undefined,
): McpMessage {
  switch (method) {
    case "initialize":
      return {
        kind: "initialize",
        id,
        protocolVersion: negotiatedVersion(
          initializeParams.safeParse(params).data?.protocolVersion,
        ),
      };

    case "ping":
      return { kind: "ping", id };

    default:
      return request(id, "legacy", method, params);
  }
}

/** Methods both eras share; 2026-07-28 removed initialize and ping. */
function request(
  id: RequestId,
  era: Era,
  method: string,
  params: JsonValue | undefined,
): McpMessage {
  switch (method) {
    case "server/discover":
      return { kind: "discover", id };

    case "tools/list":
      return { kind: "listTools", id, era };

    case "tools/call": {
      const call = toolCallParams.safeParse(params);

      return call.success
        ? {
            kind: "callTool",
            id,
            era,
            name: call.data.name,
            arguments: call.data.arguments ?? {},
          }
        : {
            kind: "invalid",
            id,
            code: errorCodes.invalidParams,
            message: "tools/call needs a tool name.",
          };
    }

    default:
      return { kind: "unknownMethod", id, era, method };
  }
}

const nameParams = z.object({ name: z.string() });

/** 2026-07-28 repeats routing fields in headers; they must match the body. */
function headerMismatch(
  headers: Headers,
  body: { version: string; method: string; params: JsonValue | undefined },
): string | undefined {
  if (headers.get("MCP-Protocol-Version") !== body.version)
    return "MCP-Protocol-Version must match the protocolVersion in _meta.";

  if (headerValue(headers.get("Mcp-Method")) !== body.method)
    return "Mcp-Method must match the request method.";
  const name = nameParams.safeParse(body.params).data?.name;

  if (
    body.method === "tools/call" &&
    name !== undefined &&
    headerValue(headers.get("Mcp-Name")) !== name
  )
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

function negotiatedVersion(requested: string | undefined): string {
  return requested && legacyVersions.includes(requested)
    ? requested
    : latestLegacyVersion;
}

export const serverInfo = { name: "kvitto", version: "0.1.0" };

/** 2026-07-28 results say they are final and name the server. */
export const modernResult = <Result extends object>(result: Result) => ({
  ...result,
  resultType: "complete" as const,
  _meta: { [metaKey.serverInfo]: serverInfo },
});

export const jsonRpcResult = <Result>(id: RequestId, result: Result) => ({
  jsonrpc: "2.0" as const,
  id,
  result,
});

export const jsonRpcError = (
  id: RequestId | null,
  code: number,
  message: string,
  data?: JsonValue,
) => ({
  jsonrpc: "2.0" as const,
  id,
  error: data === undefined ? { code, message } : { code, message, data },
});
