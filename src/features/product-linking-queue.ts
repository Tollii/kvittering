import { useEffect } from "react";
import { useIsFocused } from "expo-router";
import { useConvexAuth, usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/** Search the next bounded page only when the loaded matching queue is empty. */
export function useProductLinkingQueue() {
  const focused = useIsFocused();
  const { isAuthenticated } = useConvexAuth();
  const active = focused && isAuthenticated;
  const { results, status, loadMore } = usePaginatedQuery(
    api.productLinking.page,
    active ? {} : "skip",
    { initialNumItems: 30 },
  );
  const items = results.flatMap(({ lines, ...receipt }) =>
    lines.map((line) => ({ ...receipt, line })),
  );
  useEffect(() => {
    if (active && items.length === 0 && status === "CanLoadMore") loadMore(30);
  }, [active, items.length, status, loadMore]);
  return {
    items,
    complete: status === "Exhausted",
    loading: status !== "Exhausted" && items.length === 0,
  };
}
