# Wide-event tracing glue

The lines that tie a wide event to the trace, shown for a Hono-style framework. The event itself (its fields, structure, logger and middleware shape) follows the `logging-best-practices` skill; its `rules/structure.md` has the full middleware. Add these lines to that middleware; do not treat this as a replacement for it.

Nothing in this repository compiles this code. Check the calls against the framework and OpenTelemetry versions the project installs.

```ts
import { trace } from "@opentelemetry/api";
import type { Span } from "@opentelemetry/api";
import type { Context, Next } from "hono";

type FieldValue = string | number | boolean;

export const wideEvent = () => async (c: Context, next: Next) => {
  // Build the event as logging-best-practices describes, then add:
  const rootSpan = trace.getActiveSpan();
  const event: Record<string, unknown> = {
    trace_id: rootSpan?.spanContext().traceId,
    span_id: rootSpan?.spanContext().spanId,
  };
  c.set("event", event);
  // The span that is active here is the root span. Keep it, because handlers
  // call enrich() from inside traced helpers, where a child span is active.
  c.set("rootSpan", rootSpan);

  await next(); // ...wrapped in the try / catch / finally his middleware uses
};

/**
 * The one function handlers call to add business context. It writes each
 * field to the wide event and to the root span, so the two always agree.
 */
export function enrich(c: Context, fields: Record<string, FieldValue>): void {
  Object.assign(c.get("event") as Record<string, unknown>, fields);
  (c.get("rootSpan") as Span | undefined)?.setAttributes(fields);
}
```
