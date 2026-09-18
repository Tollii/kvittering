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
import { AppState, Platform } from "react-native";
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
  synchronize: () => Promise<void>;
};
const SessionContext = createContext<SessionData | null>(null);
const client = convexUrl
  ? new ConvexReactClient(convexUrl, { unsavedChangesWarning: false })
  : null;
const drainQueue = createQueueRunner(receiptStorage);
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
      <SessionGate>{children}</SessionGate>
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
    canUpload.current = online && auth.isAuthenticated && !!details;
  }, [online, auth.isAuthenticated, details]);
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
  const synchronize = useCallback(async () => {
    if (!householdId || Platform.OS === "web") return;

    try {
      if (!canUpload.current) return;
      await drainQueue(
        owner,
        householdId,
        {
          reserve: (entry) =>
            convex.mutation(api.receipts.reserve, {
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
                },
                body: imageFile(name),
                signal: AbortSignal.timeout(60000),
              },
            );
            if (!response.ok)
              throw new Error(
                "Bildet kunne ikke lastes opp. Prøv igjen med nett.",
              );
          },
          complete: (id) =>
            convex.mutation(api.receipts.completeUpload, { id }),
        },
        () => {},
        () =>
          active.current &&
          canUpload.current &&
          AppState.currentState === "active",
      );
      setQueueError("");
    } catch {
      if (active.current)
        setQueueError("Kunne ikke lese kvitteringene på denne enheten.");
    }
  }, [convex, householdId, owner]);
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
        <Notice>Koble til nettet for å hente husstanden første gang.</Notice>
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
      {queueError ? <Notice error>{queueError}</Notice> : null}
      <CatalogQueryProvider key={`${owner}:${household.id}`} scope={`${owner}:${household.id}`} online={online}>
        {children}
      </CatalogQueryProvider>
    </SessionContext.Provider>
  );
}
