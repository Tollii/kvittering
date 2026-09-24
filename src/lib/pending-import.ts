import { useSyncExternalStore } from "react";
import { importPendingFiles } from "./receipt-import";
import { createImportQueue } from "@/lib/capture-import";

const imports = createImportQueue();

export const offerImportedFiles = imports.offer;

export function receiveImportedFiles(
  id: number,
  room: number,
  receive: Parameters<typeof importPendingFiles>[3],
) {
  return importPendingFiles(imports, id, room, receive);
}

export const retryImportedFiles = imports.retry;

export const dismissImportedFiles = imports.dismiss;

export function usePendingImports() {
  return useSyncExternalStore(
    imports.subscribe,
    imports.snapshot,
    imports.snapshot,
  );
}
