import type { ReactNode } from "react";

/** Native SQLite opens synchronously; see the web variant. */
export function StorageReady({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
