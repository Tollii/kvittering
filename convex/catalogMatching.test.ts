import { separateHouseholds } from "../src/lib/testing/households";
import { register as registerWorkflow } from "@convex-dev/workflow/test";
import { register as registerWorkpool } from "@convex-dev/workpool/test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { api, components, internal } from "./_generated/api";
import schema from "./schema";
import { batteryFixture } from "../src/lib/mock-receipts";
import { emptyCatalogResult } from "../src/lib/catalog/model";
import { normalizeRequest, requestKey } from "../src/lib/catalog/policy";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const hour = 60 * 60_000;

/**
 * Starts real catalog matching for a receipt whose product lookup is already
 * in flight, held by a worker that will never report back. The provider
 * answers with no products whenever a lookup does reach it.
 */
async function matchingStuckOnLookup() {
  vi.useFakeTimers();
  vi.stubEnv("KASSALAPP_API_KEY", "test-key");

  const provider = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  );

  vi.stubGlobal("fetch", provider);
  vi.stubEnv("TYPESAFE_API_KEY", "");
  const t = convexTest(schema, modules);
  registerWorkflow(t);
  registerWorkflow(t, "productAnalysisWorkflow");
  registerWorkpool(t, "catalogWorkpool");
  registerRateLimiter(t);
  const { first, householdId } = await separateHouseholds(t);

  const id = await first.mutation(api.receipts.reserve, {
    householdId,
    clientId: "stalled-catalog-0001",
    imageCount: 1,
  });

  await t.run((ctx) =>
    ctx.db.patch("receipts", id, {
      data: batteryFixture(),
      status: "reviewed",
    }),
  );

  const inputs = await t.query(internal.catalogMatching.inputs, {
    id,
    generation: 0,
  });

  expect(inputs.length).toBeGreaterThan(0);
  await t.run(async (ctx) => {
    for (const input of inputs) {
      const request = normalizeRequest({
        kind: "products",
        search: input.search,
        store: input.store,
      });

      await ctx.db.insert("catalogRequests", {
        key: requestKey(request),
        request,
        state: "running",
        result: emptyCatalogResult(),
        expiresAt: 0,
        attempts: 1,
        // Live while the run starts, however far fake timers move the clock.
        scheduledAt: Number.MAX_SAFE_INTEGER,
      });
    }
  });

  await t.mutation(internal.catalogMatching.start, { id, generation: 0 });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const receipt = await t.run((ctx) => ctx.db.get("receipts", id));
  expect(receipt?.catalogStatus).toBe("pending");
  expect(provider).not.toHaveBeenCalled();

  const workflowId = receipt!.catalogWorkflowId!;

  const { workflow } = await t.query(components.workflow.workflow.getStatus, {
    workflowId,
  });

  // The lost worker was scheduled when the run started.
  await t.run(async (ctx) => {
    for (const request of await ctx.db.query("catalogRequests").collect())
      await ctx.db.patch("catalogRequests", request._id, {
        scheduledAt: workflow._creationTime,
      });
  });

  return {
    t,
    first,
    id,
    workflowId,
    provider,
    startedAt: workflow._creationTime,
  };
}

type Backend = Awaited<ReturnType<typeof matchingStuckOnLookup>>["t"];

async function workflowState(t: Backend, workflowId: string) {
  const { workflow } = await t.query(components.workflow.workflow.getStatus, {
    workflowId,
  });

  return workflow.runResult?.kind ?? "running";
}

async function analysisScheduled(t: Backend) {
  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );

  return jobs.some(
    (job) =>
      job.name === "productAnalysis:start" && job.state.kind === "pending",
  );
}

it("waits for a run within its deadline, then cancels it and lets a retry fetch the lost lookup", async () => {
  const { t, first, id, workflowId, provider, startedAt } =
    await matchingStuckOnLookup();

  vi.setSystemTime(startedAt + 2 * hour - 60_000);
  await t.mutation(internal.catalogMatching.recoverStalled, { cursor: null });
  expect(
    (await t.run((ctx) => ctx.db.get("receipts", id)))?.catalogStatus,
  ).toBe("pending");
  expect(await workflowState(t, workflowId)).toBe("running");
  expect(await analysisScheduled(t)).toBe(false);

  vi.setSystemTime(startedAt + 2 * hour + 60_000);
  await t.mutation(internal.catalogMatching.recoverStalled, { cursor: null });
  expect(
    (await t.run((ctx) => ctx.db.get("receipts", id)))?.catalogStatus,
  ).toBe("error");
  expect(await workflowState(t, workflowId)).toBe("canceled");
  expect(await analysisScheduled(t)).toBe(true);

  // The person's retry queues the lost lookup again instead of waiting on it.
  await first.mutation(api.catalogMatching.enrich, { id });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const retried = await t.run((ctx) => ctx.db.get("receipts", id));
  expect(retried?.catalogWorkflowId).not.toBe(workflowId);
  expect(retried?.catalogStatus).not.toBe("pending");
  expect(await workflowState(t, retried!.catalogWorkflowId!)).toBe("success");
  expect(provider).toHaveBeenCalled();
  expect(
    (await t.run((ctx) => ctx.db.query("catalogRequests").collect())).map(
      (request) => request.state,
    ),
  ).not.toContain("running");
});

it.each([
  { name: "ended without settling", cleanedUp: false },
  { name: "ended and was cleaned up", cleanedUp: true },
])(
  "settles a pending receipt at once when its run $name",
  async ({ cleanedUp }) => {
    const { t, id, workflowId } = await matchingStuckOnLookup();

    // An ending that bypasses `finish` and `failed`, such as an operator cancel.
    await t.mutation(components.workflow.workflow.cancel, { workflowId });

    if (cleanedUp)
      await t.mutation(components.workflow.workflow.cleanup, { workflowId });

    await t.mutation(internal.catalogMatching.recoverStalled, { cursor: null });
    expect(
      (await t.run((ctx) => ctx.db.get("receipts", id)))?.catalogStatus,
    ).toBe("error");
    expect(await analysisScheduled(t)).toBe(true);
  },
);
