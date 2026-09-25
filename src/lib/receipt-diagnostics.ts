import type { ReceiptDraft } from "./receipt-draft";

/** Project editor state into measurements; never copy receipt data or draft values. */
export function receiptDraftDiagnostics(
  incomingRevision: number,
  draft: ReceiptDraft,
) {
  return {
    incomingRevision,
    remoteRevision: draft.remote.revision,
    baselineRevision: draft.baseline.revision,
    dirty: draft.dirty,
    operation: draft.operation.kind,
  };
}
