import { useFeatureFlag } from "@/features/featureFlags";
import { releaseMutation } from "@/lib/releases/requests";
import { installedRelease } from "@/lib/releases/client";
import { useReleasePolicy } from "./release-policy";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConvex, useQuery as useConvexQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { CatalogLookup } from "@/lib/catalog/model";
import { normalizeSearch, day, catalogDetailsTtl } from "@/lib/catalog/policy";
import { productSearch } from "@/lib/catalog/search";

export function useDebouncedSearch(search: string) {
  const [term, setTerm] = useState(search);
  useEffect(() => {
    const timeout = setTimeout(() => setTerm(search), 350);

    return () => clearTimeout(timeout);
  }, [search]);

  return term;
}

function useCatalogLookup(
  lookup: CatalogLookup,
  enabled: boolean,
  lifetime: number,
) {
  const convex = useConvex();
  const cache = useQueryClient();
  const { blocked } = useReleasePolicy();
  const productLookup = useFeatureFlag("productLookup");
  const allowed = enabled && !blocked && productLookup;
  const encoded = JSON.stringify(lookup);
  const queryKey = useMemo(() => ["catalog", "lookup", encoded], [encoded]);
  const result = useQuery({
    queryKey,
    queryFn: async () => {
      await releaseMutation(convex, api.catalog.ensure, { lookup });
      return convex.query(api.catalog.observe, {
        lookup,
        client: installedRelease,
      });
    },
    enabled: allowed,
    staleTime: (query) =>
      query.state.data?.status === "pending"
        ? Infinity
        : query.state.data?.status === "error"
          ? 60000
          : lifetime,
  });
  const observed = useConvexQuery(
    api.catalog.observe,
    allowed && result.data?.status === "pending"
      ? { lookup, client: installedRelease }
      : "skip",
  );
  useEffect(() => {
    if (observed) cache.setQueryData(queryKey, observed);
  }, [cache, queryKey, observed]);
  return result;
}
export function useCatalogSearch(
  search: string,
  scope:
    | { kind: "products"; store?: string }
    | { kind: "stores"; receiptId: Id<"receipts"> },
  enabled = true,
) {
  const term = useDebouncedSearch(
    scope.kind === "stores" ? normalizeSearch(search) : productSearch(search),
  );
  return useCatalogLookup(
    { ...scope, search: term },
    enabled && term.length >= 3 && term.length <= 120,
    day,
  );
}
export function useCatalogProduct(key: string) {
  return useCatalogLookup(
    { kind: "details", productKey: key },
    true,
    catalogDetailsTtl,
  );
}
export function useCatalogPrices(key: string, enabled: boolean) {
  return useCatalogLookup(
    { kind: "prices", productKey: key },
    enabled,
    day / 4,
  );
}
