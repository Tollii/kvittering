/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function digestTarget() {
  const t = convexTest(schema, modules);

  const subscriptionId = await t.run(async (ctx) => {
    const householdId = await ctx.db.insert("households", {
      name: "Home",
      invitation: "0123456789abcdef0123456789abcdef",
    });

    return ctx.db.insert("deviceSubscriptions", {
      identity: "uploader",
      householdId,
      token: "ExpoPushToken[abcdefghijklmnop]",
    });
  });

  return { t, subscriptionId };
}

function pushService(response: () => Response) {
  vi.stubGlobal("fetch", async () => response());
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
}

const scheduled = (t: ReturnType<typeof convexTest>) =>
  t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());

it("retries a weekly digest after a transient push service failure, then gives up", async () => {
  const { t, subscriptionId } = await digestTarget();
  pushService(() => new Response(null, { status: 503 }));

  const digest = { subscriptionId, title: "Uken", body: "Du brukte 400 kr." };

  await t.action(internal.pushDelivery.sendMessage, digest);
  expect(
    (await scheduled(t)).map((job): [string, unknown] => [
      job.name,
      job.args[0],
    ]),
  ).toEqual([["pushDelivery:sendMessage", { ...digest, attempt: 1 }]]);

  const before = (await scheduled(t)).length;

  await t.action(internal.pushDelivery.sendMessage, { ...digest, attempt: 2 });
  expect(await scheduled(t)).toHaveLength(before);
});

it("removes a device that the push service reports as unregistered", async () => {
  const { t, subscriptionId } = await digestTarget();
  pushService(() =>
    Response.json({
      data: { status: "error", details: { error: "DeviceNotRegistered" } },
    }),
  );

  await t.action(internal.pushDelivery.sendMessage, {
    subscriptionId,
    title: "Uken",
    body: "Du brukte 400 kr.",
  });
  expect(
    await t.run((ctx) => ctx.db.get("deviceSubscriptions", subscriptionId)),
  ).toBeNull();
  expect(await scheduled(t)).toEqual([]);
});
