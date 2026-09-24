import type { FunctionArgs } from "convex/server";
import type { api } from "../../convex/_generated/api";
import type { Receipt } from "./domain/insights";
import { productIdentityKey } from "./domain/product-reference";
import { receiptListItem, receiptSearchText } from "./domain/receipt-summary";

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

export function selectReceiptHistory(receipts: Receipt[], search: string) {
  const term = search.trim().toLocaleLowerCase("nb-NO");

  return receipts
    .flatMap((receipt) =>
      receiptSearchText(receipt).includes(term)
        ? [receiptListItem(receipt)]
        : [],
    )
    .sort(
      (left, right) =>
        (right.purchaseDate ?? "").localeCompare(left.purchaseDate ?? "") ||
        right._creationTime - left._creationTime,
    );
}
