import { hasReceiptBeenRead } from "./domain/receipt-state";
import { z } from "zod";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

type ReceiptSummary = FunctionReturnType<
  typeof api.receipts.history
>["page"][number];

export function shortcutStore(
  value: string | string[] | undefined,
): string | null {
  return z.string().trim().min(1).max(100).safeParse(value).data ?? null;
}

export function shortcutMonth(
  value: string | string[] | undefined,
): string | null {
  return (
    z
      .string()
      .regex(/^(19\d{2}|[2-9]\d{3})-(0[1-9]|1[0-2])$/)
      .safeParse(value).data ?? null
  );
}

/** Call only after all search pages arrive; upload time does not determine purchase order. */
export function latestStoreReceipt(
  receipts: readonly ReceiptSummary[],
  store: string,
): ReceiptSummary | null {
  const term = store.trim().toLocaleLowerCase("nb-NO");

  if (!term) return null;
  let latest: { receipt: ReceiptSummary; date: string } | null = null;

  for (const receipt of receipts) {
    const date = receipt.purchaseDate;

    if (
      receipt.excluded ||
      !date ||
      !hasReceiptBeenRead(receipt.status) ||
      !receipt.store?.toLocaleLowerCase("nb-NO").includes(term)
    )
      continue;

    if (
      !latest ||
      date > latest.date ||
      (date === latest.date &&
        receipt._creationTime > latest.receipt._creationTime)
    )
      latest = { receipt, date };
  }

  return latest?.receipt ?? null;
}
