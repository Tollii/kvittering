import { z } from "zod";

const latestVersion = "2025-11-25";

/** The server answers with the client's version when it is listed. */
const protocolVersions = new Set([latestVersion, "2025-06-18", "2025-03-26"]);

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
} as const;

/** One message from a stateless Streamable HTTP client. */
export type McpMessage =
  | { kind: "initialize"; id: RequestId; protocolVersion: string }
  | { kind: "ping"; id: RequestId }
  | { kind: "listTools"; id: RequestId }
  | {
      kind: "callTool";
      id: RequestId;
      name: string;
      arguments: Record<string, JsonValue>;
    }
  /** Notifications and client responses need no answer. */
  | { kind: "acknowledge" }
  | { kind: "unknownMethod"; id: RequestId; method: string }
  | {
      kind: "invalid";
      id: RequestId | null;
      code: (typeof errorCodes)[keyof typeof errorCodes];
      message: string;
    };

export function parseMcpMessage(text: string): McpMessage {
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

  if (id === undefined || method === undefined) return { kind: "acknowledge" };

  switch (method) {
    case "initialize":
      return {
        kind: "initialize",
        id,
        protocolVersion:
          initializeParams.safeParse(params).data?.protocolVersion ?? "",
      };

    case "ping":
      return { kind: "ping", id };

    case "tools/list":
      return { kind: "listTools", id };

    case "tools/call": {
      const call = toolCallParams.safeParse(params);

      return call.success
        ? {
            kind: "callTool",
            id,
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
      return { kind: "unknownMethod", id, method };
  }
}

export function negotiatedVersion(requested: string): string {
  return protocolVersions.has(requested) ? requested : latestVersion;
}

export const jsonRpcResult = <Result>(id: RequestId, result: Result) => ({
  jsonrpc: "2.0" as const,
  id,
  result,
});

export const jsonRpcError = (
  id: RequestId | null,
  code: number,
  message: string,
) => ({ jsonrpc: "2.0" as const, id, error: { code, message } });
