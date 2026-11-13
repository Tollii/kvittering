import { v } from "convex/values";
import { z } from "zod";
import { components, internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { revokeAppleAccess } from "./appleSignIn";
import { appleAccountOf } from "./auth";
import { forgetOdaConnection } from "./oda";
import { deleteReceipt } from "./receiptChanges";
import { internalMutation, action } from "./serverFunctions";
import { userError } from "./userErrors";
import { clientValidator } from "../src/lib/releases/policy";

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

    await ctx.runQuery(internal.releasePolicy.check, { client: args.client });
    const appleAccountId = await appleAccountOf(ctx, identity.subject);

    if (appleAccountId !== null) {
      if (!args.appleAuthorizationCode)
        throw userError("Bekreft med Apple for å slette kontoen.");
      await revokeAppleAccess(args.appleAuthorizationCode, appleAccountId);
    }

    await ctx.runMutation(internal.account.deleteAccount, {
      identity: identity.tokenIdentifier,
      userId: identity.subject,
      appleAccountId,
    });

    return null;
  },
});

export const batchSize = 100;

/** The component types adapter pages as `any`; only the cursor is needed. */
const deletedPage = z.object({
  isDone: z.boolean(),
  continueCursor: z.string(),
});

/**
 * The component's delete takes a page; a user has a few sessions and
 * accounts, so all of them go in this transaction.
 */
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
  args: {
    identity: v.string(),
    userId: v.string(),
    appleAccountId: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { identity, userId, appleAccountId }) => {
    // Apple may have been linked on another device after the revocation.
    if ((await appleAccountOf(ctx, userId)) !== appleAccountId)
      throw userError("Innloggingen med Apple er endret. Prøv igjen.");

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

      if (remaining) {
        // The person leaving knows the code; a new account must not rejoin with it.
        await ctx.db.patch("households", member.householdId, {
          invitation: crypto.randomUUID().replaceAll("-", ""),
        });

        // Their unfinished uploads can no longer complete.
        const uploading = await ctx.db
          .query("receipts")
          .withIndex("by_householdId_and_status_and_uploadedBy", (q) =>
            q
              .eq("householdId", member.householdId)
              .eq("status", "uploading")
              .eq("uploadedBy", identity),
          )
          .take(batchSize);

        for (const receipt of uploading) await deleteReceipt(ctx, receipt);
      } else {
        // Removing the household first ends its invitation and every read.
        await ctx.db.delete("households", member.householdId);
        await ctx.scheduler.runAfter(0, internal.account.purgeHousehold, {
          householdId: member.householdId,
        });
      }
    }

    await forgetOdaConnection(ctx, identity);
    await ctx.scheduler.runAfter(0, internal.account.purgeIdentity, {
      identity,
    });

    await deleteAuthRecords(ctx, "session", userId);
    await deleteAuthRecords(ctx, "account", userId);
    await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
      input: { model: "user", where: [{ field: "_id", value: userId }] },
    });

    return null;
  },
});

/** One step removes a batch of records and returns how many it removed. */
type Step<Key> = (ctx: MutationCtx, key: Key) => Promise<number>;

async function removeRows<Table extends TableNames>(
  ctx: MutationCtx,
  table: Table,
  rows: Doc<Table>[],
) {
  for (const row of rows) await ctx.db.delete(table, row._id);

  return rows.length;
}

/**
 * Remove one batch with the first step that still finds records, and report
 * whether one did. A purge keeps no position between runs, so a deploy that
 * adds, removes, or reorders steps cannot make a running purge skip one. A
 * finished step costs one empty read per run.
 */
async function removeBatch<Key>(
  ctx: MutationCtx,
  steps: Step<Key>[],
  key: Key,
) {
  for (const step of steps) if ((await step(ctx, key)) > 0) return true;

  return false;
}

/**
 * Purges queued by an earlier deploy carry a step index in `stage`. It is
 * ignored. Remove it, and the test that passes it, once no such job is queued.
 */
const legacyStage = v.optional(v.number());

/** Devices go with their reminders, whose scheduled pushes are cancelled. */
const removeDevices: Step<string> = async (ctx, identity) => {
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
};

const identitySteps: Step<string>[] = [
  removeDevices,
  ...(["receiptActivities", "mcpTokens", "odaAuthorizations"] as const).map(
    (table): Step<string> =>
      async (ctx, identity) =>
        removeRows(
          ctx,
          table,
          await ctx.db
            .query(table)
            .withIndex("by_identity", (q) => q.eq("identity", identity))
            .take(batchSize),
        ),
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
];

/** Remove a deleted member's devices, tokens, and sign-ins in bounded batches. */
export const purgeIdentity = internalMutation({
  args: { identity: v.string(), stage: legacyStage },
  returns: v.null(),
  handler: async (ctx, { identity }) => {
    if (await removeBatch(ctx, identitySteps, identity))
      await ctx.scheduler.runAfter(0, internal.account.purgeIdentity, {
        identity,
      });

    return null;
  },
});

const removeReceipts: Step<Id<"households">> = async (ctx, householdId) => {
  const receipts = await ctx.db
    .query("receipts")
    .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
    .take(10);

  for (const receipt of receipts) await deleteReceipt(ctx, receipt);

  return receipts.length;
};

/** Tables whose index on the household has this name. */
function householdTables<Table extends TableNames>(
  tables: readonly Table[],
  take: (
    ctx: MutationCtx,
    table: Table,
    householdId: Id<"households">,
  ) => Promise<Doc<Table>[]>,
): Step<Id<"households">>[] {
  return tables.map(
    (table) => async (ctx, householdId) =>
      removeRows(ctx, table, await take(ctx, table, householdId)),
  );
}

/**
 * Receipts go first: deleting one updates the summaries, totals, and imports
 * after it, so those are removed only once no receipt is left to change them.
 */
const householdSteps: Step<Id<"households">>[] = [
  removeReceipts,
  ...householdTables(
    [
      "receiptSyncHeads",
      "receiptActivities",
      "corrections",
      "correctionBatches",
    ] as const,
    (ctx, table, householdId) =>
      ctx.db
        .query(table)
        .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
        .take(batchSize),
  ),
  ...householdTables(
    [
      "aliases",
      "categoryMemory",
      "productProfiles",
      "productFamilies",
    ] as const,
    (ctx, table, householdId) =>
      ctx.db
        .query(table)
        .withIndex("by_householdId_and_key", (q) =>
          q.eq("householdId", householdId),
        )
        .take(batchSize),
  ),
  ...householdTables(["receiptSummaries"] as const, (ctx, table, householdId) =>
    ctx.db
      .query(table)
      .withIndex("by_householdId_and_sequence", (q) =>
        q.eq("householdId", householdId),
      )
      .take(batchSize),
  ),
  ...householdTables(
    ["receiptDailyTotals"] as const,
    (ctx, table, householdId) =>
      ctx.db
        .query(table)
        .withIndex("by_householdId_and_date", (q) =>
          q.eq("householdId", householdId),
        )
        .take(batchSize),
  ),
  ...householdTables(["receiptImports"] as const, (ctx, table, householdId) =>
    ctx.db
      .query(table)
      .withIndex("by_householdId_and_provider_and_orderNumber", (q) =>
        q.eq("householdId", householdId),
      )
      .take(batchSize),
  ),
  ...householdTables(["productMappings"] as const, (ctx, table, householdId) =>
    ctx.db
      .query(table)
      .withIndex("by_householdId_and_retailer_and_key", (q) =>
        q.eq("householdId", householdId),
      )
      .take(batchSize),
  ),
  ...householdTables(["products"] as const, (ctx, table, householdId) =>
    ctx.db
      .query(table)
      .withIndex("by_householdId_and_retailer", (q) =>
        q.eq("householdId", householdId),
      )
      .take(batchSize),
  ),
];

/** Remove a deleted household's receipts, images, and derived data in bounded batches. */
export const purgeHousehold = internalMutation({
  args: { householdId: v.id("households"), stage: legacyStage },
  returns: v.null(),
  handler: async (ctx, { householdId }) => {
    if (await removeBatch(ctx, householdSteps, householdId))
      await ctx.scheduler.runAfter(0, internal.account.purgeHousehold, {
        householdId,
      });

    return null;
  },
});
