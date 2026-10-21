import type { Attributes, Histogram, Meter } from "@opentelemetry/api";
import type { Experimental_DecisionModelCallEndEvent, Telemetry } from "ai";
import { flushMetrics, meter } from "./metrics";

/**
 * Every model call reports its token use as a log line and as metrics, so
 * production shows what reasoning and prompt caching cost before anyone tunes
 * them. Names follow the OpenTelemetry GenAI conventions; cached input and
 * reasoning output are parts of input and output, so they get their own
 * instruments instead of token types that a sum would count twice.
 */

type ModelCall = {
  operation: "chat" | "decide";
  /** The AI SDK names providers by API, such as `openai.responses`. */
  provider: string;
  model: string;
  inputTokens: number | undefined;
  cachedInputTokens: number | undefined;
  outputTokens: number | undefined;
  reasoningTokens: number | undefined;
  durationMs: number | undefined;
};

const tokenBuckets = [
  1, 4, 16, 64, 256, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304,
];

// The reader may think for minutes, past the conventions' 82-second bucket.
const durationBuckets = [
  0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24, 20.48,
  40.96, 81.92, 163.84, 327.68,
];

type Instruments = {
  tokens: Histogram;
  cachedInputTokens: Histogram;
  reasoningTokens: Histogram;
  duration: Histogram;
};

const instruments = new WeakMap<Meter, Instruments>();

function instrumentsOf(meter: Meter) {
  const existing = instruments.get(meter);

  if (existing) return existing;

  const tokens = (name: string, description: string) =>
    meter.createHistogram(name, {
      description,
      unit: "{token}",
      advice: { explicitBucketBoundaries: tokenBuckets },
    });

  const created = {
    tokens: tokens("gen_ai.client.token.usage", "Tokens used per model call."),
    cachedInputTokens: tokens(
      "kvitto.gen_ai.client.cached_input_tokens",
      "Input tokens read from the provider's prompt cache, part of input.",
    ),
    reasoningTokens: tokens(
      "kvitto.gen_ai.client.reasoning_tokens",
      "Output tokens spent reasoning, part of output.",
    ),
    duration: meter.createHistogram("gen_ai.client.operation.duration", {
      description: "Time a model call took.",
      unit: "s",
      advice: { explicitBucketBoundaries: durationBuckets },
    }),
  };

  instruments.set(meter, created);

  return created;
}

async function record(call: ModelCall) {
  const { durationMs, ...usage } = call;

  console.info("model.call_completed", {
    ...usage,
    ...(durationMs !== undefined && { durationMs }),
  });

  const recorded = instrumentsOf(meter());

  const attributes: Attributes = {
    "gen_ai.operation.name": call.operation,
    "gen_ai.provider.name": call.provider.split(".")[0],
    "gen_ai.request.model": call.model,
  };

  const measure = (
    histogram: Histogram,
    value: number | undefined,
    extra?: Attributes,
  ) => {
    if (value !== undefined)
      histogram.record(value, { ...attributes, ...extra });
  };

  measure(recorded.tokens, call.inputTokens, { "gen_ai.token.type": "input" });
  measure(recorded.tokens, call.outputTokens, {
    "gen_ai.token.type": "output",
  });
  measure(recorded.cachedInputTokens, call.cachedInputTokens);
  measure(recorded.reasoningTokens, call.reasoningTokens);
  measure(
    recorded.duration,
    durationMs === undefined ? undefined : durationMs / 1000,
  );

  await flushMetrics();
}

// Decision models report only input and output tokens.
async function recordDecision(event: Experimental_DecisionModelCallEndEvent) {
  await record({
    operation: "decide",
    provider: event.provider,
    model: event.modelId,
    inputTokens: event.usage?.inputTokens,
    cachedInputTokens: undefined,
    outputTokens: event.usage?.outputTokens,
    reasoningTokens: undefined,
    durationMs: undefined,
  });
}

/** Pass as `telemetry: { integrations: modelUsage }` on each model call. */
export const modelUsage: Telemetry = {
  async onLanguageModelCallEnd(event) {
    await record({
      operation: "chat",
      provider: event.provider,
      model: event.modelId,
      inputTokens: event.usage.inputTokens,
      cachedInputTokens: event.usage.inputTokenDetails.cacheReadTokens,
      outputTokens: event.usage.outputTokens,
      reasoningTokens: event.usage.outputTokenDetails.reasoningTokens,
      durationMs: event.performance.responseTimeMs,
    });
  },
  experimental_onDecisionModelCallEnd: recordDecision,
};
