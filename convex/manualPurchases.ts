import { v } from "convex/values";
import { clientMutation as mutation } from "./clientFunctions";
import { requireMember } from "./access";
import { userError } from "./userErrors";
import { consumeReceiptQuota } from "./rateLimits";
import { beginUploadedReceipt } from "./receiptUploadCompletion";
import {
  manualPurchaseReceipt,
  manualPurchaseValidator,
} from "../src/lib/domain/manual-purchase";

/**
 * Record a purchase a person typed in, such as a cash purchase or a lost
 * receipt. It has no images, so processing reads the typed purchase as it
 * reads an imported order, through the same classification and review.
 */
export const add = mutation({
  service: "receiptProcessing",
  args: {
    clientId: v.string(),
    householdId: v.id("households"),
    purchase: manualPurchaseValidator,
  },
  returns: v.id("receipts"),
  handler: async (ctx, args) => {
    const member = await requireMember(ctx);

    if (member.householdId !== args.householdId)
      throw userError("Husstanden er endret. Logg inn på nytt.");

    if (!/^[\w-]{16,80}$/.test(args.clientId)) throw userError("Ugyldig kjøp.");

    const existing = await ctx.db
      .query("receipts")
      .withIndex("by_householdId_and_clientId", (q) =>
        q.eq("householdId", member.householdId).eq("clientId", args.clientId),
      )
      .unique();

    if (existing) return existing._id;

    const checked = manualPurchaseReceipt(args.purchase);

    if (checked.kind === "invalid") throw userError(checked.message);
    await consumeReceiptQuota(ctx, member, { imagesWait: false });

    const id = await ctx.db.insert("receipts", {
      householdId: member.householdId,
      uploadedBy: member.identity,
      uploaderName: member.name,
      clientId: args.clientId,
      imageCount: 0,
      status: "uploading",
      revision: 0,
      generation: 0,
      data: null,
      provider: "pending",
      duplicateResolved: false,
      excluded: false,
    });

    await ctx.db.insert("receiptImports", {
      householdId: member.householdId,
      provider: "manual",
      orderNumber: args.clientId,
      receiptId: id,
      data: checked.receipt,
    });
    await beginUploadedReceipt(ctx, id, 0);

    return id;
  },
});
