import { sqliteDatabase } from "./testing/sqlite";
import { expect, it } from "vitest";
import { ReceiptCache } from "./receipt-cache";
import { receiptFixture, testId } from "./testing/receipts";

it("resumes an incomplete download and applies deletions without mixing household data", () => {
  const { db, adapter } = sqliteDatabase();

  try {
    const receipt = receiptFixture();
    const cache = new ReceiptCache(adapter, "first", receipt.householdId);
    cache.apply(0, {
      through: 1,
      done: false,
      changes: [{ id: receipt._id, receipt }],
    });
    const reopened = new ReceiptCache(adapter, "first", receipt.householdId);
    expect(reopened.read()).toEqual({
      receipts: [receipt],
      sequence: 1,
      complete: false,
    });
    expect(
      new ReceiptCache(adapter, "second", receipt.householdId).read().receipts,
    ).toEqual([]);
    reopened.apply(1, {
      through: 3,
      done: true,
      changes: [{ id: receipt._id, receipt: null }],
    });
    expect(
      new ReceiptCache(adapter, "first", receipt.householdId).read(),
    ).toEqual({ receipts: [], sequence: 3, complete: true });
    // A delayed response cannot move a committed cursor backwards.
    reopened.apply(1, {
      through: 2,
      done: true,
      changes: [{ id: receipt._id, receipt }],
    });
    expect(reopened.read().receipts).toEqual([]);
  } finally {
    db.close();
  }
});

it("rolls back the page and cursor together when storage fails", () => {
  const { db, adapter } = sqliteDatabase();

  try {
    const receipt = receiptFixture();
    const cache = new ReceiptCache(adapter, "first", receipt.householdId);
    db.exec(
      "CREATE TRIGGER reject_cursor BEFORE INSERT ON cursors BEGIN SELECT RAISE(ABORT, 'Storage failure'); END;",
    );
    expect(() =>
      cache.apply(0, {
        through: 1,
        done: true,
        changes: [{ id: receipt._id, receipt }],
      }),
    ).toThrow("Storage failure");
    expect(
      new ReceiptCache(adapter, "first", receipt.householdId).read(),
    ).toEqual({ receipts: [], sequence: 0, complete: false });
  } finally {
    db.close();
  }
});

it("rejects another household and discards late responses after access is revoked", () => {
  const { db, adapter } = sqliteDatabase();

  try {
    const receipt = receiptFixture();
    const cache = new ReceiptCache(adapter, "first", receipt.householdId);
    expect(() =>
      cache.apply(0, {
        through: 1,
        done: true,
        changes: [
          {
            id: receipt._id,
            receipt: { ...receipt, householdId: testId<"households">("other") },
          },
        ],
      }),
    ).toThrow("Invalid receipt");
    cache.apply(0, {
      through: 1,
      done: true,
      changes: [{ id: receipt._id, receipt }],
    });
    cache.revoke();
    cache.apply(0, {
      through: 2,
      done: true,
      changes: [{ id: receipt._id, receipt }],
    });
    expect(
      new ReceiptCache(adapter, "first", receipt.householdId).read(),
    ).toEqual({ receipts: [], sequence: 0, complete: false });
  } finally {
    db.close();
  }
});

it("revokes memory and rejects delayed pages even when disk cleanup fails", () => {
  const { db, adapter } = sqliteDatabase();

  try {
    const receipt = receiptFixture();
    const cache = new ReceiptCache(adapter, "first", receipt.householdId);

    const page = {
      through: 1,
      done: true,
      changes: [{ id: receipt._id, receipt }],
    };

    cache.apply(0, page);
    db.exec(
      "CREATE TRIGGER reject_delete BEFORE DELETE ON receipts BEGIN SELECT RAISE(ABORT, 'Disk unavailable'); END;",
    );
    expect(() => cache.revoke()).toThrow("Disk unavailable");
    expect(cache.read().receipts).toEqual([]);
    cache.apply(0, page);
    expect(cache.read().receipts).toEqual([]);
  } finally {
    db.close();
  }
});
