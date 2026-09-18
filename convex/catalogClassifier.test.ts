import { afterEach, expect, it, vi } from "vitest";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { classifyCatalogProducts } from "./catalogClassifier";
import { emptyLine } from "../src/lib/domain/receipt";
import { normalizeProducts } from "./kassalapp/normalize";

// "Deluxe" is not a neutral word, so the text alone cannot link this and the model is asked.
const products = normalizeProducts({
  data: [
    { id: 1, name: "BigOne Bbq Chicken Deluxe 560g", ean: "7039010576581" },
  ],
});
const item = (index: number) => ({
  line: {
    ...emptyLine(`pizza_${index}`),
    name: "BIGONE BBQ CHICKEN",
    manual: false,
  },
  candidates: products,
  product: null,
});
const client = () =>
  new TypeSafeClient({ apiKey: "test-key", retry: { maxRetries: 0 } });
afterEach(() => vi.unstubAllGlobals());
it("sends all receipt matches and category questions in one model request", async () => {
  const requests: {
    state: { products: unknown[] };
    questions: Record<string, { type: string }>;
  }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, init) => {
      const request = JSON.parse(init.body);
      requests.push(request);
      const answers = Object.fromEntries(
        Object.entries(request.questions).map(([key, question]) => [
          key,
          (question as { type: string }).type === "noul"
            ? { type: "noul", noul: 0.86 }
            : {
                type: "choice",
                choice: "convenience.frozen-pizza",
                confidence: 0.95,
                probabilities: { "convenience.frozen-pizza": 0.99 },
              },
        ]),
      );
      return new Response(
        JSON.stringify({
          model: "jev-latest",
          answers,
          usage: { input_tokens: 100, output_tokens: 20 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }),
  );
  const result = await classifyCatalogProducts(
    Array.from({ length: 12 }, (_, index) => item(index)),
    client(),
  );
  expect(requests).toHaveLength(1);
  expect(requests[0].state.products).toHaveLength(12);
  expect(Object.keys(requests[0].questions)).toHaveLength(24);
  expect(result).toHaveLength(12);
  expect(
    result.every(
      (decision) =>
        decision.productKey === products[0].key &&
        decision.categoryId === "convenience.frozen-pizza",
    ),
  ).toBe(true);
  expect(result[0].candidates?.[0].probability).toBe(0.86);
});
it("retains the reason for a provider failure and keeps exact links usable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Network failure");
    }),
  );
  const result = await classifyCatalogProducts(
    [item(0), { ...item(1), product: products[0] }],
    client(),
  );
  expect(result[0]).toMatchObject({
    productKey: null,
    reason: "provider_error",
  });
  expect(result[1]).toMatchObject({
    productKey: products[0].key,
    reason: "saved_match",
  });
});
