import { DatabaseSync } from "node:sqlite";
import type { ReceiptCacheDatabase } from "../receipt-cache";

/** An in-memory SQLite database behind the app's synchronous database contract. */
export function sqliteDatabase() {
  const db = new DatabaseSync(":memory:");
  const control = { writeFailure: false };

  const adapter: ReceiptCacheDatabase = {
    execSync: (sql) => db.exec(sql),
    runSync: (sql, ...values) => {
      if (control.writeFailure) throw new Error("Disk full");
      db.prepare(sql).run(...values);
    },
    // SAFETY: SQL callers declare the columns their row type selects.
    getAllSync: <T>(sql: string, ...values: (string | number)[]) =>
      db.prepare(sql).all(...values) as T[],
    // SAFETY: SQL callers declare the columns their row type selects.
    getFirstSync: <T>(sql: string, ...values: (string | number)[]) =>
      (db.prepare(sql).get(...values) as T | undefined) ?? null,
    withTransactionSync: (operation) => {
      db.exec("BEGIN");

      try {
        operation();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };

  return { db, adapter, control };
}
