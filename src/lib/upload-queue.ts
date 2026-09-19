import type { Id } from "../../convex/_generated/dataModel";
import type { DiagnosticFields } from "./diagnostics";

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
  complete(id: Id<"receipts">, entry: LocalReceipt): Promise<unknown>;
}

/** Persist each completed step. Repeated requests use the same server reservation. */
export function createQueueRunner(
  store: QueueStore,
  record: (event: string, fields: DiagnosticFields) => void = () => {},
) {
  let running = false;
  return async (
    owner: string,
    householdId: Id<"households">,
    transport: UploadTransport,
    active: () => boolean,
  ) => {
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
          for (let position = 0; position < entry.images.length; position++) {
            if (!active()) return;
            if (entry.uploaded[position]) continue;
            const started = Date.now();
            await transport.upload(
              entry.receiptId,
              position,
              entry.images[position],
            );
            entry.uploaded[position] = true;
            store.update(entry);
            record("receipt.image_uploaded", {
              receiptId: entry.receiptId,
              position,
              durationMs: Date.now() - started,
            });
          }
          if (!active()) return;
          await transport.complete(entry.receiptId, entry);
          store.remove(entry);
          record("receipt.upload_completed", {
            receiptId: entry.receiptId,
            imageCount: entry.images.length,
          });
        } catch (cause) {
          entry.error =
            cause instanceof Error ? cause.message : "Opplastingen mislyktes.";
          store.update(entry);
        }
      }
    } finally {
      running = false;
    }
  };
}
