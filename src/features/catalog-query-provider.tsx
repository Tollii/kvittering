import { useEffect, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import {
  focusManager,
  onlineManager,
  QueryClient,
} from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { catalogPersister } from "@/lib/catalog-cache";
import { day } from "@/lib/catalog/policy";

export function CatalogQueryProvider({
  scope,
  online,
  children,
}: {
  scope: string;
  online: boolean;
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
  useEffect(() => {
    onlineManager.setOnline(online);
  }, [online]);
  useEffect(() => {
    focusManager.setFocused(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (state) =>
      focusManager.setFocused(state === "active"),
    );
    return () => {
      subscription.remove();
      client.clear();
      void persister.removeClient();
    };
  }, [client, persister]);
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: 7 * day,
        buster: "catalog-v1",
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" &&
            query.queryKey[0] === "catalog" &&
            (!query.state.data ||
              typeof query.state.data !== "object" ||
              !("status" in query.state.data) ||
              query.state.data.status === "ready"),
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
