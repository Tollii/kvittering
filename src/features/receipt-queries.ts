import { useEffect } from "react";
import { useIsFocused } from "expo-router";
import { useConvexAuth, usePaginatedQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../convex/_generated/api";

/** Reports are complete only when every page in their declared scope is loaded. */
export function useCompleteReceipts(
  scope: FunctionArgs<typeof api.receipts.readPage>["scope"],
  enabled = true,
) {
  const focused = useIsFocused();
  const { isAuthenticated } = useConvexAuth();
  const active = focused && enabled && isAuthenticated;
  const page = usePaginatedQuery(
    api.receipts.readPage,
    active ? { scope } : "skip",
    { initialNumItems: 50 },
  );
  const { status, loadMore } = page;
  useEffect(() => {
    if (active && status === "CanLoadMore") loadMore(50);
  }, [active, status, loadMore]);
  return {
    receipts: page.results,
    completeReceipts: active && status === "Exhausted",
    loadingReceipts: active && status !== "Exhausted",
  };
}
export function useReceiptHistory(search: string, enabled: boolean) {
  const focused = useIsFocused();
  const { isAuthenticated } = useConvexAuth();
  const active = enabled && focused && isAuthenticated;
  const page = usePaginatedQuery(
    api.receipts.history,
    active ? { search } : "skip",
    { initialNumItems: 30 },
  );
  const { status, loadMore } = page;
  // Global substring search scans all pages; the ordinary list loads on demand.
  useEffect(() => {
    if (active && search.trim() && status === "CanLoadMore") loadMore(50);
  }, [active, search, status, loadMore]);
  return page;
}
