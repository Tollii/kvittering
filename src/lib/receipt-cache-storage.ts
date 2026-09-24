import { openDatabaseSync } from "expo-sqlite";
import type { Id } from "../../convex/_generated/dataModel";
import { storageSuffix } from "./deployment-storage";
import { ReceiptCache, initializeReceiptCacheDatabase } from "./receipt-cache";

let database: ReturnType<typeof openDatabaseSync> | undefined;

const caches = new Map<string, ReceiptCache>();

export function receiptCache(owner: string, household: Id<"households">) {
  const key = JSON.stringify([owner, household]);
  let cache = caches.get(key);

  if (!cache) {
    database ??= openDatabaseSync(`receipt-cache-v1${storageSuffix}.db`);
    cache = new ReceiptCache(database, owner, household);
    caches.set(key, cache);
  }

  return cache;
}

/** Remove previous accounts and households when the authenticated scope changes. */
export function retainReceiptCache(
  owner: string | null,
  household?: Id<"households">,
) {
  for (const [key, cache] of caches) {
    if (household && key === JSON.stringify([owner, household])) continue;
    cache.revoke();
    caches.delete(key);
  }

  database ??= openDatabaseSync(`receipt-cache-v1${storageSuffix}.db`);
  // Initialize the disposable schema even when the app starts at its sign-in screen.
  initializeReceiptCacheDatabase(database);

  for (const table of ["receipts", "cursors"]) {
    if (owner && household)
      database.runSync(
        `DELETE FROM ${table} WHERE owner != ? OR household != ?`,
        owner,
        household,
      );
    else database.runSync(`DELETE FROM ${table}`);
  }
}
