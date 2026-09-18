import { useSyncExternalStore } from "react";
import type { ImportedFile } from "./receipt-import";

/**
 * Files handed to the app from the iOS share sheet wait here until the capture
 * screen is ready to take them, so nothing is lost while signing in or loading.
 */
let pending: ImportedFile[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function offerImportedFiles(files: ImportedFile[]) {
  if (!files.length) return;
  pending = [...pending, ...files];
  notify();
}
export function takeImportedFiles(): ImportedFile[] {
  const files = pending;
  pending = [];
  if (files.length) notify();
  return files;
}
export function usePendingImports() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pending,
    () => pending,
  );
}
