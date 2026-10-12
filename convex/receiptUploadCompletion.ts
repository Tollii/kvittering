import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { WithoutSystemFields } from "convex/server";
import { internal } from "./_generated/api";
import { start } from "@convex-dev/workflow";
import { trackWorkflow } from "./retention";
import type { ReceiptData } from "../src/lib/domain/receipt";

type Uploader = Pick<Doc<"members">, "householdId" | "identity" | "name">;

/** A receipt that waits for its evidence before processing begins. */
export function newReceipt(
  member: Uploader,
  clientId: string,
  imageCount: number,
): WithoutSystemFields<Doc<"receipts">> {
  return {
    householdId: member.householdId,
    uploadedBy: member.identity,
    uploaderName: member.name,
    clientId,
    imageCount,
    status: "uploading",
    revision: 0,
    generation: 0,
    data: null,
    provider: "pending",
    duplicateResolved: false,
    excluded: false,
  };
}

/** The household's receipt for a client request, so a repeated request finds it. */
export function receiptByClientId(
  ctx: MutationCtx,
  householdId: Id<"households">,
  clientId: string,
) {
  return ctx.db
    .query("receipts")
    .withIndex("by_householdId_and_clientId", (q) =>
      q.eq("householdId", householdId).eq("clientId", clientId),
    )
    .unique();
}

export async function beginUploadedReceipt(
  ctx: MutationCtx,
  id: Id<"receipts">,
  imageCount: number,
) {
  await ctx.db.patch("receipts", id, { status: "uploaded", generation: 1 });

  const workflowId = await start(
    ctx,
    internal.processing.processReceipt,
    { id, generation: 1 },
    {
      onComplete: internal.retention.workflowCompleted,
      context: { component: "processing", receiptId: id },
    },
  );

  await trackWorkflow(ctx, workflowId, "processing", id);
  console.info("receipt.upload_completed", {
    receiptId: id,
    generation: 1,
    imageCount,
  });
}

/**
 * Create a receipt whose evidence is not an image, such as a store order or a
 * purchase a person typed in, and begin processing it. Processing reads the
 * evidence from `receiptImports`, also on a retry.
 */
export async function startImportedReceipt(
  ctx: MutationCtx,
  member: Uploader,
  evidence: Pick<Doc<"receiptImports">, "provider" | "orderNumber"> & {
    clientId: string;
    data: ReceiptData;
  },
) {
  const id = await ctx.db.insert(
    "receipts",
    newReceipt(member, evidence.clientId, 0),
  );

  await ctx.db.insert("receiptImports", {
    householdId: member.householdId,
    provider: evidence.provider,
    orderNumber: evidence.orderNumber,
    receiptId: id,
    data: evidence.data,
  });
  await beginUploadedReceipt(ctx, id, 0);

  return id;
}
