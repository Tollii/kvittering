import { useSyncExternalStore } from "react";
import Storage from "expo-sqlite/kv-store";
import type { ProcessingEngine } from "./domain/processing-engine";
const key = "receipt-processing-engine";
const listeners = new Set<() => void>();
export function processingEngine(): ProcessingEngine {
  return Storage.getItemSync(key) === "foundation" ? "foundation" : "gpt";
}
export function setProcessingEngine(value: ProcessingEngine) {
  Storage.setItemSync(key, value);
  for (const listener of listeners) listener();
}
export function useProcessingEngine() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    processingEngine,
    () => "gpt" as const,
  );
}
