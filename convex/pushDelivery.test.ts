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

  const target = await t.run(async (ctx) => {
    const householdId = await ctx.db.insert("households", {
      name: "Home",
      invitation: "0123456789abcdef0123456789abcdef",
    });

    const subscriptionId = await ctx.db.insert("deviceSubscriptions", {
      identity: "uploader",
      householdId,
      token: "ExpoPushToken[abcdefghijklmnop]",
    });

    return { householdId, subscriptionId };
  });

  return {
    t,
    ...target,
    digest: { ...target, title: "Uken", body: "Du brukte 400 kr." },
  };
}

function pushService(response: () => Response) {
  const requests = vi.fn<() => Promise<Response>>(async () => response());
  vi.stubGlobal("fetch", requests);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);

  return requests;
}

const retries = async (t: ReturnType<typeof convexTest>) =>
  (
    await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())
  ).map((job): [string, unknown] => [job.name, job.args[0]]);

it("retries a weekly digest twice after transient push service failures, then gives up", async () => {
  const { t, digest } = await digestTarget();
  pushService(() => new Response(null, { status: 503 }));

  await t.action(internal.pushDelivery.sendMessage, digest);
  await t.action(internal.pushDelivery.sendMessage, { ...digest, attempt: 1 });
  await t.action(internal.pushDelivery.sendMessage, { ...digest, attempt: 2 });
  expect(await retries(t)).toEqual([
    ["pushDelivery:sendMessage", { ...digest, attempt: 1 }],
    ["pushDelivery:sendMessage", { ...digest, attempt: 2 }],
  ]);
});

it("drops a digest retry once the device belongs to another household", async () => {
  const { t, digest, subscriptionId } = await digestTarget();
  const requests = pushService(() => new Response(null, { status: 503 }));

  await t.run(async (ctx) => {
    const householdId = await ctx.db.insert("households", {
      name: "Elsewhere",
      invitation: "fedcba9876543210fedcba9876543210",
    });

    await ctx.db.patch("deviceSubscriptions", subscriptionId, { householdId });
  });
  await t.action(internal.pushDelivery.sendMessage, { ...digest, attempt: 1 });
  expect(requests).not.toHaveBeenCalled();
});

it("removes a device that the push service reports as unregistered", async () => {
  const { t, digest, subscriptionId } = await digestTarget();
  pushService(() =>
    Response.json({
      data: { status: "error", details: { error: "DeviceNotRegistered" } },
    }),
  );

  await t.action(internal.pushDelivery.sendMessage, digest);
  expect(
    await t.run((ctx) => ctx.db.get("deviceSubscriptions", subscriptionId)),
  ).toBeNull();
  expect(await retries(t)).toEqual([]);
});
