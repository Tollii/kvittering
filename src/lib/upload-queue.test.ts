import { testId } from "./testing/receipts";
import { describe, expect, it } from "vitest";
import {
  createQueueRunner,
  type LocalReceipt,
  type QueueStore,
  type UploadTransport,
} from "./upload-queue";

const household = testId<"households">("household");

const receiptId = testId<"receipts">("receipt");

function fixture() {
  let rows: LocalReceipt[] = [
    {
      schemaVersion: 1,
      id: "capture",
      owner: "user",
      householdId: household,
      createdAt: 0,
      images: ["first.jpg", "second.jpg"],
      uploaded: [false, false],
    },
  ];

  const store: QueueStore = {
    list: (owner, id) =>
      structuredClone(
        rows.filter((row) => row.owner === owner && row.householdId === id),
      ),
    update: (entry) => {
      rows = rows.map((row) =>
        row.id === entry.id ? structuredClone(entry) : row,
      );
    },
    remove: (entry) => {
      rows = rows.filter((row) => row.id !== entry.id);
    },
  };

  return { store, rows: () => rows, run: createQueueRunner(store) };
}

describe("durable receipt upload", () => {
  it("resumes after a failed image without reserving or uploading completed images again", async () => {
    const { run, rows } = fixture();

    let reservations = 0,
      completions = 0,
      fail = true;

    const uploaded: number[] = [];

    const transport: UploadTransport = {
      reserve: async () => {
        reservations++;

        return receiptId;
      },
      upload: async (_id, position) => {
        if (position === 1 && fail) throw new Error("Connection lost");
        uploaded.push(position);
      },
      complete: async () => {
        completions++;
      },
    };

    await run("user", household, transport, () => true);
    expect(rows()[0].uploaded).toEqual([true, false]);
    expect(rows()[0].error).toBe("Connection lost");
    fail = false;
    await run("user", household, transport, () => true);
    expect(uploaded).toEqual([0, 1]);
    expect(reservations).toBe(1);
    expect(completions).toBe(1);
    expect(rows()).toEqual([]);
  });
  it("keeps images when the final commit fails and retries only that commit", async () => {
    const { run, rows } = fixture();

    let uploads = 0,
      fail = true;

    const transport: UploadTransport = {
      reserve: async () => receiptId,
      upload: async () => {
        uploads++;
      },
      complete: async () => {
        if (fail) throw new Error("Offline");
      },
    };

    await run("user", household, transport, () => true);
    expect(rows()).toHaveLength(1);
    fail = false;
    await run("user", household, transport, () => true);
    expect(uploads).toBe(2);
    expect(rows()).toHaveLength(0);
  });
  it("does not upload another account’s queue and stops when the session ends", async () => {
    const { run, rows } = fixture();

    let calls = 0,
      active = true;

    const transport: UploadTransport = {
      reserve: async () => {
        calls++;
        active = false;

        return receiptId;
      },
      upload: async () => {
        calls++;
      },
      complete: async () => {
        calls++;
      },
    };

    await run("other-user", household, transport, () => true);
    expect(calls).toBe(0);
    await run("user", household, transport, () => active);
    expect(calls).toBe(1);
    expect(rows()[0].uploaded).toEqual([false, false]);
  });
});

it("schedules every background image before waiting and retains each successful result on failure", async () => {
  const { run, rows } = fixture();
  const first = Promise.withResolvers<void>();
  const second = Promise.withResolvers<void>();
  const scheduled: number[] = [];
  let committed = false;

  const transport: UploadTransport = {
    concurrentImages: true,
    reserve: async () => receiptId,
    upload: async (_id, position) => {
      scheduled.push(position);

      return position === 0 ? first.promise : second.promise;
    },
    complete: async () => {
      committed = true;
    },
  };

  const running = run("user", household, transport, () => true);
  await Promise.resolve();
  expect(scheduled).toEqual([0, 1]);
  second.resolve();
  first.reject(new Error("Offline"));
  await running;
  expect(rows()[0].uploaded).toEqual([false, true]);
  expect(committed).toBe(false);
});
