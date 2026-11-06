import { type ObjectType, v } from "convex/values";
import { z } from "zod";
import { components, internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { action, type MutationCtx } from "./_generated/server";
import { revokeAppleAccess } from "./appleSignIn";
import { appleAccountOf } from "./auth";
import { forgetOdaConnection } from "./oda";
import { deleteReceipt } from "./receiptChanges";
import { internalMutation } from "./serverFunctions";
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

const batchSize = 100;

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

        // Their unfinished uploads can no longer complete, and the partner cannot delete them.
        const uploading = await ctx.db
          .query("receipts")
          .withIndex("by_householdId_and_status", (q) =>
            q.eq("householdId", member.householdId).eq("status", "uploading"),
          )
          .take(batchSize);

        for (const receipt of uploading)
          if (receipt.uploadedBy === identity)
            await deleteReceipt(ctx, receipt);
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

/**
 * One step removes a batch of records and returns how many it removed. A
 * scheduled purge names the step it continues with, so a deploy that adds,
 * removes, or reorders steps cannot make a running purge skip one.
 */
type Step<Key> = {
  name: string;
  remove: (ctx: MutationCtx, key: Key) => Promise<number>;
};

async function removeRows<Table extends TableNames>(
  ctx: MutationCtx,
  table: Table,
  rows: Doc<Table>[],
) {
  for (const row of rows) await ctx.db.delete(table, row._id);

  return rows.length;
}

const purgeArgs = {
  step: v.optional(v.string()),
  // Jobs scheduled before steps had names carry the step's position instead.
  stage: v.optional(v.number()),
};

type Position = ObjectType<typeof purgeArgs>;

/**
 * Where a scheduled purge continues. A step no longer in the list starts the
 * purge over: every step only removes what is left, so repeating one is safe.
 */
function stepIndex<Key>(
  steps: readonly Step<Key>[],
  { step, stage }: Position,
) {
  if (step === undefined) return stage ?? 0;

  return Math.max(
    0,
    steps.findIndex(({ name }) => name === step),
  );
}

/** Repeat a step while it removes records, then schedule the next one. */
async function runStep<Key>(
  ctx: MutationCtx,
  steps: readonly Step<Key>[],
  position: Position,
  key: Key,
  next: (step: string) => Promise<Id<"_scheduled_functions">>,
) {
  const index = stepIndex(steps, position);
  const step = steps[index];

  if (!step) return;

  const following = (await step.remove(ctx, key)) > 0 ? step : steps[index + 1];

  if (following) await next(following.name);
}

/** A step that removes a batch of rows from one table. */
function tableStep<Table extends TableNames, Key>(
  table: Table,
  take: (ctx: MutationCtx, table: Table, key: Key) => Promise<Doc<Table>[]>,
): Step<Key> {
  return {
    name: table,
    remove: async (ctx, key) =>
      removeRows(ctx, table, await take(ctx, table, key)),
  };
}

/** Devices go with their reminders, whose scheduled pushes are cancelled. */
const removeDevices = async (ctx: MutationCtx, identity: string) => {
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

const identitySteps: readonly Step<string>[] = [
  { name: "deviceSubscriptions", remove: removeDevices },
  ...(["receiptActivities", "mcpTokens", "odaAuthorizations"] as const).map(
    (table) =>
      tableStep(table, (ctx, table, identity: string) =>
        ctx.db
          .query(table)
          .withIndex("by_identity", (q) => q.eq("identity", identity))
          .take(batchSize),
      ),
  ),
  tableStep("clientReleases", (ctx, table, identity: string) =>
    ctx.db
      .query(table)
      .withIndex("by_identity_and_installationId", (q) =>
        q.eq("identity", identity),
      )
      .take(batchSize),
  ),
];

/** Remove a deleted member's devices, tokens, and sign-ins in bounded batches. */
export const purgeIdentity = internalMutation({
  args: { identity: v.string(), ...purgeArgs },
  returns: v.null(),
  handler: async (ctx, { identity, ...position }) => {
    await runStep(ctx, identitySteps, position, identity, (step) =>
      ctx.scheduler.runAfter(0, internal.account.purgeIdentity, {
        identity,
        step,
      }),
    );

    return null;
  },
});

const removeReceipts = async (
  ctx: MutationCtx,
  householdId: Id<"households">,
) => {
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
  return tables.map((table) => tableStep(table, take));
}

/**
 * Receipts go first: deleting one updates the summaries, totals, and imports
 * after it, so those are removed only once no receipt is left to change them.
 */
const householdSteps: readonly Step<Id<"households">>[] = [
  { name: "receipts", remove: removeReceipts },
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
  args: { householdId: v.id("households"), ...purgeArgs },
  returns: v.null(),
  handler: async (ctx, { householdId, ...position }) => {
    await runStep(ctx, householdSteps, position, householdId, (step) =>
      ctx.scheduler.runAfter(0, internal.account.purgeHousehold, {
        householdId,
        step,
      }),
    );

    return null;
  },
});
