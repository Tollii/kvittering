# Wide-event tracing glue

The lines that tie a wide event to the trace, shown for a Hono-style framework. The event itself (its fields, structure, logger and middleware) follows the embedded `logging-best-practices` skill; its [rules/structure.md](../vendor/logging-best-practices/rules/structure.md) has the full middleware. These lines go inside that middleware and write to the event object it already creates. They do not create a second event.

Type-checked on 2026-11-14 against `hono` 4.13 and `@opentelemetry/api` 1.10. Nothing checks it since: confirm the calls against the versions the project installs.

```ts
import { trace } from "@opentelemetry/api";
import type { Attributes, Span } from "@opentelemetry/api";
import type { Context } from "hono";

type WideEvent = Record<string, unknown>;

/**
 * Call inside his middleware, right after it creates the event and stores it
 * with `c.set('wideEvent', wideEvent)`, and before `await next()`.
 */
export function linkToTrace(c: Context, wideEvent: WideEvent): void {
  const rootSpan = trace.getActiveSpan();
  wideEvent.trace_id = rootSpan?.spanContext().traceId;
  wideEvent.span_id = rootSpan?.spanContext().spanId;
  // The span that is active here is the root span. Keep it, because handlers
  // call enrich() from inside traced helpers, where a child span is active.
  c.set("rootSpan", rootSpan);
}

/**
 * The one function handlers call to add business context. The event keeps the
 * fields in the shape his rules give them, nested objects included. A span
 * attribute cannot hold an object, so the root span gets the same fields
 * flattened to dotted keys: `{ user: { id } }` becomes `user.id`.
 */
export function enrich(c: Context, fields: WideEvent): void {
  Object.assign(c.get("wideEvent") as WideEvent, fields);
  (c.get("rootSpan") as Span | undefined)?.setAttributes(flatten(fields));
}

function flatten(fields: WideEvent, prefix = ""): Attributes {
  const attributes: Attributes = {};
  for (const [key, value] of Object.entries(fields)) {
    const name = prefix + key;
    if (value === null || value === undefined) continue;
    if (typeof value === "object" && !Array.isArray(value))
      Object.assign(attributes, flatten(value as WideEvent, `${name}.`));
    else if (Array.isArray(value)) attributes[name] = value.map(String);
    else attributes[name] = value as string | number | boolean;
  }
  return attributes;
}
```
