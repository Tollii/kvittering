import { useQueryLifecycle } from "./query-lifecycle-context";
import { useEffect } from "react";
import { useIsFocused } from "expo-router";
import { useConvexAuth } from "convex/react";
import { usePaginatedQuery } from "convex-helpers/react/cache";
import { api } from "../../convex/_generated/api";

/** Search the next bounded page only when the loaded matching queue is empty. */
export function useProductLinkingQueue() {
  const focused = useIsFocused();
  const { isAuthenticated } = useConvexAuth();
  const lifecycle = useQueryLifecycle();

  const active =
    isAuthenticated && focused && lifecycle.active && lifecycle.online;

  const { results, status, loadMore } = usePaginatedQuery(
    api.productLinking.page,
    active ? {} : "skip",
    { initialNumItems: 30 },
  );

  const items = results.flatMap(({ lines, ...receipt }) =>
    lines.map((line) => ({ ...receipt, line })),
  );

  useEffect(() => {
    if (active && focused && items.length === 0 && status === "CanLoadMore")
      loadMore(30);
  }, [active, focused, items.length, status, loadMore]);

  return {
    items,
    complete: status === "Exhausted",
    loading: status !== "Exhausted" && items.length === 0,
  };
}
