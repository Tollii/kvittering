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
} from "../features/receipt-queries";
import { useProductLinkingQueue } from "../features/product-linking-queue";

const navigation = vi.hoisted(() => ({ focused: true, authenticated: true }));

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

// eslint-disable-next-line sonarjs/deprecation -- The installed React Native test renderer exercises subscription lifecycle behavior.
let renderer: ReactTestRenderer | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", globalThis);
  navigation.focused = true;
  navigation.authenticated = true;
  subscriptions = new Map();
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
        component ? createElement(component) : null,
      ),
    ),
  );

  await act(async () => {
    if (renderer) renderer.update(tree);
    // eslint-disable-next-line sonarjs/deprecation -- The installed React Native test renderer exercises subscription lifecycle behavior.
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

it("keeps all report pages and live changes while covered or switched off", async () => {
  let enabled = true;
  let result: ReturnType<typeof useCompleteReceipts>;
  const loading: boolean[] = [];

  function Report() {
    result = useCompleteReceipts({ kind: "allProducts" }, enabled);
    loading.push(result.loadingReceipts);

    return null;
  }

  await show(Report);
  await publish("receipts:readPage", {
    page: [{ _id: "first" }],
    isDone: false,
    continueCursor: "second",
  });
  await publish(
    "receipts:readPage",
    {
      page: [{ _id: "second" }],
      isDone: true,
      continueCursor: "end",
    },
    "second",
  );
  expect(result!.completeReceipts).toBe(true);
  loading.length = 0;
  navigation.focused = false;
  enabled = false;
  await show(Report);
  await publish("receipts:readPage", {
    page: [{ _id: "updated" }],
    isDone: false,
    continueCursor: "second",
  });
  navigation.focused = true;
  enabled = true;
  await show(Report);
  expect(loading).not.toContain(true);
  expect(result!.receipts.map((receipt) => receipt._id)).toEqual([
    "updated",
    "second",
  ]);
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

it("retains history pagination across product tabs without mixing searches", async () => {
  let enabled = true;
  let search = "";
  let result: ReturnType<typeof useReceiptHistory>;

  function History() {
    result = useReceiptHistory(search, enabled);

    return null;
  }

  await show(History);
  await publish("receipts:history", {
    page: [{ _id: "first" }],
    isDone: false,
    continueCursor: "second",
  });
  await act(async () => result!.loadMore(30));
  await publish(
    "receipts:history",
    { page: [{ _id: "second" }], isDone: true, continueCursor: "end" },
    "second",
  );
  enabled = false;
  await show(History);
  enabled = true;
  await show(History);
  expect(result!.results).toHaveLength(2);
  expect(result!.status).toBe("Exhausted");
  search = "different store";
  await show(History);
  expect(result!.results).toEqual([]);
  expect(result!.status).toBe("LoadingFirstPage");
});

it("keeps the matching queue current while another screen has focus", async () => {
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
  expect(result!.items).toHaveLength(1);
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

it("reopens a live detail immediately, including edits and deletion", async () => {
  const query = makeFunctionReference<
    "query",
    { id: string },
    { total: number } | null
  >("receipts:detail");

  const values: unknown[] = [];

  function Detail() {
    values.push(useQuery(query, { id: "first" }));

    return null;
  }

  await show(Detail);
  await publish("receipts:detail", { total: 100 });
  await show(null);
  await publish("receipts:detail", { total: 200 });
  values.length = 0;
  await show(Detail);
  expect(values.length).toBeGreaterThan(0);
  expect(
    values.every((value) => JSON.stringify(value) === '{"total":200}'),
  ).toBe(true);
  await show(null);
  await publish("receipts:detail", null);
  values.length = 0;
  await show(Detail);
  expect(values.every((value) => value === null)).toBe(true);
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
  expect(subscriptions.size).toBe(40);
});
