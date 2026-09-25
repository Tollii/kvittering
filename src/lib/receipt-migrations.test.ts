import { expect, it } from "vitest";
import {
  migrateReceipt,
  ReceiptMigrationError,
  migrateReceiptDatabase,
} from "./receipt-migrations";
import { sqliteDatabase } from "./testing/sqlite";

const legacy = {
  id: "capture",
  owner: "user",
  householdId: "household",
  createdAt: 1,
  images: ["one.jpg", "two.jpg"],
  uploaded: [true, false],
  receiptId: "reserved",
  error: "Offline",
};

function database() {
  const { db, adapter } = sqliteDatabase();
  db.exec(
    "CREATE TABLE receipt_queue(id TEXT PRIMARY KEY, data TEXT NOT NULL)",
  );

  return { db, adapter };
}

it("migrates an old queued receipt without losing identity, image paths or progress", () => {
  const { db, adapter } = database();

  try {
    db.prepare("INSERT INTO receipt_queue VALUES (?, ?)").run(
      legacy.id,
      JSON.stringify(legacy),
    );
    migrateReceiptDatabase(adapter);
    migrateReceiptDatabase(adapter);
    const row = db.prepare("SELECT data FROM receipt_queue").get()!;
    expect(JSON.parse(String(row.data))).toEqual({
      ...legacy,
      schemaVersion: 1,
    });
    expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(1);
  } finally {
    db.close();
  }
});

it("rolls back the entire migration when one record is corrupt, retaining the original data", () => {
  const { db, adapter } = database();

  try {
    db.prepare("INSERT INTO receipt_queue VALUES (?, ?)").run(
      legacy.id,
      JSON.stringify(legacy),
    );
    db.prepare("INSERT INTO receipt_queue VALUES (?, ?)").run(
      "broken",
      "{broken",
    );
    expect(() => migrateReceiptDatabase(adapter)).toThrow(
      ReceiptMigrationError,
    );
    expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(0);
    expect(
      db.prepare("SELECT data FROM receipt_queue WHERE id = ?").get(legacy.id)
        ?.data,
    ).toBe(JSON.stringify(legacy));
    expect(
      db.prepare("SELECT COUNT(*) AS count FROM receipt_queue").get()?.count,
    ).toBe(2);
  } finally {
    db.close();
  }
});

it("refuses unknown future schemas and invalid upload progress", () => {
  expect(() => migrateReceipt({ ...legacy, schemaVersion: 2 })).toThrow(
    "nyere",
  );
  expect(() => migrateReceipt({ ...legacy, uploaded: [] })).toThrow(
    "Ugyldig lokal kvittering",
  );
  const { db, adapter } = database();

  try {
    db.exec("PRAGMA user_version = 2");
    expect(() => migrateReceiptDatabase(adapter)).toThrow("nyere");
  } finally {
    db.close();
  }
});
