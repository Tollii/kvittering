import {
  parseReceiptIssue,
  receiptIssueText,
} from "../src/lib/domain/receipt-issues";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  parseReceipt,
  type ParsedReceipt,
  type ReceiptData,
} from "../src/lib/domain/receipt";
import { assessReceipt } from "../src/lib/domain/receipt-review";

export const receiptCommitValidator = v.object({
  receiptId: v.id("receipts"),
  revision: v.number(),
});
export type ReceiptCommitAcknowledgement = {
  receiptId: Id<"receipts">;
  revision: number;
};
export type ReceiptChangeOrigin =
  | { kind: "human"; editor: string; reviewed: boolean }
  | { kind: "alias" | "correction" | "undo"; editor: string }
  | { kind: "product_link"; editor: string }
  | { kind: "catalog" }
  | {
      kind: "extraction";
      provider: string;
      next: "catalog" | "analysis" | "none";
    };
export type ReceiptChangeInput = {
  previous: Pick<
    Doc<"receipts">,
    "revision" | "status" | "provider" | "autoAccepted"
  >;
  data: ParsedReceipt;
  unresolvedDuplicate: boolean;
  origin: ReceiptChangeOrigin;
};

/** Approval and revision policy has no storage or clock effects. Learning stays with human commands. */
export function decideReceiptChange({
  previous,
  data,
  unresolvedDuplicate,
  origin,
}: ReceiptChangeInput) {
  if (origin.kind === "product_link")
    return {
      revision: previous.revision + 1,
      status: previous.status,
      autoAccepted: previous.autoAccepted,
    };
  const acceptable = assessReceipt(data, unresolvedDuplicate).acceptable;
  if (origin.kind === "human" && origin.reviewed && !acceptable)
    throw new Error("Kontroller avvik og uklare felt før godkjenning.");
  const provider =
    origin.kind === "extraction" ? origin.provider : previous.provider;
  const automatic =
    acceptable &&
    !provider.includes("mock") &&
    (origin.kind !== "extraction" || previous.revision === 0) &&
    origin.kind !== "undo";
  const reviewed =
    acceptable &&
    ((origin.kind === "human" && origin.reviewed) ||
      automatic ||
      (origin.kind !== "extraction" && previous.status === "reviewed"));
  return {
    revision: previous.revision + (origin.kind === "extraction" ? 0 : 1),
    status: reviewed ? ("reviewed" as const) : ("needs_review" as const),
    autoAccepted:
      origin.kind === "human"
        ? false
        : reviewed &&
          (previous.status !== "reviewed" || previous.autoAccepted === true),
  };
}

/** Commit within the caller's mutation. Recheck the snapshot before writing history or data. */
export async function commitReceiptChange(
  ctx: MutationCtx,
  input: {
    receiptId: Id<"receipts">;
    expected: { revision: number; generation: number };
    data: ReceiptData;
    origin: ReceiptChangeOrigin;
    duplicate?: { duplicateOf: Id<"receipts"> | undefined; resolved: boolean };
    excluded?: boolean;
  },
): Promise<ReceiptCommitAcknowledgement> {
  const previous = await ctx.db.get("receipts", input.receiptId);
  if (
    !previous ||
    previous.revision !== input.expected.revision ||
    previous.generation !== input.expected.generation
  )
    throw new Error("Kvitteringen er endret. Hent siste versjon.");
  const parsed = parseReceipt(input.data);
  if (parsed.kind === "rejected") throw new Error(parsed.issue.message);
  const duplicateOf = input.duplicate
    ? input.duplicate.duplicateOf
    : previous.duplicateOf;
  const duplicateResolved =
    input.duplicate?.resolved ?? previous.duplicateResolved;
  const decision = decideReceiptChange({
    previous,
    data: parsed.receipt,
    unresolvedDuplicate: !!duplicateOf && !duplicateResolved,
    origin: input.origin,
  });
  if (previous.data && input.origin.kind !== "extraction")
    await ctx.db.insert("revisions", {
      receiptId: previous._id,
      data: previous.data,
      revision: previous.revision,
      editor: "editor" in input.origin ? input.origin.editor : "catalog",
    });
  await ctx.db.patch("receipts", previous._id, {
    ...decision,
    productLinkUndo: undefined,
    // Keep the installed-client representation at the storage boundary.
    data: {
      ...parsed.receipt,
      issues: parsed.receipt.issues.map((issue) =>
        receiptIssueText(parseReceiptIssue(issue)),
      ),
      lines: parsed.receipt.lines.map((line) => ({
        ...line,
        issues: line.issues.map((issue) =>
          receiptIssueText(parseReceiptIssue(issue)),
        ),
      })),
    },
    duplicateOf,
    duplicateResolved,
    excluded: input.excluded ?? previous.excluded,
    ...(input.origin.kind === "human" || input.origin.kind === "extraction"
      ? { error: undefined }
      : {}),
    ...(input.origin.kind === "extraction"
      ? {
          provider: input.origin.provider,
          catalogStatus: undefined,
          catalogWorkflowId: undefined,
        }
      : {}),
  });
  if (input.origin.kind === "extraction" && input.origin.next === "catalog")
    await ctx.scheduler.runAfter(0, internal.catalogMatching.start, {
      id: previous._id,
      generation: previous.generation,
    });
  else if (
    input.origin.kind !== "extraction" ||
    input.origin.next === "analysis"
  )
    await ctx.scheduler.runAfter(0, internal.productAnalysis.start, {
      id: previous._id,
    });
  return { receiptId: previous._id, revision: decision.revision };
}
