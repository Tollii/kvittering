import { v } from "convex/values";
import { start as startWorkflow } from "@convex-dev/workflow";
import {
  env,
  internalAction,
  internalQuery,
  query,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./serverFunctions";
import { clientMutation as mutation } from "./clientFunctions";
import { requireMember } from "./access";
import { userError } from "./userErrors";
import { trackWorkflow } from "./retention";
import { featureEnabled } from "./featureFlags";
import { receiptDataValidator } from "../src/lib/domain/receipt";
import { errorDetails } from "../src/lib/diagnostics";
import {
  callOdaTool,
  deliveredOrders,
  odaOrderPageSize,
  odaOrders,
  OdaSignInExpired,
  orderReceipt,
  refreshOdaTokens,
  revokeOdaToken,
} from "./odaApi";

const authorizationLifetimeMs = 10 * 60 * 1000;

const syncIntervalMs = 60 * 1000;

export const odaCallbackUrl = () => `${env.CONVEX_SITE_URL}/oda/callback`;

/** A member's own Oda account, if they connected one. */
const connectionOf = (ctx: QueryCtx, identity: string) =>
  ctx.db
    .query("odaConnections")
    .withIndex("by_identity", (q) => q.eq("identity", identity))
    .unique();

/** What the settings screen shows about the member's own Oda account. */
export const status = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      expired: v.boolean(),
      lastSyncAt: v.union(v.number(), v.null()),
      importedCount: v.number(),
      error: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const member = await requireMember(ctx);
    const connection = await connectionOf(ctx, member.identity);

    return connection
      ? {
          expired: connection.expired,
          lastSyncAt: connection.lastSyncAt ?? null,
          importedCount: connection.importedCount,
          error: connection.error ?? null,
        }
      : null;
  },
});

/**
 * Begin signing in at Oda. The app generates `request` and opens the returned
 * URL in a browser session; Oda's callback returns to `returnUrl`.
 */
export const start = mutation({
  args: { request: v.string(), returnUrl: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);

    if (!/^[\w-]{32,80}$/.test(args.request) || !isReturnUrl(args.returnUrl))
      throw userError("Ugyldig innlogging.");

    for (const old of await ctx.db
      .query("odaAuthorizations")
      .withIndex("by_identity", (q) => q.eq("identity", member.identity))
      .take(20))
      await ctx.db.delete("odaAuthorizations", old._id);

    await ctx.db.insert("odaAuthorizations", {
      request: args.request,
      identity: member.identity,
      householdId: member.householdId,
      returnUrl: args.returnUrl,
      expiresAt: Date.now() + authorizationLifetimeMs,
    });

    return `${env.CONVEX_SITE_URL}/oda/authorize?request=${args.request}`;
  },
});

/** Schemes a browser handles itself, so they cannot be the app's link back. */
const browserSchemes = new Set([
  "http:",
  "https:",
  "javascript:",
  "data:",
  "file:",
]);

/** The app's own link back, or the web app; never another web page. */
function isReturnUrl(text: string) {
  if (!URL.canParse(text)) return false;

  const url = new URL(text);

  return (
    !browserSchemes.has(url.protocol) ||
    (!!env.SITE_URL && url.origin === new URL(env.SITE_URL).origin) ||
    url.hostname === "localhost"
  );
}

/** Fetch new Oda orders now instead of waiting for the next scheduled sync. */
export const sync = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const member = await requireMember(ctx);
    const connection = await connectionOf(ctx, member.identity);

    if (!connection) throw userError("Logg inn med Oda først.");

    if (connection.expired) throw userError("Logg inn med Oda på nytt.");

    if (Date.now() - (connection.lastSyncAt ?? 0) > syncIntervalMs)
      await ctx.scheduler.runAfter(0, internal.oda.syncConnection, {
        id: connection._id,
      });

    return null;
  },
});

/** Forget the Oda account. Receipts already imported stay. */
export const disconnect = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const member = await requireMember(ctx);
    const connection = await connectionOf(ctx, member.identity);

    if (connection) {
      await ctx.db.delete("odaConnections", connection._id);
      await ctx.scheduler.runAfter(0, internal.oda.revoke, {
        clientId: connection.clientId,
        token: connection.refreshToken ?? connection.accessToken,
      });
    }

    return null;
  },
});

export const authorization = internalQuery({
  args: { request: v.string() },
  returns: v.union(
    v.null(),
    v.object({ expired: v.boolean(), started: v.boolean() }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("odaAuthorizations")
      .withIndex("by_request", (q) => q.eq("request", args.request))
      .unique();

    return row
      ? { expired: row.expiresAt < Date.now(), started: !!row.state }
      : null;
  },
});

/** Attach OAuth state and the PKCE verifier once; a second visit is refused. */
export const beginAuthorization = internalMutation({
  args: { request: v.string(), state: v.string(), verifier: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("odaAuthorizations")
      .withIndex("by_request", (q) => q.eq("request", args.request))
      .unique();

    if (!row || row.state || row.expiresAt < Date.now()) return false;
    await ctx.db.patch("odaAuthorizations", row._id, {
      state: args.state,
      verifier: args.verifier,
    });

    return true;
  },
});

/** Use up the sign-in that `state` belongs to. */
export const completeAuthorization = internalMutation({
  args: { state: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      identity: v.string(),
      householdId: v.id("households"),
      returnUrl: v.string(),
      verifier: v.string(),
      expired: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("odaAuthorizations")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .unique();

    if (!row?.verifier) return null;
    await ctx.db.delete("odaAuthorizations", row._id);

    return {
      identity: row.identity,
      householdId: row.householdId,
      returnUrl: row.returnUrl,
      verifier: row.verifier,
      expired: row.expiresAt < Date.now(),
    };
  },
});

export const registeredClient = internalQuery({
  args: { redirectUri: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("odaClients")
      .withIndex("by_redirectUri", (q) => q.eq("redirectUri", args.redirectUri))
      .first();

    return row?.clientId ?? null;
  },
});

export const saveClient = internalMutation({
  args: { redirectUri: v.string(), clientId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("odaClients", args);

    return null;
  },
});

const tokensValidator = {
  accessToken: v.string(),
  accessExpiresAt: v.number(),
  refreshToken: v.optional(v.string()),
};

/** Save the member's Oda account and import their recent orders. */
export const connect = internalMutation({
  args: {
    identity: v.string(),
    householdId: v.id("households"),
    clientId: v.string(),
    ...tokensValidator,
  },
  returns: v.null(),
  handler: async (ctx, { identity, householdId, clientId, ...tokens }) => {
    const existing = await ctx.db
      .query("odaConnections")
      .withIndex("by_identity", (q) => q.eq("identity", identity))
      .unique();

    const fields = {
      householdId,
      clientId,
      ...tokens,
      expired: false,
      error: undefined,
    };

    const id = existing
      ? existing._id
      : await ctx.db.insert("odaConnections", {
          ...fields,
          identity,
          importedCount: 0,
        });

    if (existing) await ctx.db.patch("odaConnections", id, fields);
    console.info("oda.connected", { connectionId: id });
    await ctx.scheduler.runAfter(0, internal.oda.syncConnection, { id });

    return null;
  },
});

export const connection = internalQuery({
  args: { id: v.id("odaConnections") },
  returns: v.union(
    v.null(),
    v.object({
      clientId: v.string(),
      expired: v.boolean(),
      ...tokensValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("odaConnections", args.id);

    return row
      ? {
          clientId: row.clientId,
          expired: row.expired,
          accessToken: row.accessToken,
          accessExpiresAt: row.accessExpiresAt,
          refreshToken: row.refreshToken,
        }
      : null;
  },
});

export const saveTokens = internalMutation({
  args: { id: v.id("odaConnections"), ...tokensValidator },
  returns: v.null(),
  handler: async (ctx, { id, ...tokens }) => {
    const row = await ctx.db.get("odaConnections", id);

    if (row)
      await ctx.db.patch("odaConnections", id, {
        ...tokens,
        refreshToken: tokens.refreshToken ?? row.refreshToken,
      });

    return null;
  },
});

export const recordFailure = internalMutation({
  args: { id: v.id("odaConnections"), error: v.string(), expired: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await ctx.db.get("odaConnections", args.id))
      await ctx.db.patch("odaConnections", args.id, {
        error: args.error,
        expired: args.expired,
        lastSyncAt: Date.now(),
      });

    return null;
  },
});

/** Create a receipt for each order the household does not have yet. */
export const importOrders = internalMutation({
  args: {
    id: v.id("odaConnections"),
    receipts: v.array(receiptDataValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get("odaConnections", args.id);

    if (!connection) return null;

    const member = await ctx.db
      .query("members")
      .withIndex("by_identity", (q) => q.eq("identity", connection.identity))
      .unique();

    // A paused receipt service also pauses imports; the next sync picks them up.
    if (!member || !(await featureEnabled(ctx, "receiptProcessing")))
      return null;

    let imported = 0;

    for (const data of args.receipts) {
      const clientId = `oda-${data.receiptNumber}`;

      const existing = await ctx.db
        .query("receipts")
        .withIndex("by_householdId_and_clientId", (q) =>
          q.eq("householdId", member.householdId).eq("clientId", clientId),
        )
        .unique();

      if (existing) continue;

      const id: Id<"receipts"> = await ctx.db.insert("receipts", {
        householdId: member.householdId,
        uploadedBy: member.identity,
        uploaderName: member.name,
        clientId,
        imageCount: 0,
        status: "uploaded",
        revision: 0,
        generation: 1,
        data: null,
        provider: "pending",
        duplicateResolved: false,
        excluded: false,
      });

      const workflowId = await startWorkflow(
        ctx,
        internal.processing.processReceipt,
        { id, generation: 1, imported: { data, provider: "oda" } },
        {
          onComplete: internal.retention.workflowCompleted,
          context: { component: "processing", receiptId: id },
        },
      );

      await trackWorkflow(ctx, workflowId, "processing", id);
      imported += 1;
    }

    console.info("oda.orders_imported", {
      connectionId: args.id,
      orderCount: args.receipts.length,
      imported,
    });
    await ctx.db.patch("odaConnections", args.id, {
      householdId: member.householdId,
      lastSyncAt: Date.now(),
      importedCount: connection.importedCount + imported,
      error: undefined,
    });

    return null;
  },
});

/** Read the latest Oda orders with a fresh access token and import new ones. */
export const syncConnection = internalAction({
  args: { id: v.id("odaConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.runQuery(internal.oda.connection, args);

    if (!connection || connection.expired) return null;

    try {
      let { accessToken } = connection;

      if (connection.accessExpiresAt < Date.now() + 60_000) {
        if (!connection.refreshToken)
          throw new OdaSignInExpired("No refresh token.");

        const tokens = await refreshOdaTokens(
          connection.clientId,
          connection.refreshToken,
        );

        await ctx.runMutation(internal.oda.saveTokens, { ...args, ...tokens });
        accessToken = tokens.accessToken;
      }

      const { orders } = await callOdaTool(
        accessToken,
        "get_orders",
        { page: 1, size: odaOrderPageSize },
        odaOrders,
      );

      await ctx.runMutation(internal.oda.importOrders, {
        ...args,
        receipts: deliveredOrders(orders).map(orderReceipt),
      });
    } catch (error) {
      const expired = error instanceof OdaSignInExpired;

      console.error("oda.sync_failed", {
        connectionId: args.id,
        expired,
        errorType: errorDetails(error).errorType,
      });
      await ctx.runMutation(internal.oda.recordFailure, {
        ...args,
        expired,
        error: expired
          ? "Innloggingen hos Oda er utløpt. Logg inn på nytt."
          : "Kunne ikke hente bestillinger fra Oda. Prøver igjen senere.",
      });
    }

    return null;
  },
});

/** Tell Oda to forget the sign-in; the account is already gone from Kvitto. */
export const revoke = internalAction({
  args: { clientId: v.string(), token: v.string() },
  returns: v.null(),
  handler: async (_ctx, args) => {
    await revokeOdaToken(args.clientId, args.token);

    return null;
  },
});

/** Scheduled: look for new orders on every Oda account that is still signed in. */
export const syncAll = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const connections = await ctx.db.query("odaConnections").take(500);

    for (const [index, connection] of connections.entries())
      if (!connection.expired)
        await ctx.scheduler.runAfter(
          index * 2000,
          internal.oda.syncConnection,
          {
            id: connection._id,
          },
        );

    return null;
  },
});
