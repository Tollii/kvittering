import { ReceiptActivityTracking } from "./receipt-activity";
import { ReceiptSearchIndex } from "./spotlight";
import { retainReceiptSystemScope } from "./receipt-system-scope";
import { storageSuffix } from "@/lib/deployment-storage";
import { FeatureFlagsProvider, useFeatureFlag } from "./featureFlags";
import { removeAccountCatalogCache } from "@/lib/catalog-cache";
import { removedAccount, useQueryLifecycle } from "./query-lifecycle";
import { ReleaseDiagnostics } from "./release-diagnostics";
import { recordEvent, reportError } from "@/lib/observability";
import { ReleasePolicyProvider, useReleasePolicy } from "./release-policy";
import { receiptUploadTransport } from "@/lib/receipt-upload-transport";
import {
  useCallback,
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
  useQuery,
} from "convex/react";
import { api } from "../../convex/_generated/api";
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
} from "@/lib/receipt-storage";
import { visibleHousehold } from "@/lib/household";
import { createQueueRunner, type LocalReceipt } from "@/lib/upload-queue";
import { Loading, Notice, Screen } from "@/components/ui";
import { CatalogQueryProvider } from "./catalog-query-provider";
import { NavigationQueryProvider } from "./navigation-query-provider";
import { SignIn, HouseholdSetup } from "./sign-in";
import { SessionContext } from "./household-context";

const emptyQueue: LocalReceipt[] = [];

const client = convexUrl
  ? new ConvexReactClient(convexUrl, { unsavedChangesWarning: false })
  : null;

const drainQueue = createQueueRunner(receiptStorage, recordEvent);

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

export function SessionProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
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
      <FeatureFlagsProvider>
        <ReleasePolicyProvider>
          <SessionGate>{children}</SessionGate>
        </ReleasePolicyProvider>
      </FeatureFlagsProvider>
    </ConvexProviderWithAuth>
  );
}

function SessionGate({ children }: Readonly<{ children: ReactNode }>) {
  const session = authClient.useSession();
  const previousOwner = useRef<string | null>(null);
  const owner = session.data?.user.id ?? null;
  useEffect(() => {
    if (session.isPending) return;
    const removed = removedAccount(previousOwner.current, owner);

    if (removed) removeAccountCatalogCache(removed);

    if (!owner) retainReceiptSystemScope(null);

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
}: Readonly<{
  owner: string;
  children: ReactNode;
}>) {
  const convex = useConvex();
  const { policy, blocked } = useReleasePolicy();
  const receiptProcessing = useFeatureFlag("receiptProcessing");
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

  const household = visibleHousehold(details, cached);

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
      receiptProcessing;
  }, [online, auth.isAuthenticated, details, blocked, receiptProcessing]);
  useEffect(() => {
    active.current = true;

    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (details === undefined) return;

    cacheHousehold(owner, visibleHousehold(details, null));
  }, [details, owner]);
  const householdId = household?.id;
  useEffect(() => {
    retainReceiptSystemScope(
      householdId ? `${storageSuffix}:${owner}:${householdId}` : null,
    );
  }, [householdId, owner]);

  const showQueueReadError = useCallback(() => {
    if (active.current)
      setQueueError("Kunne ikke lese kvitteringene på denne enheten.");
  }, []);

  const synchronize = useCallback(async () => {
    if (!householdId) return;

    try {
      if (!canUpload.current) return;

      await drainQueue(
        owner,
        householdId,
        receiptUploadTransport(
          convex,
          householdId,
          () => active.current && canUpload.current,
          `${storageSuffix}:${owner}:${householdId}`,
        ),
        () =>
          active.current &&
          canUpload.current &&
          AppState.currentState === "active",
      );
      setQueueError("");
    } catch (error) {
      reportError(error, "receipt.queue_read");
      showQueueReadError();
    }
  }, [convex, householdId, owner, showQueueReadError]);

  const retryFailedUploads = useCallback(async () => {
    if (!householdId || !canUpload.current) return;

    try {
      for (const entry of receiptStorage.list(owner, householdId))
        receiptStorage.update({ ...entry, error: undefined });
    } catch (error) {
      reportError(error, "receipt.queue_read");
      showQueueReadError();

      return;
    }

    await synchronize();
  }, [householdId, owner, synchronize, showQueueReadError]);

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
        online,
        queue,
        synchronize,
        retryFailedUploads,
      }}
    >
      {auth.isAuthenticated && (
        <>
          <ReleaseDiagnostics />
          <ReceiptSearchIndex />
          <ReceiptActivityTracking />
        </>
      )}
      {!receiptProcessing && (
        <Notice>
          {policy.message ||
            "Behandling av kvitteringer er satt på pause. Nye bilder blir lagret på enheten."}
        </Notice>
      )}
      {queueError ? <Notice tone="error">{queueError}</Notice> : null}
      <CatalogQueryProvider
        key={`${owner}:${household.id}`}
        scope={`${owner}:${household.id}`}
      >
        <NavigationQueryProvider>{children}</NavigationQueryProvider>
      </CatalogQueryProvider>
    </SessionContext.Provider>
  );
}
