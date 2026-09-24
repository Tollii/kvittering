import {
  RequestDeferred,
  retryDeadline,
  type RetryStore,
  type RetryDeadline,
} from "./request-retry";
import type { Id } from "../../convex/_generated/dataModel";
import type { DiagnosticFields } from "./diagnostics";
import { parseUserError } from "./user-errors";

export type LocalReceipt = {
  schemaVersion: 1;
  id: string;
  owner: string;
  householdId: Id<"households">;
  createdAt: number;
  images: string[];
  uploaded: boolean[];
  receiptId?: Id<"receipts">;
  error?: string;
};

export interface QueueStore {
  list(owner: string, householdId: Id<"households">): LocalReceipt[];
  update(receipt: LocalReceipt): void;
  remove(receipt: LocalReceipt): void;
}

export interface UploadTransport {
  reserve(entry: LocalReceipt): Promise<Id<"receipts">>;
  upload(id: Id<"receipts">, position: number, uri: string): Promise<void>;
  complete(id: Id<"receipts">, entry: LocalReceipt): Promise<void>;
}

export const retryPolicy = { firstDelayMs: 15_000, maxAttempts: 6 };

/**
 * When a failed capture may be tried again automatically. A rejection the
 * person must act on waits for them; other failures back off and stop after
 * the attempt cap. Returns null when only a manual retry or restart may retry.
 */
export function nextAttemptAt(
  failures: number,
  rejected: boolean,
  now: number,
): number | null {
  if (rejected || failures >= retryPolicy.maxAttempts) return null;

  return now + retryPolicy.firstDelayMs * 2 ** (failures - 1);
}

type RetryState = { failures: number; nextAttemptAt: number | null };

/**
 * Persist each completed step. Repeated requests use the same server reservation.
 * Quota deadlines survive restarts. Other failures stop after the per-process cap.
 */
export function createQueueRunner(
  store: QueueStore,
  record: (event: string, fields: DiagnosticFields) => void = () => {},
  retries: RetryStore,
  clock: () => number = Date.now,
) {
  let running = false;
  const attempts = new Map<string, RetryState>();
  const restrictions = new Map<string, RetryDeadline>();
  const listeners = new Set<() => void>();

  function readDeadline(id: string) {
    const saved = retries.read(id);
    const memory = restrictions.get(id);

    return memory && memory.retryAt > (saved?.retryAt ?? 0) ? memory : saved;
  }

  function defer(id: string, cause: RequestDeferred) {
    const deadline = retryDeadline(1, clock(), cause);
    // Keep the restriction in memory even if the durable write fails.
    const memory = restrictions.get(id);
    restrictions.set(
      id,
      memory && memory.retryAt > deadline.retryAt ? memory : deadline,
    );
    const previous = readDeadline(id);

    const retained =
      previous && previous.retryAt > deadline.retryAt ? previous : deadline;

    restrictions.set(id, retained);
    retries.write(id, retained);
  }

  function storageFailure(entry: LocalReceipt) {
    attempts.set(entry.id, { failures: 0, nextAttemptAt: null });
    entry.error ??=
      "Kunne ikke lese eller lagre ventetiden. Prøv igjen når lagringen virker.";
    store.update(entry);
    record("receipt.retry_storage_failed", { captureId: entry.id });
  }

  function deadline(entry: LocalReceipt) {
    const attempt = attempts.get(entry.id);

    if (attempt?.nextAttemptAt === null) return null;
    const saved = readDeadline(entry.id);

    return Math.max(
      attempt?.nextAttemptAt ?? 0,
      saved?.restricted ? saved.retryAt : 0,
    );
  }

  /** Re-read the queue after every drain, including captures added during an upload. */
  function schedule(
    owner: string,
    householdId: Id<"households">,
    synchronize: () => Promise<void>,
  ) {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const update = () => {
      if (timer) clearTimeout(timer);

      if (running) return;
      let next = Infinity;

      for (const entry of store.list(owner, householdId)) {
        try {
          const at = deadline(entry);

          if (at !== null) next = Math.min(next, at);
        } catch {
          // The drain records the unreadable deadline without contacting the server.
          next = Math.min(next, clock());
        }
      }

      if (Number.isFinite(next))
        timer = setTimeout(
          () => void synchronize(),
          Math.max(0, next - clock()),
        );
    };

    listeners.add(update);
    update();

    return () => {
      listeners.delete(update);

      if (timer) clearTimeout(timer);
    };
  }

  const run = async (
    owner: string,
    householdId: Id<"households">,
    transport: UploadTransport,
    active: () => boolean,
    { retryFailed = false }: { retryFailed?: boolean } = {},
  ) => {
    // A manual retry applies even if a drain is already running.
    if (retryFailed) attempts.clear();

    if (running) return;
    running = true;

    try {
      for (const snapshot of store.list(owner, householdId)) {
        const entry = {
          ...snapshot,
          images: [...snapshot.images],
          uploaded: [...snapshot.uploaded],
        };

        if (!active()) break;

        try {
          const at = deadline(entry);

          if (at === null || at > clock()) continue;
        } catch {
          storageFailure(entry);
          continue;
        }

        const retry = attempts.get(entry.id);

        try {
          entry.error = undefined;

          if (!entry.receiptId) {
            entry.receiptId = await transport.reserve(entry);
            store.update(entry);
            record("receipt.reserved", {
              captureId: entry.id,
              receiptId: entry.receiptId,
              imageCount: entry.images.length,
            });
          }

          const receiptId = entry.receiptId;

          const uploadImage = async (image: string, position: number) => {
            if (!active()) return;

            if (entry.uploaded[position]) return;
            const started = Date.now();
            await transport.upload(receiptId, position, image);
            entry.uploaded[position] = true;
            store.update(entry);
            record("receipt.image_uploaded", {
              receiptId: entry.receiptId,
              position,
              durationMs: Date.now() - started,
            });
          };

          const results = await Promise.allSettled(
            entry.images.map((image, position) => uploadImage(image, position)),
          );

          const failed = results.find((result) => result.status === "rejected");

          if (failed) throw failed.reason;

          if (!active()) return;
          await transport.complete(entry.receiptId, entry);
          retries.remove(entry.id);
          store.remove(entry);
          attempts.delete(entry.id);
          restrictions.delete(entry.id);
          record("receipt.upload_completed", {
            receiptId: entry.receiptId,
            imageCount: entry.images.length,
          });
        } catch (cause) {
          entry.error =
            cause instanceof Error ? cause.message : "Opplastingen mislyktes.";
          store.update(entry);

          const failures = (retry?.failures ?? 0) + 1;

          const next = nextAttemptAt(
            failures,
            parseUserError(cause)?.code === "REJECTED",
            clock(),
          );

          attempts.set(entry.id, { failures, nextAttemptAt: next });

          if (next === null)
            record("receipt.upload_paused", {
              captureId: entry.id,
              attempts: failures,
            });

          try {
            if (cause instanceof RequestDeferred) defer(entry.id, cause);
            else retries.remove(entry.id);
          } catch {
            storageFailure(entry);
          }

          if (cause instanceof RequestDeferred) {
            for (const pending of store.list(owner, householdId)) {
              if (pending.receiptId || pending.id === entry.id) continue;

              const deferred = {
                ...pending,
                error: pending.error ?? cause.message,
              };

              store.update(deferred);

              try {
                defer(pending.id, cause);
              } catch {
                storageFailure(deferred);
              }
            }
          }
        }
      }
    } finally {
      running = false;

      for (const listener of listeners) listener();
    }
  };

  return Object.assign(run, { isRunning: () => running, schedule });
}
