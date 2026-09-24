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
 * Retry limits live only for this app process, so every app start tries again.
 */
export function createQueueRunner(
  store: QueueStore,
  record: (event: string, fields: DiagnosticFields) => void = () => {},
  clock: () => number = Date.now,
) {
  let running = false;
  const retries = new Map<string, RetryState>();

  return async (
    owner: string,
    householdId: Id<"households">,
    transport: UploadTransport,
    active: () => boolean,
    { retryFailed = false }: { retryFailed?: boolean } = {},
  ) => {
    // A manual retry applies even if a drain is already running.
    if (retryFailed) retries.clear();

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
        const retry = retries.get(entry.id);

        if (
          retry &&
          (retry.nextAttemptAt === null || clock() < retry.nextAttemptAt)
        )
          continue;

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

          const uploadImage = async (position: number) => {
            if (!active()) return;

            if (entry.uploaded[position]) return;
            const started = Date.now();
            await transport.upload(receiptId, position, entry.images[position]);
            entry.uploaded[position] = true;
            store.update(entry);
            record("receipt.image_uploaded", {
              receiptId: entry.receiptId,
              position,
              durationMs: Date.now() - started,
            });
          };

          const results = await Promise.allSettled(
            entry.images.map((_, position) => uploadImage(position)),
          );

          const failed = results.find((result) => result.status === "rejected");

          if (failed) throw failed.reason;

          if (!active()) return;
          await transport.complete(entry.receiptId, entry);
          store.remove(entry);
          retries.delete(entry.id);
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

          retries.set(entry.id, { failures, nextAttemptAt: next });

          if (next === null)
            record("receipt.upload_paused", {
              captureId: entry.id,
              attempts: failures,
            });
        }
      }
    } finally {
      running = false;
    }
  };
}
