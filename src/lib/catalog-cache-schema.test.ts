import { expect, it } from "vitest";
import { dehydrate, QueryClient } from "@tanstack/react-query";
import {
  catalogCacheSchema,
  shouldPersistCatalogQuery,
} from "./catalog-cache-schema";
import { emptyCatalogResult } from "./catalog/model";

const key = ["catalog", "lookup", '{"kind":"products","search":"milk"}'];

it("restores complete catalogue data and rejects damaged response fields", () => {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity } },
  });

  const response = { ...emptyCatalogResult(), status: "ready" };
  client.setQueryData(key, response);

  const stored = {
    timestamp: 100,
    buster: "catalog-v2",
    clientState: dehydrate(client, {
      shouldDehydrateQuery: shouldPersistCatalogQuery,
    }),
  };

  const restored = catalogCacheSchema.parse(JSON.parse(JSON.stringify(stored)));
  expect(restored.clientState.queries).toHaveLength(1);
  expect(restored.clientState.queries[0].state.data).toEqual(response);
  expect(restored.clientState.queries[0].state.dataUpdatedAt).toBe(
    stored.clientState.queries[0].state.dataUpdatedAt,
  );
  expect(() =>
    catalogCacheSchema.parse({
      ...stored,
      clientState: {
        ...stored.clientState,
        queries: [
          {
            ...stored.clientState.queries[0],
            state: {
              ...stored.clientState.queries[0].state,
              data: { ...response, products: [{ name: 42 }] },
            },
          },
        ],
      },
    }),
  ).toThrow(Error);
  client.clear();
});

it("excludes pending, failed, malformed and unrelated query data", () => {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity } },
  });

  for (const status of ["pending", "error"]) {
    client.setQueryData(key, { ...emptyCatalogResult(), status });
    expect(
      dehydrate(client, { shouldDehydrateQuery: shouldPersistCatalogQuery })
        .queries,
    ).toEqual([]);
  }

  client.setQueryData(key, { status: "ready" });
  client.setQueryData(["receipts"], {
    ...emptyCatalogResult(),
    status: "ready",
  });
  expect(
    dehydrate(client, { shouldDehydrateQuery: shouldPersistCatalogQuery })
      .queries,
  ).toEqual([]);
  client.clear();
});
