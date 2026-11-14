# Where telemetry goes

## The code stays vendor-neutral

Whatever the backend is, application code uses the OpenTelemetry SDK with the OTLP exporter, configured through the standard env vars:

- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_HEADERS`
- `OTEL_SERVICE_NAME`
- `OTEL_RESOURCE_ATTRIBUTES`

Keep vendor SDKs and agents out of application code, so that changing backend is a config change. With no endpoint set, the app must still run: print spans to the console in development and export nothing in production.

## Choosing the backend

Take the first case that applies:

1. **The project already sends telemetry somewhere, or its config names a backend.** Use that. Check its current docs for the OTLP endpoint and auth header.
2. **Nothing is chosen and someone is there to answer.** Ask one question, with your recommendation first.
3. **Nothing is chosen and nobody answers.** Go ahead with plain OTLP and no backend configured, and say so at the top of PR 1.

## What to recommend when nothing is chosen

In this order:

1. A tool the project already pays for that accepts OTLP, such as its error tracker or APM.
2. The hosting platform's own tracing, if it has one.
3. Otherwise a backend built for high-cardinality events, where any field can be queried without declaring it first. Wide events are only useful if you can filter and group by fields like user id. Honeycomb, Axiom, and ClickHouse-based tools such as SigNoz are examples; the Grafana stack is the common self-hosted choice.

Pricing, free tiers and OTLP support change, so check current docs before naming one, and give the reason for the pick in a sentence.

## Local viewing

Give developers a way to see traces locally from day one: a single-container OTLP viewer (Jaeger, or Grafana's `otel-lgtm` image), documented in the conventions doc.

## Runtimes that cannot run the full SDK

Edge workers, managed function platforms and mobile clients often cannot run the full SDK. Use the path the platform supports, or a small OTLP-over-fetch exporter.

If part of the system cannot be traced, or cannot export, say so in the PR and in the conventions doc. Do not leave a setup that looks complete and silently emits nothing.

## References

- [OTLP exporter configuration](https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/) for the endpoint and header env vars.
- [General SDK configuration](https://opentelemetry.io/docs/languages/sdk-configuration/general/) for the service name and resource attributes.
