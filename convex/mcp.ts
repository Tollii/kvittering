import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { paginationOptsValidator } from "convex/server";
import { components, internal } from "./_generated/api";
import {
  env,
  internalAction,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { randomToken, sha256Hex } from "./tokens";
import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./serverFunctions";
import { consumeMcpQuota } from "./rateLimits";
import { categoryOf } from "../src/lib/domain/categories";
import { maxSummaryDays } from "../src/lib/mcp/tools";
import { calendarDateValidator } from "../src/lib/domain/calendar";
import { lineValidator, type ReceiptLine } from "../src/lib/domain/receipt";
import { receiptStatusValidator } from "../src/lib/domain/receipt-state";
import { Ore } from "../src/lib/domain/ore";
import {
  addCategoryTotals,
  addSpendingTotals,
  emptySpendingTotals,
  receiptListItem,
} from "../src/lib/domain/receipt-summary";

const accountUser = z.object({ _id: z.string() });

/** Stored amounts are whole øre; tools speak kroner. */
const nok = (amount: number) => Ore.toKroner(Ore.of(amount));

const nullableNok = (amount: number | null) =>
  amount === null ? null : nok(amount);

/**
 * Creates a token for one member and returns it once. Run from the CLI:
 * `npx convex run mcp:createToken '{"member":{"email":"…"},"label":"Claude"}'`.
 * Actions have unseeded randomness, unlike mutations.
 */
export const createToken = internalAction({
  args: {
    label: v.string(),
    member: v.union(
      v.object({ email: v.string() }),
      v.object({ memberId: v.id("members") }),
    ),
  },
  returns: v.object({ token: v.string(), member: v.string() }),
  handler: async (ctx, args) => {
    const token = `kvitto_mcp_${randomToken()}`;

    const member: string = await ctx.runMutation(internal.mcp.storeToken, {
      member:
        "email" in args.member
          ? { identity: await identityForEmail(ctx, args.member.email) }
          : args.member,
      label: args.label,
      tokenHash: await sha256Hex(token),
    });

    return { token, member };
  },
});

async function identityForEmail(ctx: ActionCtx, email: string) {
  // The component types adapter results as `any`; only the id is needed.
  const user: unknown = await ctx.runQuery(
    components.betterAuth.adapter.findOne,
    { model: "user", where: [{ field: "email", value: email }] },
  );

  const account = accountUser.safeParse(user);

  if (!account.success) throw new ConvexError("No account has that email.");

  // Convex identities from Better Auth are the site URL and the user id.
  return `${env.CONVEX_SITE_URL}|${account.data._id}`;
}

export const storeToken = internalMutation({
  args: {
    member: v.union(
      v.object({ identity: v.string() }),
      v.object({ memberId: v.id("members") }),
    ),
    label: v.string(),
    tokenHash: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const target = args.member;

    const member =
      "memberId" in target
        ? await ctx.db.get("members", target.memberId)
        : await ctx.db
            .query("members")
            .withIndex("by_identity", (q) => q.eq("identity", target.identity))
            .unique();

    if (!member) throw new ConvexError("That account has no household.");

    await ctx.db.insert("mcpTokens", {
      identity: member.identity,
      label: args.label.trim().slice(0, 100) || "MCP",
      tokenHash: args.tokenHash,
      createdAt: Date.now(),
    });

    return member.name;
  },
});

export const listTokens = internalQuery({
  args: { memberId: v.id("members") },
  returns: v.array(
    v.object({
      _id: v.id("mcpTokens"),
      label: v.string(),
      createdAt: v.number(),
      revokedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, { memberId }) => {
    const member = await ctx.db.get("members", memberId);

    if (!member) return [];

    const tokens = await ctx.db
      .query("mcpTokens")
      .withIndex("by_identity", (q) => q.eq("identity", member.identity))
      .take(50);

    return tokens.map(({ _id, label, createdAt, revokedAt }) => ({
      _id,
      label,
      createdAt,
      revokedAt,
    }));
  },
});

export const revokeToken = internalMutation({
  args: { tokenId: v.id("mcpTokens") },
  returns: v.null(),
  handler: async (ctx, { tokenId }) => {
    const token = await ctx.db.get("mcpTokens", tokenId);

    if (token && token.revokedAt === undefined)
      await ctx.db.patch("mcpTokens", tokenId, { revokedAt: Date.now() });

    return null;
  },
});

/** Resolves the household on every request, so leaving a household ends access. */
export const authorize = internalMutation({
  args: { tokenHash: v.string() },
  returns: v.union(
    v.object({ kind: v.literal("allowed"), householdId: v.id("households") }),
    v.object({ kind: v.literal("denied") }),
    v.object({ kind: v.literal("limited"), retryAfter: v.number() }),
  ),
  handler: async (ctx, { tokenHash }) => {
    const token = await ctx.db
      .query("mcpTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();

    if (!token || token.revokedAt !== undefined)
      return { kind: "denied" as const };

    const member = await ctx.db
      .query("members")
      .withIndex("by_identity", (q) => q.eq("identity", token.identity))
      .unique();

    if (!member) return { kind: "denied" as const };
    const quota = await consumeMcpQuota(ctx, token._id);

    return quota.ok
      ? { kind: "allowed" as const, householdId: member.householdId }
      : { kind: "limited" as const, retryAfter: quota.retryAfter };
  },
});

const nullableNumber = v.union(v.number(), v.null());

const nullableString = v.union(v.string(), v.null());

const receiptFields = {
  receiptId: v.id("receipts"),
  store: nullableString,
  purchaseDate: nullableString,
  status: receiptStatusValidator,
  excluded: v.boolean(),
};

const listedReceipt = v.object({
  ...receiptFields,
  totalNok: nullableNumber,
  purchasesNok: v.number(),
});

const lineFields = {
  kind: lineValidator.fields.kind,
  name: v.string(),
  printedText: v.string(),
  amountNok: nullableNumber,
  quantity: nullableNumber,
  unit: nullableString,
  unitPriceNok: nullableNumber,
  packageSize: nullableNumber,
  packageUnit: nullableString,
  brand: nullableString,
  category: nullableString,
  product: nullableString,
};

const page = <Item extends ReturnType<typeof v.object>>(item: Item) =>
  v.object({
    items: v.array(item),
    hasMore: v.boolean(),
    nextCursor: v.union(v.string(), v.null()),
  });

export const listReceipts = internalQuery({
  args: {
    householdId: v.id("households"),
    from: v.optional(calendarDateValidator),
    to: v.optional(calendarDateValidator),
    store: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: page(listedReceipt),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("receiptSummaries")
      .withIndex("by_householdId_and_purchaseDate", (q) => {
        const household = q.eq("householdId", args.householdId);

        const lower = args.from
          ? household.gte("purchaseDate", args.from)
          : household;

        return args.to ? lower.lte("purchaseDate", args.to) : lower;
      })
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        maximumRowsRead: 100,
        maximumBytesRead: 500_000,
      });

    const store = args.store?.toLocaleLowerCase("nb-NO");

    return {
      items: result.page
        .filter(
          (summary) =>
            !summary.deleted &&
            (!store ||
              summary.store?.toLocaleLowerCase("nb-NO").includes(store)),
        )
        .map((summary) => ({
          receiptId: summary.receiptId,
          store: summary.store,
          purchaseDate: summary.purchaseDate,
          status: summary.status,
          excluded: summary.excluded,
          totalNok: nullableNok(summary.totalOre),
          purchasesNok: nok(summary.spendingOre),
        })),
      hasMore: !result.isDone,
      nextCursor: result.isDone ? null : result.continueCursor,
    };
  },
});

function lineView(line: ReceiptLine) {
  return {
    kind: line.kind,
    name: line.name,
    printedText: line.originalText,
    amountNok: nullableNok(line.amountOre),
    quantity: line.quantity,
    unit: line.unit,
    unitPriceNok: nullableNok(line.unitPriceOre),
    packageSize: line.packageSize,
    packageUnit: line.packageUnit,
    brand: line.brand,
    category: line.kind === "product" ? categoryOf(line.categoryId).name : null,
    product: line.productName ?? null,
  };
}

const receiptDetail = v.object({
  ...receiptFields,
  unresolvedDuplicate: v.boolean(),
  branch: nullableString,
  purchaseTime: nullableString,
  currency: nullableString,
  totalNok: nullableNumber,
  purchasesNok: v.number(),
  lines: v.array(v.object(lineFields)),
});

export const getReceipt = internalQuery({
  args: { householdId: v.id("households"), receiptId: v.string() },
  returns: v.union(receiptDetail, v.null()),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("receipts", args.receiptId);
    const receipt = id ? await ctx.db.get("receipts", id) : null;

    if (!receipt || receipt.householdId !== args.householdId) return null;
    const data = receipt.data;
    // The list's rules: excluded receipts and unread receipts add nothing.
    const listed = receiptListItem(receipt);

    return {
      receiptId: receipt._id,
      store: listed.store,
      purchaseDate: listed.purchaseDate,
      status: receipt.status,
      excluded: receipt.excluded,
      unresolvedDuplicate: !!receipt.duplicateOf && !receipt.duplicateResolved,
      branch: data?.branch ?? null,
      purchaseTime: data?.purchaseTime ?? null,
      currency: data?.currency ?? null,
      totalNok: nullableNok(listed.totalOre),
      purchasesNok: nok(listed.spendingOre),
      lines: data?.lines.map(lineView) ?? [],
    };
  },
});

const spendingSummaryResult = v.object({
  from: v.string(),
  to: v.string(),
  receipts: v.number(),
  purchasesNok: v.number(),
  discountsNok: v.number(),
  paidNok: v.number(),
  depositsNok: v.number(),
  returnsNok: v.number(),
  byCategory: v.array(
    v.object({ category: v.string(), purchasesNok: v.number() }),
  ),
  uncategorizedNok: v.number(),
  included: v.object({
    receiptsNeedingReview: v.number(),
    suspectedDuplicateReceipts: v.number(),
    receiptsWithoutPrintedTotal: v.number(),
  }),
  notIncluded: v.object({
    foreignCurrencyReceipts: v.number(),
    linesWithoutAmount: v.number(),
  }),
});

export const spendingSummary = internalQuery({
  args: {
    householdId: v.id("households"),
    from: calendarDateValidator,
    to: calendarDateValidator,
  },
  returns: v.union(spendingSummaryResult, v.null()),
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("receiptReadModel")
      .withIndex("by_name", (q) => q.eq("name", "receipts-v1"))
      .unique();

    if (!state?.ready) return null;

    const days = await ctx.db
      .query("receiptDailyTotals")
      .withIndex("by_householdId_and_date", (q) =>
        q
          .eq("householdId", args.householdId)
          .gte("date", args.from)
          .lte("date", args.to),
      )
      .take(maxSummaryDays);

    const totals = days.reduce(
      (sum, day) => addSpendingTotals(sum, day.totals),
      { ...emptySpendingTotals },
    );

    // Daily categories follow the comparison rules: no suspected duplicates.
    const categoryTotals = days.reduce<Record<string, number>>(
      (sum, day) => addCategoryTotals(sum, day.categories),
      {},
    );

    const byName = new Map<string, number>();

    for (const [id, amount] of Object.entries(categoryTotals)) {
      const name = categoryOf(id).name;

      byName.set(name, (byName.get(name) ?? 0) + amount);
    }

    const categorized = Ore.sum([...byName.values()].map(Ore.of));

    return {
      from: args.from,
      to: args.to,
      receipts: totals.receipts,
      purchasesNok: nok(totals.products),
      discountsNok: nok(totals.discounts),
      paidNok: nok(totals.paid),
      depositsNok: nok(totals.deposits),
      returnsNok: nok(totals.returns),
      byCategory: [...byName]
        .map(([category, amount]) => ({ category, purchasesNok: nok(amount) }))
        .sort((a, b) => b.purchasesNok - a.purchasesNok),
      uncategorizedNok: nok(
        Ore.subtract(totals.comparisonProducts, categorized),
      ),
      included: {
        receiptsNeedingReview: totals.provisional,
        suspectedDuplicateReceipts: totals.receipts - totals.comparisonReceipts,
        receiptsWithoutPrintedTotal: totals.unknownTotals,
      },
      notIncluded: {
        foreignCurrencyReceipts: totals.unconverted,
        linesWithoutAmount: totals.unknownAmounts,
      },
    };
  },
});

export const findPurchases = internalQuery({
  args: {
    householdId: v.id("households"),
    text: v.string(),
    from: calendarDateValidator,
    to: calendarDateValidator,
    paginationOpts: paginationOptsValidator,
  },
  returns: page(v.object({ ...receiptFields, ...lineFields })),
  handler: async (ctx, args) => {
    // Newest first answers "when did we last buy" from the first page.
    const result = await ctx.db
      .query("receipts")
      .withIndex("by_householdId_and_purchaseDate", (q) =>
        q
          .eq("householdId", args.householdId)
          .gte("data.purchaseDate", args.from)
          .lte("data.purchaseDate", args.to),
      )
      .order("desc")
      .paginate({
        ...args.paginationOpts,
        maximumRowsRead: 100,
        maximumBytesRead: 500_000,
      });

    const text = args.text.toLocaleLowerCase("nb-NO");

    const matches = (line: ReceiptLine) =>
      [line.name, line.originalText, line.receiptName, line.productName].some(
        (value) => value?.toLocaleLowerCase("nb-NO").includes(text),
      );

    return {
      items: result.page.flatMap((receipt: Doc<"receipts">) =>
        (receipt.data?.lines ?? [])
          .filter((line) => line.kind === "product" && matches(line))
          .map((line) => ({
            receiptId: receipt._id,
            store: receipt.data?.store ?? null,
            purchaseDate: receipt.data?.purchaseDate ?? null,
            status: receipt.status,
            excluded: receipt.excluded,
            ...lineView(line),
          })),
      ),
      hasMore: !result.isDone,
      nextCursor: result.isDone ? null : result.continueCursor,
    };
  },
});
