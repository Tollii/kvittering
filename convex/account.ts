import { v } from "convex/values";
import { z } from "zod";
import { components, internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { action, internalQuery, type MutationCtx } from "./_generated/server";
import { revokeAppleAccess } from "./appleSignIn";
import { requireCompatibleClient } from "./releasePolicy";
import { internalMutation } from "./serverFunctions";
import { userError } from "./userErrors";
import { clientValidator } from "../src/lib/releases/policy";

/** The component types adapter results as `any`; only the Apple subject is needed. */
const appleAccount = z.object({ accountId: z.string() }).nullable();

const deletedPage = z.object({
  isDone: z.boolean(),
  continueCursor: z.string(),
});

/** Whether deletion must revoke an Apple sign-in; read before anything is removed. */
export const deletionPlan = internalQuery({
  args: { userId: v.string(), client: clientValidator.optional() },
  returns: v.object({ appleAccountId: v.union(v.string(), v.null()) }),
  handler: async (ctx, { userId, client }) => {
    await requireCompatibleClient(ctx, client);

    const account: unknown = await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: "account",
        where: [
          { field: "userId", value: userId },
          { field: "providerId", value: "apple" },
        ],
      },
    );

    return { appleAccountId: appleAccount.parse(account)?.accountId ?? null };
  },
});

/**
 * Delete the signed-in account. An Apple sign-in is revoked first, with a
 * fresh authorization code from the app, so a failed revocation deletes
 * nothing. The last member takes the household's receipts with them; a member
 * who shares the household leaves it, and its receipts stay with the other.
 */
export const remove = action({
  args: {
    client: clientValidator.optional(),
    appleAuthorizationCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) throw userError("Logg inn først.");

    const { appleAccountId } = await ctx.runQuery(
      internal.account.deletionPlan,
      { userId: identity.subject, client: args.client },
    );

    if (appleAccountId !== null) {
      if (!args.appleAuthorizationCode)
        throw userError("Bekreft med Apple for å slette kontoen.");
      await revokeAppleAccess(args.appleAuthorizationCode, appleAccountId);
    }

    await ctx.runMutation(internal.account.deleteAccount, {
      identity: identity.tokenIdentifier,
      userId: identity.subject,
    });

    return null;
  },
});

async function deleteAuthRecords(
  ctx: MutationCtx,
  model: "session" | "account",
  userId: string,
) {
  let cursor: string | null = null;
  let done = false;

  while (!done) {
    const page: unknown = await ctx.runMutation(
      components.betterAuth.adapter.deleteMany,
      {
        input: { model, where: [{ field: "userId", value: userId }] },
        paginationOpts: { cursor, numItems: 100 },
      },
    );

    const parsed = deletedPage.parse(page);

    done = parsed.isDone;
    cursor = parsed.continueCursor;
  }
}

export const deleteAccount = internalMutation({
  args: { identity: v.string(), userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { identity, userId }) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_identity", (q) => q.eq("identity", identity))
      .unique();

    if (member) {
      await ctx.db.delete("members", member._id);

      const remaining = await ctx.db
        .query("members")
        .withIndex("by_householdId", (q) =>
          q.eq("householdId", member.householdId),
        )
        .first();

      // Removing the household first ends its invitation and every read.
      if (!remaining) {
        await ctx.db.delete("households", member.householdId);
        await ctx.scheduler.runAfter(0, internal.account.purgeHousehold, {
          householdId: member.householdId,
          stage: 0,
        });
      }
    }

    // Stop imports now; Oda forgets the sign-in in the background.
    const oda = await ctx.db
      .query("odaConnections")
      .withIndex("by_identity", (q) => q.eq("identity", identity))
      .unique();

    if (oda) {
      await ctx.db.delete("odaConnections", oda._id);
      await ctx.scheduler.runAfter(0, internal.oda.revoke, {
        clientId: oda.clientId,
        token: oda.refreshToken ?? oda.accessToken,
      });
    }

    await ctx.scheduler.runAfter(0, internal.account.purgeIdentity, {
      identity,
      stage: 0,
    });

    await deleteAuthRecords(ctx, "session", userId);
    await deleteAuthRecords(ctx, "account", userId);
    await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
      input: { model: "user", where: [{ field: "_id", value: userId }] },
    });

    return null;
  },
});

const batchSize = 100;

async function removeRows<Table extends TableNames>(
  ctx: MutationCtx,
  table: Table,
  rows: Doc<Table>[],
) {
  for (const row of rows) await ctx.db.delete(table, row._id);

  return rows.length;
}

/** Each step removes one batch of a member's own records and returns its size. */
const identitySteps: ((
  ctx: MutationCtx,
  identity: string,
) => Promise<number>)[] = [
  async (ctx, identity) => {
    const subscriptions = await ctx.db
      .query("deviceSubscriptions")
      .withIndex("by_identity", (q) => q.eq("identity", identity))
      .take(10);

    for (const subscription of subscriptions) {
      const reminders = await ctx.db
        .query("receiptReminders")
        .withIndex("by_subscriptionId_and_receiptId", (q) =>
          q.eq("subscriptionId", subscription._id),
        )
        .take(batchSize);

      for (const reminder of reminders) {
        await ctx.scheduler.cancel(reminder.scheduledId);
        await ctx.db.delete("receiptReminders", reminder._id);
      }

      // A device with more reminders is finished on the next run.
      if (reminders.length < batchSize)
        await ctx.db.delete("deviceSubscriptions", subscription._id);
    }

    return subscriptions.length;
  },
  async (ctx, identity) =>
    removeRows(
      ctx,
      "receiptActivities",
      await ctx.db
        .query("receiptActivities")
        .withIndex("by_identity", (q) => q.eq("identity", identity))
        .take(batchSize),
    ),
  async (ctx, identity) =>
    removeRows(
      ctx,
      "clientReleases",
      await ctx.db
        .query("clientReleases")
        .withIndex("by_identity_and_installationId", (q) =>
          q.eq("identity", identity),
        )
        .take(batchSize),
    ),
  async (ctx, identity) =>
    removeRows(
      ctx,
      "mcpTokens",
      await ctx.db
        .query("mcpTokens")
        .withIndex("by_identity", (q) => q.eq("identity", identity))
        .take(batchSize),
    ),
  async (ctx, identity) =>
    removeRows(
      ctx,
      "odaAuthorizations",
      await ctx.db
        .query("odaAuthorizations")
        .withIndex("by_identity", (q) => q.eq("identity", identity))
        .take(batchSize),
    ),
];

/** Remove a deleted member's devices, tokens, and sign-ins in bounded batches. */
export const purgeIdentity = internalMutation({
  args: { identity: v.string(), stage: v.number() },
  returns: v.null(),
  handler: async (ctx, { identity, stage }) => {
    const step = identitySteps[stage];

    if (!step) return null;

    const removed = await step(ctx, identity);

    await ctx.scheduler.runAfter(0, internal.account.purgeIdentity, {
      identity,
      stage: removed > 0 ? stage : stage + 1,
    });

    return null;
  },
});

type HouseholdStep = (
  ctx: MutationCtx,
  householdId: Id<"households">,
) => Promise<number>;

/**
 * Receipts go first: deleting one updates the summaries, totals, and imports
 * below, so those are removed only once no receipt is left to change them.
 */
const householdSteps: HouseholdStep[] = [
  async (ctx, householdId) => {
    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .take(10);

    for (const receipt of receipts) {
      await ctx.db.delete("receipts", receipt._id);
      await ctx.scheduler.runAfter(
        0,
        internal.retention.deletedReceiptWorkflows,
        { receiptId: receipt._id },
      );
      await ctx.scheduler.runAfter(0, internal.receipts.cleanupDeleted, {
        id: receipt._id,
      });
    }

    return receipts.length;
  },
  async (ctx, householdId) =>
    removeRows(
      ctx,
      "receiptSummaries",
      await ctx.db
        .query("receiptSummaries")
        .withIndex("by_householdId_and_sequence", (q) =>
          q.eq("householdId", householdId),
        )
        .take(batchSize),
    ),
  async (ctx, householdId) =>
    removeRows(
      ctx,
      "receiptDailyTotals",
      await ctx.db
        .query("receiptDailyTotals")
        .withIndex("by_householdId_and_date", (q) =>
          q.eq("householdId", householdId),
        )
        .take(batchSize),
    ),
  async (ctx, householdId) =>
    removeRows(
      ctx,
      "receiptSyncHeads",
      await ctx.db
        .query("receiptSyncHeads")
        .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
        .take(batchSize),
    ),
  async (ctx, householdId) =>
    removeRows(
      ctx,
      "receiptImports",
      await ctx.db
        .query("receiptImports")
        .withIndex("by_householdId_and_provider_and_orderNumber", (q) =>
          q.eq("householdId", householdId),
        )
        .take(batchSize),
    ),
  async (ctx, householdId) =>
    removeRows(
      ctx,
      "receiptActivities",
      await ctx.db
        .query("receiptActivities")
        .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
        .take(batchSize),
    ),
  async (ctx, householdId) =>
    removeRows(
      ctx,
      "corrections",
      await ctx.db
        .query("corrections")
        .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
        .take(batchSize),
    ),
  async (ctx, householdId) =>
    removeRows(
      ctx,
      "correctionBatches",
      await ctx.db
        .query("correctionBatches")
        .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
        .take(batchSize),
    ),
  async (ctx, householdId) =>
    removeRows(
      ctx,
      "aliases",
      await ctx.db
        .query("aliases")
        .withIndex("by_householdId_and_key", (q) =>
          q.eq("householdId", householdId),
        )
        .take(batchSize),
    ),
  async (ctx, householdId) =>
    removeRows(
      ctx,
      "categoryMemory",
      await ctx.db
        .query("categoryMemory")
        .withIndex("by_householdId_and_key", (q) =>
          q.eq("householdId", householdId),
        )
        .take(batchSize),
    ),
  async (ctx, householdId) =>
    removeRows(
      ctx,
      "productMappings",
      await ctx.db
        .query("productMappings")
        .withIndex("by_householdId_and_retailer_and_key", (q) =>
          q.eq("householdId", householdId),
        )
        .take(batchSize),
    ),
  async (ctx, householdId) =>
    removeRows(
      ctx,
      "products",
      await ctx.db
        .query("products")
        .withIndex("by_householdId_and_retailer", (q) =>
          q.eq("householdId", householdId),
        )
        .take(batchSize),
    ),
  async (ctx, householdId) =>
    removeRows(
      ctx,
      "productProfiles",
      await ctx.db
        .query("productProfiles")
        .withIndex("by_householdId_and_key", (q) =>
          q.eq("householdId", householdId),
        )
        .take(batchSize),
    ),
  async (ctx, householdId) =>
    removeRows(
      ctx,
      "productFamilies",
      await ctx.db
        .query("productFamilies")
        .withIndex("by_householdId_and_key", (q) =>
          q.eq("householdId", householdId),
        )
        .take(batchSize),
    ),
];

/** Remove a deleted household's receipts, images, and derived data in bounded batches. */
export const purgeHousehold = internalMutation({
  args: { householdId: v.id("households"), stage: v.number() },
  returns: v.null(),
  handler: async (ctx, { householdId, stage }) => {
    const step = householdSteps[stage];

    if (!step) return null;

    const removed = await step(ctx, householdId);

    await ctx.scheduler.runAfter(0, internal.account.purgeHousehold, {
      householdId,
      stage: removed > 0 ? stage : stage + 1,
    });

    return null;
  },
});
