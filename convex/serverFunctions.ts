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

// A deleted receipt takes its imported evidence with it.
triggers.register("receipts", async (ctx, change) => {
  if (change.operation !== "delete") return;

  const imported = await ctx.db
    .query("receiptImports")
    .withIndex("by_receiptId", (q) => q.eq("receiptId", change.id))
    .unique();

  if (!imported) return;

  switch (imported.provider) {
    case "oda":
      // The order number stays, so the next sync does not bring the receipt back.
      await ctx.db.patch("receiptImports", imported._id, {
        receiptId: undefined,
        data: undefined,
      });
      break;
    case "manual":
      await ctx.db.delete("receiptImports", imported._id);
      break;
  }
});

export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));

export const internalMutation = customMutation(
  rawInternalMutation,
  customCtx(triggers.wrapDB),
);
