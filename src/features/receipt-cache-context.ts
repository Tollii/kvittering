import { createContext, useContext } from "react";
import type { ReceiptCacheSnapshot } from "../lib/receipt-cache";

export const ReceiptCacheContext = createContext<
  (ReceiptCacheSnapshot & { available: boolean; synchronized: boolean }) | null
>(null);

export function useCachedReceipts() {
  const value = useContext(ReceiptCacheContext);

  if (!value) throw new Error("Receipt cache is not available.");

  return value;
}
