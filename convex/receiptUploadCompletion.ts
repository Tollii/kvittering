import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { start } from "@convex-dev/workflow";
import { trackWorkflow } from "./retention";

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
