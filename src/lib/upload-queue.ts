import {
  RequestDeferred,
  retryDeadline,
  type RetryStore,
  type RetryDeadline,
} from "./request-retry";
import type { Id } from "../../convex/_generated/dataModel";
import type { DiagnosticFields } from "./diagnostics";
import {
  deferral,
  failureFromCause,
  waitsForPerson,
  type UploadFailure,
} from "./upload-failure";

export type LocalReceipt = {
  schemaVersion: 1;
  id: string;
  owner: string;
  householdId: Id<"households">;
  createdAt: number;
  images: string[];
  uploaded: boolean[];
  receiptId?: Id<"receipts">;
  failure?: UploadFailure;
};

export interface QueueStore {
  list(owner: string, householdId: Id<"households">): LocalReceipt[];
  update(receipt: LocalReceipt): void;
  remove(receipt: LocalReceipt): void;
}

export interface UploadTransport {
  reserve(entry: LocalReceipt): Promise<Id<"receipts">>;
  upload(id: Id<"receipts">, position: number, uri: string): Promise<void>;
  complete(id: Id<"receipts">, entry: LocalReceipt): Promise<void>;
  /** Whether a repeated upload joins the transfer already in flight instead of sending another. */
  readonly joinsPendingUploads?: boolean;
}

export const retryPolicy = { firstDelayMs: 15_000, maxAttempts: 6 };

/** How long each step may wait for an answer while the app is open. */
export const stepDeadlineMs = {
  reserve: 30_000,
  upload: 120_000,
  complete: 30_000,
};

type UploadStep = keyof typeof stepDeadlineMs;

const deadlineTickMs = 5_000;

/** The longest delay setTimeout keeps; a longer one overflows and fires at once. */
const longestTimerMs = 2 ** 31 - 1;

/** A request that never answered. It holds no server result, so the capture retries. */
class UploadStalled extends Error {
  override name = "UploadStalled";

  constructor(
    readonly step: UploadStep,
    /** A retry joins the request still in flight, so retrying costs nothing. */
    readonly joinable = false,
  ) {
    super("Opplastingen fikk ikke svar.");
  }
}

type Report = (
  cause: unknown,
  operation: string,
  fields: DiagnosticFields,
) => void;

/**
 * Reject a step that has not settled within its deadline, and report the stall,
 * which throws nowhere else. iOS stops timers while the app is suspended, so
 * counted ticks leave background time out.
 */
function withinDeadline<T>(
  cause: UploadStalled,
  request: Promise<T>,
  report: Report,
  fields: DiagnosticFields,
) {
  let timer: ReturnType<typeof setInterval> | undefined;

  const stalled = new Promise<never>((_, reject) => {
    let remaining = stepDeadlineMs[cause.step];

    timer = setInterval(() => {
      remaining -= deadlineTickMs;

      if (remaining > 0) return;
      clearInterval(timer);
      // Settle first: a failing report must not bring back the hang.
      reject(cause);

      try {
        report(cause, "receipt.upload_stalled", {
          ...fields,
          phase: cause.step,
        });
      } catch {
        /* The capture still retries; only the diagnostic is lost. */
      }
    }, deadlineTickMs);
  });

  return Promise.race([request, stalled]).finally(() => clearInterval(timer));
}

/** Give every transport step its deadline, so a request that never answers cannot hold the queue. */
function withDeadlines(
  transport: UploadTransport,
  report: Report,
): UploadTransport {
  return {
    reserve: (entry) =>
      withinDeadline(
        new UploadStalled("reserve"),
        transport.reserve(entry),
        report,
        {},
      ),
    upload: (receiptId, position, uri) =>
      withinDeadline(
        new UploadStalled("upload", transport.joinsPendingUploads),
        transport.upload(receiptId, position, uri),
        report,
        { receiptId, position },
      ),
    complete: (receiptId, entry) =>
      withinDeadline(
        new UploadStalled("complete"),
        transport.complete(receiptId, entry),
        report,
        { receiptId },
      ),
  };
}

/**
 * Whether a failure spends the automatic retry budget. A stall whose retry
 * joins the transfer in flight does not: retrying sends nothing new, and
 * stopping would leave the capture waiting after the transfer lands. Nor does
 * a deferral: the service named when to come back, so the capture waits for
 * that time instead of stopping as if it had failed.
 */
function spendsRetry(failure: UploadFailure, joinable: boolean) {
  return failure.kind !== "deferred" && !joinable;
}

/**
 * When a failed capture may be tried again automatically. A rejection the
 * person must act on waits for them; other failures back off and stop after
 * the attempt cap. Returns null when only a manual retry or restart may retry.
 */
export function nextAttemptAt(
  failures: number,
  rejected: boolean,
  now: number,
): number | null {
  if (rejected || failures >= retryPolicy.maxAttempts) return null;

  return now + retryPolicy.firstDelayMs * 2 ** (failures - 1);
}

type RetryState = { failures: number; nextAttemptAt: number | null };

/**
 * Persist each completed step. Repeated requests use the same server reservation.
 * Quota deadlines survive restarts. Other failures stop after the per-process cap.
 * A step that never answers fails at its deadline, so it cannot hold the queue.
 */
export function createQueueRunner(
  store: QueueStore,
  retries: RetryStore,
  {
    record = () => {},
    report = () => {},
    clock = Date.now,
  }: {
    record?: (event: string, fields: DiagnosticFields) => void;
    report?: Report;
    clock?: () => number;
  } = {},
) {
  let running = false;
  const attempts = new Map<string, RetryState>();
  const restrictions = new Map<string, RetryDeadline>();
  const listeners = new Set<() => void>();

  function readDeadline(id: string) {
    const saved = retries.read(id);
    const memory = restrictions.get(id);

    return memory && memory.retryAt > (saved?.retryAt ?? 0) ? memory : saved;
  }

  function defer(id: string, cause: RequestDeferred) {
    const deadline = retryDeadline(1, clock(), cause);
    // Keep the restriction in memory even if the durable write fails.
    const memory = restrictions.get(id);
    restrictions.set(
      id,
      memory && memory.retryAt > deadline.retryAt ? memory : deadline,
    );
    const previous = readDeadline(id);

    const retained =
      previous && previous.retryAt > deadline.retryAt ? previous : deadline;

    restrictions.set(id, retained);
    retries.write(id, retained);
  }

  /** The capture waits for a manual retry, so a deferral no longer waits by itself. */
  function storageFailure(entry: LocalReceipt) {
    attempts.set(entry.id, { failures: 0, nextAttemptAt: null });

    if (!entry.failure || entry.failure.kind === "deferred")
      entry.failure = { kind: "failed" };
    store.update(entry);
    record("receipt.retry_storage_failed", { captureId: entry.id });
  }

  function deadline(entry: LocalReceipt) {
    const attempt = attempts.get(entry.id);

    if (attempt?.nextAttemptAt === null) return null;
    const saved = readDeadline(entry.id);

    return Math.max(
      attempt?.nextAttemptAt ?? 0,
      saved?.restricted ? saved.retryAt : 0,
    );
  }

  /** Re-read the queue after every drain, including captures added during an upload. */
  function schedule(
    owner: string,
    householdId: Id<"households">,
    synchronize: () => Promise<void>,
  ) {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const update = () => {
      if (timer) clearTimeout(timer);

      if (running) return;
      let next = Infinity;

      for (const entry of store.list(owner, householdId)) {
        try {
          const at = deadline(entry);

          if (at !== null) next = Math.min(next, at);
        } catch {
          // The drain records the unreadable deadline without contacting the server.
          next = Math.min(next, clock());
        }
      }

      // A longer delay than setTimeout holds would fire at once, again and again.
      if (Number.isFinite(next))
        timer = setTimeout(
          () => void synchronize(),
          Math.min(Math.max(0, next - clock()), longestTimerMs),
        );
    };

    listeners.add(update);
    update();

    return () => {
      listeners.delete(update);

      if (timer) clearTimeout(timer);
    };
  }

  /**
   * Whether the drain may try the capture now. An unreadable deadline is
   * recorded as a storage failure, and the capture waits.
   */
  function isDue(entry: LocalReceipt) {
    try {
      const at = deadline(entry);

      return at !== null && at <= clock();
    } catch {
      storageFailure(entry);

      return false;
    }
  }

  /**
   * Reserve, upload, and complete one capture, and persist each step.
   * Returns false when the drain must stop before completion. Throws when a step fails.
   */
  async function uploadEntry(
    entry: LocalReceipt,
    transport: UploadTransport,
    active: () => boolean,
    event: DiagnosticFields,
  ) {
    entry.failure = undefined;

    if (!entry.receiptId) {
      entry.receiptId = await transport.reserve(entry);
      store.update(entry);
      event.reserved = true;
    }

    const receiptId = entry.receiptId;

    event.receiptId = receiptId;

    const uploadImage = async (image: string, position: number) => {
      if (!active()) return;

      if (entry.uploaded[position]) return;
      await transport.upload(receiptId, position, image);
      entry.uploaded[position] = true;
      store.update(entry);
      event.uploadedImages = (event.uploadedImages ?? 0) + 1;
    };

    const results = await Promise.allSettled(
      entry.images.map((image, position) => uploadImage(image, position)),
    );

    const rejected: unknown[] = [];

    for (const result of results)
      if (result.status === "rejected") rejected.push(result.reason);

    // A stall must not hide another image's real error, which the cap still applies to.
    const failure =
      rejected.find((cause) => !(cause instanceof UploadStalled)) ??
      rejected[0];

    if (rejected.length) throw failure;

    if (!active()) return false;
    await transport.complete(receiptId, entry);
    retries.remove(entry.id);
    store.remove(entry);
    attempts.delete(entry.id);
    restrictions.delete(entry.id);

    return true;
  }

  /**
   * Keep a deferral on the row and its deadline in the retry store together.
   * A capture that already waits for the person keeps that failure.
   */
  function applyDeferral(entry: LocalReceipt, cause: RequestDeferred) {
    if (!entry.failure || !waitsForPerson(entry.failure))
      entry.failure = deferral(cause);
    store.update(entry);

    try {
      defer(entry.id, cause);
    } catch {
      storageFailure(entry);
    }
  }

  /** Apply a deferral to each other capture that has no server reservation yet. */
  function deferPendingCaptures(
    owner: string,
    householdId: Id<"households">,
    failedId: string,
    cause: RequestDeferred,
  ) {
    for (const pending of store.list(owner, householdId)) {
      if (pending.receiptId || pending.id === failedId) continue;

      applyDeferral({ ...pending }, cause);
    }
  }

  /** Persist the failure and set when the capture may be tried again. */
  function recordFailure(
    owner: string,
    householdId: Id<"households">,
    entry: LocalReceipt,
    retry: RetryState | undefined,
    cause: unknown,
  ) {
    const failure = failureFromCause(cause);
    const joinable = cause instanceof UploadStalled && cause.joinable;

    const failures =
      (retry?.failures ?? 0) + (spendsRetry(failure, joinable) ? 1 : 0);

    // A free retry still backs off, from the first delay up.
    const next = nextAttemptAt(
      Math.max(failures, 1),
      waitsForPerson(failure),
      clock(),
    );

    attempts.set(entry.id, { failures, nextAttemptAt: next });
    entry.failure = failure;

    if (cause instanceof RequestDeferred) {
      applyDeferral(entry, cause);
      deferPendingCaptures(owner, householdId, entry.id, cause);

      return;
    }

    store.update(entry);

    try {
      retries.remove(entry.id);
    } catch {
      storageFailure(entry);
    }
  }

  const run = async (
    owner: string,
    householdId: Id<"households">,
    transport: UploadTransport,
    active: () => boolean,
    { retryFailed = false }: { retryFailed?: boolean } = {},
  ) => {
    // A manual retry applies even if a drain is already running.
    if (retryFailed) attempts.clear();

    if (running) return;
    running = true;

    try {
      for (const snapshot of store.list(owner, householdId)) {
        const entry = {
          ...snapshot,
          images: [...snapshot.images],
          uploaded: [...snapshot.uploaded],
        };

        if (!active()) break;

        if (!isDue(entry)) continue;

        const retry = attempts.get(entry.id);

        const guarded = withDeadlines(transport, (cause, operation, fields) =>
          report(cause, operation, { ...fields, captureId: entry.id }),
        );

        // One event per attempt at a capture, with what the attempt did.
        const event: DiagnosticFields = {
          captureId: entry.id,
          imageCount: entry.images.length,
          attempts: retry?.failures ?? 0,
        };

        const started = clock();

        try {
          const completed = await uploadEntry(entry, guarded, active, event);

          event.outcome = completed ? "completed" : "stopped";

          if (!completed) return;
        } catch (cause) {
          recordFailure(owner, householdId, entry, retry, cause);
          event.outcome = entry.failure?.kind ?? "failed";
          event.paused = attempts.get(entry.id)?.nextAttemptAt === null;
        } finally {
          event.durationMs = clock() - started;
          record("receipt.upload_attempted", event);
        }
      }
    } finally {
      running = false;

      for (const listener of listeners) listener();
    }
  };

  return Object.assign(run, { isRunning: () => running, schedule });
}
