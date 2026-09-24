import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { CalendarDate } from "../src/lib/domain/calendar";
import type { PaginationOptions } from "convex/server";

/** Shared indexed period contract for interactive reports and bounded background reads. */
export function receiptPeriodPage(
  ctx: QueryCtx,
  householdId: Id<"households">,
  start: CalendarDate,
  end: CalendarDate,
  paginationOpts: PaginationOptions,
) {
  return ctx.db
    .query("receipts")
    .withIndex("by_householdId_and_purchaseDate", (q) =>
      q
        .eq("householdId", householdId)
        .gte("data.purchaseDate", start)
        .lte("data.purchaseDate", end),
    )
    .paginate({
      ...paginationOpts,
      maximumRowsRead: 100,
      maximumBytesRead: 500_000,
    });
}
