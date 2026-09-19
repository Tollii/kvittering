/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { defaultPolicy, type ClientRelease } from "../src/lib/releases/policy";
const modules = import.meta.glob("./**/*.ts");
const client: ClientRelease = {
  platform: "ios",
  channel: "testflight",
  version: "1.0.0",
  build: "6",
  apiVersion: 1,
  updateId: null,
  runtimeVersion: "fixture",
};
beforeEach(() => vi.stubEnv("RELEASE_CHANNEL", "testflight"));
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const t = convexTest(schema, modules);
  const user = t.withIdentity({
    subject: "first",
    issuer: "https://test.local",
    name: "First",
  });
  const householdId = await user.mutation(api.households.create, {
    name: "Home",
    invitation: "0123456789abcdef0123456789abcdef",
  });
  return { t, user, householdId };
}
const settings = () => {
  const { minimum, recommended, minimumApiVersion, features, message } =
    defaultPolicy("ios", "testflight");
  return { minimum, recommended, minimumApiVersion, features, message };
};
it("refuses a future or invalid API contract before changing data", async () => {
  const { user, householdId } = await setup();
  for (const apiVersion of [2, 0, -1, 1.5]) {
    await expect(
      user.mutation(api.receipts.reserve, {
        householdId,
        imageCount: 1,
        clientId: "capture-request-0001",
        client: { ...client, apiVersion },
      }),
    ).rejects.toThrow("UNSUPPORTED_API_VERSION");
  }
  const result = await user.query(api.receipts.list, {
    paginationOpts: { cursor: null, numItems: 10 },
  });
  expect(result.page).toHaveLength(0);
});
it("serves the bootstrap policy without login while keeping writes authenticated", async () => {
  const { t, householdId } = await setup();
  expect(
    (await t.query(api.releasePolicy.get, { platform: "ios" })).revision,
  ).toBe(0);
  await expect(
    t.mutation(api.receipts.reserve, {
      householdId,
      imageCount: 1,
      clientId: "capture-request-0001",
      client,
    }),
  ).rejects.toThrow("Logg inn");
});
it("keeps the build 5 request contract usable until its explicit retirement", async () => {
  const { t, user, householdId } = await setup();
  const args = { householdId, imageCount: 1, clientId: "capture-request-0001" };
  const id = await user.mutation(api.receipts.reserve, args);
  expect(await user.mutation(api.receipts.reserve, { ...args, client })).toBe(
    id,
  );
  const configured = await t.mutation(internal.releasePolicy.configure, {
    platform: "ios",
    settings: { ...settings(), minimumApiVersion: 1 },
    expectedRevision: 0,
    operator: "test",
    reason: "Retire legacy contract",
    replacementAvailable: true,
  });
  expect(configured.revision).toBe(1);
  await expect(user.mutation(api.receipts.reserve, args)).rejects.toThrow(
    "UPDATE_REQUIRED",
  );
  await expect(
    user.mutation(api.receipts.completeUpload, { id }),
  ).rejects.toThrow("UPDATE_REQUIRED");
  await expect(
    t.query(internal.releasePolicy.check, { feature: "receiptProcessing" }),
  ).rejects.toThrow("UPDATE_REQUIRED");
  expect(await user.mutation(api.receipts.reserve, { ...args, client })).toBe(
    id,
  );
  expect((await user.query(api.receipts.detail, { id }))?.receipt.status).toBe(
    "uploading",
  );
});
it("enforces native build restrictions and service flags on the server despite stale client policy", async () => {
  const { t, user, householdId } = await setup();
  const policy = {
    ...settings(),
    recommended: { version: "1.0.0", build: "7" },
    minimum: { version: "1.0.0", build: "7" },
  };
  await t.mutation(internal.releasePolicy.configure, {
    platform: "ios",
    settings: policy,
    expectedRevision: 0,
    operator: "test",
    reason: "Compatibility",
    replacementAvailable: true,
  });
  await expect(
    user.mutation(api.receipts.reserve, {
      householdId,
      imageCount: 1,
      clientId: "capture-request-0001",
      client,
    }),
  ).rejects.toThrow("UPDATE_REQUIRED");
  await t.mutation(internal.releasePolicy.configure, {
    platform: "ios",
    settings: {
      ...settings(),
      features: {
        ...settings().features,
        receiptProcessing: false,
        productLookup: false,
      },
    },
    expectedRevision: 1,
    operator: "test",
    reason: "Pause services",
    replacementAvailable: false,
  });
  await expect(
    user.mutation(api.receipts.reserve, {
      householdId,
      imageCount: 1,
      clientId: "capture-request-0001",
      client,
    }),
  ).rejects.toThrow("SERVICE_PAUSED");
  await expect(
    user.mutation(api.catalog.searchProducts, { search: "Cola", client }),
  ).rejects.toThrow("SERVICE_PAUSED");
  await user.mutation(api.households.setBudget, {
    monthlyBudgetOre: 10000,
    client,
  });
});
it("requires release availability, rejects stale administration, and records policy changes", async () => {
  const { t } = await setup();
  const args = {
    platform: "ios" as const,
    settings: { ...settings(), minimumApiVersion: 1 },
    expectedRevision: 0,
    operator: "test",
    reason: "Compatibility",
    replacementAvailable: false,
  };
  await expect(
    t.mutation(internal.releasePolicy.configure, args),
  ).rejects.toThrow("available");
  await t.mutation(internal.releasePolicy.configure, {
    ...args,
    replacementAvailable: true,
  });
  await expect(
    t.mutation(internal.releasePolicy.configure, {
      ...args,
      replacementAvailable: true,
    }),
  ).rejects.toThrow("Policy changed");
  const history = await t.run((ctx) =>
    ctx.db.query("releasePolicyHistory").take(10),
  );
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({
    previous: { revision: 0 },
    policy: { revision: 1 },
    operator: "test",
  });
});
