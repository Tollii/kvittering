/// <reference types="vite/client" />
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { register } from "@convex-dev/workflow/test";
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("fails a receipt instead of storing sample data when the OpenAI key is missing", async () => {
  vi.useFakeTimers();
  vi.stubEnv("RECEIPT_PROVIDER", "");
  vi.stubEnv("OPENAI_API_KEY", "");
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  register(t);

  const user = t.withIdentity({
    subject: "owner",
    issuer: "https://test.local",
  });

  const householdId = await user.mutation(api.households.create, {
    name: "Home",
    invitation: "0123456789abcdef0123456789abcdef",
  });

  const id = await user.mutation(api.receipts.reserve, {
    householdId,
    clientId: "capture-missing-key",
    imageCount: 1,
    backgroundUpload: true,
  });

  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob(["receipt"], { type: "image/jpeg" })),
  );

  await user.mutation(internal.receipts.attachImage, {
    id,
    position: 0,
    storageId,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const { receipt } = (await user.query(api.receipts.detail, { id }))!;
  expect(receipt).toMatchObject({ status: "failed", data: null });
  expect(receipt.error).toMatch(/API-nøkkel/);
});
