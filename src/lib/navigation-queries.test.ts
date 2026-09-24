import { ReceiptCacheContext } from "../features/receipt-cache-context";
import { QueryLifecycleContext } from "../features/query-lifecycle-context";
import { receiptFixture } from "./testing/receipts";
import type { ReceiptCacheSnapshot } from "./receipt-cache";
import { z } from "zod";
import { createElement, StrictMode, act } from "react";
// eslint-disable-next-line sonarjs/deprecation -- The installed React Native test renderer exercises subscription lifecycle behavior.
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useQuery, useQueries } from "convex-helpers/react/cache";
import { convexToJson, type Value } from "convex/values";
import { getFunctionName, makeFunctionReference } from "convex/server";
import { NavigationQueryProvider } from "../features/navigation-query-provider";
import {
  useCompleteReceipts,
  useReceiptHistory,
  useReceiptDetail,
} from "../features/receipt-queries";
import { useProductLinkingQueue } from "../features/product-linking-queue";

const navigation = vi.hoisted(() => ({ focused: true, authenticated: true }));

let cache: ReceiptCacheSnapshot & { available: boolean; synchronized: boolean };

let lifecycle = { active: true, online: true };

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace the native SDK or environment boundary; application behavior remains under test.
vi.mock("expo-router", () => ({ useIsFocused: () => navigation.focused }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace the native SDK or environment boundary; application behavior remains under test.
vi.mock("convex/react", async (original) => ({
  ...(await original<typeof import("convex/react")>()),
  useConvexAuth: () => ({ isAuthenticated: navigation.authenticated }),
}));

type Subscription = {
  name: string;
  args: Record<string, Value>;
  value: Value | Error | undefined;
  listeners: Set<() => void>;
};

/** The spied client method types arguments as `any`; the test uses JSON arguments. */
const queryArguments = z.record(z.string(), z.json());

let subscriptions: Map<string, Subscription>;

let client: ConvexReactClient;

// eslint-disable-next-line sonarjs/deprecation, @typescript-eslint/no-deprecated -- The installed React Native test renderer exercises subscription lifecycle behavior.
let renderer: ReactTestRenderer | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", globalThis);
  navigation.focused = true;
  navigation.authenticated = true;
  subscriptions = new Map();
  cache = {
    receipts: [],
    sequence: 0,
    complete: false,
    available: false,
    synchronized: false,
  };
  lifecycle = { active: true, online: true };
  client = new ConvexReactClient("https://navigation-test.convex.cloud");
  // Exercise real React/Convex hooks with a transport that drops unsubscribed data.
  vi.spyOn(client, "watchQuery").mockImplementation(
    (...[query, untypedArgs = {}]) => {
      const args = queryArguments.parse(untypedArgs);
      const name = getFunctionName(query);
      const key = JSON.stringify([name, convexToJson(args)]);

      return {
        onUpdate(listener) {
          let subscription = subscriptions.get(key);

          if (!subscription) {
            subscription = {
              name,
              args,
              value: undefined,
              listeners: new Set(),
            };
            subscriptions.set(key, subscription);
          }

          subscription.listeners.add(listener);

          return () => {
            subscription.listeners.delete(listener);

            if (!subscription.listeners.size) subscriptions.delete(key);
          };
        },
        localQueryResult: () => {
          const value = subscriptions.get(key)?.value;

          if (value instanceof Error) throw value;

          return value;
        },
        journal: () => undefined,
      };
    },
  );
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  // oxlint-disable-next-line vitest/no-standalone-expect -- Check cleanup after every rendered scenario.
  expect(subscriptions.size).toBe(0);
  // oxlint-disable-next-line vitest/no-standalone-expect -- Check cleanup after every rendered scenario.
  expect(vi.getTimerCount()).toBe(0);
  await client.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function show(component: (() => null) | null, scope = "household-a") {
  const tree = createElement(
    StrictMode,
    null,
    createElement(
      ConvexProvider,
      { client },
      createElement(
        NavigationQueryProvider,
        { key: scope },
        createElement(
          ReceiptCacheContext.Provider,
          { value: cache },
          createElement(
            QueryLifecycleContext.Provider,
            { value: lifecycle },
            component ? createElement(component) : null,
          ),
        ),
      ),
    ),
  );

  await act(async () => {
    if (renderer) renderer.update(tree);
    // eslint-disable-next-line sonarjs/deprecation, @typescript-eslint/no-deprecated -- The installed React Native test renderer exercises subscription lifecycle behavior.
    else renderer = create(tree);
  });
}

async function publish(
  name: string,
  value: Value,
  cursor: string | null = null,
) {
  const subscription = [...subscriptions.values()].find((entry) => {
    const pagination = entry.args.paginationOpts;

    return (
      entry.name === name &&
      (!pagination ||
        z.object({ cursor: z.string().nullable() }).safeParse(pagination).data
          ?.cursor === cursor)
    );
  });

  expect(subscription, `subscription for ${name}`).toBeDefined();
  await act(async () => {
    subscription!.value = value;

    for (const listener of subscription!.listeners) listener();
  });
}

it("reads complete cached reports without server pages when tabs are covered or offline", async () => {
  cache = {
    receipts: [receiptFixture()],
    sequence: 1,
    complete: true,
    available: true,
    synchronized: true,
  };
  let result: ReturnType<typeof useCompleteReceipts>;

  function Report() {
    result = useCompleteReceipts({ kind: "allProducts" });

    return null;
  }

  await show(Report);
  expect(result!.receipts).toHaveLength(1);
  expect(result!.completeReceipts).toBe(true);
  navigation.focused = false;
  lifecycle = { active: false, online: false };
  await show(Report);
  expect(result!.receipts).toHaveLength(1);
  expect(subscriptions.size).toBe(0);
});

it("releases fallback receipt pages while the app is in the background", async () => {
  function Report() {
    useCompleteReceipts({ kind: "allProducts" });

    return null;
  }

  await show(Report);
  expect(subscriptions.size).toBe(1);
  lifecycle.active = false;
  await show(Report);
  expect(subscriptions.size).toBe(0);
});

it("loads optional report scopes only on demand and stops at sign-out", async () => {
  let enabled = false;
  let result: ReturnType<typeof useCompleteReceipts>;

  function Report() {
    result = useCompleteReceipts({ kind: "undated" }, enabled);

    return null;
  }

  await show(Report);
  expect(subscriptions.size).toBe(0);
  enabled = true;
  await show(Report);
  expect(subscriptions.size).toBe(1);
  await publish("receipts:readPage", {
    page: [],
    isDone: true,
    continueCursor: "end",
  });
  navigation.authenticated = false;
  await show(Report);
  expect(result!.receipts).toEqual([]);
  expect(result!.completeReceipts).toBe(false);
});

it("retains local history pagination across tabs and keeps searches separate", async () => {
  cache = {
    receipts: Array.from({ length: 40 }, (_, index) =>
      receiptFixture({ _id: String(index) }),
    ),
    sequence: 40,
    complete: true,
    available: true,
    synchronized: true,
  };

  let enabled = true,
    search = "";

  let result: ReturnType<typeof useReceiptHistory>;

  function History() {
    result = useReceiptHistory(search, enabled);

    return null;
  }

  await show(History);
  expect(result!.results).toHaveLength(30);
  await act(async () => result!.loadMore(30));
  enabled = false;
  await show(History);
  enabled = true;
  await show(History);
  expect(result!.results).toHaveLength(40);
  expect(result!.status).toBe("Exhausted");
  search = "different store";
  await show(History);
  expect(result!.results).toEqual([]);
  expect(subscriptions.size).toBe(0);
});

it("releases the matching queue while another screen has focus", async () => {
  let result: ReturnType<typeof useProductLinkingQueue>;

  function Queue() {
    result = useProductLinkingQueue();

    return null;
  }

  await show(Queue);
  await publish("productLinking:page", {
    page: [{ receiptId: "first", lines: [{ id: "line" }] }],
    isDone: true,
    continueCursor: "end",
  });
  navigation.focused = false;
  await show(Queue);
  expect(subscriptions.size).toBe(0);
  navigation.focused = true;
  await show(Queue);
  await publish("productLinking:page", {
    page: [],
    isDone: true,
    continueCursor: "end",
  });
  navigation.focused = true;
  await show(Queue);
  expect(result!.items).toEqual([]);
  expect(result!.loading).toBe(false);
});

it("releases closed details and obtains fresh values when reopened", async () => {
  const query = makeFunctionReference<
    "query",
    { id: string },
    { total: number } | null
  >("receipts:detail");

  let value: { total: number } | null | undefined;

  function Detail() {
    value = useQuery(query, { id: "first" });

    return null;
  }

  await show(Detail);
  await publish("receipts:detail", { total: 100 });
  await show(null);
  expect(subscriptions.size).toBe(0);
  await show(Detail);
  expect(value).toBeUndefined();
  await publish("receipts:detail", { total: 200 });
  expect(value).toEqual({ total: 200 });
  await publish("receipts:detail", null);
  expect(value).toBeNull();
});

it("expires idle results and releases them when the household changes", async () => {
  const query = makeFunctionReference<"query", Record<string, never>, number>(
    "receipts:detail",
  );

  let value: number | undefined;

  function Detail() {
    value = useQuery(query, {});

    return null;
  }

  await show(Detail);
  await publish("receipts:detail", 100);
  await show(null);
  await act(async () => {
    vi.advanceTimersByTime(5 * 60_000);
  });
  expect(subscriptions.size).toBe(0);
  await show(Detail);
  expect(value).toBeUndefined();
  await publish("receipts:detail", 200);
  await show(null, "household-b");
  expect(subscriptions.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  await show(Detail, "household-b");
  expect(value).toBeUndefined();
});

it("bounds idle subscriptions without evicting mounted queries", async () => {
  const query = makeFunctionReference<"query", { id: number }, number>(
    "receipts:detail",
  );

  function Details() {
    useQueries(
      Object.fromEntries(
        Array.from({ length: 45 }, (_, id) => [
          String(id),
          { query, args: { id } },
        ]),
      ),
    );

    return null;
  }

  await show(Details);
  expect(subscriptions.size).toBe(45);
  await show(null);
  expect(subscriptions.size).toBe(0);
});

it("opens a newly linked receipt before the local change page arrives", async () => {
  cache = {
    receipts: [],
    sequence: 1,
    complete: true,
    available: true,
    synchronized: true,
  };
  let receipt: ReturnType<typeof useReceiptDetail>;

  function Detail() {
    receipt = useReceiptDetail("new-receipt");

    return null;
  }

  await show(Detail);
  expect(receipt).toBeUndefined();
  const added = receiptFixture({ _id: "new-receipt" });
  await publish("receipts:detail", { receipt: added, images: [] });
  expect(receipt?._id).toBe("new-receipt");
  cache = { ...cache, receipts: [added], sequence: 2 };
  await show(Detail);
  expect(subscriptions.size).toBe(0);
  expect(receipt?._id).toBe("new-receipt");
});
