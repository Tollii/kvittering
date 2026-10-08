import { v } from "convex/values";
import {
  env,
  internalAction,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./serverFunctions";
import { clientMutation as mutation } from "./clientFunctions";
import { requireMember } from "./access";
import { userError } from "./userErrors";
import { featureEnabled } from "./featureFlags";
import { beginUploadedReceipt } from "./receiptUploadCompletion";
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

/** How long one sync may hold the connection before another may start. */
const syncLeaseMs = 5 * 60 * 1000;

const tokensValidator = {
  accessToken: v.string(),
  accessExpiresAt: v.number(),
  refreshToken: v.optional(v.string()),
};

export const signInExpiredMessage =
  "Innloggingen er utløpt. Gå tilbake til Kvitto og prøv igjen.";

export const odaCallbackUrl = () => `${env.CONVEX_SITE_URL}/oda/callback`;

/** A member's own Oda account, if they connected one. */
const connectionOf = (ctx: QueryCtx | MutationCtx, identity: string) =>
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

/**
 * Finish signing in from the app that started it. The confirmation reaches
 * only the browser that signed in at Oda, so a forwarded sign-in link cannot
 * connect someone else's Oda account to this household.
 */
export const confirm = mutation({
  args: { confirmation: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);

    const row = await ctx.db
      .query("odaAuthorizations")
      .withIndex("by_confirmation", (q) =>
        q.eq("pending.confirmation", args.confirmation),
      )
      .unique();

    if (
      !row?.pending ||
      !row.signIn ||
      row.identity !== member.identity ||
      row.expiresAt < Date.now()
    )
      throw userError("Innloggingen hos Oda er utløpt. Prøv igjen.");
    await ctx.db.delete("odaAuthorizations", row._id);

    const { confirmation: _, ...tokens } = row.pending;
    const existing = await connectionOf(ctx, member.identity);

    const fields = {
      householdId: member.householdId,
      clientId: row.signIn.clientId,
      ...tokens,
      expired: false,
      error: undefined,
      syncingUntil: undefined,
    };

    let id = existing?._id;

    if (id) await ctx.db.patch("odaConnections", id, fields);
    else
      id = await ctx.db.insert("odaConnections", {
        ...fields,
        identity: member.identity,
        importedCount: 0,
      });

    console.info("oda.connected", { connectionId: id });
    await ctx.scheduler.runAfter(0, internal.oda.syncConnection, { id });

    return null;
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

/** Attach the OAuth sign-in once; a second visit to the link is refused. */
export const beginAuthorization = internalMutation({
  args: {
    request: v.string(),
    clientId: v.string(),
    state: v.string(),
    verifier: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { request, ...signIn }) => {
    const row = await ctx.db
      .query("odaAuthorizations")
      .withIndex("by_request", (q) => q.eq("request", request))
      .unique();

    if (!row || row.signIn || row.expiresAt < Date.now()) return false;
    await ctx.db.patch("odaAuthorizations", row._id, { signIn });

    return true;
  },
});

/** Take Oda's answer for the sign-in that `state` belongs to, once. */
export const completeAuthorization = internalMutation({
  args: { state: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("odaAuthorizations"),
      returnUrl: v.string(),
      clientId: v.string(),
      verifier: v.string(),
      expired: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("odaAuthorizations")
      .withIndex("by_state", (q) => q.eq("signIn.state", args.state))
      .unique();

    if (!row?.signIn || row.answered) return null;
    await ctx.db.patch("odaAuthorizations", row._id, { answered: true });

    return {
      id: row._id,
      returnUrl: row.returnUrl,
      clientId: row.signIn.clientId,
      verifier: row.signIn.verifier,
      expired: row.expiresAt < Date.now(),
    };
  },
});

/** Hold Oda's tokens until the app confirms the sign-in. */
export const holdTokens = internalMutation({
  args: {
    id: v.id("odaAuthorizations"),
    confirmation: v.string(),
    ...tokensValidator,
  },
  returns: v.null(),
  handler: async (ctx, { id, ...pending }) => {
    await ctx.db.patch("odaAuthorizations", id, { pending });

    return null;
  },
});

export const forgetAuthorization = internalMutation({
  args: { id: v.id("odaAuthorizations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await ctx.db.get("odaAuthorizations", args.id))
      await ctx.db.delete("odaAuthorizations", args.id);

    return null;
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

/** Claim the connection for one sync and return its tokens, or null. */
export const claimSync = internalMutation({
  args: { id: v.id("odaConnections") },
  returns: v.union(
    v.null(),
    v.object({ clientId: v.string(), ...tokensValidator }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("odaConnections", args.id);
    const now = Date.now();

    if (!row || row.expired || (row.syncingUntil ?? 0) > now) return null;
    await ctx.db.patch("odaConnections", args.id, {
      syncingUntil: now + syncLeaseMs,
    });

    return {
      clientId: row.clientId,
      accessToken: row.accessToken,
      accessExpiresAt: row.accessExpiresAt,
      refreshToken: row.refreshToken,
    };
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
        syncingUntil: undefined,
      });

    return null;
  },
});

/** Create a receipt for each order the household does not have yet. */
export const importOrders = internalMutation({
  args: {
    id: v.id("odaConnections"),
    orders: v.array(
      v.object({ orderNumber: v.string(), data: receiptDataValidator }),
    ),
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

    for (const { orderNumber, data } of args.orders) {
      const known = await ctx.db
        .query("receiptImports")
        .withIndex("by_householdId_and_provider_and_orderNumber", (q) =>
          q
            .eq("householdId", member.householdId)
            .eq("provider", "oda")
            .eq("orderNumber", orderNumber),
        )
        .unique();

      if (known) continue;

      const id: Id<"receipts"> = await ctx.db.insert("receipts", {
        householdId: member.householdId,
        uploadedBy: member.identity,
        uploaderName: member.name,
        clientId: `oda-${orderNumber}`,
        imageCount: 0,
        status: "uploading",
        revision: 0,
        generation: 0,
        data: null,
        provider: "pending",
        duplicateResolved: false,
        excluded: false,
      });

      await ctx.db.insert("receiptImports", {
        householdId: member.householdId,
        provider: "oda",
        orderNumber,
        receiptId: id,
        data,
      });
      await beginUploadedReceipt(ctx, id, 0);
      imported += 1;
    }

    console.info("oda.orders_imported", {
      connectionId: args.id,
      orderCount: args.orders.length,
      imported,
    });
    await ctx.db.patch("odaConnections", args.id, {
      householdId: member.householdId,
      lastSyncAt: Date.now(),
      importedCount: connection.importedCount + imported,
      error: undefined,
      syncingUntil: undefined,
    });

    return null;
  },
});

/** Read the latest Oda orders with a fresh access token and import new ones. */
export const syncConnection = internalAction({
  args: { id: v.id("odaConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.runMutation(internal.oda.claimSync, args);

    if (!connection) return null;

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
        orders: deliveredOrders(orders).map((order) => ({
          orderNumber: order.orderNumber,
          data: orderReceipt(order),
        })),
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
  args: { cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("odaConnections")
      .paginate({ numItems: 200, cursor: cursor ?? null });

    // An expired or busy connection is skipped when its sync starts.
    for (const [index, connection] of page.page.entries())
      await ctx.scheduler.runAfter(index * 2000, internal.oda.syncConnection, {
        id: connection._id,
      });

    if (!page.isDone)
      await ctx.scheduler.runAfter(
        page.page.length * 2000,
        internal.oda.syncAll,
        { cursor: page.continueCursor },
      );

    return null;
  },
});
