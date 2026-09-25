import type { ReactNode } from "react";
import type { ReceiptDraft, ReceiptDraftAction } from "@/lib/receipt-draft";
import { receiptDraftDiagnostics } from "@/lib/receipt-diagnostics";
import { useDraftNavigation } from "./receipt-draft-navigation";
import { ReceiptRenderBoundary } from "./receipt-render-boundary";

/** Keep unsaved edits protected while the editor's error fallback is visible. */
export function ReceiptDraftBoundary({
  draft,
  dispatch,
  incomingRevision,
  children,
}: Readonly<{
  draft: ReceiptDraft;
  dispatch: (action: ReceiptDraftAction) => void;
  incomingRevision: number;
  children: ReactNode;
}>) {
  useDraftNavigation(draft, () => dispatch({ type: "discard" }));

  return (
    <ReceiptRenderBoundary
      diagnostics={receiptDraftDiagnostics(incomingRevision, draft)}
    >
      {children}
    </ReceiptRenderBoundary>
  );
}
