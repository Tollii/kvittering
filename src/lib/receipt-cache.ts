import { parse } from "convex-helpers/validators";
import schema from "../../convex/schema";
import type { Doc, Id } from "../../convex/_generated/dataModel";

export interface ReceiptCacheDatabase {
  execSync(sql: string): void;
  runSync(sql: string, ...values: (string | number)[]): void;
  getAllSync<T>(sql: string, ...values: (string | number)[]): T[];
  getFirstSync<T>(sql: string, ...values: (string | number)[]): T | null;
  withTransactionSync(operation: () => void): void;
}

export type ReceiptCacheSnapshot = {
  receipts: Doc<"receipts">[];
  sequence: number;
  complete: boolean;
};

export type ReceiptChangePage = {
  through: number;
  done: boolean;
  changes: { id: Id<"receipts">; receipt: Doc<"receipts"> | null }[];
};

export function initializeReceiptCacheDatabase(db: ReceiptCacheDatabase) {
  db.execSync(
    "CREATE TABLE IF NOT EXISTS receipts (owner TEXT NOT NULL, household TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(owner, household, id)); CREATE TABLE IF NOT EXISTS cursors (owner TEXT NOT NULL, household TEXT NOT NULL, sequence INTEGER NOT NULL, complete INTEGER NOT NULL, PRIMARY KEY(owner, household));",
  );
}

/** Disposable data only. Queue records and unsaved editor drafts use separate storage. */
export class ReceiptCache {
  private snapshot: ReceiptCacheSnapshot;
  private readonly listeners = new Set<() => void>();
  private disposed = false;
  constructor(
    private readonly db: ReceiptCacheDatabase,
    private readonly owner: string,
    private readonly household: Id<"households">,
  ) {
    initializeReceiptCacheDatabase(db);
    this.snapshot = this.restore();
  }

  private restore(): ReceiptCacheSnapshot {
    try {
      const cursor = this.db.getFirstSync<{
        sequence: number;
        complete: number;
      }>(
        "SELECT sequence, complete FROM cursors WHERE owner = ? AND household = ?",
        this.owner,
        this.household,
      );

      const receipts = this.db
        .getAllSync<{ data: string }>(
          "SELECT data FROM receipts WHERE owner = ? AND household = ?",
          this.owner,
          this.household,
        )
        .map((row) => parse(schema.doc("receipts"), JSON.parse(row.data)));

      if (receipts.some((receipt) => receipt.householdId !== this.household))
        throw new Error("Invalid cached household.");

      return {
        receipts,
        sequence: cursor?.sequence ?? 0,
        complete: cursor?.complete === 1,
      };
    } catch {
      this.clear();

      return { receipts: [], sequence: 0, complete: false };
    }
  }

  read = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  apply(after: number, page: ReceiptChangePage) {
    if (this.disposed || after !== this.snapshot.sequence) return;

    if (
      page.through < after ||
      page.changes.some(
        (change) =>
          change.receipt &&
          (change.receipt.householdId !== this.household ||
            change.receipt._id !== change.id),
      )
    )
      throw new Error("Invalid receipt synchronization response.");

    const receipts = new Map(
      this.snapshot.receipts.map((receipt) => [receipt._id, receipt]),
    );

    const complete = this.snapshot.complete || page.done;
    this.db.withTransactionSync(() => {
      for (const change of page.changes) {
        if (change.receipt) {
          this.db.runSync(
            "INSERT OR REPLACE INTO receipts (owner, household, id, data) VALUES (?, ?, ?, ?)",
            this.owner,
            this.household,
            change.id,
            JSON.stringify(change.receipt),
          );
          receipts.set(change.id, change.receipt);
        } else {
          this.db.runSync(
            "DELETE FROM receipts WHERE owner = ? AND household = ? AND id = ?",
            this.owner,
            this.household,
            change.id,
          );
          receipts.delete(change.id);
        }
      }

      this.db.runSync(
        "INSERT OR REPLACE INTO cursors (owner, household, sequence, complete) VALUES (?, ?, ?, ?)",
        this.owner,
        this.household,
        page.through,
        Number(complete),
      );
    });
    this.snapshot = {
      receipts: [...receipts.values()],
      sequence: page.through,
      complete,
    };

    for (const listener of this.listeners) listener();
  }

  private clear() {
    this.db.withTransactionSync(() => {
      this.db.runSync(
        "DELETE FROM receipts WHERE owner = ? AND household = ?",
        this.owner,
        this.household,
      );
      this.db.runSync(
        "DELETE FROM cursors WHERE owner = ? AND household = ?",
        this.owner,
        this.household,
      );
    });
  }

  /** Revocation also rejects responses from requests that were already in flight. */
  revoke() {
    this.disposed = true;
    this.clear();
    this.snapshot = { receipts: [], sequence: 0, complete: false };

    for (const listener of this.listeners) listener();
  }
}
