import { expect, it } from "vitest";
import {
  migrateReceipt,
  ReceiptMigrationError,
  migrateReceiptDatabase,
  serializeReceipt,
} from "./receipt-migrations";
import { receiptImageLimitMessage } from "./domain/receipt-images";
import type { LocalReceipt } from "./upload-queue";
import type { UploadFailure } from "./upload-failure";
import { v } from "convex/values";
import { parse } from "convex-helpers/validators";
import { sqliteDatabase } from "./testing/sqlite";

/** The reader of the releases before typed failures, as they shipped. */
const olderReader = v.object({
  schemaVersion: v.literal(1),
  id: v.string(),
  owner: v.string(),
  householdId: v.id("households"),
  createdAt: v.number(),
  images: v.array(v.string()),
  uploaded: v.array(v.boolean()),
  receiptId: v.id("receipts").optional(),
  error: v.string().optional(),
});

/** What an older release rolled back to reads from a stored capture. */
function storedForOlderRelease(entry: LocalReceipt) {
  const stored: unknown = JSON.parse(serializeReceipt(entry));

  return parse(olderReader, stored);
}

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
      failure: { kind: "failed" },
      error: "Opplastingen mislyktes.",
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

it("stores each failure so this release and an older one rolled back to both read it", () => {
  const { error: legacyError, ...uploading } = legacy;
  const capture = migrateReceipt(uploading);

  const failures: UploadFailure[] = [
    { kind: "failed" },
    { kind: "deferred", message: "Vent ett minutt." },
    { kind: "rejected", message: "Husstanden er endret." },
    { kind: "image_limit" },
  ];

  for (const failure of failures) {
    const stored: unknown = JSON.parse(
      serializeReceipt({ ...capture, failure }),
    );

    // The older reader accepts the row and drops the field it does not know.
    expect(storedForOlderRelease({ ...capture, failure })).not.toHaveProperty(
      "failure",
    );
    expect(migrateReceipt(stored)).toEqual({ ...capture, failure });
  }

  // Older releases show the deferral and match the image limit by its text.
  expect(
    storedForOlderRelease({
      ...capture,
      failure: { kind: "deferred", message: "Vent ett minutt." },
    }).error,
  ).toBe("Vent ett minutt.");
  expect(
    storedForOlderRelease({ ...capture, failure: { kind: "image_limit" } })
      .error,
  ).toContain(receiptImageLimitMessage);
  expect(migrateReceipt({ ...uploading, error: legacyError }).failure).toEqual({
    kind: "failed",
  });
});

it("reads the failure from the text older releases wrote", () => {
  const { error: _, ...uploading } = legacy;

  expect(
    migrateReceipt({ ...uploading, error: receiptImageLimitMessage }).failure,
  ).toEqual({ kind: "image_limit" });
  // An older release cleared the text when the retry went through.
  expect(
    migrateReceipt({
      ...uploading,
      failure: { kind: "rejected", message: "Husstanden er endret." },
    }).failure,
  ).toBeUndefined();
  // A capture an older release deferred keeps waiting for the service's deadline.
  expect(
    migrateReceipt(
      { ...uploading, error: "Vent ett minutt." },
      { restricted: true },
    ).failure,
  ).toEqual({ kind: "deferred", message: "Vent ett minutt." });
  // A failure kind from a later release falls back to its text.
  expect(
    migrateReceipt({ ...legacy, failure: { kind: "later" } }).failure,
  ).toEqual({ kind: "failed" });
});
