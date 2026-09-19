import { removeAccountCatalogCache } from "@/lib/catalog-cache";
import { removedAccount, useQueryLifecycle } from "./query-lifecycle";
import { ReleaseDiagnostics } from "./release-diagnostics";
import { recordEvent, reportError } from "@/lib/observability";
import { ReleasePolicyProvider, useReleasePolicy } from "./release-policy";
import { receiptUploadTransport } from "@/lib/receipt-upload-transport";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import {
  ConvexProviderWithAuth,
  ConvexReactClient,
  useConvex,
  useConvexAuth,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { api } from "../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import type { Receipt } from "@/lib/domain/insights";
import {
  authClient,
  convexSiteUrl,
  convexUrl,
  fetchAccessToken,
} from "@/lib/auth-client";
import {
  subscribeStorage,
  cachedHousehold,
  cacheHousehold,
  receiptStorage,
  type CachedHousehold,
} from "@/lib/receipt-storage";
import { createQueueRunner, type LocalReceipt } from "@/lib/upload-queue";
import { Loading, Notice, Screen } from "@/components/ui";
import { CatalogQueryProvider } from "./catalog-query-provider";
import { SignIn, HouseholdSetup } from "./sign-in";

type Household = NonNullable<FunctionReturnType<typeof api.households.current>>;
type SessionData = {
  owner: string;
  household: CachedHousehold;
  details: Household | undefined;
  receipts: Receipt[];
  loadingReceipts: boolean;
  completeReceipts: boolean;
  online: boolean;
  queue: LocalReceipt[];
  synchronize: (retryFailed?: boolean) => Promise<void>;
};
const emptyQueue: LocalReceipt[] = [];
const SessionContext = createContext<SessionData | null>(null);
const client = convexUrl
  ? new ConvexReactClient(convexUrl, { unsavedChangesWarning: false })
  : null;
const drainQueue = createQueueRunner(receiptStorage, recordEvent);
export function useHousehold() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Husstanden er ikke klar.");
  return value;
}

function useSessionAuth() {
  const session = authClient.useSession();
  const sessionId = session.data?.session.id;
  const token = useCallback(async () => {
    if (!sessionId) return null;
    try {
      return await fetchAccessToken();
    } catch {
      return null;
    }
  }, [sessionId]);
  return {
    isLoading: session.isPending,
    isAuthenticated: !!sessionId,
    fetchAccessToken: token,
  };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  if (!client || !convexSiteUrl)
    return (
      <Screen title="Kvitto">
        <Notice>
          Legg til EXPO_PUBLIC_CONVEX_URL og EXPO_PUBLIC_CONVEX_SITE_URL i
          .env.local, og start appen på nytt.
        </Notice>
      </Screen>
    );
  return (
    <ConvexProviderWithAuth client={client} useAuth={useSessionAuth}>
      <ReleasePolicyProvider>
        <SessionGate>{children}</SessionGate>
      </ReleasePolicyProvider>
    </ConvexProviderWithAuth>
  );
}
function SessionGate({ children }: { children: ReactNode }) {
  const session = authClient.useSession();
  const previousOwner = useRef<string | null>(null);
  const owner = session.data?.user.id ?? null;
  useEffect(() => {
    if (session.isPending) return;
    const removed = removedAccount(previousOwner.current, owner);
    if (removed) removeAccountCatalogCache(removed);
    previousOwner.current = owner;
  }, [owner, session.isPending]);
  if (session.isPending && !session.data)
    return (
      <Screen>
        <Loading title="Henter innlogging …" />
      </Screen>
    );
  if (!session.data) return <SignIn />;
  return (
    <HouseholdProvider key={session.data.user.id} owner={session.data.user.id}>
      {children}
    </HouseholdProvider>
  );
}
function HouseholdProvider({
  owner,
  children,
}: {
  owner: string;
  children: ReactNode;
}) {
  const convex = useConvex();
  const { policy, blocked } = useReleasePolicy();
  const auth = useConvexAuth();
  const { online } = useQueryLifecycle();
  const details = useQuery(
    api.households.current,
    auth.isAuthenticated ? {} : "skip",
  );
  const cached = useSyncExternalStore(
    subscribeStorage,
    () => cachedHousehold(owner),
    () => null,
  );
  const household = details
    ? { id: details.household._id, name: details.household.name }
    : !online
      ? cached
      : null;
  const page = usePaginatedQuery(
    api.receipts.list,
    auth.isAuthenticated && details ? {} : "skip",
    { initialNumItems: 100 },
  );
  const queue = useSyncExternalStore(
    subscribeStorage,
    () => (household ? receiptStorage.list(owner, household.id) : emptyQueue),
    () => emptyQueue,
  );
  const [queueError, setQueueError] = useState("");
  const active = useRef(true);
  const canUpload = useRef(false);
  useEffect(() => {
    canUpload.current =
      online &&
      auth.isAuthenticated &&
      !!details &&
      !blocked &&
      policy.features.receiptProcessing;
  }, [
    online,
    auth.isAuthenticated,
    details,
    blocked,
    policy.features.receiptProcessing,
  ]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (details === undefined) return;
    const value = details
      ? { id: details.household._id, name: details.household.name }
      : null;
    cacheHousehold(owner, value);
  }, [details, owner]);
  const { status, loadMore } = page;
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(100);
  }, [status, loadMore]);
  const householdId = household?.id;
  const synchronize = useCallback(
    async (retryFailed = false) => {
      if (!householdId) return;

      try {
        if (!canUpload.current) return;
        if (retryFailed) {
          for (const entry of receiptStorage.list(owner, householdId)) {
            receiptStorage.update({ ...entry, error: undefined });
          }
        }
        await drainQueue(
          owner,
          householdId,
          receiptUploadTransport(
            convex,
            householdId,
            () => active.current && canUpload.current,
          ),
          () =>
            active.current &&
            canUpload.current &&
            AppState.currentState === "active",
        );
        setQueueError("");
      } catch (error) {
        reportError(error, "receipt.queue_read");
        if (active.current)
          setQueueError("Kunne ikke lese kvitteringene på denne enheten.");
      }
    },
    [convex, householdId, owner],
  );
  useEffect(() => {
    const initialUpload = setTimeout(() => void synchronize(), 0);
    const interval = setInterval(() => {
      if (AppState.currentState === "active") void synchronize();
    }, 15000);
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void synchronize();
    });
    return () => {
      clearTimeout(initialUpload);
      clearInterval(interval);
      listener.remove();
    };
  }, [synchronize, online, auth.isAuthenticated]);
  if (!online && !household)
    return (
      <Screen title="Uten nett">
        <Notice icon="wifi.slash">Koble til nettet første gang</Notice>
      </Screen>
    );
  if (!household && (details === undefined || auth.isLoading))
    return (
      <Screen>
        <Loading title="Henter husstanden …" />
      </Screen>
    );
  if (!household) return <HouseholdSetup />;
  return (
    <SessionContext.Provider
      value={{
        owner,
        household,
        details: details ?? undefined,
        receipts: page.results,
        loadingReceipts: page.status === "LoadingFirstPage",
        completeReceipts: page.status === "Exhausted",
        online,
        queue,
        synchronize,
      }}
    >
      {auth.isAuthenticated && <ReleaseDiagnostics />}
      {!policy.features.receiptProcessing && (
        <Notice>
          {policy.message ||
            "Behandling av kvitteringer er satt på pause. Nye bilder blir lagret på enheten."}
        </Notice>
      )}
      {queueError ? <Notice error>{queueError}</Notice> : null}
      <CatalogQueryProvider
        key={`${owner}:${household.id}`}
        scope={`${owner}:${household.id}`}
      >
        {children}
      </CatalogQueryProvider>
    </SessionContext.Provider>
  );
}
