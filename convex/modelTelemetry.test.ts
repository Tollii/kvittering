/// <reference types="vite/client" />
import { metrics } from "@opentelemetry/api";
import {
  DataPointType,
  MeterProvider,
  MetricReader,
} from "@opentelemetry/sdk-metrics";
import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { judgmentClient } from "./decisions";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

class TestReader extends MetricReader {
  protected override onForceFlush() {
    return Promise.resolve();
  }

  protected override onShutdown() {
    return Promise.resolve();
  }
}

let reader: TestReader;

beforeEach(() => {
  reader = new TestReader();
  metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));
});

afterEach(() => {
  metrics.disable();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** Each data point of a histogram as its attributes with its sum. */
async function recorded(name: string) {
  const { resourceMetrics } = await reader.collect();

  return resourceMetrics.scopeMetrics
    .flatMap((scope) => scope.metrics)
    .flatMap((metric) =>
      metric.descriptor.name === name &&
      metric.dataPointType === DataPointType.HISTOGRAM
        ? metric.dataPoints.map((point) => ({
            ...point.attributes,
            sum: point.value.sum,
          }))
        : [],
    );
}

const extraction = {
  store: "REMA 1000",
  branch: null,
  purchaseDate: "2026-10-20",
  purchaseTime: null,
  receiptNumber: null,
  currency: "NOK",
  totalOre: 2590,
  originalText: "MELK 25,90",
  issues: [],
  lines: [
    {
      id: "l1",
      sourceImages: [1],
      overlapUncertain: false,
      kind: "product",
      originalText: "MELK 25,90",
      name: "Melk",
      amountOre: 2590,
      quantity: null,
      unit: null,
      unitPriceOre: null,
      packageSize: null,
      packageUnit: null,
      brand: null,
      attributes: [],
      relatedLineId: null,
      issues: [],
    },
  ],
};

it("reports the reader's cached and reasoning tokens in its log and metrics", async () => {
  vi.stubEnv("RECEIPT_PROVIDER", "openai");
  vi.stubEnv("RECEIPT_MODEL", "openai:gpt-6-luna");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "resp_1",
            created_at: 1792540800,
            model: "gpt-6-luna",
            output: [
              {
                type: "message",
                role: "assistant",
                id: "msg_1",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify(extraction),
                    annotations: [],
                  },
                ],
              },
            ],
            usage: {
              input_tokens: 1200,
              input_tokens_details: { cached_tokens: 1024 },
              output_tokens: 900,
              output_tokens_details: { reasoning_tokens: 600 },
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
    ),
  );

  const t = convexTest(schema, modules);
  registerRateLimiter(t);

  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob([new Uint8Array([1])], { type: "image/jpeg" })),
  );

  await t.action(internal.providers.extract, { storageIds: [storageId] });

  expect(info).toHaveBeenCalledWith(
    "receipt.extraction_completed",
    expect.objectContaining({
      inputTokens: 1200,
      cachedInputTokens: 1024,
      outputTokens: 900,
      reasoningTokens: 600,
    }),
  );

  const call = {
    "gen_ai.operation.name": "chat",
    "gen_ai.provider.name": "openai",
    "gen_ai.request.model": "gpt-6-luna",
  };

  expect(await recorded("gen_ai.client.token.usage")).toEqual(
    expect.arrayContaining([
      { ...call, "gen_ai.token.type": "input", sum: 1200 },
      { ...call, "gen_ai.token.type": "output", sum: 900 },
    ]),
  );
  expect(await recorded("kvitto.gen_ai.client.cached_input_tokens")).toEqual([
    { ...call, sum: 1024 },
  ]);
  expect(await recorded("kvitto.gen_ai.client.reasoning_tokens")).toEqual([
    { ...call, sum: 600 },
  ]);
  expect(await recorded("gen_ai.client.operation.duration")).toHaveLength(1);
});

it("reports a decision's token use without inventing cached or reasoning tokens", async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            model: "jev-latest",
            answers: { frozen: { type: "noul", noul: 0.9 } },
            usage: { input_tokens: 100, output_tokens: 20 },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
    ),
  );

  const client = judgmentClient(
    createTypeSafeAi({ apiKey: "test-key" }).decisionModel("jev-latest"),
    { timeoutMs: 1000 },
  );

  await client.systemOne({
    state: { name: "Fiskepinner" },
    questions: {
      frozen: { type: "noul", instructions: "Is the product frozen?" },
    },
  });

  const call = {
    "gen_ai.operation.name": "decide",
    "gen_ai.provider.name": "typesafe",
    "gen_ai.request.model": "jev-latest",
  };

  expect(await recorded("gen_ai.client.token.usage")).toEqual(
    expect.arrayContaining([
      { ...call, "gen_ai.token.type": "input", sum: 100 },
      { ...call, "gen_ai.token.type": "output", sum: 20 },
    ]),
  );
  expect(await recorded("kvitto.gen_ai.client.cached_input_tokens")).toEqual(
    [],
  );
  expect(await recorded("kvitto.gen_ai.client.reasoning_tokens")).toEqual([]);
});
