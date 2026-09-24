import { useEffect, useMemo, useState } from "react";
import { useIsFocused } from "expo-router";
import { useConvexAuth, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../convex/_generated/api";
import { useCachedReceipts } from "./receipt-cache-context";
import { useQueryLifecycle } from "./query-lifecycle-context";
import {
  createReceiptSelector,
  selectReceiptHistory,
} from "../lib/receipt-selection";

/** Existing data remains readable until the bounded server backfill is complete. */
export function useCompleteReceipts(
  scope: FunctionArgs<typeof api.receipts.readPage>["scope"],
  enabled = true,
) {
  const focused = useIsFocused();
  const { isAuthenticated } = useConvexAuth();
  const lifecycle = useQueryLifecycle();
  const cache = useCachedReceipts();

  const active =
    enabled &&
    focused &&
    lifecycle.active &&
    lifecycle.online &&
    isAuthenticated;

  const page = usePaginatedQuery(
    api.receipts.readPage,
    active && !cache.available ? { scope } : "skip",
    { initialNumItems: 50 },
  );

  const { status, loadMore } = page;
  useEffect(() => {
    if (active && !cache.available && status === "CanLoadMore") loadMore(50);
  }, [active, cache.available, status, loadMore]);

  const [select] = useState(createReceiptSelector);
  const selected = select(cache.receipts, scope);

  return cache.available
    ? {
        receipts: selected,
        completeReceipts: cache.synchronized,
        loadingReceipts: !cache.complete,
      }
    : {
        receipts: page.results,
        completeReceipts: active && status === "Exhausted",
        loadingReceipts: active && status !== "Exhausted",
      };
}

export function useReceiptHistory(search: string, enabled: boolean) {
  const focused = useIsFocused();
  const { isAuthenticated } = useConvexAuth();
  const lifecycle = useQueryLifecycle();
  const cache = useCachedReceipts();

  const active =
    enabled &&
    focused &&
    lifecycle.active &&
    lifecycle.online &&
    isAuthenticated;

  const [limit, setLimit] = useState(30);

  const page = usePaginatedQuery(
    api.receipts.history,
    active && !cache.available ? { search } : "skip",
    { initialNumItems: 30 },
  );

  const { status, loadMore } = page;
  useEffect(() => {
    if (active && !cache.available && search.trim() && status === "CanLoadMore")
      loadMore(50);
  }, [active, cache.available, search, status, loadMore]);

  const selected = useMemo(
    () => selectReceiptHistory(cache.receipts, search),
    [cache.receipts, search],
  );

  if (!cache.available) return page;
  const results = search.trim() ? selected : selected.slice(0, limit);

  return {
    results,
    status: !cache.complete
      ? ("LoadingFirstPage" as const)
      : results.length < selected.length
        ? ("CanLoadMore" as const)
        : ("Exhausted" as const),
    loadMore: (count: number) => setLimit((value) => value + count),
    isLoading: !cache.complete,
  };
}

export function useReceiptDetail(id: string) {
  const cache = useCachedReceipts();
  const focused = useIsFocused();
  const { active, online } = useQueryLifecycle();

  const cached = cache.receipts.find((receipt) => receipt._id === id);

  // A deep link can identify a newly created receipt before its change page arrives.
  const detail = useQuery(
    api.receipts.detail,
    !cached && focused && active && online ? { id } : "skip",
  );

  const receipt =
    cached ??
    (detail === null
      ? null
      : (detail?.receipt ?? (!online && cache.complete ? null : undefined)));

  const [retained, setRetained] = useState(receipt);

  if (receipt !== undefined && receipt !== retained) setRetained(receipt);

  return receipt === undefined ? retained : receipt;
}

export function useReceiptEditorContext(
  id: FunctionArgs<typeof api.receipts.editorContext>["id"],
) {
  const cache = useCachedReceipts();
  const focused = useIsFocused();
  const { active, online } = useQueryLifecycle();

  const remote = useQuery(
    api.receipts.editorContext,
    !cache.complete && focused && active && online ? { id } : "skip",
  );

  const local = useMemo(() => {
    const recent = [...cache.receipts].sort(
      (left, right) => right._creationTime - left._creationTime,
    );

    return {
      recentCategories: recent
        .slice(0, 50)
        .flatMap(
          (receipt) =>
            receipt.data?.lines.flatMap((line) =>
              line.categoryId ? [line.categoryId] : [],
            ) ?? [],
        ),
      nextPendingId:
        recent.find(
          (receipt) =>
            receipt._id !== id &&
            !receipt.excluded &&
            (receipt.status === "needs_review" || receipt.status === "failed"),
        )?._id ?? null,
    };
  }, [cache.receipts, id]);

  return cache.complete ? local : remote;
}

/** A small report is available while a new phone downloads its first receipt history. */
export function useInitialSpendingTotals(month: string, through: string) {
  const cache = useCachedReceipts();
  const focused = useIsFocused();
  const { active, online } = useQueryLifecycle();

  return useQuery(
    api.receiptSync.month,
    !cache.complete && focused && active && online
      ? { month, through }
      : "skip",
  );
}
