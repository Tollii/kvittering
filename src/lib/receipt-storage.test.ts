import { testId } from "./testing/receipts";
import { expect, it, vi } from "vitest";
import {
  receiptStorage,
  subscribeStorage,
  saveLocalReceipts,
  parseCachedHousehold,
} from "./receipt-storage";

const control = vi.hoisted(() => ({ fail: false }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace the native SDK or environment boundary; application behavior remains under test.
vi.mock("./deployment-storage", () => ({ storageSuffix: "-test" }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace the native SDK or environment boundary; application behavior remains under test.
vi.mock("expo-crypto", () => ({ randomUUID: () => "capture" }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace the native SDK or environment boundary; application behavior remains under test.
vi.mock("expo-file-system", () => ({
  Paths: { document: "test" },
  Directory: class {
    create() {}
  },
  File: class {
    exists = false;
    copy() {}
    delete() {}
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
        if (control.fail) throw new Error("Disk full");

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
  expect(Object.isFrozen(snapshot[0].uploaded)).toBe(true);
  expect(receiptStorage.list("another", household)).toEqual([]);
  unsubscribe();
});

it("rejects malformed disposable household cache data", () => {
  expect(parseCachedHousehold({ id: 4, name: "Home" })).toBeNull();
  expect(parseCachedHousehold({ id: "household", name: "Home" })).toEqual({
    id: "household",
    name: "Home",
  });
});
