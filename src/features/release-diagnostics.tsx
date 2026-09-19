import { useEffect } from "react";
import { AppState } from "react-native";
import { useConvex } from "convex/react";
import { randomUUID } from "expo-crypto";
import Storage from "expo-sqlite/kv-store";
import { api } from "../../convex/_generated/api";
import { installedRelease } from "@/lib/releases/client";
import { storageSuffix } from "@/lib/deployment-storage";
import { useReleasePolicy } from "./release-policy";

export function ReleaseDiagnostics() {
  const convex = useConvex();
  const { policy } = useReleasePolicy();
  useEffect(() => {
    let lastReport = 0;

    const report = async () => {
      if (Date.now() - lastReport < 6 * 60 * 60_000) return;
      lastReport = Date.now();

      try {
        const key = `installation-id${storageSuffix}`;
        const installationId = Storage.getItemSync(key) ?? randomUUID();
        Storage.setItemSync(key, installationId);
        await convex.mutation(api.clientReleases.report, {
          client: installedRelease,
          installationId,
          policyRevision: policy.revision,
        });
      } catch {
        /* Diagnostics must not block receipts or cause recursive error reports. */
      }
    };

    void report();

    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void report();
    });

    return () => listener.remove();
  }, [convex, policy.revision]);

  return null;
}
