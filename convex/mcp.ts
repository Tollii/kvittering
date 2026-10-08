import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { paginationOptsValidator } from "convex/server";
import { components, internal } from "./_generated/api";
import { env, internalAction, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./serverFunctions";
import { consumeMcpQuota } from "./rateLimits";
import { categoryOf } from "../src/lib/domain/categories";
import { maxSummaryDays } from "../src/lib/mcp/tools";
import { calendarDateValidator } from "../src/lib/domain/calendar";
import { reconcile, type ReceiptLine } from "../src/lib/domain/receipt";
import {
  addSpendingTotals,
  emptySpendingTotals,
} from "../src/lib/domain/receipt-summary";

/** Stored amounts are whole øre; tools speak kroner. */
const accountUser = z.object({ _id: z.string() });

const nok = (amount: number) => amount / 100;

const nullableNok = (amount: number | null) =>
  amount === null ? null : nok(amount);

export async function sha256(text: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Creates a token for one member and returns it once. Run from the CLI:
 * `npx convex run mcp:createToken '{"email":"…","label":"Claude"}'`.
 * Actions have unseeded randomness, unlike mutations.
 */
export const createToken = internalAction({
  args: {
    label: v.string(),
    email: v.optional(v.string()),
    memberId: v.optional(v.id("members")),
  },
  returns: v.object({ token: v.string(), member: v.string() }),
  handler: async (ctx, args) => {
    let identity: string | null = null;

    if (args.email) {
      // The component types adapter results as `any`; only the id is needed.
      const user: unknown = await ctx.runQuery(
        components.betterAuth.adapter.findOne,
        { model: "user", where: [{ field: "email", value: args.email }] },
      );

      const account = accountUser.safeParse(user);

      if (!account.success) throw new ConvexError("No account has that email.");

      // Convex identities from Better Auth are the site URL and the user id.
      identity = `${env.CONVEX_SITE_URL}|${account.data._id}`;
    }

    const bytes = crypto.getRandomValues(new Uint8Array(32));

    const token = `kvitto_mcp_${btoa(String.fromCharCode(...bytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "")}`;

    const member: string = await ctx.runMutation(internal.mcp.storeToken, {
      identity: identity ?? undefined,
      memberId: args.memberId,
      label: args.label,
      tokenHash: await sha256(token),
    });

    return { token, member };
  },
});

export const storeToken = internalMutation({
  args: {
    identity: v.optional(v.string()),
    memberId: v.optional(v.id("members")),
    label: v.string(),
    tokenHash: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const { identity, memberId } = args;

    const member = memberId
      ? await ctx.db.get("members", memberId)
      : identity
        ? await ctx.db
            .query("members")
            .withIndex("by_identity", (q) => q.eq("identity", identity))
            .unique()
        : null;

    if (!member)
      throw new ConvexError(
        "Pass the email or memberId of a household member.",
      );

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

const receiptListItem = v.object({
  receiptId: v.id("receipts"),
  store: v.union(v.string(), v.null()),
  purchaseDate: v.union(v.string(), v.null()),
  status: v.string(),
  totalNok: v.union(v.number(), v.null()),
  purchasesNok: v.number(),
  excluded: v.boolean(),
});

const page = <T extends ReturnType<typeof v.object>>(item: T) =>
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
  returns: page(receiptListItem),
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
          totalNok: nullableNok(summary.totalOre),
          purchasesNok: nok(summary.spendingOre),
          excluded: summary.excluded,
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

export const getReceipt = internalQuery({
  args: { householdId: v.id("households"), receiptId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("receipts", args.receiptId);
    const receipt = id ? await ctx.db.get("receipts", id) : null;

    if (!receipt || receipt.householdId !== args.householdId) return null;
    const data = receipt.data;

    return {
      receiptId: receipt._id,
      status: receipt.status,
      excluded: receipt.excluded,
      unresolvedDuplicate: !!receipt.duplicateOf && !receipt.duplicateResolved,
      store: data?.store ?? null,
      branch: data?.branch ?? null,
      purchaseDate: data?.purchaseDate ?? null,
      purchaseTime: data?.purchaseTime ?? null,
      currency: data?.currency ?? null,
      totalNok: data ? nullableNok(data.totalOre) : null,
      purchasesNok: data ? nok(reconcile(data).productSpending) : null,
      lines: data?.lines.map(lineView) ?? [],
    };
  },
});

export const spendingSummary = internalQuery({
  args: {
    householdId: v.id("households"),
    from: calendarDateValidator,
    to: calendarDateValidator,
  },
  returns: v.any(),
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
      {
        ...emptySpendingTotals,
      },
    );

    const categories = new Map<string, number>();

    for (const day of days)
      for (const [id, amount] of Object.entries(day.categories)) {
        const name = categoryOf(id).name;
        categories.set(name, (categories.get(name) ?? 0) + amount);
      }

    return {
      from: args.from,
      to: args.to,
      receipts: totals.receipts,
      purchasesNok: nok(totals.products),
      discountsNok: nok(totals.discounts),
      paidNok: nok(totals.paid),
      depositsNok: nok(totals.deposits),
      returnsNok: nok(totals.returns),
      byCategory: [...categories]
        .map(([category, amount]) => ({ category, purchasesNok: amount / 100 }))
        .sort((a, b) => b.purchasesNok - a.purchasesNok),
      notCounted: {
        provisionalReceipts: totals.provisional,
        unconvertedReceipts: totals.unconverted,
        receiptsWithoutTotal: totals.unknownTotals,
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
  returns: v.any(),
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
