# SDK setup template

A starting point for the one module that sets up OpenTelemetry, and the entry file that loads it before anything else. Configuration is the standard `OTEL_*` env vars only.

Type-checked, linted and tested on 2026-11-14 in a trial project with `@opentelemetry/api` 1.10, `@opentelemetry/sdk-trace` 3.1 and Node's `AsyncLocalStorage`. Nothing checks it since, and other versions differ: confirm every import and constructor against the versions the project installs. It also used `@opentelemetry/resources` 3.1, `@opentelemetry/core` 3.1, `@opentelemetry/context-async-hooks` 3.1 and `@opentelemetry/exporter-trace-otlp-http` 0.301.

What it is careful about:

- **It always registers a provider.** With no endpoint set, spans print to the console outside production and are not exported in production, but they still record, so trace ids and propagation keep working. An all-in-one SDK wrapper is not a shortcut here: check what it does with no `OTEL_*` variables set, because some configure exporters that point at `localhost`, and some register no provider when given no span processors.
- **The context manager and the propagator are set explicitly.** Recent SDK majors no longer do it for you.
- **Only trace context is propagated.** Baggage can hold user data.
- **Span processors take an options object** (`{ exporter }`) in recent majors, not the exporter itself.

## `sdk.ts`

```ts
// SDK setup in one module. Load it before anything else:
//   node --import ./src/telemetry/instrumentation.ts ...
// Configuration is the standard OTEL_* env vars. With no endpoint set the app
// still runs: spans are printed in development and not exported in production.

import { context, propagation } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  defaultResource,
  detectResources,
  envDetector,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
  TracerProvider,
} from "@opentelemetry/sdk-trace";
import type { SpanProcessor } from "@opentelemetry/sdk-trace";
import { trace } from "@opentelemetry/api";
import { RequestContextProcessor } from "./tracing";

// Deployment facts, read once at startup. They become resource attributes on
// every span and the `env` object on every wide event.

export const serviceEnvironment = {
  service: process.env.OTEL_SERVICE_NAME ?? "app",
  version: process.env.SERVICE_VERSION ?? process.env.npm_package_version,
  commit_hash: process.env.COMMIT_SHA,
  region: process.env.REGION,
  environment: process.env.NODE_ENV ?? "development",
  instance_id: process.env.HOSTNAME,
};

export function startTelemetry(): { shutdown: () => Promise<void> } {
  // `OTEL_SDK_DISABLED=true` turns tracing off entirely.
  if (process.env.OTEL_SDK_DISABLED === "true") return { shutdown: async () => {} };

  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  // Trace context only. Baggage can hold user data and is not propagated.
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());

  // OTEL_SERVICE_NAME and OTEL_RESOURCE_ATTRIBUTES are read by the env detector
  // and win over the defaults below.
  const resource = defaultResource()
    .merge(
      resourceFromAttributes({
        "service.name": serviceEnvironment.service,
        "service.version": serviceEnvironment.version,
        "vcs.ref.head.revision": serviceEnvironment.commit_hash,
        "deployment.environment.name": serviceEnvironment.environment,
        "cloud.region": serviceEnvironment.region,
      }),
    )
    .merge(detectResources({ detectors: [envDetector] }));

  const processors: SpanProcessor[] = [new RequestContextProcessor()];
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) {
    processors.push(new BatchSpanProcessor({ exporter: new OTLPTraceExporter() }));
  } else if (process.env.NODE_ENV !== "production") {
    processors.push(new SimpleSpanProcessor({ exporter: new ConsoleSpanExporter() }));
  }

  const provider = new TracerProvider({ resource, spanProcessors: processors });
  trace.setGlobalTracerProvider(provider);
  return { shutdown: () => provider.shutdown() };
}
```

## `instrumentation.ts`

Load it first, for example with `node --import ./src/telemetry/instrumentation.ts`. If nothing loads it, nothing is exported; say so in the PR when the project has no entry point to add it to.

```ts
import { startTelemetry } from "./sdk";

const telemetry = startTelemetry();
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => void telemetry.shutdown().finally(() => process.kill(process.pid, signal)));
}
```
