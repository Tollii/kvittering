import {
  reduceReceiptDraft,
  type ReceiptDraft,
  type ReceiptDraftAction,
} from "../features/receipt-draft";
import type { Receipt } from "./domain/insights";
import type { DraftPersistence } from "./receipt-draft-storage";

type DraftSnapshot =
  | { kind: "blocked"; message: string }
  | { kind: "ready"; draft: ReceiptDraft; storageError: string };

/** Publish edits after attempting their durable write, before the next navigation or update event. */
export class ReceiptDraftController {
  private snapshot: DraftSnapshot;
  private readonly listeners = new Set<() => void>();
  private storage?: DraftPersistence;
  constructor(open: () => DraftPersistence, receipt: Receipt) {
    try {
      this.storage = open();
      this.snapshot = {
        kind: "ready",
        draft: this.storage.restore(receipt),
        storageError: "",
      };
    } catch {
      this.snapshot = {
        kind: "blocked",
        message:
          "Det lagrede utkastet kan ikke åpnes i denne versjonen. Ingen data er slettet. Oppdater appen eller kontakt hjelp.",
      };
    }
  }
  read = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };
  dispatch = (action: ReceiptDraftAction) => {
    if (this.snapshot.kind !== "ready") return;
    const previous = this.snapshot.draft;
    const draft = reduceReceiptDraft(previous, action);
    let storageError = this.snapshot.storageError;

    if (
      draft.dirty !== previous.dirty ||
      draft.values !== previous.values ||
      draft.moneyErrors !== previous.moneyErrors ||
      draft.baseline !== previous.baseline ||
      storageError
    ) {
      try {
        this.storage!.write(draft);
        storageError = "";
      } catch {
        storageError =
          "Utkastet kunne ikke lagres på enheten. Behold appen åpen til endringene er lagret.";
      }
    }

    this.snapshot = { kind: "ready", draft, storageError };

    for (const listener of this.listeners) listener();
  };
}
