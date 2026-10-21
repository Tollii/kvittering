/// <reference types="vite/client" />
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { register } from "@convex-dev/workflow/test";
import { convexTest } from "convex-test";
import { afterEach, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { z } from "zod";
import { present } from "../src/lib/testing/receipts";
import {
  choiceAnswer,
  readModelRequest,
  type ModelRequest,
} from "../src/lib/testing/model-requests";

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

it("classifies a receipt beyond one request's context with each answer kept on its product", async () => {
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  vi.stubEnv("RECEIPT_PROVIDER", "");
  const t = convexTest(schema, modules);
  registerRateLimiter(t);
  const requests: ModelRequest[] = [];

  // Answers from the product each question names, as a model would read it.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const request = readModelRequest(init);
      requests.push(request);

      const products = z
        .array(z.object({ name: z.string() }))
        .parse(request.state?.products);

      const answers = Object.fromEntries(
        Object.keys(request.questions).map((key) => {
          const name = present(products[Number(key.replace("item_", ""))]).name;

          const choice = name.startsWith("COLA")
            ? "drinks.soft-drinks"
            : "drinks.juice";

          return [key, choiceAnswer(request.questions[key], choice, 0.9)];
        }),
      );

      return Response.json({
        model: "jev-latest",
        answers,
        usage: { input_tokens: 10, output_tokens: 1 },
      });
    }),
  );

  const products = Array.from({ length: 60 }, (_, index) => ({
    id: `line_${index}`,
    evidence: { name: `${index % 3 ? "JUICE" : "COLA"} ${index}` },
  }));

  try {
    // A typical receipt goes out in one request.
    await t.action(internal.providers.classify, {
      products: products.slice(0, 15),
    });
    expect(requests).toHaveLength(1);

    requests.length = 0;
    const result = await t.action(internal.providers.classify, { products });

    expect(requests.length).toBeGreaterThan(1);
    expect(result.classifications).toEqual(
      products.map((product, index) => ({
        id: product.id,
        categoryId: index % 3 ? "drinks.juice" : "drinks.soft-drinks",
        confidence: 0.9,
      })),
    );
  } finally {
    vi.unstubAllGlobals();
  }
});
