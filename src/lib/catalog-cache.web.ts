import type {
  Persister,
  PersistedClient,
} from "@tanstack/react-query-persist-client";
export function catalogPersister(scope: string): Persister {
  const key = `kvitto-catalog:${scope}`;
  return {
    persistClient: (client) => {
      try {
        localStorage.setItem(key, JSON.stringify(client));
      } catch {}
    },
    restoreClient: () => {
      try {
        const value = localStorage.getItem(key);
        return value ? (JSON.parse(value) as PersistedClient) : undefined;
      } catch {
        return undefined;
      }
    },
    removeClient: () => {
      try {
        localStorage.removeItem(key);
      } catch {}
    },
  };
}
