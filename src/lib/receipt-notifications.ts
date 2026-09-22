export const receiptReviewCategory = "receipt-review";

export const reviewReceiptAction = "review-receipt";

export const remindReceiptAction = "remind-receipt";

/** Use the device's local evening, including daylight-saving transitions. */
export function nextReviewEvening(now: Date): Date {
  const evening = new Date(now);
  evening.setHours(20, 0, 0, 0);

  if (evening <= now) evening.setDate(evening.getDate() + 1);

  return evening;
}
