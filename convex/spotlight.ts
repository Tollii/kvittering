import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireMember } from "./access";

/** The optional device index covers the latest 100 receipts; it is not household storage. */
export const recent = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("receipts"),
      title: v.string(),
      detail: v.string(),
      keywords: v.array(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const member = await requireMember(ctx);

    const receipts = await ctx.db
      .query("receipts")
      .withIndex("by_householdId", (q) =>
        q.eq("householdId", member.householdId),
      )
      .order("desc")
      .take(100);

    return receipts.flatMap((receipt) =>
      receipt.data && !receipt.excluded
        ? [
            {
              id: receipt._id,
              title: receipt.data.store || "Kvittering",
              detail: receipt.data.purchaseDate || "Uten dato",
              keywords: receipt.data.lines
                .map((line) => line.name)
                .filter(Boolean),
            },
          ]
        : [],
    );
  },
});
