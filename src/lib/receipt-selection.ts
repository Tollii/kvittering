import { CalendarDate, type CalendarMonth } from "./domain/calendar";
import type { FunctionArgs } from "convex/server";
import type { api } from "../../convex/_generated/api";
import type { Receipt } from "./domain/insights";
import { productIdentityKey } from "./domain/product-reference";
import { isReceiptProcessing } from "./domain/receipt-state";
import {
  receiptListItem,
  receiptSearchText,
  type ReceiptListItem,
} from "./domain/receipt-summary";

export function selectReceipts(
  receipts: Receipt[],
  scope: FunctionArgs<typeof api.receipts.readPage>["scope"],
) {
  const source =
    scope.kind === "priceHistory"
      ? receipts.find((receipt) => receipt._id === scope.receiptId)
      : null;

  const keys = new Set(
    source?.data?.lines.map(productIdentityKey).filter((key) => key !== null),
  );

  return receipts
    .filter((receipt) => {
      const date = receipt.data?.purchaseDate;

      switch (scope.kind) {
        case "period":
          return !!date && date >= scope.start && date <= scope.end;
        case "undated":
          return !date;
        case "inbox":
          return receipt.status !== "reviewed" && !receipt.excluded;
        case "product":
          return receipt.data?.lines.some(
            (line) =>
              line.catalogProduct?.key === scope.key ||
              productIdentityKey(line) === scope.key,
          );
        case "priceHistory":
          return receipt.data?.lines.some((line) => {
            const key = productIdentityKey(line);

            return key !== null && keys.has(key);
          });
        case "allProducts":
          return true;
      }
    })
    .sort((left, right) => right._creationTime - left._creationTime);
}

type ListedState = Readonly<{ status: Receipt["status"]; excluded: boolean }>;

/**
 * Receipts that wait for a person or are still on their way in are pinned above
 * the months in Kvitteringer. An excluded receipt is never pinned.
 */
export function isPinned(receipt: ListedState) {
  return !receipt.excluded && receipt.status !== "reviewed";
}

/**
 * Without a search, a pinned receipt stays out of the months, so each receipt
 * shows once. A search hides the pinned sections, so it lists every read
 * receipt that matches.
 */
export function listedInHistory(receipt: ListedState, search: string) {
  return search.trim()
    ? receipt.excluded || !isReceiptProcessing(receipt.status)
    : !isPinned(receipt);
}

export function selectReceiptHistory(receipts: Receipt[], search: string) {
  const term = search.trim().toLocaleLowerCase("nb-NO");

  return receipts
    .flatMap((receipt) =>
      listedInHistory(receipt, search) &&
      receiptSearchText(receipt).includes(term)
        ? [receiptListItem(receipt)]
        : [],
    )
    .sort(
      (left, right) =>
        (right.purchaseDate && left.purchaseDate
          ? CalendarDate.compare(right.purchaseDate, left.purchaseDate)
          : right.purchaseDate
            ? 1
            : left.purchaseDate
              ? -1
              : 0) || right._creationTime - left._creationTime,
    );
}

/** The month a receipt is listed under in Kvitteringer. */
export function receiptMonth(
  receipt: Readonly<{ purchaseDate: ReceiptListItem["purchaseDate"] }>,
): CalendarMonth | "unknown" {
  return receipt.purchaseDate
    ? CalendarDate.month(receipt.purchaseDate)
    : "unknown";
}

/**
 * The first `limit` receipts of a history sorted by month, extended to the end
 * of the last month it reaches, so every month shown carries its full count
 * and spending.
 */
export function historyPage(receipts: ReceiptListItem[], limit: number) {
  const last = receipts[Math.min(limit, receipts.length) - 1];

  if (!last) return [];

  const end = receipts.findIndex(
    (receipt, index) =>
      index >= limit && receiptMonth(receipt) !== receiptMonth(last),
  );

  return end === -1 ? receipts : receipts.slice(0, end);
}

/** Keep a selection stable when callers construct an equivalent scope on each render. */
export function createReceiptSelector() {
  let previous:
    | { receipts: Receipt[]; key: string; selected: Receipt[] }
    | undefined;

  return (
    receipts: Receipt[],
    scope: FunctionArgs<typeof api.receipts.readPage>["scope"],
  ) => {
    const key = JSON.stringify(scope);

    if (previous?.receipts === receipts && previous.key === key)
      return previous.selected;
    const selected = selectReceipts(receipts, scope);
    previous = { receipts, key, selected };

    return selected;
  };
}
