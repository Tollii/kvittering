/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { emptyCatalogResult } from "../src/lib/catalog/model";

const modules = import.meta.glob("./**/*.ts");

it("removes only expired terminal catalog results and preserves pending work", async () => {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) =>
    Promise.all(
      (["ready", "error", "pending", "running"] as const).map((state) =>
        ctx.db.insert("catalogRequests", {
          key: state,
          request: { kind: "products", search: "test" },
          state,
          result: emptyCatalogResult(),
          expiresAt: 1,
          attempts: 1,
          scheduledAt: 0,
        }),
      ),
    ),
  );

  expect(
    await t.mutation(internal.retention.catalog, { state: "ready", before: 2 }),
  ).toBe(1);
  expect(
    await t.mutation(internal.retention.catalog, { state: "error", before: 1 }),
  ).toBe(0);

  const remaining = await t.run((ctx) =>
    Promise.all(ids.map((id) => ctx.db.get("catalogRequests", id))),
  );

  expect(remaining.map((row) => row?.state ?? null)).toEqual([
    null,
    "error",
    "pending",
    "running",
  ]);
});
