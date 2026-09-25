import { expect, it } from "vitest";
import { receiptFixture } from "./testing/receipts";
import { createReceiptDraft, reduceReceiptDraft } from "./receipt-draft";
import { receiptDraftDiagnostics } from "./receipt-diagnostics";
import { diagnosticScreen } from "./navigation-diagnostics";

it("describes a stale snapshot and unsaved work without copying receipt values", () => {
  const receipt = receiptFixture({ revision: 4 });

  const draft = reduceReceiptDraft(createReceiptDraft(receipt), {
    type: "edit",
    values: { excluded: true },
  });

  const saving = reduceReceiptDraft(draft, {
    type: "start",
    operation: "saving",
  });

  expect(receiptDraftDiagnostics(3, saving)).toEqual({
    incomingRevision: 3,
    remoteRevision: 4,
    baselineRevision: 4,
    dirty: true,
    operation: "saving",
  });
});

it("uses route templates without accepting receipt identifiers or search parameters", () => {
  expect(diagnosticScreen(["receipt", "[id]"])).toBe("receipt/[id]");
  expect(diagnosticScreen(["(tabs)", "history"])).toBe("(tabs)/history");
  expect(diagnosticScreen(["receipt", "PRIVATE_RECEIPT_ID"])).toBe("unknown");
  expect(diagnosticScreen(["settings?token=PRIVATE"])).toBe("unknown");
});
