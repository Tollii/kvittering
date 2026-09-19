import { ReleaseDiagnostics } from "./release-diagnostics";
import { recordEvent, reportError } from "@/lib/observability";
import { ReleasePolicyProvider, useReleasePolicy } from "./release-policy";
import { installedRelease, releaseError } from "@/lib/releases/client";
import { releaseMutation } from "@/lib/releases/requests";
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
import { useNetworkState } from "expo-network";
import { fetch as nativeFetch } from "expo/fetch";
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
  imageFile,
  receiptStorage,
  type CachedHousehold,
} from "@/lib/receipt-storage";
import { createQueueRunner, type LocalReceipt } from "@/lib/upload-queue";
import { Loading, Notice, Screen } from "@/components/ui";
import { CatalogQueryProvider } from "./catalog-query-provider";
import { ProductAnalysisSync } from "./product-analysis-sync";
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
  const network = useNetworkState();
  const online =
    network.isConnected !== false && network.isInternetReachable !== false;
  const details = useQuery(
    api.households.current,
    auth.isAuthenticated ? {} : "skip",
  );
  const cachedSnapshot = useSyncExternalStore(
    subscribeStorage,
    () => JSON.stringify(cachedHousehold(owner)),
    () => "null",
  );
  const cached = JSON.parse(cachedSnapshot) as CachedHousehold | null;
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
  const queueSnapshot = useSyncExternalStore(
    subscribeStorage,
    () =>
      household
        ? JSON.stringify(receiptStorage.list(owner, household.id))
        : "[]",
    () => "[]",
  );
  const queue = JSON.parse(queueSnapshot) as LocalReceipt[];
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
            entry.error = undefined;
            receiptStorage.update(entry);
          }
        }
        await drainQueue(
          owner,
          householdId,
          {
            reserve: (entry) =>
              releaseMutation(convex, api.receipts.reserve, {
                clientId: entry.id,
                imageCount: entry.images.length,
                householdId,
              }),
            upload: async (id, position, name) => {
              const token = await fetchAccessToken();
              if (!active.current || !canUpload.current)
                throw new Error(
                  "Opplastingen fortsetter når du åpner appen med nett.",
                );
              const response = await nativeFetch(
                `${convexSiteUrl}/receipt-image?receipt=${id}&position=${position}`,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "image/jpeg",
                    "X-Kvitto-Client": JSON.stringify(installedRelease),
                  },
                  body: imageFile(name),
                  signal: AbortSignal.timeout(60000),
                },
              ).catch((error) => {
                throw releaseError(error, "receipt.image_upload", {
                  receiptId: id,
                  position,
                });
              });
              if (!response.ok) {
                const data = await response.json().catch(() => null);
                if (data?.code)
                  throw releaseError({ data }, "receipt.image_upload", {
                    receiptId: id,
                    position,
                    status: response.status,
                  });
                throw releaseError(
                  new Error(
                    "Bildet kunne ikke lastes opp. Prøv igjen med nett.",
                  ),
                  "receipt.image_upload",
                  { receiptId: id, position, status: response.status },
                );
              }
            },
            complete: (id) =>
              releaseMutation(convex, api.receipts.completeUpload, { id }),
          },
          () => {},
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
        online={online}
      >
        <ProductAnalysisSync
          receipts={page.results}
          enabled={
            online &&
            auth.isAuthenticated &&
            !!details &&
            !blocked &&
            policy.features.spendingAnalysis
          }
        />
        {children}
      </CatalogQueryProvider>
    </SessionContext.Provider>
  );
}
