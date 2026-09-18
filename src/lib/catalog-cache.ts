import { openDatabaseSync } from "expo-sqlite";
import { storageSuffix } from "./deployment-storage";
import type {
  PersistedClient,
  Persister,
} from "@tanstack/react-query-persist-client";
let database: ReturnType<typeof openDatabaseSync> | undefined;
function storage() {
  if (!database) {
    database = openDatabaseSync(`catalog-cache${storageSuffix}.db`);
    database.execSync(
      "CREATE TABLE IF NOT EXISTS query_cache (scope TEXT PRIMARY KEY, data TEXT NOT NULL)",
    );
  }
  return database;
}
export function catalogPersister(scope: string): Persister {
  return {
    persistClient: (client: PersistedClient) => {
      try {
        storage().runSync(
          "INSERT OR REPLACE INTO query_cache (scope, data) VALUES (?, ?)",
          scope,
          JSON.stringify(client),
        );
      } catch {
        /* The server cache remains available if local storage fails. */
      }
    },
    restoreClient: () => {
      try {
        const row = storage().getFirstSync<{ data: string }>(
          "SELECT data FROM query_cache WHERE scope = ?",
          scope,
        );
        return row ? (JSON.parse(row.data) as PersistedClient) : undefined;
      } catch {
        return undefined;
      }
    },
    removeClient: () => {
      try {
        storage().runSync("DELETE FROM query_cache WHERE scope = ?", scope);
      } catch {}
    },
  };
}
