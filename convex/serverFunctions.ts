import { Triggers } from "convex-helpers/server/triggers";
import {
  customCtx,
  customMutation,
} from "convex-helpers/server/customFunctions";
import {
  query as rawQuery,
  internalQuery as rawInternalQuery,
  mutation as rawMutation,
  internalMutation as rawInternalMutation,
  action as rawAction,
  internalAction as rawInternalAction,
  httpAction as rawHttpAction,
} from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import { updateReceiptReadModel } from "./receiptReadModel";
import { tracedBuilder, tracedHttpHandler, type HttpHandler } from "./tracing";

/**
 * The application's Convex function builders. Each one traces its handler
 * where the function is defined: a root span per call, named after the
 * function, with its outcome and request context (see ./tracing). Import
 * these instead of the generated builders; the `kvitto/traced-exports` lint
 * rule enforces it.
 */

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

export const query = tracedBuilder("query", rawQuery);

export const internalQuery = tracedBuilder("query", rawInternalQuery);

export const mutation = tracedBuilder(
  "mutation",
  customMutation(rawMutation, customCtx(triggers.wrapDB)),
);

export const internalMutation = tracedBuilder(
  "mutation",
  customMutation(rawInternalMutation, customCtx(triggers.wrapDB)),
);

export const action = tracedBuilder("action", rawAction);

export const internalAction = tracedBuilder("action", rawInternalAction);

/**
 * An HTTP action that continues the caller's trace from its W3C
 * `traceparent` header.
 */
export function httpAction(handler: HttpHandler) {
  return rawHttpAction(tracedHttpHandler(handler));
}
