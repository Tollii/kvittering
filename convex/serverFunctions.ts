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

// A deleted receipt takes the Oda order it was imported from with it.
triggers.register("receipts", async (ctx, change) => {
  if (change.operation !== "delete") return;

  const imported = await ctx.db
    .query("odaImports")
    .withIndex("by_receiptId", (q) => q.eq("receiptId", change.id))
    .unique();

  if (imported) await ctx.db.delete("odaImports", imported._id);
});

export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));

export const internalMutation = customMutation(
  rawInternalMutation,
  customCtx(triggers.wrapDB),
);
