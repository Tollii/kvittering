import { useContext, useEffect, type PropsWithChildren } from "react";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache";
import { ConvexQueryCacheContext } from "convex-helpers/react/cache/provider";

/** Release unused subscriptions; receipt data is retained separately in SQLite. */
export function NavigationQueryProvider({
  children,
}: Readonly<PropsWithChildren>) {
  return (
    <ConvexQueryCacheProvider expiration={0} maxIdleEntries={0}>
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
