import { useSyncExternalStore } from "react";
import { createImportQueue } from "@/lib/capture-import";

const imports = createImportQueue();

export const offerImportedFiles = imports.offer;

export const claimImportedFiles = imports.claim;

export const finishImportedFiles = imports.finish;

export const retryImportedFiles = imports.retry;

export const dismissImportedFiles = imports.dismiss;

export function usePendingImports() {
  return useSyncExternalStore(
    imports.subscribe,
    imports.snapshot,
    imports.snapshot,
  );
}
