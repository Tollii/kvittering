import type {
  ProcessingEngine,
  FoundationResult,
} from "./domain/processing-engine";
import type { Id } from "../../convex/_generated/dataModel";

export type LocalReceipt = {
  id: string;
  owner: string;
  householdId: Id<"households">;
  createdAt: number;
  images: string[];
  uploaded: boolean[];
  receiptId?: Id<"receipts">;
  error?: string;
  processingEngine?: ProcessingEngine;
  foundationResult?: FoundationResult;
};
export interface QueueStore {
  list(owner: string, householdId: Id<"households">): LocalReceipt[];
  update(receipt: LocalReceipt): void;
  remove(receipt: LocalReceipt): void;
}
export interface UploadTransport {
  reserve(entry: LocalReceipt): Promise<Id<"receipts">>;
  upload(id: Id<"receipts">, position: number, uri: string): Promise<void>;
  prepare?(entry: LocalReceipt): Promise<void>;
  complete(id: Id<"receipts">, entry: LocalReceipt): Promise<unknown>;
}

/** Persist each completed step. Repeated requests use the same server reservation. */
export function createQueueRunner(store: QueueStore) {
  let running = false;
  return async (
    owner: string,
    householdId: Id<"households">,
    transport: UploadTransport,
    changed: () => void,
    active: () => boolean,
  ) => {
    if (running) return;
    running = true;
    try {
      for (const entry of store.list(owner, householdId)) {
        if (!active()) break;
        if (entry.processingEngine === "foundation" && entry.error) continue;
        try {
          entry.error = undefined;
          if (!entry.receiptId) {
            entry.receiptId = await transport.reserve(entry);
            store.update(entry);
          }
          for (let position = 0; position < entry.images.length; position++) {
            if (!active()) return;
            if (entry.uploaded[position]) continue;
            await transport.upload(
              entry.receiptId,
              position,
              entry.images[position],
            );
            entry.uploaded[position] = true;
            store.update(entry);
            changed();
          }
          if (!active()) return;
          await transport.prepare?.(entry);
          store.update(entry);
          if (!active()) return;
          await transport.complete(entry.receiptId, entry);
          store.remove(entry);
        } catch (cause) {
          entry.error =
            cause instanceof Error ? cause.message : "Opplastingen mislyktes.";
          store.update(entry);
        }
        changed();
      }
    } finally {
      running = false;
    }
  };
}
