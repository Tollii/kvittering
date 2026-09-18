import type { ProcessingEngine } from "./domain/processing-engine";
import { Directory, File, Paths } from "expo-file-system";
import { openDatabaseSync } from "expo-sqlite";
import { randomUUID } from "expo-crypto";
import type { Id } from "../../convex/_generated/dataModel";
import type { LocalReceipt, QueueStore } from "./upload-queue";

const listeners = new Set<() => void>();
export function subscribeStorage(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function changed() {
  for (const listener of listeners) listener();
}

let database: ReturnType<typeof openDatabaseSync> | undefined;
function storage() {
  if (!database) {
    database = openDatabaseSync("kvitto.db");
    database.execSync(
      "PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS receipt_queue (id TEXT PRIMARY KEY, owner TEXT NOT NULL, household TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS household_cache (owner TEXT PRIMARY KEY, data TEXT NOT NULL);",
    );
  }
  return database;
}
const directory = () => new Directory(Paths.document, "receipts");
// Store relative names: iOS can change the application's container path after an update.
export function imageFile(name: string) {
  return new File(directory(), name);
}
export const receiptStorage: QueueStore = {
  list(owner, householdId) {
    return storage()
      .getAllSync<{ data: string }>(
        "SELECT data FROM receipt_queue WHERE owner = ? AND household = ? ORDER BY rowid",
        owner,
        householdId,
      )
      .map((row) => JSON.parse(row.data) as LocalReceipt);
  },
  update(entry) {
    storage().runSync(
      "INSERT OR REPLACE INTO receipt_queue (id, owner, household, data) VALUES (?, ?, ?, ?)",
      entry.id,
      entry.owner,
      entry.householdId,
      JSON.stringify(entry),
    );
    changed();
  },
  remove(entry) {
    // Remove the durable record only after the server has accepted every image.
    storage().runSync("DELETE FROM receipt_queue WHERE id = ?", entry.id);
    changed();
    for (const name of entry.images) {
      try {
        const file = imageFile(name);
        if (file.exists) file.delete();
      } catch {
        /* A stale file does not prevent the next upload. */
      }
    }
  },
};
export function saveLocalReceipts(
  owner: string,
  householdId: Id<"households">,
  uris: string[],
  combined: boolean,
  processingEngine: ProcessingEngine = "gpt",
) {
  if (!uris.length || uris.length > 8)
    throw new Error("Velg mellom ett og åtte bilder.");
  directory().create({ intermediates: true, idempotent: true });
  const files: File[] = [];
  try {
    const entries = (combined ? [uris] : uris.map((uri) => [uri])).map(
      (group) => {
        const id = randomUUID();
        const images = group.map((uri, position) => {
          const name = `${id}-${position}.jpg`;
          const file = imageFile(name);
          files.push(file);
          new File(uri).copy(file);
          return name;
        });
        return {
          id,
          owner,
          householdId,
          createdAt: Date.now(),
          processingEngine,
          images,
          uploaded: images.map(() => false),
        } satisfies LocalReceipt;
      },
    );
    storage().withTransactionSync(() => {
      for (const entry of entries) receiptStorage.update(entry);
    });
  } catch (error) {
    for (const file of files) {
      if (file.exists) file.delete();
    }
    throw error;
  }
}
export type CachedHousehold = { id: Id<"households">; name: string };
export function cachedHousehold(owner: string): CachedHousehold | null {
  const row = storage().getFirstSync<{ data: string }>(
    "SELECT data FROM household_cache WHERE owner = ?",
    owner,
  );
  return row ? (JSON.parse(row.data) as CachedHousehold) : null;
}
export function cacheHousehold(owner: string, value: CachedHousehold | null) {
  if (value)
    storage().runSync(
      "INSERT OR REPLACE INTO household_cache (owner, data) VALUES (?, ?)",
      owner,
      JSON.stringify(value),
    );
  else storage().runSync("DELETE FROM household_cache WHERE owner = ?", owner);
  changed();
}
