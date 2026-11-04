import { retainReceiptImageScope } from "@/lib/receipt-image-cache";
import { ReceiptCacheProvider } from "./receipt-cache-provider";
import { retainReceiptCache } from "@/lib/receipt-cache-storage";
import { ReceiptActivityTracking } from "./receipt-activity";
import { ReceiptSearchIndex } from "./spotlight";
import { retainReceiptSystemScope } from "./receipt-system-scope";
import { storageSuffix } from "@/lib/deployment-storage";
import { FeatureFlagsProvider, useFeatureFlag } from "./featureFlags";
import { removeAccountCatalogCache } from "@/lib/catalog-cache";
import { removedAccount, useQueryLifecycle } from "./query-lifecycle";
import { ReleaseDiagnostics } from "./release-diagnostics";
import { recordEvent, reportError } from "@/lib/observability";
import { analytics } from "@/lib/analytics";
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
  uploadRetries,
  regroupQueuedReceipt,
} from "@/lib/receipt-storage";
import { visibleHousehold } from "@/lib/household";
import { createQueueRunner, type LocalReceipt } from "@/lib/upload-queue";
import { silentWaits, uploadWait, type UploadWait } from "./upload-gate";
import type { DiagnosticFields } from "@/lib/diagnostics";
import { Loading, Notice, Screen } from "@/components/ui";
import { CatalogQueryProvider } from "./catalog-query-provider";
import { NavigationQueryProvider } from "./navigation-query-provider";
import { SignIn, HouseholdSetup } from "./sign-in";
import { SessionContext } from "./household-context";
import { UserError } from "@/lib/user-errors";

const emptyQueue: LocalReceipt[] = [];

const convex = convexUrl
  ? {
      url: convexUrl,
      client: new ConvexReactClient(convexUrl, {
        unsavedChangesWarning: false,
      }),
    }
  : null;

/** The Convex connection when an upload waits, which tells a dead socket from a slow server. */
function connectionDiagnostics(): DiagnosticFields {
  if (!convex) return {};
  const state = convex.client.connectionState();

  return {
    websocketConnected: state.isWebSocketConnected,
    connectionCount: state.connectionCount,
    connectionRetries: state.connectionRetries,
    inflightMutations: state.inflightMutations,
  };
}

const drainQueue = createQueueRunner(receiptStorage, uploadRetries, {
  record: recordEvent,
  report: (cause, operation, fields) =>
    reportError(cause, operation, { ...fields, ...connectionDiagnostics() }),
});

/** How long queued uploads may wait silently before Sentry hears of it. */
const silentWaitReportMs = 30_000;

/** Report a wait that leaves queued captures at "Laster opp" with no error to show. */
function useSilentWaitReport(wait: UploadWait | null, watching: boolean) {
  const silent = watching && wait && silentWaits.has(wait) ? wait : null;

  useEffect(() => {
    if (!silent) return undefined;

    const timer = setTimeout(
      () =>
        reportError(
          new Error("Queued receipt uploads are waiting to start."),
          "receipt.queue_waiting",
          { phase: silent, ...connectionDiagnostics() },
        ),
      silentWaitReportMs,
    );

    return () => clearTimeout(timer);
  }, [silent]);
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

export function SessionProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  if (!convex || !convexSiteUrl)
    return (
      <Screen title="Kvitto">
        <Notice>
          Legg til EXPO_PUBLIC_CONVEX_URL og EXPO_PUBLIC_CONVEX_SITE_URL i
          .env.local, og start appen på nytt.
        </Notice>
      </Screen>
    );

  return (
    <ConvexProviderWithAuth client={convex.client} useAuth={useSessionAuth}>
      <FeatureFlagsProvider>
        <ReleasePolicyProvider convexUrl={convex.url}>
          <SessionGate>{children}</SessionGate>
        </ReleasePolicyProvider>
      </FeatureFlagsProvider>
    </ConvexProviderWithAuth>
  );
}

function SessionGate({ children }: Readonly<{ children: ReactNode }>) {
  const session = authClient.useSession();
  const [sessionLoaded, setSessionLoaded] = useState(!session.isPending);

  if (!sessionLoaded && !session.isPending) setSessionLoaded(true);
  const previousOwner = useRef<string | null>(null);
  const owner = session.data?.user.id ?? null;
  useEffect(() => {
    if (session.isPending) return;
    const removed = removedAccount(previousOwner.current, owner);

    if (removed) {
      removeAccountCatalogCache(removed);
      analytics?.reset();
    }

    if (owner && owner !== previousOwner.current) analytics?.identify(owner);

    if (!owner) {
      retainReceiptSystemScope(null);
      retainReceiptCache(null);
      retainReceiptImageScope(null);
    }

    previousOwner.current = owner;
  }, [owner, session.isPending]);

  // Later session refreshes must retain the sign-in form and its input.
  if (!sessionLoaded && !session.data)
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
  const { online, active: foreground } = useQueryLifecycle();

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

  const wait = uploadWait({
    online,
    authenticated: auth.isAuthenticated,
    householdLoaded: !!details,
    releaseBlocked: blocked,
    processingEnabled: receiptProcessing,
  });

  useEffect(() => {
    canUpload.current = wait === null;
  }, [wait]);
  useSilentWaitReport(wait, foreground && queue.length > 0);
  useEffect(() => {
    active.current = true;

    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (details === undefined) return;

    const value = visibleHousehold(details, null);

    cacheHousehold(owner, value);

    if (!value) {
      retainReceiptCache(null);
      retainReceiptImageScope(null);
    }
  }, [details, owner]);
  const householdId = household?.id;
  useEffect(() => {
    retainReceiptSystemScope(
      householdId ? `${storageSuffix}:${owner}:${householdId}` : null,
    );
  }, [householdId, owner]);
  useEffect(() => {
    if (householdId) void analytics?.register({ household_id: householdId });
  }, [householdId]);

  const showQueueReadError = useCallback(() => {
    if (active.current)
      setQueueError("Kunne ikke lese kvitteringene på denne enheten.");
  }, []);

  const synchronize = useCallback(
    async ({ retryFailed = false }: { retryFailed?: boolean } = {}) => {
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
          // A manual retry also lifts this app session's automatic retry limits.
          { retryFailed },
        );
        setQueueError("");
      } catch (error) {
        reportError(error, "receipt.queue_read");
        showQueueReadError();
      }
    },
    [convex, householdId, owner, showQueueReadError],
  );

  const retryFailedUploads = useCallback(async () => {
    if (!householdId || !canUpload.current) return;

    await synchronize({ retryFailed: true });
  }, [householdId, synchronize]);

  useEffect(() => {
    if (!foreground || wait !== null || !queue.length || !householdId)
      return undefined;

    return drainQueue.schedule(owner, householdId, synchronize);
  }, [synchronize, owner, householdId, foreground, queue, wait]);

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
        regroup: (id, selected) => {
          if (drainQueue.isRunning())
            throw new UserError({
              code: "REJECTED",
              message: "Vent til opplastingsforsøket er ferdig.",
            });
          regroupQueuedReceipt(owner, household.id, id, selected);
        },
        discardQueue: () => {
          if (drainQueue.isRunning())
            throw new UserError({
              code: "REJECTED",
              message: "Vent til opplastingsforsøket er ferdig.",
            });

          for (const entry of receiptStorage.list(owner, household.id))
            receiptStorage.remove(entry);
        },
      }}
    >
      <ReceiptCacheProvider
        key={`${owner}:${household.id}`}
        owner={owner}
        household={household.id}
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
      </ReceiptCacheProvider>
    </SessionContext.Provider>
  );
}
