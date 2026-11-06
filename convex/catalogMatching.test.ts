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
});

/**
 * Starts real catalog matching for a receipt whose product lookup is already
 * in flight, held by a worker that will never report back.
 */
async function stalledMatching() {
  vi.useFakeTimers();
  vi.stubEnv("KASSALAPP_API_KEY", "test-key");
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
        scheduledAt: 0,
      });
    }
  });

  await t.mutation(internal.catalogMatching.start, { id, generation: 0 });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const receipt = await t.run((ctx) => ctx.db.get("receipts", id));
  expect(receipt?.catalogStatus).toBe("pending");

  const workflowId = receipt!.catalogWorkflowId!;

  const { workflow } = await t.query(components.workflow.workflow.getStatus, {
    workflowId,
  });

  return { t, first, id, workflowId, startedAt: workflow._creationTime };
}

type Backend = Awaited<ReturnType<typeof stalledMatching>>["t"];

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

it("waits for a run within its deadline, then cancels it, unblocks retry and starts analysis", async () => {
  const { t, first, id, workflowId, startedAt } = await stalledMatching();

  vi.setSystemTime(startedAt + 29 * 60_000);
  await t.mutation(internal.catalogMatching.recoverStalled, { cursor: null });
  expect(
    (await t.run((ctx) => ctx.db.get("receipts", id)))?.catalogStatus,
  ).toBe("pending");
  expect(await workflowState(t, workflowId)).toBe("running");
  expect(await analysisScheduled(t)).toBe(false);

  vi.setSystemTime(startedAt + 31 * 60_000);
  await t.mutation(internal.catalogMatching.recoverStalled, { cursor: null });
  expect(
    (await t.run((ctx) => ctx.db.get("receipts", id)))?.catalogStatus,
  ).toBe("error");
  expect(await workflowState(t, workflowId)).toBe("canceled");
  expect(await analysisScheduled(t)).toBe(true);

  // The person's retry starts a new run instead of being ignored as pending.
  await first.mutation(api.catalogMatching.enrich, { id });
  const retried = await t.run((ctx) => ctx.db.get("receipts", id));
  expect(retried?.catalogStatus).toBe("pending");
  expect(retried?.catalogWorkflowId).not.toBe(workflowId);
});

it.each([
  { name: "ended without settling", cleanedUp: false },
  { name: "ended and was cleaned up", cleanedUp: true },
])(
  "settles a pending receipt at once when its run $name",
  async ({ cleanedUp }) => {
    const { t, id, workflowId } = await stalledMatching();

    // An ending that bypasses `finish` and `failed`, such as an operator cancel.
    await t.mutation(components.workflow.workflow.cancel, { workflowId });

    if (cleanedUp)
      await t.run(async (ctx) => {
        await ctx.runMutation(components.workflow.workflow.cleanup, {
          workflowId,
        });

        for (const journal of await ctx.db
          .query("workflowJournals")
          .withIndex("by_component_and_workflowId", (q) =>
            q.eq("component", "processing").eq("workflowId", workflowId),
          )
          .collect())
          await ctx.db.delete("workflowJournals", journal._id);
      });

    await t.mutation(internal.catalogMatching.recoverStalled, { cursor: null });
    expect(
      (await t.run((ctx) => ctx.db.get("receipts", id)))?.catalogStatus,
    ).toBe("error");
    expect(await analysisScheduled(t)).toBe(true);
  },
);
