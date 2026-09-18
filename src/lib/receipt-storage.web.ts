import type { QueueStore } from "./upload-queue";
import type { CachedHousehold } from "./receipt-storage";
export const receiptStorage: QueueStore = {
  list: () => [],
  update: () => {},
  remove: () => {},
};
export function imageFile(_name: string): never {
  throw new Error("Åpne iOS-appen for å laste opp bilder.");
}
export function saveLocalReceipts(..._args: unknown[]): never {
  throw new Error("Åpne iOS-appen for å lagre kvitteringer.");
}
export function cachedHousehold(_owner: string): CachedHousehold | null {
  return null;
}
export function cacheHousehold(
  _owner: string,
  _value: CachedHousehold | null,
) {}

export function subscribeStorage(_listener: () => void) {
  return () => {};
}
