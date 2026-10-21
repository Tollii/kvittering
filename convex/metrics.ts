import { metrics } from "@opentelemetry/api";
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
        exportIntervalMillis: 60000,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(provider);

  return provider;
}

/** The backend's meter; a no-op until a collector is configured. */
export function meter() {
  exporting();

  return metrics.getMeter("kvitto-backend");
}

/** Sends what was recorded. A collector failure never fails the caller. */
export async function flushMetrics() {
  await exporting()
    ?.forceFlush()
    .catch((error: Error) => {
      console.warn("metrics.export_failed", { message: error.message });
    });
}
