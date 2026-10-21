import {
  DiagConsoleLogger,
  DiagLogLevel,
  diag,
  metrics,
} from "@opentelemetry/api";
import {
  AggregationTemporalityPreference,
  OTLPMetricExporter,
} from "@opentelemetry/exporter-metrics-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { deploymentChannel } from "./deployment";

/**
 * Backend metrics leave over OTLP/HTTP once the deployment names a collector
 * with the standard OTEL_EXPORTER_OTLP_* variables; until then recording does
 * nothing. Convex may freeze an action's process once it returns, so code that
 * records flushes before it returns instead of waiting for the periodic export.
 */

let provider: MeterProvider | undefined;

function exporting() {
  if (provider) return provider;

  const env = process.env;

  if (
    !env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT &&
    !env.OTEL_EXPORTER_OTLP_ENDPOINT
  )
    return undefined;

  provider = new MeterProvider({
    resource: resourceFromAttributes({
      "service.name": "kvitto-backend",
      // Each action process reports its own series.
      "service.instance.id": crypto.randomUUID(),
      "deployment.environment.name": deploymentChannel(),
    }),
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          // Short-lived processes each start their own counts, so delta is the
          // default; the standard variable can still ask for cumulative.
          ...(!env.OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE && {
            temporalityPreference: AggregationTemporalityPreference.DELTA,
          }),
          // A flush waits on the model call that recorded it.
          ...(!env.OTEL_EXPORTER_OTLP_TIMEOUT &&
            !env.OTEL_EXPORTER_OTLP_METRICS_TIMEOUT && { timeoutMillis: 5000 }),
        }),
      }),
    ],
  });
  // The reader reports a failed export only through OpenTelemetry's own
  // diagnostics, which are silent until they have a logger.
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

  return provider;
}

/**
 * The backend's meter. Without a collector it comes from the global provider,
 * which does nothing unless a test installs one.
 */
export function meter() {
  return (exporting() ?? metrics).getMeter("kvitto-backend");
}

const flushWaitMs = 1000;

const slowCollectorPauseMs = 60000;

let waitAgainAt = 0;

/**
 * Sends what was recorded. Receipt work waits at most a second for it; after
 * a slow export it stops waiting for a minute and lets exports finish in the
 * background. A failed export is logged, never thrown.
 */
export async function flushMetrics() {
  // The diagnostics logger reports failures; a background flush must not reject.
  const flushing = exporting()
    ?.forceFlush()
    .catch(() => undefined);

  if (!flushing || Date.now() < waitAgainAt) return;

  let timer: ReturnType<typeof setTimeout> | undefined;

  const finished = await Promise.race([
    flushing.then(() => true),
    new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), flushWaitMs);
    }),
  ]);

  clearTimeout(timer);

  if (!finished) waitAgainAt = Date.now() + slowCollectorPauseMs;
}
