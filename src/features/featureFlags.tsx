import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "convex/react";
import Storage from "expo-sqlite/kv-store";
import { api } from "../../convex/_generated/api";
import { installedRelease } from "@/lib/releases/client";
import { storageSuffix } from "@/lib/deployment-storage";
import {
  defaultFeatureFlags,
  parseFeatureFlagSnapshot,
  type FeatureFlags,
  type FeatureName,
  type FeatureFlagSnapshot,
} from "@/lib/featureFlags";

const scope = {
  platform: installedRelease.platform,
  channel: installedRelease.channel,
};

const storageKey = `featureFlags-v1${storageSuffix}:${scope.channel}:${scope.platform}`;

const fallback = (): FeatureFlagSnapshot => ({
  ...scope,
  revision: 0,
  values: defaultFeatureFlags(),
});

function readSnapshot(): FeatureFlagSnapshot {
  try {
    const saved = Storage.getItemSync(storageKey);

    if (saved) return parseFeatureFlagSnapshot(JSON.parse(saved), scope);
    // Retain configured disabled values on the first offline start after this upgrade.
    const legacyKey = `release-policy-v1${storageSuffix}:${scope.channel}:${scope.platform}`;
    const legacy = JSON.parse(Storage.getItemSync(legacyKey) ?? "null")?.policy;

    if (legacy)
      return parseFeatureFlagSnapshot(
        { ...legacy, revision: 0, values: legacy.features },
        scope,
      );
  } catch {
    /* Invalid disposable state cannot replace a validated snapshot. */
  }

  return fallback();
}

const FeatureFlagsContext = createContext<FeatureFlags>(defaultFeatureFlags());

/** One subscription remains mounted above sign-in and version gates. */
export function FeatureFlagsProvider({
  children,
}: Readonly<{ children: ReactNode }>) {
  const live = useQuery(api.featureFlags.get, { platform: scope.platform });

  const [state, setState] = useState<{
    source: typeof live;
    snapshot: FeatureFlagSnapshot;
  }>(() => ({
    source: undefined,
    snapshot: readSnapshot(),
  }));

  if (live && live !== state.source) {
    let snapshot = state.snapshot;

    try {
      snapshot = parseFeatureFlagSnapshot(live, scope);
    } catch {
      /* Retain known values for an invalid scope or payload. */
    }

    setState({ source: live, snapshot });
  }

  useEffect(() => {
    try {
      Storage.setItemSync(storageKey, JSON.stringify(state.snapshot));
    } catch {
      /* Memory remains valid when persistence fails. */
    }
  }, [state.snapshot]);

  return (
    <FeatureFlagsContext.Provider value={state.snapshot.values}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlag(name: FeatureName): boolean {
  return useFeatureFlags()[name];
}

/** Shared snapshot for compatibility persistence; ordinary consumers select one flag. */
export function useFeatureFlags(): FeatureFlags {
  return useContext(FeatureFlagsContext);
}
