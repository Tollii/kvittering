import {
  maxReceiptImages,
  receiptImageLimitMessage,
} from "./domain/receipt-images";
import type { LocalReceipt } from "./upload-queue";

/** Where a capture stands, for the interface. */
export type UploadPhase =
  | { kind: "uploading" }
  | { kind: "offline" }
  /** Waits for the time the service named, and then continues by itself. */
  | { kind: "deferred"; message: string }
  /** Failed; the queue tries again until its attempts run out, then waits for the person. */
  | { kind: "failed" }
  /** Waits for the person; only a manual retry sends it again. */
  | { kind: "rejected"; message: string }
  /** Waits for the person to split the images into two receipts. */
  | { kind: "regroup" };

/** How a phase reads: in progress, waiting by itself, or waiting for the person. */
export type UploadTone = "active" | "waiting" | "attention";

/** Each phase's tone and the one action the person can take. */
const phaseTreatment = {
  uploading: { tone: "active", action: null },
  offline: { tone: "active", action: null },
  deferred: { tone: "waiting", action: null },
  failed: { tone: "attention", action: "retry" },
  rejected: { tone: "attention", action: "retry" },
  regroup: { tone: "attention", action: "regroup" },
} as const satisfies Record<
  UploadPhase["kind"],
  { tone: UploadTone; action: "retry" | "regroup" | null }
>;

export const phaseTone = (phase: UploadPhase) =>
  phaseTreatment[phase.kind].tone;

export const phaseAction = (phase: UploadPhase) =>
  phaseTreatment[phase.kind].action;

/** Whether the person can split an unreserved older capture into two receipts. */
export function canRegroup(entry: LocalReceipt) {
  return (
    entry.failure?.kind === "image_limit" &&
    !entry.receiptId &&
    !entry.uploaded.some(Boolean) &&
    entry.images.length > maxReceiptImages
  );
}

/** The phase a stopped capture is in, or null while it is on its way. */
function stoppedPhase(entry: LocalReceipt): UploadPhase | null {
  switch (entry.failure?.kind) {
    case undefined:
      return null;
    case "failed":
    case "deferred":
    case "rejected":
      return entry.failure;
    case "image_limit":
      return canRegroup(entry)
        ? { kind: "regroup" }
        : { kind: "rejected", message: receiptImageLimitMessage };
  }
}

export function uploadPhase(entry: LocalReceipt, online: boolean): UploadPhase {
  return stoppedPhase(entry) ?? { kind: online ? "uploading" : "offline" };
}

/** Whether a capture waits for the person, which the tab badge counts. */
export function needsPerson(entry: LocalReceipt) {
  const phase = stoppedPhase(entry);

  return !!phase && phaseTone(phase) === "attention";
}
