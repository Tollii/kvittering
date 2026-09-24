import { parse } from "convex-helpers/validators";
import { v } from "convex/values";
import type { Id } from "../../convex/_generated/dataModel";
import type { ReceiptCacheDatabase } from "./receipt-cache";
import { receiptDataValidator } from "./domain/receipt";
import { productChoiceValidator } from "./domain/product-reference";
import { createReceiptDraft, type ReceiptDraft } from "./receipt-draft";
import type { Receipt } from "./domain/insights";

const savedDraft = v.object({
  schemaVersion: v.literal(1),
  baseline: v.object({
    _id: v.id("receipts"),
    householdId: v.id("households"),
    revision: v.number(),
  }),
  values: v.object({
    data: v.union(receiptDataValidator, v.null()),
    duplicateResolved: v.boolean(),
    excluded: v.boolean(),
    remember: v.array(v.string()),
    productChanges: v.record(v.string(), productChoiceValidator),
    physicalStoreId: v.union(v.number(), v.null()).optional(),
  }),
  moneyErrors: v.record(v.string(), v.string()),
  editVersion: v.number(),
});

export interface DraftPersistence {
  restore(receipt: Receipt): ReceiptDraft;
  write(draft: ReceiptDraft): void;
}

/** Durable drafts are separate from disposable receipt caches and upload queue migrations. */
export class ReceiptDraftStorage implements DraftPersistence {
  constructor(
    private readonly db: ReceiptCacheDatabase,
    private readonly owner: string,
    private readonly household: Id<"households">,
    private readonly id: Id<"receipts">,
  ) {
    const version =
      db.getFirstSync<{ user_version: number }>("PRAGMA user_version")
        ?.user_version ?? 0;

    if (version > 1)
      throw new Error(
        "Lagrede utkast krever en nyere app. Ingen data er slettet.",
      );
    db.withTransactionSync(() => {
      db.execSync(
        "CREATE TABLE IF NOT EXISTS receipt_drafts (owner TEXT NOT NULL, household TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(owner, household, id)); PRAGMA user_version = 1;",
      );
    });
  }

  private read() {
    const row = this.db.getFirstSync<{ data: string }>(
      "SELECT data FROM receipt_drafts WHERE owner = ? AND household = ? AND id = ?",
      this.owner,
      this.household,
      this.id,
    );

    if (!row) return null;
    // Unknown or malformed records remain on disk. Do not replace them with an empty draft.
    const draft = parse(savedDraft, JSON.parse(row.data));

    if (
      draft.baseline._id !== this.id ||
      draft.baseline.householdId !== this.household
    )
      throw new Error("Utkastets tilhørighet stemmer ikke.");

    return draft;
  }

  restore(receipt: Receipt): ReceiptDraft {
    const saved = this.read();

    if (!saved) return createReceiptDraft(receipt);

    return {
      ...createReceiptDraft(receipt),
      baseline: { ...receipt, ...saved.baseline },
      values: {
        ...saved.values,
        physicalStoreId: saved.values.physicalStoreId,
      },
      moneyErrors: saved.moneyErrors,
      editVersion: saved.editVersion,
      dirty: true,
    };
  }

  write(draft: ReceiptDraft) {
    this.db.withTransactionSync(() => {
      this.read();

      if (draft.dirty)
        this.db.runSync(
          "INSERT OR REPLACE INTO receipt_drafts (owner, household, id, data) VALUES (?, ?, ?, ?)",
          this.owner,
          this.household,
          this.id,
          JSON.stringify({
            schemaVersion: 1,
            baseline: {
              _id: draft.baseline._id,
              householdId: draft.baseline.householdId,
              revision: draft.baseline.revision,
            },
            values: draft.values,
            moneyErrors: draft.moneyErrors,
            editVersion: draft.editVersion,
          }),
        );
      else
        this.db.runSync(
          "DELETE FROM receipt_drafts WHERE owner = ? AND household = ? AND id = ?",
          this.owner,
          this.household,
          this.id,
        );
    });
  }
}
