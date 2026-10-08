import { Triggers } from "convex-helpers/server/triggers";
import {
  customCtx,
  customMutation,
} from "convex-helpers/server/customFunctions";
import {
  mutation as rawMutation,
  internalMutation as rawInternalMutation,
} from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import { updateReceiptReadModel } from "./receiptReadModel";

const triggers = new Triggers<DataModel>();

triggers.register("receipts", async (ctx, change) => {
  await updateReceiptReadModel(
    ctx,
    change.newDoc ?? change.oldDoc,
    change.operation === "delete",
  );
});

// A deleted receipt takes its imported order data with it.
triggers.register("receipts", async (ctx, change) => {
  if (change.operation !== "delete") return;

  const imported = await ctx.db
    .query("receiptImports")
    .withIndex("by_receiptId", (q) => q.eq("receiptId", change.id))
    .unique();

  // The order number stays, so the next sync does not bring the receipt back.
  if (imported)
    await ctx.db.patch("receiptImports", imported._id, {
      receiptId: undefined,
      data: undefined,
    });
});

export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));

export const internalMutation = customMutation(
  rawInternalMutation,
  customCtx(triggers.wrapDB),
);
