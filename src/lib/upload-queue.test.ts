import { present, testId } from "./testing/receipts";
import {
  RequestDeferred,
  type RetryDeadline,
  type RetryStore,
} from "./request-retry";
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
  const deadlines = new Map<string, RetryDeadline>();

  const retries: RetryStore = {
    read: (id) => deadlines.get(id) ?? null,
    write: (id, value) => {
      deadlines.set(id, value);
    },
    remove: (id) => {
      deadlines.delete(id);
    },
  };

  return {
    store,
    rows: () => rows,
    clock,
    retries,
    advance: (milliseconds: number) => { clock.now += milliseconds; },
    run: createQueueRunner(store, undefined, retries, () => clock.now),
    restart: () => createQueueRunner(store, undefined, retries, () => clock.now),
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
  it("retains queued images after quota rejection and uses the same capture on retry", async () => {
    const { run, rows, advance } = fixture();
    const original = structuredClone(rows()[0]);
    let blocked = true;
    let uploads = 0;
    const captureIds: string[] = [];

    const transport: UploadTransport = {
      reserve: async (entry) => {
        captureIds.push(entry.id);

        if (blocked) throw new Error("Dagens grense for kvitteringer er nådd.");

        return receiptId;
      },
      upload: async () => {
        uploads++;
      },
      complete: async () => {},
    };

    await run("user", household, transport, () => true);
    expect(rows()).toEqual([
      { ...original, error: "Dagens grense for kvitteringer er nådd." },
    ]);
    expect(uploads).toBe(0);
    blocked = false;
    advance(retryPolicy.firstDelayMs);
    await run("user", household, transport, () => true);
    expect(captureIds).toEqual([original.id, original.id]);
    expect(uploads).toBe(2);
    expect(rows()).toEqual([]);
  });
  it("resumes after a failed image without reserving or uploading completed images again", async () => {
    const { run, rows, advance } = fixture();

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
    expect(present(rows()[0]).uploaded).toEqual([true, false]);
    expect(present(rows()[0]).error).toBe("Connection lost");
    fail = false;
    advance(retryPolicy.firstDelayMs);
    await run("user", household, transport, () => true);
    expect(uploaded).toEqual([0, 1]);
    expect(reservations).toBe(1);
    expect(completions).toBe(1);
    expect(rows()).toEqual([]);
  });
  it("keeps images when the final commit fails and retries only that commit", async () => {
    const { run, rows, advance } = fixture();

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
    advance(retryPolicy.firstDelayMs);
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
    expect(present(rows()[0]).uploaded).toEqual([false, false]);
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
  expect(present(rows()[0]).uploaded).toEqual([false, true]);
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
    expect(present(rows()[0]).error).toContain("Husstanden er endret.");

    await run("user", household, transport, () => true, { retryFailed: true });
    expect(attempts.count).toBe(2);

    await restart()("user", household, transport, () => true);
    expect(attempts.count).toBe(3);
    expect(rows()).toHaveLength(1);
  });
});

it("does not contact the server before its quota deadline, including after runner recreation", async () => {
  const { run, store, retries, advance, rows } = fixture();
  let calls = 0;

  const transport: UploadTransport = {
    reserve: async () => {
      calls++;
      throw new RequestDeferred("Vent til i morgen.", 86_400_000);
    },
    upload: async () => {},
    complete: async () => {},
  };

  await run("user", household, transport, () => true);
  advance(60_000);
  await run("user", household, transport, () => true);
  await createQueueRunner(
    store,
    () => {},
    retries,
    () => 60_000,
  )("user", household, transport, () => true);
  expect(calls).toBe(1);
  expect(rows()[0].images).toEqual(["first.jpg", "second.jpg"]);
  advance(86_400_000);
  await run("user", household, transport, () => true);
  expect(calls).toBe(2);
});

it("reports an active reservation until its failure is persisted", async () => {
  const { run, rows } = fixture();

  let rejectReservation: (cause: Error) => void = (cause) => {
    throw cause;
  };

  const reservation = new Promise<typeof receiptId>((_, reject) => {
    rejectReservation = reject;
  });

  const pending = run(
    "user",
    household,
    {
      reserve: async () => reservation,
      upload: async () => {},
      complete: async () => {},
    },
    () => true,
  );

  expect(run.isRunning()).toBe(true);
  rejectReservation(new Error("Image limit"));
  await pending;
  expect(run.isRunning()).toBe(false);
  expect(rows()[0].error).toBe("Image limit");
  expect(rows()[0].images).toEqual(["first.jpg", "second.jpg"]);
});
