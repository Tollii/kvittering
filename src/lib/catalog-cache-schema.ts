import { z } from "zod";
import { parse } from "convex-helpers/validators";
import { catalogResponseValidator } from "./catalog/model";
import type { Query } from "@tanstack/react-query";

/** Persist only complete catalogue responses; pending requests resume from the server. */
export function shouldPersistCatalogQuery(query: Query) {
  if (query.state.status !== "success" || query.queryKey[0] !== "catalog")
    return false;

  try {
    return parse(catalogResponseValidator, query.state.data).status === "ready";
  } catch {
    return false;
  }
}

/** Disposable storage has its own parser; malformed data must not enter the live cache. */
export const catalogCacheSchema = z.object({
  timestamp: z.number(),
  buster: z.string(),
  clientState: z.object({
    mutations: z.array(z.never()),
    queries: z.array(
      z.object({
        queryHash: z.string(),
        queryKey: z.tuple([
          z.literal("catalog"),
          z.literal("lookup"),
          z.string(),
        ]),
        dehydratedAt: z.number(),
        state: z.object({
          data: z.unknown().transform((value) => {
            const response = parse(catalogResponseValidator, value);

            if (response.status !== "ready")
              throw new Error("Incomplete catalogue cache");

            return response;
          }),
          dataUpdateCount: z.number(),
          dataUpdatedAt: z.number(),
          error: z.null(),
          errorUpdateCount: z.number(),
          errorUpdatedAt: z.number(),
          fetchFailureCount: z.number(),
          fetchFailureReason: z.null(),
          fetchMeta: z.null(),
          isInvalidated: z.boolean(),
          status: z.literal("success"),
          fetchStatus: z.enum(["fetching", "paused", "idle"]),
        }),
      }),
    ),
  }),
});
