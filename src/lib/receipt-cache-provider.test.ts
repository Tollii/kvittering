// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReceiptCacheDatabase, ReceiptChangePage } from "./receipt-cache";
import { receiptFixture } from "./testing/receipts";

const boundary = vi.hoisted(() => ({
  open: vi.fn<() => ReceiptCacheDatabase>(),
  query: vi.fn<() => Promise<ReceiptChangePage>>(),
  head: { ready: true, sequence: 1 },
  imageFailure: false,
  report: vi.fn<typeof import("./observability").reportError>(),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace native SQLite; the real cache and provider handle its failures.
vi.mock("expo-sqlite", () => ({ openDatabaseSync: boundary.open }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace the Convex transport and subscribed head at the SDK boundary.
vi.mock("convex/react", () => ({
  useConvex: () => boundary,
  useConvexAuth: () => ({ isAuthenticated: true }),
  useQuery: () => boundary.head,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Capture the application telemetry sink, without sending test errors.
vi.mock("./observability", () => ({ reportError: boundary.report }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Image authentication is not used by cache synchronization.
vi.mock("./auth-client", () => ({
  convexSiteUrl: "",
  fetchAccessToken: async () => "",
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace the native filesystem boundary to reproduce cleanup failures.
vi.mock("expo-file-system", () => ({
  Directory: class {
    get exists() {
      if (boundary.imageFailure) throw new Error("Image storage unavailable");

      return false;
    }
  },
  File: class {},
  Paths: { cache: "cache" },
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Render the native presentation primitives in the hook test DOM.
vi.mock("react-native", () => ({
  View: "section",
  Text: "span",
  Pressable: "button",
  ActivityIndicator: "span",
  StyleSheet: { create: <T>(styles: T) => styles },
  useColorScheme: () => "light",
  useWindowDimensions: () => ({ width: 400, height: 800 }),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Native symbols have no behavior in these storage tests.
vi.mock("expo-symbols", () => ({ SymbolView: () => null }));

async function mount() {
  const { ReceiptCacheProvider } =
    await import("../features/receipt-cache-provider");

  const { useCachedReceipts } =
    await import("../features/receipt-cache-context");

  function CacheState() {
    const cache = useCachedReceipts();

    return createElement(
      "output",
      null,
      cache.available ? `cached:${cache.sequence}` : "server reads available",
    );
  }

  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  const receipt = receiptFixture();

  const render = () =>
    act(async () => {
      root.render(
        createElement(
          ReceiptCacheProvider,
          {
            owner: "provider-test",
            household: receipt.householdId,
          },
          createElement(CacheState),
        ),
      );
    });

  await render();

  return {
    container,
    render,
    close: () =>
      act(async () => {
        root.unmount();
      }),
  };
}

function database() {
  const db = new DatabaseSync(":memory:");
  const control = { writeFailure: false };

  const adapter: ReceiptCacheDatabase = {
    execSync: (sql) => db.exec(sql),
    runSync: (sql, ...values) => {
      if (control.writeFailure) throw new Error("Disk full");
      db.prepare(sql).run(...values);
    },
    // SAFETY: SQL callers declare their selected columns.
    getAllSync: <T>(sql: string, ...values: (string | number)[]) =>
      db.prepare(sql).all(...values) as T[],
    // SAFETY: SQL callers declare their selected columns.
    getFirstSync: <T>(sql: string, ...values: (string | number)[]) =>
      (db.prepare(sql).get(...values) as T | undefined) ?? null,
    withTransactionSync: (operation) => operation(),
  };

  boundary.open.mockReturnValue(adapter);

  return { control, db };
}

beforeEach(() => vi.resetModules());

afterEach(async () => {
  const { retainReceiptCache } = await import("./receipt-cache-storage");
  retainReceiptCache(null);
  boundary.open.mockReset();
  boundary.query.mockReset();
  boundary.report.mockClear();
  boundary.head = { ready: true, sequence: 1 };
  boundary.imageFailure = false;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("keeps children and server reads available when opening SQLite fails", async () => {
  boundary.open.mockImplementation(() => {
    throw new Error("SQLite unavailable");
  });
  const view = await mount();

  try {
    expect(view.container.textContent).toBe("server reads available");
    expect(boundary.query).not.toHaveBeenCalled();
    expect(boundary.report).toHaveBeenCalledWith(
      expect.any(Error),
      "receipt.cache_open",
    );
  } finally {
    await view.close();
  }
});

it("falls back to server reads after a cache write failure and tolerates cleanup failure", async () => {
  const { db, control } = database();
  const { retainReceiptCache } = await import("./receipt-cache-storage");
  const { retainReceiptImageScope } = await import("./receipt-image-cache");
  boundary.imageFailure = true;
  boundary.query.mockImplementation(async () => {
    control.writeFailure = true;

    return { through: 1, done: true, changes: [] };
  });
  const view = await mount();

  try {
    expect(view.container.textContent).toBe("server reads available");
    expect(() => retainReceiptImageScope(null)).not.toThrow();
    expect(() => retainReceiptCache(null)).not.toThrow();
    expect(boundary.report).toHaveBeenCalledWith(
      expect.any(Error),
      "receipt.cache_write",
    );
  } finally {
    await view.close();
    db.close();
  }
});

it("restarts synchronization backoff at thirty seconds after a successful download", async () => {
  vi.useFakeTimers();
  const { db } = database();
  const { retainReceiptCache } = await import("./receipt-cache-storage");
  let failed = true;
  boundary.query.mockImplementation(async () => {
    if (failed) throw new Error("Offline");

    return { through: boundary.head.sequence, done: true, changes: [] };
  });
  const view = await mount();

  try {
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(boundary.query).toHaveBeenCalledTimes(2);
    failed = false;
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(view.container.textContent).toBe("cached:1");
    failed = true;
    boundary.head = { ready: true, sequence: 2 };
    await view.render();
    const calls = boundary.query.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(29_999));
    expect(boundary.query).toHaveBeenCalledTimes(calls);
    failed = false;
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(view.container.textContent).toBe("cached:2");
  } finally {
    await view.close();
    retainReceiptCache(null);
    db.close();
  }
});
