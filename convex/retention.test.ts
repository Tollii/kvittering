import { createFunctionHandle } from "convex/server";
import { register as registerWorkflow } from "@convex-dev/workflow/test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { createEvent, type WorkflowId } from "@convex-dev/workflow";
import { trackWorkflow } from "./retention";
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { api, components, internal } from "./_generated/api";
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

afterEach(() => vi.useRealTimers());

async function workflowFixture(
  component: "processing" | "analysis",
  legacy = false,
) {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  registerWorkflow(t);
  registerWorkflow(t, "productAnalysisWorkflow");
  registerRateLimiter(t);
  const member = t.withIdentity({ subject: "retention", issuer: "test" });

  const householdId = await member.mutation(api.households.create, {
    name: "Home",
    invitation: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  });

  const receiptId = await member.mutation(api.receipts.reserve, {
    householdId,
    clientId: "retention-test-receipt",
    imageCount: 1,
  });

  const owner =
    component === "analysis"
      ? components.productAnalysisWorkflow
      : components.workflow;

  const workflowId = await t.run(async (ctx) => {
    const id = await ctx.runMutation(owner.workflow.create, {
      workflowName: "retention fixture",
      workflowHandle: "unused",
      workflowArgs: { id: receiptId },
      createOnly: true,
      onComplete: {
        fnHandle: await createFunctionHandle(
          internal.retention.workflowCompleted,
        ),
        context: legacy ? null : { component, receiptId },
      },
    });

    // SAFETY: The component created and validated this workflow ID.
    const workflowId = id as WorkflowId;

    if (!legacy) await trackWorkflow(ctx, workflowId, component, receiptId);

    return workflowId;
  });

  await t.mutation(owner.journal.startSteps, {
    workflowId,
    generationNumber: 0,
    steps: [
      {
        step: {
          kind: "function",
          functionType: "query",
          handle: "unused",
          name: "receipt extraction",
          args: { privateText: "sensitive receipt payload" },
          argsSize: 100,
          inProgress: false,
          startedAt: Date.now(),
          completedAt: Date.now(),
          runResult: {
            kind: "success",
            returnValue: { receipt: "sensitive product text" },
          },
        },
      },
    ],
  });

  return { t, member, owner, workflowId, receiptId };
}

it.each(["processing", "analysis"] as const)(
  "removes %s journal payloads for every terminal outcome after retention",
  async (component) => {
    vi.useFakeTimers();

    for (const runResult of [
      { kind: "success", returnValue: null },
      { kind: "failed", error: "provider failed" },
      { kind: "canceled" },
    ] as const) {
      const { t, owner, workflowId } = await workflowFixture(component);
      await t.mutation(owner.workflow.complete, {
        workflowId,
        generationNumber: 0,
        runResult,
      });

      const journal = await t.query(owner.workflow.listSteps, {
        workflowId,
        order: "asc",
        paginationOpts: { cursor: null, numItems: 10 },
      });

      expect(journal.page).toHaveLength(1);
      await t.mutation(internal.retention.workflowJournal, {
        workflowId,
        component,
      });
      expect(
        (
          await t.query(owner.workflow.listSteps, {
            workflowId,
            order: "asc",
            paginationOpts: { cursor: null, numItems: 10 },
          })
        ).page,
      ).toHaveLength(1);
      vi.setSystemTime(Date.now() + 30 * 24 * 60 * 60_000);
      await t.mutation(internal.retention.workflowJournal, {
        workflowId,
        component,
      });
      await t.mutation(internal.retention.workflowJournal, {
        workflowId,
        component,
      });
      expect(
        (
          await t.query(owner.workflow.listSteps, {
            workflowId,
            order: "asc",
            paginationOpts: { cursor: null, numItems: 10 },
          })
        ).page,
      ).toEqual([]);
      expect(
        (
          await t.query(owner.workflow.list, {
            order: "asc",
            paginationOpts: { cursor: null, numItems: 10 },
          })
        ).page,
      ).toEqual([]);
    }
  },
);

it.each([false, true])(
  "preserves journals until deletion and cancels only active work (completed: %s)",
  async (completed) => {
    const { t, member, owner, workflowId, receiptId } =
      await workflowFixture("analysis");

    if (completed)
      await t.mutation(owner.workflow.complete, {
        workflowId,
        generationNumber: 0,
        runResult: { kind: "success", returnValue: null },
      });
    await t.mutation(internal.retention.inventoryWorkflows, {
      component: "analysis",
    });
    await t.mutation(internal.retention.workflowJournal, {
      workflowId,
      component: "analysis",
    });
    expect(
      (await t.query(owner.journal.load, { workflowId })).journalEntries,
    ).toHaveLength(1);
    await t.run((ctx) =>
      ctx.db.patch("receipts", receiptId, { status: "processing" }),
    );
    await member.mutation(api.receipts.remove, { id: receiptId, revision: 0 });

    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );

    expect(
      jobs.some(
        (job) =>
          job.name === "retention:deletedReceiptWorkflows" &&
          job.args[0].receiptId === receiptId,
      ),
    ).toBe(true);
    await t.mutation(internal.retention.deletedReceiptWorkflows, { receiptId });
    expect(
      (await t.query(owner.workflow.getStatus, { workflowId })).workflow
        .runResult?.kind,
    ).toBe(completed ? "success" : "canceled");
    await t.mutation(internal.retention.workflowJournal, {
      workflowId,
      component: "analysis",
    });
    expect(
      (
        await t.query(owner.workflow.listSteps, {
          workflowId,
          order: "asc",
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page,
    ).toEqual([]);
  },
);

it("inventories legacy terminal journals in the correct component and retains a full grace period", async () => {
  vi.useFakeTimers();
  const { t, owner, workflowId } = await workflowFixture("analysis", true);
  await t.mutation(owner.workflow.complete, {
    workflowId,
    generationNumber: 0,
    runResult: { kind: "failed", error: "old failure" },
  });
  await t.mutation(internal.retention.workflowJournal, { workflowId });
  await t.mutation(internal.retention.inventoryWorkflows, {
    component: "analysis",
  });
  await t.mutation(internal.retention.inventoryWorkflows, {
    component: "analysis",
  });
  expect(
    await t.run((ctx) => ctx.db.query("workflowJournals").collect()),
  ).toHaveLength(1);
  vi.setSystemTime(Date.now() + 30 * 24 * 60 * 60_000);
  await t.mutation(internal.retention.workflowJournal, {
    workflowId,
    component: "analysis",
  });
  expect(
    (
      await t.query(owner.workflow.listSteps, {
        workflowId,
        order: "asc",
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).page,
  ).toEqual([]);
});

it("removes a catalog waiter after its completed workflow journal has been cleaned", async () => {
  vi.useFakeTimers();
  const { t, owner, workflowId } = await workflowFixture("processing");

  const requestId = await t.run(async (ctx) => {
    const eventId = await createEvent(ctx, components.workflow, {
      name: "catalog-ready",
      workflowId,
    });

    const requestId = await ctx.db.insert("catalogRequests", {
      key: "completed",
      request: { kind: "products", search: "test" },
      state: "ready",
      result: emptyCatalogResult(),
      expiresAt: 1,
      attempts: 1,
      scheduledAt: 0,
    });

    await ctx.db.insert("catalogRequestWaiters", { requestId, eventId });

    return requestId;
  });

  await t.mutation(owner.workflow.complete, {
    workflowId,
    generationNumber: 0,
    runResult: { kind: "success", returnValue: null },
  });
  vi.setSystemTime(Date.now() + 30 * 24 * 60 * 60_000);
  await t.mutation(internal.retention.workflowJournal, {
    workflowId,
    component: "processing",
  });
  await t.mutation(internal.catalogQueue.notify, { id: requestId });
  expect(
    await t.run((ctx) => ctx.db.query("catalogRequestWaiters").collect()),
  ).toEqual([]);
});
