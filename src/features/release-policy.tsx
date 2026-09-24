import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { recordEvent, reportError } from "@/lib/observability";
import { SafeAreaView } from "react-native-safe-area-context";
import { Linking, Modal, View } from "react-native";
import { useQueryLifecycle } from "./query-lifecycle";
import { useFeatureFlags } from "./featureFlags";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { Button, Copy, IconButton, Notice, Screen } from "@/components/ui";
import {
  defaultPolicy,
  parseVersionPolicy,
  policyFreshnessMs,
  reminderIntervalMs,
  updateRequirement,
  updateUrl,
  type VersionPolicy,
} from "@/lib/releases/policy";
import {
  installedRelease,
  subscribeServerPolicy,
  setReleaseDiagnostics,
} from "@/lib/releases/client";
import {
  cachePolicy,
  readCachedPolicy,
  dismissedUntil,
  dismissUpdate,
} from "@/lib/releases/cache";

const fallback = parseVersionPolicy(
  defaultPolicy(installedRelease.platform, installedRelease.channel),
);

const PolicyContext = createContext({
  policy: fallback,
  blocked: false,
  refresh: async () => {},
});

export const useReleasePolicy = () => useContext(PolicyContext);

const queryKey = [
  "release-policy",
  installedRelease.platform,
  installedRelease.channel,
];

export function ReleasePolicyProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const [client] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={client}>
      <PolicyProvider client={client}>{children}</PolicyProvider>
    </QueryClientProvider>
  );
}

function PolicyProvider({
  children,
  client,
}: Readonly<{
  children: ReactNode;
  client: QueryClient;
}>) {
  const [cached] = useState(readCachedPolicy);
  const featureFlags = useFeatureFlags();
  const { active, online } = useQueryLifecycle();

  const http = useMemo(
    () =>
      new ConvexHttpClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
      }),
    [],
  );

  const result = useQuery({
    queryKey,
    queryFn: async () => {
      // A failed or stalled policy request must not prevent local use.
      const policy = parseVersionPolicy(
        await http.query(api.releasePolicy.getVersions, {
          platform: installedRelease.platform,
        }),
      );

      if (policy.channel !== installedRelease.channel)
        throw new Error("Release environment mismatch.");
      const previous = client.getQueryData<VersionPolicy>(queryKey);

      return previous && previous.revision > policy.revision
        ? previous
        : policy;
    },
    initialData: cached?.policy,
    initialDataUpdatedAt: cached?.fetchedAt,
    staleTime: policyFreshnessMs,
    retry: false,
    enabled: active && online,
    refetchInterval: active && online ? policyFreshnessMs : false,
  });

  useEffect(
    () =>
      subscribeServerPolicy((policy) => {
        if (
          policy.channel !== installedRelease.channel ||
          policy.platform !== installedRelease.platform
        )
          return;
        client.setQueryData<VersionPolicy>(queryKey, (previous) =>
          previous && previous.revision > policy.revision ? previous : policy,
        );
      }),
    [client],
  );
  useEffect(() => {
    if (result.data)
      cachePolicy(result.data, result.dataUpdatedAt, featureFlags);
  }, [result.data, result.dataUpdatedAt, featureFlags]);
  const policy = result.data ?? fallback;
  useEffect(() => setReleaseDiagnostics(policy.revision), [policy.revision]);
  const requirement = updateRequirement(policy, installedRelease);
  useEffect(() => {
    recordEvent("release.policy_applied", {
      policyRevision: policy.revision,
      outcome: requirement,
    });
  }, [policy.revision, requirement]);
  useEffect(() => {
    if (result.error) reportError(result.error, "release.policy_refresh");
  }, [result.error]);
  const [error, setError] = useState("");
  const [dismissal, setDismissal] = useState(0);
  const release = JSON.stringify(policy.recommended);

  const recommended =
    requirement === "recommended" &&
    result.dataUpdatedAt > Math.max(dismissal, dismissedUntil(release));

  const refresh = async () => {
    setError("");
    const response = await result.refetch();

    if (response.isError)
      setError("Kunne ikke kontrollere versjonen. Prøv igjen med nett.");
  };

  const openUpdate = async () => {
    const url = updateUrl(policy);

    try {
      if (!url) throw new Error("Update destination unavailable");
      await Linking.openURL(url);
    } catch {
      setError(
        policy.channel === "testflight"
          ? "Åpne TestFlight og oppdater Kvitto der."
          : "Åpne appbutikken og søk etter Kvitto.",
      );
    }
  };

  return (
    <PolicyContext.Provider
      value={{ policy, blocked: requirement === "required", refresh }}
    >
      <View style={{ flex: 1 }}>
        {recommended && (
          <SafeAreaView edges={["top"]}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 6,
                gap: 8,
              }}
            >
              <Copy size={14} style={{ flex: 1 }}>
                En oppdatering er tilgjengelig.
              </Copy>
              <Button
                title="Oppdater"
                compact
                onPress={() => void openUpdate()}
              />
              <IconButton
                name="xmark"
                label="Minn meg på senere"
                onPress={() => {
                  const until = Date.now() + reminderIntervalMs;
                  dismissUpdate(release, until);
                  setDismissal(until);
                }}
              />
            </View>
          </SafeAreaView>
        )}
        {error && requirement !== "required" ? (
          <Notice tone="error">{error}</Notice>
        ) : null}
        {children}
      </View>
      <Modal
        visible={requirement === "required"}
        presentationStyle="fullScreen"
        onRequestClose={() => {}}
      >
        <Screen title="Kvitto må oppdateres">
          <Copy>
            {policy.message ||
              "Denne versjonen støttes ikke lenger. Oppdater appen for å fortsette."}
          </Copy>
          <Copy muted>
            Lagrede kvitteringer og bilder som venter på opplasting, blir
            beholdt.
          </Copy>
          <Button title="Oppdater Kvitto" onPress={() => void openUpdate()} />
          <Button
            title="Kontroller igjen"
            variant="secondary"
            busy={result.isFetching}
            onPress={() => void refresh()}
          />
          {!!error && <Notice tone="error">{error}</Notice>}
          <Copy muted size={13}>
            Versjon {installedRelease.version} ({installedRelease.build})
          </Copy>
        </Screen>
      </Modal>
    </PolicyContext.Provider>
  );
}
