import {
  maxReceiptImages,
  receiptImageLimitMessage,
} from "./domain/receipt-images";
import type { RetryStore } from "./request-retry";
import { parse } from "convex-helpers/validators";
import { v } from "convex/values";
import { migrateReceipt, migrateReceiptDatabase } from "./receipt-migrations";
import { Directory, File, Paths } from "expo-file-system";
import { openDatabaseSync } from "expo-sqlite";
import { randomUUID } from "expo-crypto";
import type { Id } from "../../convex/_generated/dataModel";
import type { LocalReceipt, QueueStore } from "./upload-queue";
import { storageSuffix } from "./deployment-storage";
import { getOrInsert } from "./map-cache";

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
    const opened = openDatabaseSync(`kvitto${storageSuffix}.db`);
    opened.execSync(
      "PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS receipt_queue (id TEXT PRIMARY KEY, owner TEXT NOT NULL, household TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS household_cache (owner TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS receipt_retry (id TEXT PRIMARY KEY, attempts INTEGER NOT NULL, retryAt REAL NOT NULL, restricted INTEGER NOT NULL);",
    );
    migrateReceiptDatabase(opened);
    database = opened;
  }

  return database;
}

const queueSnapshots = new Map<string, LocalReceipt[]>();

const householdSnapshots = new Map<string, CachedHousehold | null>();

const scopeKey = (owner: string, household: string) =>
  JSON.stringify([owner, household]);

function freezeReceipt(entry: LocalReceipt): LocalReceipt {
  Object.freeze(entry.images);
  Object.freeze(entry.uploaded);

  return Object.freeze(entry);
}

function writeEntry(entry: LocalReceipt) {
  storage().runSync(
    "INSERT OR REPLACE INTO receipt_queue (id, owner, household, data) VALUES (?, ?, ?, ?)",
    entry.id,
    entry.owner,
    entry.householdId,
    JSON.stringify(entry),
  );
}

function publishQueue(owner: string, household: Id<"households">) {
  queueSnapshots.delete(scopeKey(owner, household));
  receiptStorage.list(owner, household);
  changed();
}

const directory = () =>
  new Directory(Paths.document, `receipts${storageSuffix}`);

// Store relative names: iOS can change the application's container path after an update.
export function imageFile(name: string) {
  return new File(directory(), name);
}

export const uploadRetries: RetryStore = {
  read(id) {
    const row = storage().getFirstSync<{
      attempts: number;
      retryAt: number;
      restricted: number;
    }>(
      "SELECT attempts, retryAt, restricted FROM receipt_retry WHERE id = ?",
      id,
    );

    return row ? { ...row, restricted: row.restricted === 1 } : null;
  },
  write(id, deadline) {
    storage().runSync(
      "INSERT OR REPLACE INTO receipt_retry (id, attempts, retryAt, restricted) VALUES (?, ?, ?, ?)",
      id,
      deadline.attempts,
      deadline.retryAt,
      Number(deadline.restricted),
    );
  },
  remove(id) {
    storage().runSync("DELETE FROM receipt_retry WHERE id = ?", id);
  },
};

export const receiptStorage: QueueStore = {
  list(owner, householdId) {
    return getOrInsert(queueSnapshots, scopeKey(owner, householdId), () => {
      const entries = storage()
        .getAllSync<{ data: string }>(
          "SELECT data FROM receipt_queue WHERE owner = ? AND household = ? ORDER BY rowid",
          owner,
          householdId,
        )
        .map((row) => freezeReceipt(migrateReceipt(JSON.parse(row.data))));

      Object.freeze(entries);

      return entries;
    });
  },
  update(entry) {
    writeEntry(entry);
    publishQueue(entry.owner, entry.householdId);
  },
  remove(entry) {
    uploadRetries.remove(entry.id);
    // Remove the durable record only after the server has accepted every image.
    storage().runSync("DELETE FROM receipt_queue WHERE id = ?", entry.id);
    publishQueue(entry.owner, entry.householdId);

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
) {
  if (!uris.length || uris.length > maxReceiptImages)
    throw new Error("Velg mellom ett og fem bilder.");
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
          new File(uri).copySync(file);

          return name;
        });

        return {
          schemaVersion: 1,
          id,
          owner,
          householdId,
          createdAt: Date.now(),
          images,
          uploaded: images.map(() => false),
        } satisfies LocalReceipt;
      },
    );

    storage().withTransactionSync(() => {
      for (const entry of entries) writeEntry(entry);
    });
  } catch (error) {
    for (const file of files) {
      if (file.exists) file.delete();
    }

    throw error;
  }

  publishQueue(owner, householdId);
}

export type CachedHousehold = { id: Id<"households">; name: string };

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This boundary parser validates external input before returning a domain value.
export function parseCachedHousehold(value: unknown): CachedHousehold | null {
  try {
    return Object.freeze(
      parse(v.object({ id: v.id("households"), name: v.string() }), value),
    );
  } catch {
    return null;
  }
}

export function cachedHousehold(owner: string): CachedHousehold | null {
  return getOrInsert(householdSnapshots, owner, () => {
    const row = storage().getFirstSync<{ data: string }>(
      "SELECT data FROM household_cache WHERE owner = ?",
      owner,
    );

    try {
      return row ? parseCachedHousehold(JSON.parse(row.data)) : null;
    } catch {
      /* Disposable cache only. */
      return null;
    }
  });
}

export function cacheHousehold(owner: string, value: CachedHousehold | null) {
  if (value)
    storage().runSync(
      "INSERT OR REPLACE INTO household_cache (owner, data) VALUES (?, ?)",
      owner,
      JSON.stringify(value),
    );
  else storage().runSync("DELETE FROM household_cache WHERE owner = ?", owner);
  householdSnapshots.set(owner, value ? parseCachedHousehold(value) : null);
  changed();
}

/** Regroup only a rejected, unreserved legacy entry, without copying or deleting its images. */
export function regroupQueuedReceipt(
  owner: string,
  householdId: Id<"households">,
  id: string,
  selected: number[],
) {
  storage().withTransactionSync(() => {
    const row = storage().getFirstSync<{ data: string }>(
      "SELECT data FROM receipt_queue WHERE id = ? AND owner = ? AND household = ?",
      id,
      owner,
      householdId,
    );

    if (!row) throw new Error("Kvitteringen er endret. Åpne køen på nytt.");
    const entry = migrateReceipt(JSON.parse(row.data));

    if (
      entry.receiptId ||
      entry.uploaded.some(Boolean) ||
      !entry.error?.includes(receiptImageLimitMessage)
    )
      throw new Error(
        "Vent til opplastingen er avklart før du deler opp bildene.",
      );
    const positions = new Set(selected);

    if (
      positions.size !== selected.length ||
      selected.some(
        (position) =>
          !Number.isInteger(position) ||
          position < 0 ||
          position >= entry.images.length,
      )
    )
      throw new Error("Ugyldig bildevalg.");

    const groups = [
      entry.images.filter((_, position) => positions.has(position)),
      entry.images.filter((_, position) => !positions.has(position)),
    ];

    if (
      groups.some((group) => !group.length || group.length > maxReceiptImages)
    )
      throw new Error("Hver kvittering må ha mellom ett og fem bilder.");

    for (const images of groups)
      writeEntry({
        schemaVersion: 1,
        id: randomUUID(),
        owner,
        householdId,
        createdAt: entry.createdAt,
        images,
        uploaded: images.map(() => false),
      });
    storage().runSync("DELETE FROM receipt_queue WHERE id = ?", id);
    uploadRetries.remove(id);
  });
  publishQueue(owner, householdId);
}
