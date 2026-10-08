import { z } from "zod";
import { CalendarDate } from "../src/lib/domain/calendar";
import { Ore } from "../src/lib/domain/ore";
import {
  emptyLine,
  validateReceipt,
  type ReceiptData,
  type ReceiptLine,
} from "../src/lib/domain/receipt";
import { unclearCategoryId } from "../src/lib/domain/categories";
import { base64Url } from "./tokens";

/**
 * Oda's official MCP server, the same one AI assistants connect to. A person
 * signs in at Oda with OAuth, so Kvitto never sees their password.
 */
export const odaResource = "https://oda.com/mcp";

const authorizationServer = "https://oda.com/o";

/** Only delivered orders are purchases; the first sync reads the latest few. */
export const odaOrderPageSize = 10;

const tokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive().optional(),
});

const tokenError = z.object({ error: z.string().optional() });

export type OdaTokens = {
  accessToken: string;
  refreshToken?: string;
  accessExpiresAt: number;
};

/** Oda rejected the saved sign-in; the person has to log in again. */
export class OdaSignInExpired extends Error {}

/** Registers Kvitto as an OAuth client for one callback URL. */
export async function registerOdaClient(redirectUri: string): Promise<string> {
  const response = await fetch(`${authorizationServer}/register/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Kvitto",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp",
    }),
  });

  if (!response.ok)
    throw new Error(`Oda client registration failed: ${response.status}`);

  return z.object({ client_id: z.string().min(1) }).parse(await response.json())
    .client_id;
}

export function odaAuthorizationUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}) {
  const url = new URL(`${authorizationServer}/authorize/`);

  url.search = new URLSearchParams({
    response_type: "code",
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    scope: "mcp",
    state: args.state,
    code_challenge: args.challenge,
    code_challenge_method: "S256",
    resource: odaResource,
  }).toString();

  return url.toString();
}

async function requestTokens(
  fields: Record<string, string>,
): Promise<OdaTokens> {
  const started = Date.now();

  const response = await fetch(`${authorizationServer}/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...fields, resource: odaResource }),
  });

  if (!response.ok) {
    const { error } = tokenError.parse(await response.json().catch(() => ({})));

    // Only a refused grant means the person must sign in again.
    throw new (error === "invalid_grant" ? OdaSignInExpired : Error)(
      `Oda token request failed: ${response.status} ${error ?? ""}`.trim(),
    );
  }

  const tokens = tokenResponse.parse(await response.json());

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessExpiresAt: started + (tokens.expires_in ?? 3600) * 1000,
  };
}

export const exchangeOdaCode = (args: {
  clientId: string;
  redirectUri: string;
  code: string;
  verifier: string;
}) =>
  requestTokens({
    grant_type: "authorization_code",
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    code: args.code,
    code_verifier: args.verifier,
  });

export const refreshOdaTokens = (clientId: string, refreshToken: string) =>
  requestTokens({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refreshToken,
  });

export async function revokeOdaToken(clientId: string, token: string) {
  const response = await fetch(`${authorizationServer}/revoke_token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, token }),
  });

  if (!response.ok)
    throw new Error(`Oda token revocation failed: ${response.status}`);
}

export async function pkceChallenge(verifier: string) {
  return base64Url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  );
}

const jsonRpcResponse = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  result: z.unknown().optional(),
  error: z.object({ message: z.string() }).optional(),
});

/** A Streamable HTTP response is either JSON or a server-sent event stream. */
async function readRpc(response: Response, id: number) {
  const text = await response.text();

  const messages = response.headers
    .get("Content-Type")
    ?.includes("text/event-stream")
    ? text
        .split(/\r?\n\r?\n/)
        .map((event) =>
          event
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n"),
        )
        .filter((data) => data.startsWith("{"))
        .map((data) => jsonRpcResponse.parse(JSON.parse(data)))
    : [jsonRpcResponse.parse(JSON.parse(text))];

  const message = messages.find((candidate) => candidate.id === id);

  if (!message) throw new Error("Oda svarte ikke på forespørselen.");

  if (message.error) throw new Error(`Oda: ${message.error.message}`);

  return message.result;
}

const toolResult = z.object({
  isError: z.boolean().optional(),
  structuredContent: z.unknown().optional(),
  content: z
    .array(z.object({ type: z.string(), text: z.string().optional() }))
    .default([]),
});

/** Arguments for an Oda tool: plain page and size values. */
type ToolArguments = Readonly<Record<string, string | number>>;

/** Opens an MCP session, calls one tool, and parses its answer. */
export async function callOdaTool<Output>(
  accessToken: string,
  name: string,
  args: ToolArguments,
  output: z.ZodType<Output>,
): Promise<Output> {
  const headers = new Headers({
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  });

  async function post(body: string) {
    const response = await fetch(odaResource, {
      method: "POST",
      headers,
      body,
    });

    if (response.status === 401 || response.status === 403)
      throw new OdaSignInExpired(
        `Oda rejected the access token: ${response.status}`,
      );

    if (!response.ok) throw new Error(`Oda MCP failed: ${response.status}`);

    return response;
  }

  const initialized = await post(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "kvitto", version: "1.0.0" },
      },
    }),
  );

  const session = initialized.headers.get("Mcp-Session-Id");

  if (session) headers.set("Mcp-Session-Id", session);
  await readRpc(initialized, 1);
  headers.set("MCP-Protocol-Version", "2025-06-18");
  await post(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  );

  const result = toolResult.parse(
    await readRpc(
      await post(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name, arguments: args },
        }),
      ),
      2,
    ),
  );

  const text = result.content.find((part) => part.type === "text")?.text;

  if (result.isError) throw new Error(`Oda: ${text ?? name} failed.`);

  return output.parse(result.structuredContent ?? JSON.parse(text ?? "null"));
}

const amount = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const parsed = Ore.parse(String(value));

  if (parsed.kind === "amount" && parsed.ore !== null) return parsed.ore;
  ctx.addIssue({ code: "custom", message: `Invalid Oda amount ${value}` });

  return z.NEVER;
});

const odaOrder = z.object({
  orderNumber: z.string().min(1),
  deliveryDate: z.string(),
  currency: z.string().nullish(),
  grossAmount: amount,
  products: z.array(
    z.object({
      product: z.object({
        id: z.number(),
        name: z.string(),
        unitPrice: amount.nullish(),
        brand: z.string().nullish(),
      }),
      quantity: z.number().positive(),
      totalGrossAmount: amount,
    }),
  ),
});

export const odaOrders = z.object({ orders: z.array(odaOrder) });

export type OdaOrder = z.infer<typeof odaOrder>;

/** Delivered orders only: a future delivery is not yet a purchase. */
export function deliveredOrders(orders: OdaOrder[], time = Date.now()) {
  const today = CalendarDate.today(time);

  return orders.filter((order) => {
    const date = CalendarDate.parse(order.deliveryDate);

    return date !== null && CalendarDate.compare(date, today) <= 0;
  });
}

/**
 * The order as receipt evidence. Oda reports what each item cost but not the
 * discounts, deposits and delivery fee behind the charged total, so any
 * difference stays visible as one adjustment line instead of being guessed.
 */
export function orderReceipt(order: OdaOrder): ReceiptData {
  const lines: ReceiptLine[] = order.products.map((item, index) => {
    const text = `${item.product.name}  ${item.quantity} x ${Ore.formatInput(item.product.unitPrice ?? null)}`;

    return {
      ...emptyLine(`oda-${order.orderNumber}-${index + 1}`),
      originalText: text,
      name: item.product.name,
      receiptName: item.product.name,
      amountOre: item.totalGrossAmount,
      quantity: item.quantity,
      unitPriceOre: item.product.unitPrice ?? null,
      brand: item.product.brand ?? null,
      manual: false,
      categoryId: unclearCategoryId,
    };
  });

  const difference = Ore.subtract(
    order.grossAmount,
    Ore.sum(lines.map((line) => line.amountOre ?? Ore.zero)),
  );

  if (difference !== 0)
    lines.push({
      ...emptyLine(`oda-${order.orderNumber}-adjustment`),
      kind: "adjustment",
      originalText: "Rabatter, pant og levering (ikke spesifisert av Oda)",
      name: "Rabatter, pant og levering",
      amountOre: difference,
      manual: false,
      categoryId: null,
    });

  return validateReceipt({
    physicalStore: null,
    store: "Oda",
    branch: null,
    purchaseDate: CalendarDate.parse(order.deliveryDate),
    purchaseTime: null,
    receiptNumber: order.orderNumber,
    currency: order.currency ?? "NOK",
    totalOre: order.grossAmount,
    originalText: [
      `Oda bestilling ${order.orderNumber}`,
      `Levert ${order.deliveryDate}`,
      ...lines.map(
        (line) =>
          `${line.originalText}  ${Ore.formatInput(line.amountOre ?? null)}`,
      ),
      `Totalt ${Ore.formatInput(order.grossAmount)}`,
    ].join("\n"),
    lines,
    issues: [],
  });
}
