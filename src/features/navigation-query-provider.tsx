import { useContext, useEffect, type PropsWithChildren } from "react";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache";
import { ConvexQueryCacheContext } from "convex-helpers/react/cache/provider";

/** Retain live results for return navigation within one account and household. */
export function NavigationQueryProvider({ children }: PropsWithChildren) {
  return (
    <ConvexQueryCacheProvider expiration={5 * 60_000} maxIdleEntries={40}>
      <QueryCacheCleanup />
      {children}
    </ConvexQueryCacheProvider>
  );
}

function QueryCacheCleanup() {
  const { registry } = useContext(ConvexQueryCacheContext);
  useEffect(() => {
    // The helper retains subscriptions after unmount and has no disposal API.
    // Release them immediately when this account or household is removed.
    return () => {
      if (!registry) return;

      for (const entry of registry.queries.values()) {
        if (entry.evictTimer !== null) clearTimeout(entry.evictTimer);
        entry.unsub();
      }

      registry.queries.clear();
      registry.subs.clear();
      registry.idle = 0;
    };
  }, [registry]);

  return null;
}
