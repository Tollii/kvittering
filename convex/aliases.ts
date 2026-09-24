import { commitReceiptChange } from "./receiptChanges";
import { v } from "convex/values";
import {
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { aliasKey, type ReceiptData } from "../src/lib/domain/receipt";
import { categoryById } from "../src/lib/domain/categories";
import {
  applyCategoryMemory,
  categoryMemoryKey,
  categoryMemoryThreshold,
  learnableLine,
  recordCategoryDecision,
} from "../src/lib/domain/category-memory";
import { isCategoryUncertain } from "../src/lib/domain/receipt-review";

/**
 * A remembered household decision settles the category: it replaces the
 * automatic suggestion and removes the uncertainty flag for that line.
 * Lines a person edited by hand keep their own category.
 */
export function settleLineWithAlias(
  line: ReceiptData["lines"][number],
  key: string,
  categoryId: string,
): boolean {
  const nextCategory = line.manual ? line.categoryId : categoryId;
  const issues = line.issues.filter((issue) => !isCategoryUncertain(issue));

  const changed =
    line.productKey !== key ||
    line.categoryId !== nextCategory ||
    issues.length !== line.issues.length ||
    line.confidence !== 1;

  line.categoryAliasKey = key;
  line.productKey = key;
  line.categoryId = nextCategory;
  line.issues = issues;
  line.confidence = 1;

  return changed;
}

/**
 * Apply what the household already knows to freshly read receipt data: an
 * exact alias settles item identity and category; otherwise a category the
 * household has approved often enough for this store and name settles the
 * category alone.
 */
export async function applyHouseholdAliases(
  ctx: QueryCtx,
  householdId: Id<"households">,
  data: ReceiptData,
): Promise<ReceiptData> {
  for (const line of data.lines) {
    if (line.kind !== "product") continue;
    const key = aliasKey(data, line);

    const alias = key
      ? await ctx.db
          .query("aliases")
          .withIndex("by_householdId_and_key", (q) =>
            q.eq("householdId", householdId).eq("key", key),
          )
          .unique()
      : null;

    if (alias && key && categoryById.has(alias.categoryId)) {
      settleLineWithAlias(line, key, alias.categoryId);
      continue;
    }

    const memoryKey = categoryMemoryKey(data.store, line.name);

    const memory = memoryKey
      ? await ctx.db
          .query("categoryMemory")
          .withIndex("by_householdId_and_key", (q) =>
            q.eq("householdId", householdId).eq("key", memoryKey),
          )
          .unique()
      : null;

    if (memory) applyCategoryMemory(line, memory);
  }

  return data;
}

/**
 * A person approved this receipt: every settled product line is one more vote
 * for its category. Items the person asked to remember are trusted at once.
 */
export async function learnCategories(
  ctx: MutationCtx,
  householdId: Id<"households">,
  identity: string,
  data: ReceiptData,
  rememberLineIds: string[],
) {
  const seen = new Set<string>();

  for (const line of data.lines) {
    if (!learnableLine(line)) continue;
    const key = categoryMemoryKey(data.store, line.name);

    if (!key || seen.has(key)) continue;
    seen.add(key);

    const existing = await ctx.db
      .query("categoryMemory")
      .withIndex("by_householdId_and_key", (q) =>
        q.eq("householdId", householdId).eq("key", key),
      )
      .unique();

    const next = recordCategoryDecision(
      existing,
      line.categoryId,
      rememberLineIds.includes(line.id) ? categoryMemoryThreshold : 1,
    );

    if (existing)
      await ctx.db.patch("categoryMemory", existing._id, {
        ...next,
        confirmedBy: identity,
      });
    else
      await ctx.db.insert("categoryMemory", {
        householdId,
        key,
        ...next,
        confirmedBy: identity,
      });
  }
}

/**
 * Apply a confirmed exact match in bounded batches. Item-only corrections keep
 * their category. A receipt waiting only on that item is approved on the spot.
 */
export const applyToMatching = internalMutation({
  args: {
    householdId: v.id("households"),
    key: v.string(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const alias = await ctx.db
      .query("aliases")
      .withIndex("by_householdId_and_key", (q) =>
        q.eq("householdId", args.householdId).eq("key", args.key),
      )
      .unique();

    if (!alias || !categoryById.has(alias.categoryId)) return null;

    const page = await ctx.db
      .query("receipts")
      .withIndex("by_householdId", (q) => q.eq("householdId", args.householdId))
      .paginate({ cursor: args.cursor, numItems: 10 });

    for (const receipt of page.page) {
      if (!receipt.data) continue;
      let changed = false;
      const data = structuredClone(receipt.data);

      for (const line of data.lines) {
        if (line.kind !== "product" || aliasKey(data, line) !== args.key)
          continue;

        if (settleLineWithAlias(line, args.key, alias.categoryId))
          changed = true;
      }

      if (changed) {
        await commitReceiptChange(ctx, {
          receiptId: receipt._id,
          expected: receipt,
          data,
          origin: { kind: "alias", editor: alias.confirmedBy },
        });
      }
    }

    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.aliases.applyToMatching, {
        ...args,
        cursor: page.continueCursor,
      });

    return null;
  },
});
