import { shouldPersistCatalogQuery } from "@/lib/catalog-cache-schema";
import { useState, type ReactNode } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { catalogPersister } from "@/lib/catalog-cache";
import { day } from "@/lib/catalog/policy";

export function CatalogQueryProvider({
  scope,
  children,
}: {
  scope: string;
  children: ReactNode;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: day, gcTime: 7 * day, retry: 1 },
        },
      }),
  );

  const [persister] = useState(() => catalogPersister(scope));

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: 7 * day,
        buster: "catalog-v2",
        dehydrateOptions: {
          shouldDehydrateQuery: shouldPersistCatalogQuery,
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
