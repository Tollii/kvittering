/// <reference types="vite/client" />
import { ROOT_CONTEXT, SpanKind, metrics } from "@opentelemetry/api";
import {
  DataPointType,
  MeterProvider,
  MetricReader,
} from "@opentelemetry/sdk-metrics";
import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { internal } from "./_generated/api";
import { judgmentClient } from "./decisions";
import schema from "./schema";
import { z } from "zod";
import type { extractionSchema } from "../src/lib/domain/receipt-extraction";
import { tracedRequest } from "../src/lib/tracing";
import "./tracing";

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
} satisfies z.input<typeof extractionSchema>;

/** The attributes of the wide event a request logged. */
function wideEvent(info: MockInstance<typeof console.info>) {
  const call = info.mock.calls.find(([event]) => event === "request.completed");

  return requestLine.parse(call?.at(1)).attributes;
}

const requestLine = z.object({
  attributes: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean()]),
  ),
});

it("reports the reader's cached and reasoning tokens on the receipt's wide event and in metrics", async () => {
  vi.stubEnv("OTEL_TRACES_EXPORTER", "");
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

  // One line ties the tokens to the receipt reading that spent them.
  expect(wideEvent(info)).toMatchObject({
    "kvitto.receipt.line_count": 1,
    "kvitto.model.chat.model": "gpt-6-luna",
    "kvitto.model.chat.calls": 1,
    "kvitto.model.chat.input_tokens": 1200,
    "kvitto.model.chat.cached_input_tokens": 1024,
    "kvitto.model.chat.output_tokens": 900,
    "kvitto.model.chat.reasoning_tokens": 600,
  });

  const call = {
    "gen_ai.operation.name": "chat",
    "gen_ai.provider.name": "openai",
    "gen_ai.response.model": "gpt-6-luna",
    "kvitto.function": "evaluation.read.default",
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
  vi.stubEnv("OTEL_TRACES_EXPORTER", "");
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
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

  await tracedRequest(
    "modelTelemetry.test.request",
    { kind: SpanKind.SERVER, parent: ROOT_CONTEXT, attributes: {} },
    async () => {
      await client.systemOne({
        state: { name: "Fiskepinner" },
        questions: {
          frozen: { type: "noul", instructions: "Is the product frozen?" },
        },
      });
    },
  );

  const event = wideEvent(info);

  expect(event).toMatchObject({
    "kvitto.model.decide.model": "jev-latest",
    "kvitto.model.decide.input_tokens": 100,
    "kvitto.model.decide.output_tokens": 20,
  });
  expect(event).not.toHaveProperty("kvitto.model.decide.cached_input_tokens");
  expect(event).not.toHaveProperty("kvitto.model.decide.reasoning_tokens");

  const call = {
    "gen_ai.operation.name": "decide",
    "gen_ai.provider.name": "typesafe",
    "gen_ai.response.model": "jev-latest",
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
