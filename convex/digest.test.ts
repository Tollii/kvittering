import { parse } from "convex-helpers/validators";
import { deliverBatchArgs, sendAllArgs } from "./digest";
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => vi.useRealTimers());

it("continues beyond 500 subscriptions without duplicate device batches", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const householdId = await ctx.db.insert("households", {
      name: "Home",
      invitation: "test",
    });

    for (let index = 0; index < 501; index++)
      await ctx.db.insert("deviceSubscriptions", {
        householdId,
        identity: `user-${index}`,
        token: `device-${index}`,
      });
  });
  await t.mutation(internal.digest.sendAll, {});
  const processed = new Set<string>();

  while (true) {
    const jobs = await t.run((ctx) =>
      ctx.db.system.query("_scheduled_functions").collect(),
    );

    const next = jobs.find(
      (job) => job.name === "digest:sendAll" && !processed.has(job._id),
    );

    if (!next) break;
    processed.add(next._id);
    await t.mutation(internal.digest.sendAll, parse(sendAllArgs, next.args[0]));
  }

  const jobs = await t.run((ctx) =>
    ctx.db.system.query("_scheduled_functions").collect(),
  );

  const devices = jobs
    .filter((job) => job.name === "digest:deliverBatch")
    .flatMap((job) =>
      parse(deliverBatchArgs, job.args[0]).devices.map(
        (device) => device.subscriptionId,
      ),
    );

  expect(devices).toHaveLength(501);
  expect(new Set(devices).size).toBe(501);
  expect(jobs.every((job) => !job.name.startsWith("pushDelivery"))).toBe(true);
});
