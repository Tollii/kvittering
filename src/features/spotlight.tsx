import { useEffect, useSyncExternalStore } from "react";
import { useQuery } from "convex/react";
import Storage from "expo-sqlite/kv-store";
import ReceiptIntelligence from "../../modules/receipt-intelligence/src/ReceiptIntelligenceModule";
import { api } from "../../convex/_generated/api";
import { Copy, Toggle } from "@/components/ui";
import { useHousehold } from "./session";
import { reportError } from "@/lib/observability";
import { storageSuffix } from "@/lib/deployment-storage";

const listeners = new Set<() => void>();

const key = "spotlight-enabled-scope";

const read = () => Storage.getItemSync(key);

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
};

export function clearReceiptSearch() {
  Storage.removeItemSync(key);

  for (const listener of listeners) listener();
  void ReceiptIntelligence?.indexReceipts?.([]).catch((error) =>
    reportError(error, "spotlight.clear"),
  );
}

function useSearchEnabled() {
  const { owner, household } = useHousehold();
  const scope = `${storageSuffix}:${owner}:${household.id}`;
  const selected = useSyncExternalStore(subscribe, read, () => null);

  return { enabled: selected === scope, scope };
}

export function ReceiptSearchIndex() {
  const { enabled, scope } = useSearchEnabled();

  const receipts = useQuery(
    api.spotlight.recent,
    enabled && ReceiptIntelligence?.indexReceipts ? {} : "skip",
  );

  useEffect(() => {
    if (enabled && receipts && read() === scope) {
      void ReceiptIntelligence?.indexReceipts?.(receipts).catch((error) =>
        reportError(error, "spotlight.index"),
      );
    }
  }, [enabled, scope, receipts]);

  return null;
}

export function ReceiptSearchSettings() {
  const { enabled, scope } = useSearchEnabled();

  if (!ReceiptIntelligence?.indexReceipts) return null;

  return (
    <>
      <Toggle
        label="Finn kvitteringer i Spotlight"
        value={enabled}
        onChange={(value) => {
          if (value) {
            Storage.setItemSync(key, scope);

            for (const listener of listeners) listener();
          } else clearReceiptSearch();
        }}
      />
      <Copy muted size={14}>
        De siste 100 kvitteringene kan søkes opp med butikk eller varenavn fra
        Hjem-skjermen. Slå av for å fjerne indeksen.
      </Copy>
    </>
  );
}
