import { useEffect, useState } from "react";
import { useIsFocused } from "expo-router";
import { useConvexAuth } from "convex/react";
import { usePaginatedQuery } from "convex-helpers/react/cache";
import type { FunctionArgs } from "convex/server";
import { api } from "../../convex/_generated/api";

/** Load on first use, then preserve pagination until the screen unmounts. */
function useQueryRequested(enabled: boolean) {
  const [requested, setRequested] = useState(enabled);

  if (enabled && !requested) setRequested(true);

  return enabled || requested;
}

/** Reports are complete only when every page in their declared scope is loaded. */
export function useCompleteReceipts(
  scope: FunctionArgs<typeof api.receipts.readPage>["scope"],
  enabled = true,
) {
  const focused = useIsFocused();
  const { isAuthenticated } = useConvexAuth();
  const requested = useQueryRequested(enabled);
  const active = requested && isAuthenticated;

  const page = usePaginatedQuery(
    api.receipts.readPage,
    active ? { scope } : "skip",
    { initialNumItems: 50 },
  );

  const { status, loadMore } = page;
  useEffect(() => {
    if (active && focused && enabled && status === "CanLoadMore") loadMore(50);
  }, [active, focused, enabled, status, loadMore]);

  return {
    receipts: page.results,
    completeReceipts: active && status === "Exhausted",
    loadingReceipts: active && status !== "Exhausted",
  };
}
export function useReceiptHistory(search: string, enabled: boolean) {
  const focused = useIsFocused();
  const { isAuthenticated } = useConvexAuth();
  const requested = useQueryRequested(enabled);
  const active = requested && isAuthenticated;

  const page = usePaginatedQuery(
    api.receipts.history,
    active ? { search } : "skip",
    { initialNumItems: 30 },
  );
  const { status, loadMore } = page;
  // Global substring search scans all pages; the ordinary list loads on demand.
  useEffect(() => {
    if (
      active &&
      focused &&
      enabled &&
      search.trim() &&
      status === "CanLoadMore"
    )
      loadMore(50);
  }, [active, focused, enabled, search, status, loadMore]);

  return page;
}
