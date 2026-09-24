import { testId } from "./testing/receipts";
import { describe, expect, it } from "vitest";
import { userError } from "../../convex/userErrors";
import {
  createQueueRunner,
  retryPolicy,
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

  const clock = { now: 0 };

  return {
    store,
    rows: () => rows,
    clock,
    run: createQueueRunner(store, undefined, () => clock.now),
    // Another app start: the durable queue remains, in-memory retry limits do not.
    restart: () => createQueueRunner(store, undefined, () => clock.now),
  };
}

const failingTransport = (failure: () => Error) => {
  const attempts = { count: 0 };

  const transport: UploadTransport = {
    reserve: async () => {
      attempts.count++;
      throw failure();
    },
    upload: async () => {},
    complete: async () => {},
  };

  return { attempts, transport };
};

describe("durable receipt upload", () => {
  it("resumes after a failed image without reserving or uploading completed images again", async () => {
    const { run, rows, clock } = fixture();

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
    clock.now += retryPolicy.firstDelayMs;
    await run("user", household, transport, () => true);
    expect(uploaded).toEqual([0, 1]);
    expect(reservations).toBe(1);
    expect(completions).toBe(1);
    expect(rows()).toEqual([]);
  });
  it("keeps images when the final commit fails and retries only that commit", async () => {
    const { run, rows, clock } = fixture();

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
    clock.now += retryPolicy.firstDelayMs;
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

describe("automatic upload retries", () => {
  it("backs off after each failure and stops at the attempt cap", async () => {
    const { run, clock } = fixture();

    const { attempts, transport } = failingTransport(
      () => new Error("Offline"),
    );

    const drain = () => run("user", household, transport, () => true);

    await drain();
    await drain();
    expect(attempts.count).toBe(1);

    for (let failure = 1; failure < retryPolicy.maxAttempts; failure++) {
      clock.now += retryPolicy.firstDelayMs * 2 ** (failure - 1) - 1;
      await drain();
      expect(attempts.count).toBe(failure);
      clock.now += 1;
      await drain();
      expect(attempts.count).toBe(failure + 1);
    }

    clock.now += 24 * 60 * 60 * 1000;
    await drain();
    expect(attempts.count).toBe(retryPolicy.maxAttempts);
  });

  it("waits for the person after a rejection, then tries again on request or app start", async () => {
    const { run, restart, rows, clock } = fixture();

    const { attempts, transport } = failingTransport(() =>
      userError("Husstanden er endret. Logg inn på nytt."),
    );

    await run("user", household, transport, () => true);
    clock.now += 24 * 60 * 60 * 1000;
    await run("user", household, transport, () => true);
    expect(attempts.count).toBe(1);
    expect(rows()[0].error).toContain("Husstanden er endret.");

    await run("user", household, transport, () => true, { retryFailed: true });
    expect(attempts.count).toBe(2);

    await restart()("user", household, transport, () => true);
    expect(attempts.count).toBe(3);
    expect(rows()).toHaveLength(1);
  });
});
