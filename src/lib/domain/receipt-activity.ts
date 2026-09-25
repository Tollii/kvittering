/** The most receipts one Live Activity follows. */
export const liveActivityReceiptLimit = 30;

export type ReceiptActivityProgress = {
  total: number;
  completed: number;
  failed: number;
  ended: boolean;
};

/** A failed or removed receipt is terminal, but must never count as successfully processed. */
export function receiptActivityProgress(
  statuses: readonly (string | null)[],
  expired = false,
): ReceiptActivityProgress {
  const completed = statuses.filter(
    (status) => status === "reviewed" || status === "needs_review",
  ).length;

  const failed = statuses.filter(
    (status) => status === null || status === "failed",
  ).length;

  return {
    total: statuses.length,
    completed,
    failed,
    ended: expired || completed + failed === statuses.length,
  };
}
