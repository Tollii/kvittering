import { isReceiptProcessing } from "../src/lib/domain/receipt-state";
import { commitReceiptChange } from "./receiptChanges";
import { v } from "convex/values";
import { type MutationCtx, type QueryCtx } from "./_generated/server";
import { internalMutation } from "./serverFunctions";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  aliasKey,
  printedName,
  type ReceiptData,
} from "../src/lib/domain/receipt";
import { isCategoryId, type CategoryId } from "../src/lib/domain/categories";
import {
  applyCategoryMemory,
  categoryMemoryKey,
  learnableLine,
  recordCategoryDecision,
  settleLine,
} from "../src/lib/domain/category-memory";

/**
 * A remembered household alias settles the line like category memory does,
 * and also marks the line as identified by that alias.
 */
export function settleLineWithAlias(
  line: ReceiptData["lines"][number],
  key: string,
  categoryId: CategoryId,
  name?: string,
): boolean {
  const keyChanged = line.productKey !== key;
  line.categoryAliasKey = key;
  line.productKey = key;

  return settleLine(line, { categoryId, name }) || keyChanged;
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

    if (alias && key && isCategoryId(alias.categoryId)) {
      settleLineWithAlias(line, key, alias.categoryId, alias.name);
      continue;
    }

    const memoryKey = categoryMemoryKey(data.store, printedName(line));

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
    const key = categoryMemoryKey(data.store, printedName(line));

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
      line,
      rememberLineIds.includes(line.id),
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

/** Existing scheduled calls retain their original argument contract. */
export const applyToMatching = internalMutation({
  args: {
    householdId: v.id("households"),
    key: v.string(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: (ctx, args) =>
    applyChangesPage(ctx, {
      householdId: args.householdId,
      keys: [args.key],
      cursor: args.cursor,
      through: Date.now(),
    }),
});

/** One bounded household traversal applies every changed decision from a save. */
export const applyChanges = internalMutation({
  args: {
    householdId: v.id("households"),
    keys: v.array(v.string()),
    cursor: v.union(v.string(), v.null()),
    through: v.number(),
  },
  returns: v.null(),
  handler: applyChangesPage,
});

type CategoryAlias = {
  categoryId: string;
  confirmedBy: string;
  name?: string;
};

/** Reads the household aliases for the keys and keeps only the aliases with a known category. */
async function loadCategoryAliases(
  ctx: MutationCtx,
  householdId: Id<"households">,
  keys: string[],
): Promise<Map<string, CategoryAlias>> {
  const aliases = new Map<string, CategoryAlias>();

  for (const key of new Set(keys)) {
    const alias = await ctx.db
      .query("aliases")
      .withIndex("by_householdId_and_key", (q) =>
        q.eq("householdId", householdId).eq("key", key),
      )
      .unique();

    if (alias && isCategoryId(alias.categoryId)) aliases.set(key, alias);
  }

  return aliases;
}

/**
 * Settles each product line that has an alias. Returns the person who
 * confirmed the last alias that changed a line, or null when no line changed.
 */
function settleLinesWithAliases(
  data: ReceiptData,
  aliases: Map<string, CategoryAlias>,
): string | null {
  let editor: string | null = null;

  for (const line of data.lines) {
    if (line.kind !== "product") continue;
    const key = aliasKey(data, line);
    const alias = key ? aliases.get(key) : null;

    if (
      key &&
      alias &&
      isCategoryId(alias.categoryId) &&
      settleLineWithAlias(line, key, alias.categoryId, alias.name)
    )
      editor = alias.confirmedBy;
  }

  return editor;
}

async function applyChangesPage(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    keys: string[];
    cursor: string | null;
    through: number;
  },
): Promise<null> {
  if (!args.keys.length || args.keys.length > 300)
    throw new Error("Invalid alias batch.");

  const aliases = await loadCategoryAliases(ctx, args.householdId, args.keys);

  if (!aliases.size) return null;

  const page = await ctx.db
    .query("receipts")
    .withIndex("by_householdId", (q) =>
      q.eq("householdId", args.householdId).lte("_creationTime", args.through),
    )
    .paginate({
      cursor: args.cursor,
      numItems: 10,
      maximumRowsRead: 10,
      maximumBytesRead: 500_000,
    });

  for (const receipt of page.page) {
    // Completion applies current aliases after extraction owns the state transition.
    if (!receipt.data || isReceiptProcessing(receipt.status)) continue;
    const data = structuredClone(receipt.data);
    const editor = settleLinesWithAliases(data, aliases);

    if (editor !== null)
      await commitReceiptChange(ctx, {
        receiptId: receipt._id,
        expected: receipt,
        data,
        origin: { kind: "alias", editor },
      });
  }

  if (!page.isDone)
    await ctx.scheduler.runAfter(0, internal.aliases.applyChanges, {
      ...args,
      cursor: page.continueCursor,
    });

  return null;
}
