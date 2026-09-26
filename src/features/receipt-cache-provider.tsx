import {
  retainReceiptImageScope,
  removeCachedReceiptImages,
} from "@/lib/receipt-image-cache";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  useConvex,
  useConvexAuth,
  useQuery,
  type ConvexReactClient,
} from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { receiptCache, retainReceiptCache } from "@/lib/receipt-cache-storage";
import { ReceiptCacheContext } from "./receipt-cache-context";
import { reportError } from "@/lib/observability";
import { useQueryLifecycle } from "./query-lifecycle-context";
import { Notice } from "@/components/ui/surfaces";

const emptySnapshot: import("@/lib/receipt-cache").ReceiptCacheSnapshot = {
  receipts: [],
  sequence: 0,
  complete: false,
};

const readEmpty = () => emptySnapshot;

const subscribeEmpty = () => () => {};

type PullOutcome = "complete" | "cancelled" | "write-failed";

/**
 * Applies change pages to the cache until it holds every change through
 * `through`. Query failures propagate to the caller; a failed cache write
 * is reported here.
 */
async function pullReceiptChanges(
  cache: NonNullable<ReturnType<typeof receiptCache>>,
  convex: ConvexReactClient,
  through: number,
  isCancelled: () => boolean,
): Promise<PullOutcome> {
  while (!isCancelled()) {
    const current = cache.read();

    if (current.complete && current.sequence >= through) return "complete";

    const page = await convex.query(api.receiptSync.changes, {
      after: current.sequence,
      through: through,
    });

    if (isCancelled()) return "cancelled";

    try {
      cache.apply(current.sequence, page);
    } catch (error) {
      reportError(error, "receipt.cache_write");

      return "write-failed";
    }

    for (const change of page.changes)
      if (!change.receipt) removeCachedReceiptImages(change.id);

    if (page.done) return "complete";
  }

  return "cancelled";
}

export function ReceiptCacheProvider({
  owner,
  household,
  children,
}: Readonly<{
  owner: string;
  household: Id<"households">;
  children?: ReactNode;
}>) {
  const [cache, setCache] = useState(() => {
    try {
      return receiptCache(owner, household);
    } catch (error) {
      reportError(error, "receipt.cache_open");

      return null;
    }
  });

  const snapshot = useSyncExternalStore(
    cache?.subscribe ?? subscribeEmpty,
    cache?.read ?? readEmpty,
    cache?.read ?? readEmpty,
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
  const consecutiveFailures = useRef(0);
  useEffect(() => {
    retainReceiptCache(owner, household);
    retainReceiptImageScope(owner, household);
  }, [owner, household]);

  useEffect(() => {
    if (!cache || !head?.ready || !active || !online || !isAuthenticated)
      return undefined;
    const currentCache = cache;
    const through = head.sequence;
    const control = { cancelled: false };
    const isCancelled = () => control.cancelled;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function synchronize() {
      try {
        const outcome = await pullReceiptChanges(
          currentCache,
          convex,
          through,
          isCancelled,
        );

        if (outcome === "write-failed") {
          setCache(null);

          return;
        }

        if (outcome === "complete" && !isCancelled()) {
          consecutiveFailures.current = 0;
          setFailure(0);
        }
      } catch (error) {
        if (isCancelled()) return;
        reportError(error, "receipt.synchronization");
        const count = consecutiveFailures.current;
        consecutiveFailures.current++;
        setFailure(count + 1);
        timer = setTimeout(
          () => setRetry((value) => value + 1),
          Math.min(15 * 60_000, 30_000 * 2 ** Math.min(count, 5)),
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
          cache !== null &&
          (snapshot.complete || snapshot.sequence > 0 || head?.ready === true),
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
