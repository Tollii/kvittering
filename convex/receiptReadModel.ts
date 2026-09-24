import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  addSpendingTotals,
  addCategoryTotals,
  receiptComparisonCategories,
  emptySpendingTotals,
  receiptListItem,
  receiptSpendingTotals,
  type SpendingTotals,
} from "../src/lib/domain/receipt-summary";

async function adjustDay(
  ctx: MutationCtx,
  householdId: Id<"households">,
  date: string | null,
  totals: SpendingTotals,
  categories: Record<string, number>,
  sign: number,
) {
  if (
    !date ||
    (Object.values(totals).every((value) => value === 0) &&
      Object.keys(categories).length === 0)
  )
    return;

  const day = await ctx.db
    .query("receiptDailyTotals")
    .withIndex("by_householdId_and_date", (q) =>
      q.eq("householdId", householdId).eq("date", date),
    )
    .unique();

  const next = addSpendingTotals(
    day?.totals ?? emptySpendingTotals,
    totals,
    sign,
  );

  const nextCategories = addCategoryTotals(
    day?.categories ?? {},
    categories,
    sign,
  );

  if (day) {
    if (
      Object.values(next).every((value) => value === 0) &&
      Object.keys(nextCategories).length === 0
    )
      await ctx.db.delete("receiptDailyTotals", day._id);
    else
      await ctx.db.patch("receiptDailyTotals", day._id, {
        totals: next,
        categories: nextCategories,
      });
  } else
    await ctx.db.insert("receiptDailyTotals", {
      householdId,
      date,
      totals: next,
      categories: nextCategories,
    });
}

/** Summary, deletion record, totals, and cursor commit with the receipt write. */
export async function updateReceiptReadModel(
  ctx: MutationCtx,
  receipt: Doc<"receipts">,
  deleted = false,
) {
  const previous = await ctx.db
    .query("receiptSummaries")
    .withIndex("by_receiptId", (q) => q.eq("receiptId", receipt._id))
    .unique();

  const head = await ctx.db
    .query("receiptSyncHeads")
    .withIndex("by_householdId", (q) =>
      q.eq("householdId", receipt.householdId),
    )
    .unique();

  const sequence = (head?.sequence ?? 0) + 1;
  const item = receiptListItem(receipt);

  const totals = deleted
    ? { ...emptySpendingTotals }
    : receiptSpendingTotals(receipt);

  const summary = {
    householdId: receipt.householdId,
    receiptId: receipt._id,
    sequence,
    deleted,
    createdAt: item._creationTime,
    status: item.status,
    store: deleted ? null : item.store,
    purchaseDate: deleted ? null : item.purchaseDate,
    totalOre: deleted ? null : item.totalOre,
    spendingOre: deleted ? 0 : item.spendingOre,
    excluded: item.excluded,
    totals,
    categories: deleted ? {} : receiptComparisonCategories(receipt),
  };

  if (
    previous?.purchaseDate !== summary.purchaseDate ||
    JSON.stringify(previous.totals) !== JSON.stringify(totals) ||
    JSON.stringify(previous.categories) !== JSON.stringify(summary.categories)
  ) {
    if (previous)
      await adjustDay(
        ctx,
        previous.householdId,
        previous.purchaseDate,
        previous.totals,
        previous.categories,
        -1,
      );
    await adjustDay(
      ctx,
      receipt.householdId,
      summary.purchaseDate,
      totals,
      summary.categories,
      1,
    );
  }

  if (previous) await ctx.db.replace("receiptSummaries", previous._id, summary);
  else await ctx.db.insert("receiptSummaries", summary);

  if (head) await ctx.db.patch("receiptSyncHeads", head._id, { sequence });
  else
    await ctx.db.insert("receiptSyncHeads", {
      householdId: receipt.householdId,
      sequence,
    });
}
