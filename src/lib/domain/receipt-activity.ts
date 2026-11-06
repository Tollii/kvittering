import type { ReceiptStatus } from "./receipt-state";

/** The most receipts one Live Activity follows. */
export const liveActivityReceiptLimit = 30;

/** The most Live Activities one person follows at once; registering another ends the oldest. */
export const liveActivitiesPerPerson = 3;

export type ReceiptActivityProgress = {
  total: number;
  completed: number;
  failed: number;
  ended: boolean;
};

type ReceiptActivityOutcome = "working" | "completed" | "failed";

/** `null` is a receipt that was deleted or moved out of the activity's household. */
function receiptActivityOutcome(
  status: ReceiptStatus | null,
): ReceiptActivityOutcome {
  switch (status) {
    case "uploading":
    case "uploaded":
    case "processing":
      return "working";
    case "needs_review":
    case "reviewed":
      return "completed";
    case "failed":
    case null:
      return "failed";
  }
}

/** A failed or removed receipt is terminal, but must never count as successfully processed. */
export function receiptActivityProgress(
  statuses: readonly (ReceiptStatus | null)[],
  expired = false,
): ReceiptActivityProgress {
  const outcomes = statuses.map(receiptActivityOutcome);

  const completed = outcomes.filter(
    (outcome) => outcome === "completed",
  ).length;

  const failed = outcomes.filter((outcome) => outcome === "failed").length;

  return {
    total: statuses.length,
    completed,
    failed,
    ended: expired || completed + failed === statuses.length,
  };
}
