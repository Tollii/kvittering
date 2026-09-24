import { present, testId } from "./testing/receipts";
import { openDatabaseSync } from "expo-sqlite";
import { receiptImageLimitMessage } from "./domain/receipt-images";
import { expect, it, vi } from "vitest";
import {
  receiptStorage,
  subscribeStorage,
  saveLocalReceipts,
  parseCachedHousehold,
  regroupQueuedReceipt,
} from "./receipt-storage";

const control = vi.hoisted(() => ({
  fail: false,
  copyFails: false,
  sequence: 0,
  copies: 0,
  deletes: 0,
  writesBeforeFailure: -1,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace the native SDK or environment boundary; application behavior remains under test.
vi.mock("./deployment-storage", () => ({ storageSuffix: "-test" }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace the native SDK or environment boundary; application behavior remains under test.
vi.mock("expo-crypto", () => ({
  randomUUID: () => {
    control.sequence++;

    return `capture-${control.sequence}`;
  },
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace the native SDK or environment boundary; application behavior remains under test.
vi.mock("expo-file-system", () => ({
  Paths: { document: "test" },
  Directory: class {
    create() {}
  },
  File: class {
    exists = false;
    copySync() {
      if (control.copyFails) throw new Error("Copy failed");
      control.copies++;
    }
    delete() {
      control.deletes++;
    }
  },
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace the native SDK or environment boundary; application behavior remains under test.
vi.mock("expo-sqlite", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");

  return {
    openDatabaseSync: () => ({
      execSync: (sql: string) => db.exec(sql),
      getFirstSync: (sql: string, ...args: string[]) =>
        db.prepare(sql).get(...args) ?? null,
      getAllSync: (sql: string, ...args: string[]) =>
        db.prepare(sql).all(...args),
      runSync: (sql: string, ...args: string[]) => {
        if (control.fail || control.writesBeforeFailure === 0)
          throw new Error("Disk full");

        if (control.writesBeforeFailure > 0) control.writesBeforeFailure--;

        return db.prepare(sql).run(...args);
      },
      withTransactionSync: (operation: () => void) => {
        db.exec("BEGIN");

        try {
          operation();
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    }),
  };
});

it("publishes immutable scoped snapshots only after committed writes", () => {
  const household = testId<"households">("household");
  const empty = receiptStorage.list("owner", household);
  expect(receiptStorage.list("owner", household)).toBe(empty);

  const notified = vi.fn<() => ReturnType<typeof receiptStorage.list>>(() =>
    receiptStorage.list("owner", household),
  );

  const unsubscribe = subscribeStorage(notified);
  control.fail = true;
  expect(() => saveLocalReceipts("owner", household, ["image"], true)).toThrow(
    "Disk full",
  );
  expect(notified).not.toHaveBeenCalled();
  expect(receiptStorage.list("owner", household)).toBe(empty);
  control.fail = false;
  saveLocalReceipts("owner", household, ["image"], true);
  const snapshot = receiptStorage.list("owner", household);
  expect(snapshot).toHaveLength(1);
  expect(notified).toHaveReturnedWith(snapshot);
  expect(receiptStorage.list("owner", household)).toBe(snapshot);
  expect(Object.isFrozen(present(snapshot[0]).uploaded)).toBe(true);
  expect(receiptStorage.list("another", household)).toEqual([]);
  unsubscribe();
});

it("queues no receipt when an image cannot be copied", () => {
  const household = testId<"households">("copy-household");
  control.copyFails = true;
  expect(() => saveLocalReceipts("owner", household, ["image"], false)).toThrow(
    "Copy failed",
  );
  control.copyFails = false;
  expect(receiptStorage.list("owner", household)).toEqual([]);
});

it("rejects malformed disposable household cache data", () => {
  expect(parseCachedHousehold({ id: 4, name: "Home" })).toBeNull();
  expect(parseCachedHousehold({ id: "household", name: "Home" })).toEqual({
    id: "household",
    name: "Home",
  });
});

it("rejects a sixth new image before copying files", () => {
  const before = control.copies;
  expect(() =>
    saveLocalReceipts(
      "limit",
      testId<"households">("household"),
      Array.from({ length: 6 }, (_, index) => `image-${index}`),
      true,
    ),
  ).toThrow("fem");
  expect(control.copies).toBe(before);
});

it("atomically regroups all legacy images and keeps the original on write failure", () => {
  const household = testId<"households">("regroup-household");

  const entry = {
    schemaVersion: 1 as const,
    id: "legacy-group",
    owner: "regroup",
    householdId: household,
    createdAt: 1,
    images: Array.from({ length: 8 }, (_, index) => `${index}.jpg`),
    uploaded: Array.from({ length: 8 }, () => false),
    error: receiptImageLimitMessage,
  };

  receiptStorage.update(entry);
  control.writesBeforeFailure = 1;
  expect(() =>
    regroupQueuedReceipt(entry.owner, household, entry.id, [0, 2, 4, 6]),
  ).toThrow("Disk full");
  control.writesBeforeFailure = -1;
  expect(receiptStorage.list(entry.owner, household)).toEqual([entry]);
  const { copies, deletes } = control;
  expect(() =>
    regroupQueuedReceipt("other", household, entry.id, [0, 2, 4, 6]),
  ).toThrow("endret");
  regroupQueuedReceipt(entry.owner, household, entry.id, [0, 2, 4, 6]);
  const groups = receiptStorage.list(entry.owner, household);
  expect(groups.map((group) => group.images)).toEqual([
    ["0.jpg", "2.jpg", "4.jpg", "6.jpg"],
    ["1.jpg", "3.jpg", "5.jpg", "7.jpg"],
  ]);
  expect(new Set(groups.map((group) => group.id)).size).toBe(2);
  expect(
    groups.every(
      (group) =>
        !group.receiptId && group.uploaded.every((uploaded) => !uploaded),
    ),
  ).toBe(true);
  expect(control.copies).toBe(copies);
  expect(control.deletes).toBe(deletes);
});

it("refuses to regroup reserved or unknown future queue payloads", () => {
  const household = testId<"households">("protected-household");

  const entry = {
    schemaVersion: 1 as const,
    id: "protected-group",
    owner: "protected",
    householdId: household,
    createdAt: 1,
    images: Array.from({ length: 6 }, (_, index) => `${index}.jpg`),
    uploaded: Array.from({ length: 6 }, () => false),
    receiptId: testId<"receipts">("reserved"),
    error: receiptImageLimitMessage,
  };

  receiptStorage.update(entry);
  expect(() =>
    regroupQueuedReceipt(entry.owner, household, entry.id, [0, 1, 2]),
  ).toThrow("avklart");
  const db = openDatabaseSync("ignored");
  const future = JSON.stringify({ ...entry, schemaVersion: 2 });
  db.runSync(
    "UPDATE receipt_queue SET data = ? WHERE id = ?",
    future,
    entry.id,
  );
  expect(() =>
    regroupQueuedReceipt(entry.owner, household, entry.id, [0, 1, 2]),
  ).toThrow("nyere versjon");
  expect(
    db.getFirstSync<{ data: string }>(
      "SELECT data FROM receipt_queue WHERE id = ?",
      entry.id,
    )?.data,
  ).toBe(future);
});
