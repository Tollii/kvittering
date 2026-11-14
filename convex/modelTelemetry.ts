import type { Attributes, Histogram } from "@opentelemetry/api";
import type { Telemetry } from "ai";
import { flushMetrics, meter } from "./metrics";
import { annotate, count, traced } from "../src/lib/tracing";

/**
 * Every model call adds its token use to the request's wide event and to metrics, so
 * production shows what reasoning and prompt caching cost before anyone tunes
 * them. Names follow the OpenTelemetry GenAI conventions; cached input and
 * reasoning output are parts of input and output, so they get their own
 * instruments instead of token types that a sum would count twice. The AI SDK
 * reports a call only once it succeeds, so tokens spent on a failed or
 * refused call are missing.
 */

type ModelCall = {
  operation: "chat" | "decide";
  /** Which work made the call, when the caller names it. */
  functionId: string | undefined;
  /** The AI SDK names providers by API, such as `openai.responses`. */
  provider: string;
  /** The model the provider says answered, which may be a dated snapshot. */
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

// The SDK returns the same instruments when they are created again.
function instruments() {
  const backend = meter();

  const tokens = (name: string, description: string) =>
    backend.createHistogram(name, {
      description,
      unit: "{token}",
      advice: { explicitBucketBoundaries: tokenBuckets },
    });

  return {
    tokens: tokens("gen_ai.client.token.usage", "Tokens used per model call."),
    cachedInputTokens: tokens(
      "kvitto.gen_ai.client.cached_input_tokens",
      "Input tokens read from the provider's prompt cache, part of input.",
    ),
    reasoningTokens: tokens(
      "kvitto.gen_ai.client.reasoning_tokens",
      "Output tokens spent reasoning, part of output.",
    ),
    duration: backend.createHistogram("gen_ai.client.operation.duration", {
      description: "Time a model call took.",
      unit: "s",
      advice: { explicitBucketBoundaries: durationBuckets },
    }),
  };
}

/** Sums a request's model calls onto its wide event, per operation, since one request can make several. */
function annotateCall(call: ModelCall) {
  const prefix = `kvitto.model.${call.operation}` as const;

  annotate({
    [`${prefix}.provider`]: call.provider,
    [`${prefix}.model`]: call.model,
  });
  count(`${prefix}.calls`);

  const totals = {
    input_tokens: call.inputTokens,
    cached_input_tokens: call.cachedInputTokens,
    output_tokens: call.outputTokens,
    reasoning_tokens: call.reasoningTokens,
    duration_ms: call.durationMs,
  };

  for (const [field, value] of Object.entries(totals))
    if (value !== undefined) count(`${prefix}.${field}`, value);
}

async function record(call: ModelCall) {
  annotateCall(call);

  const recorded = instruments();

  const attributes: Attributes = {
    "gen_ai.operation.name": call.operation,
    "gen_ai.provider.name": call.provider.split(".")[0],
    "gen_ai.response.model": call.model,
    ...(call.functionId && { "kvitto.function": call.functionId }),
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
    call.durationMs === undefined ? undefined : call.durationMs / 1000,
  );

  await flushMetrics();
}

type LanguageModelCallEnd = Parameters<
  NonNullable<Telemetry["onLanguageModelCallEnd"]>
>[0];

type DecisionModelCallEnd = Parameters<
  NonNullable<Telemetry["experimental_onDecisionModelCallEnd"]>
>[0];

/** Pass as `telemetry: { integrations: modelUsage }` on each model call. */
export const modelUsage: Telemetry = {
  onLanguageModelCallEnd: traced(
    "modelTelemetry.onLanguageModelCallEnd",
    (event: LanguageModelCallEnd) =>
      record({
        operation: "chat",
        functionId: event.functionId,
        provider: event.provider,
        model: event.modelId,
        inputTokens: event.usage.inputTokens,
        cachedInputTokens: event.usage.inputTokenDetails.cacheReadTokens,
        outputTokens: event.usage.outputTokens,
        reasoningTokens: event.usage.outputTokenDetails.reasoningTokens,
        durationMs: event.performance.responseTimeMs,
      }),
  ),
  // Decision models report only input and output tokens.
  ["experimental_onDecisionModelCallEnd"]: traced(
    "modelTelemetry.onDecisionModelCallEnd",
    (event: DecisionModelCallEnd) =>
      record({
        operation: "decide",
        functionId: event.functionId,
        provider: event.provider,
        model: event.response?.modelId ?? event.modelId,
        inputTokens: event.usage?.inputTokens,
        cachedInputTokens: undefined,
        outputTokens: event.usage?.outputTokens,
        reasoningTokens: undefined,
        durationMs: undefined,
      }),
  ),
};
