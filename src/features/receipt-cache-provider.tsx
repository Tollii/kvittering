import {
  retainReceiptImageScope,
  removeCachedReceiptImages,
} from "@/lib/receipt-image-cache";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useConvex, useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { receiptCache, retainReceiptCache } from "@/lib/receipt-cache-storage";
import { ReceiptCacheContext } from "./receipt-cache-context";
import { reportError } from "@/lib/observability";
import { useQueryLifecycle } from "./query-lifecycle";
import { Notice } from "@/components/ui";

export function ReceiptCacheProvider({
  owner,
  household,
  children,
}: Readonly<{
  owner: string;
  household: Id<"households">;
  children: ReactNode;
}>) {
  const [cache] = useState(() => receiptCache(owner, household));

  const snapshot = useSyncExternalStore(
    cache.subscribe,
    cache.read,
    cache.read,
  );

  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const { active, online } = useQueryLifecycle();

  const head = useQuery(
    api.receiptSync.head,
    active && online && isAuthenticated ? {} : "skip",
  );

  const [failure, setFailure] = useState(0);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    retainReceiptCache(owner, household);
    retainReceiptImageScope(owner, household);
  }, [owner, household]);

  useEffect(() => {
    if (!head?.ready || !active || !online || !isAuthenticated)
      return undefined;
    const through = head.sequence;
    const control = { cancelled: false };
    const isCancelled = () => control.cancelled;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function synchronize() {
      try {
        while (!isCancelled()) {
          const current = cache.read();

          if (current.complete && current.sequence >= through) break;

          const page = await convex.query(api.receiptSync.changes, {
            after: current.sequence,
            through: through,
          });

          if (isCancelled()) return;
          cache.apply(current.sequence, page);

          for (const change of page.changes)
            if (!change.receipt) removeCachedReceiptImages(change.id);

          if (page.done) break;
        }

        if (!isCancelled()) setFailure(0);
      } catch (error) {
        if (isCancelled()) return;
        reportError(error, "receipt.synchronization");
        setFailure((count) => count + 1);
        timer = setTimeout(
          () => setRetry((value) => value + 1),
          Math.min(15 * 60_000, 30_000 * 2 ** Math.min(retry, 5)),
        );
      }
    }

    void synchronize();

    return () => {
      control.cancelled = true;

      if (timer) clearTimeout(timer);
    };
  }, [cache, convex, head, active, online, isAuthenticated, retry]);

  return (
    <ReceiptCacheContext.Provider
      value={{
        ...snapshot,
        available:
          snapshot.complete || snapshot.sequence > 0 || head?.ready === true,
        synchronized:
          snapshot.complete &&
          (!online ||
            (head?.ready === true && snapshot.sequence === head.sequence)),
      }}
    >
      {failure > 0 && (
        <Notice>
          Viser lagrede kvitteringer. Nye endringer hentes når forbindelsen er
          klar.
        </Notice>
      )}
      {children}
    </ReceiptCacheContext.Provider>
  );
}
