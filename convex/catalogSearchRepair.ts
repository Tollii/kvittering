import { v } from "convex/values";
import { query, mutation, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireReceipt } from "./access";
import type { Doc } from "./_generated/dataModel";
import { lineEvidenceKey } from "../src/lib/catalog/matching";
import {
  productSearch,
  validateSearchSuggestion,
} from "../src/lib/catalog/search";
import { requestKey } from "../src/lib/catalog/policy";
import {
  savedSearchRepair,
  searchRepairValidator,
  searchSuggestionKey,
} from "../src/lib/catalog/search-repair";
import type { ReceiptLine } from "../src/lib/domain/receipt";

function eligible(receipt: Doc<"receipts">, line: ReceiptLine) {
  return (
    !receipt.excluded &&
    receipt.catalogStatus === "complete" &&
    (receipt.status === "reviewed" || receipt.status === "needs_review") &&
    line.kind === "product" &&
    !line.catalogProduct &&
    !line.productMatchManual &&
    !savedSearchRepair(receipt.catalogSearchRepairs, line)
  );
}

async function emptySearch(ctx: QueryCtx, name: string) {
  const search = productSearch(name);
  if (search.length < 3 || search.length > 120) return false;
  const result = await ctx.db
    .query("catalogRequests")
    .withIndex("by_key", (q) =>
      q.eq("key", requestKey({ kind: "products", search })),
    )
    .unique();
  // A timeout or rate limit is not evidence that the description needs repair.
  return result?.state === "ready" && result.result.products.length === 0;
}

export const pending = query({
  args: { id: v.id("receipts") },
  returns: v.object({
    generation: v.number(),
    store: v.union(v.string(), v.null()),
    items: v.array(
      v.object({
        lineId: v.string(),
        evidenceKey: v.string(),
        name: v.string(),
        cached: v.boolean(),
        search: v.union(v.string(), v.null()),
      }),
    ),
  }),
  handler: async (ctx, { id }) => {
    const { receipt } = await requireReceipt(ctx, id);
    const items = [];
    for (const line of receipt.data?.lines ?? []) {
      if (!eligible(receipt, line) || !(await emptySearch(ctx, line.name)))
        continue;
      const key = searchSuggestionKey(receipt.data!.store, line);
      const saved = await ctx.db
        .query("catalogSearchSuggestions")
        .withIndex("by_householdId_and_key", (q) =>
          q.eq("householdId", receipt.householdId).eq("key", key),
        )
        .unique();
      items.push({
        lineId: line.id,
        evidenceKey: lineEvidenceKey(line),
        name: line.name,
        cached: !!saved,
        search: saved?.search ?? null,
      });
      if (items.length === 8) break;
    }
    return {
      generation: receipt.generation,
      store: receipt.data?.store ?? null,
      items,
    };
  },
});

export const submit = mutation({
  args: {
    id: v.id("receipts"),
    generation: v.number(),
    store: v.union(v.string(), v.null()),
    repairs: v.array(searchRepairValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { receipt } = await requireReceipt(ctx, args.id);
    if (args.repairs.length > 8) throw new Error("For mange søkeforslag.");
    if (
      !receipt.data ||
      receipt.generation !== args.generation ||
      receipt.data.store !== args.store
    )
      return null;
    // Retain only current line evidence, so edits cannot accumulate stale records.
    const repairs = receipt.data.lines.flatMap((line) => {
      const repair = savedSearchRepair(receipt.catalogSearchRepairs, line);
      return repair ? [repair] : [];
    });
    let retry = false;
    for (const proposed of args.repairs) {
      const line = receipt.data.lines.find(
        (line) => line.id === proposed.lineId,
      );
      if (
        !line ||
        !eligible(receipt, line) ||
        lineEvidenceKey(line) !== proposed.evidenceKey ||
        repairs.some((repair) => repair.lineId === line.id) ||
        !(await emptySearch(ctx, line.name))
      )
        continue;
      const key = searchSuggestionKey(args.store, line);
      const cached = await ctx.db
        .query("catalogSearchSuggestions")
        .withIndex("by_householdId_and_key", (q) =>
          q.eq("householdId", receipt.householdId).eq("key", key),
        )
        .unique();
      const search = validateSearchSuggestion(
        line.name,
        cached ? cached.search : proposed.search,
      );
      if (!cached)
        await ctx.db.insert("catalogSearchSuggestions", {
          householdId: receipt.householdId,
          key,
          search,
        });
      repairs.push({
        lineId: line.id,
        evidenceKey: proposed.evidenceKey,
        search,
      });
      retry ||= search !== null;
    }
    await ctx.db.patch("receipts", receipt._id, {
      catalogSearchRepairs: repairs,
    });
    if (retry)
      await ctx.runMutation(internal.catalogMatching.start, {
        id: receipt._id,
        generation: receipt.generation,
      });
    return null;
  },
});
