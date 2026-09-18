import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { normalizeSearch, day } from "@/lib/catalog/policy";
import { productSearch } from "@/lib/catalog/search";

export function useCatalogSearch(search: string, receiptId?: Id<"receipts">) {
  const convex = useConvex();
  const [term, setTerm] = useState("");
  useEffect(() => {
    const timeout = setTimeout(
      () =>
        setTerm(receiptId ? normalizeSearch(search) : productSearch(search)),
      350,
    );
    return () => clearTimeout(timeout);
  }, [search, receiptId]);
  return useQuery({
    queryKey: [
      "catalog",
      receiptId ? "stores" : "products",
      receiptId ?? null,
      term,
    ],
    queryFn: () =>
      receiptId
        ? convex.mutation(api.catalog.searchStores, { receiptId, search: term })
        : convex.mutation(api.catalog.searchProducts, { search: term }),
    enabled: term.length >= 3 && term.length <= 120,
    staleTime: (query) => (query.state.data?.status === "error" ? 60000 : day),
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 2000 : false,
  });
}
export function useCatalogProduct(key: string) {
  const convex = useConvex();
  return useQuery({
    queryKey: ["catalog", "product", key],
    queryFn: () => convex.mutation(api.catalog.product, { key }),
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 2000 : false,
  });
}
export function useCatalogPrices(key: string, enabled: boolean) {
  const convex = useConvex();
  return useQuery({
    queryKey: ["catalog", "prices", key],
    queryFn: () => convex.mutation(api.catalog.prices, { productKey: key }),
    enabled,
    staleTime: day / 4,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 2000 : false,
  });
}
