# Sources and credit

This skill arranges other people's ideas into a repeatable workflow. Use these sources when the skill does not settle a question. If a user asks why a rule exists or wants more detail than is written here, point them to the relevant source rather than guessing.

## Wide events

The wide-event approach is the work of [Boris Tane](https://x.com/boristane). This skill does not restate his rules: [wide-events.md](wide-events.md) has the agent read and apply his `logging-best-practices` skill as written, and the logging checks in [maintenance.md](maintenance.md) are judged against it.

| Source | Used for |
| --- | --- |
| [Logging Sucks](https://loggingsucks.com/) by Boris Tane | The main source: why log lines fail in distributed systems, what a wide event contains, the tail-sampling rules, and how wide events relate to OpenTelemetry |
| [Observability wide events 101](https://boristane.com/blog/observability-wide-events-101/) by Boris Tane | His longer introduction to wide events |
| [Canonical log lines](https://stripe.com/blog/canonical-log-lines) on the Stripe blog | The same pattern under its older name: one information-dense line per request |
| [`logging-best-practices`](https://github.com/boristane/agent-skills) agent skill by Boris Tane (MIT) | The logging rules themselves, used unmodified. Vendored in this repository at [`.agents/skills/logging-best-practices`](../../logging-best-practices/SKILL.md); installed elsewhere with `npx add-skill boristane/agent-skills --skill "logging-best-practices"` |

## Tracing

The tracing rules ([tracing.md](tracing.md), [backend.md](backend.md)) are general OpenTelemetry practice and are not taken from the sources above.

| Source | Used for |
| --- | --- |
| [OpenTelemetry documentation](https://opentelemetry.io/docs/) | SDK setup, exporters, context propagation, baggage |
| [OpenTelemetry semantic conventions](https://opentelemetry.io/docs/specs/semconv/) | Attribute and field names |
| [SDK environment variables](https://opentelemetry.io/docs/languages/sdk-configuration/) | The `OTEL_*` configuration the code relies on |
| [W3C Trace Context](https://www.w3.org/TR/trace-context/) | The `traceparent` and `tracestate` headers |

## What is this skill's own

The two-PR split, the rule that functions are traced where they are defined and enforced by lint, trace ids on the event and `enrich()` writing to both the event and the root span, the rule about what stays out of an event, the conventions doc, and the maintenance pass.

## For the conventions doc

Link the three wide-event articles from the project's conventions doc, so people working in the repo can read the reasoning behind the logging rules.
