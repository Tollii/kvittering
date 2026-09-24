import { present } from "../src/lib/testing/receipts";
import {
  readModelRequest,
  type ModelRequest,
} from "../src/lib/testing/model-requests";
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
  const requests: ModelRequest[] = [];

  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const request = readModelRequest(init);
      requests.push(request);

      const answers = Object.fromEntries(
        Object.entries(request.questions).map(([key, question]) => [
          key,
          question.type === "noul"
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
  expect(present(requests[0]).state?.products).toHaveLength(12);
  expect(Object.keys(present(requests[0]).questions)).toHaveLength(24);
  expect(result).toHaveLength(12);
  expect(
    result.every(
      (decision) =>
        decision.productKey === present(products[0]).key &&
        decision.categoryId === "convenience.frozen-pizza",
    ),
  ).toBe(true);
  expect(present(present(result[0]).candidates?.[0]).probability).toBeCloseTo(
    0.86,
  );
});

it("retains the reason for a provider failure and keeps exact links usable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Network failure");
    }),
  );

  const result = await classifyCatalogProducts(
    [item(0), { ...item(1), product: present(products[0]) }],
    client(),
  );

  expect(result[0]).toMatchObject({
    productKey: null,
    reason: "provider_error",
  });
  expect(result[1]).toMatchObject({
    productKey: present(products[0]).key,
    reason: "saved_match",
  });
});

it("scores duplicate catalog records together and keeps their individual diagnostics", async () => {
  const candidates = normalizeProducts({
    data: [
      { id: 1, name: "BigOne Bbq Chicken Deluxe 560g", ean: "7039010576581" },
      {
        id: 2,
        name: "BigOne Bbq Chicken Deluxe 560g pose",
        ean: "7039010576582",
      },
    ],
  });

  let questionCount = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const request = readModelRequest(init);
      questionCount = Object.keys(request.questions).length;
      expect(
        present(request.state?.products?.[0]).catalogCandidates,
      ).toHaveLength(1);
      expect(
        present(present(request.state?.products?.[0]).catalogCandidates?.[0])
          .alternativeNames,
      ).toHaveLength(2);

      return new Response(
        JSON.stringify({
          model: "jev-latest",
          answers: {
            product_0_0: { type: "noul", noul: 0.92 },
          },
          usage: { input_tokens: 100, output_tokens: 20 },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }),
  );

  const result = present(
    (
      await classifyCatalogProducts(
        [{ ...item(0), line: { ...item(0).line, manual: true }, candidates }],
        client(),
      )
    )[0],
  );

  expect(questionCount).toBe(1);
  expect(result.reason).toBe("equivalent_match");
  expect(result.equivalentKeys).toEqual(
    candidates.map((product) => product.key),
  );
  expect(result.candidates?.map((candidate) => candidate.probability)).toEqual([
    0.92, 0.92,
  ]);
});

it("does not treat an unanswered competing group as a negative answer", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "jev-latest",
            answers: { product_0_0: { type: "noul", noul: 0.98 } },
            usage: { input_tokens: 100, output_tokens: 10 },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
    ),
  );

  const candidates = normalizeProducts({
    data: [
      { id: 1, name: "BigOne Bbq Chicken Deluxe 560g" },
      { id: 2, name: "BigOne Bbq Chicken Deluxe 700g" },
    ],
  });

  const result = present(
    (await classifyCatalogProducts([{ ...item(0), candidates }], client()))[0],
  );

  expect(result).toMatchObject({ productKey: null, reason: "provider_error" });
  expect(result.equivalentKeys).toBeUndefined();
});

it("bounds catalog question batches while retaining every line decision", async () => {
  const batches: number[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      batches.push(Object.keys(body.questions).length);

      const answers = Object.fromEntries(
        Object.keys(body.questions).map((key) => [
          key,
          key.startsWith("product_")
            ? { type: "noul", noul: 0.9 }
            : {
                type: "choice",
                choice: "convenience.frozen-pizza",
                confidence: 0.95,
              },
        ]),
      );

      return Response.json({ model: "jev-latest", answers });
    }),
  );

  const results = await classifyCatalogProducts(
    Array.from({ length: 25 }, (_, index) => item(index)),
    client(),
  );

  expect(batches).toEqual([24, 24, 2]);
  expect(results.map((result) => result.lineId)).toEqual(
    Array.from({ length: 25 }, (_, index) => `pizza_${index}`),
  );
  expect(
    results.every((result) => result.categoryId === "convenience.frozen-pizza"),
  ).toBe(true);
});
