import { AsyncLocalStorage } from "node:async_hooks";
import {
  ROOT_CONTEXT,
  type Context,
  type ContextManager,
} from "@opentelemetry/api";
import {
  StackContextManager,
  type ReadableSpan,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace";
import { installTracing, spanRecord } from "../src/lib/tracing/sdk";

/**
 * Backend spans stay in the Convex logs as `trace.span` lines; the free plan
 * has no log streams, and queries and mutations cannot make network requests.
 * Search the logs by trace id to follow one request, including the app's half
 * of it, which carries the same trace id. `OTEL_TRACES_EXPORTER=none` turns
 * the lines off; spans are still recorded so trace context keeps flowing.
 */

/**
 * Keeps the active span across `await`. Convex provides AsyncLocalStorage in
 * both runtimes: the isolate as a global that the bundler maps
 * `node:async_hooks` to, and Node actions natively.
 */
class AsyncContextManager implements ContextManager {
  #storage = new AsyncLocalStorage<Context>();

  active() {
    return this.#storage.getStore() ?? ROOT_CONTEXT;
  }

  with<A extends unknown[], F extends (...args: A) => ReturnType<F>>(
    context: Context,
    fn: F,
    thisArg?: ThisParameterType<F>,
    ...args: A
  ): ReturnType<F> {
    return this.#storage.run(context, () => fn.apply(thisArg, args));
  }

  bind<T>(context: Context, target: T): T {
    if (!(target instanceof Function)) return target;

    const run = (...args: unknown[]) =>
      // oxlint-disable-next-line typescript/no-unsafe-return -- bind forwards any function's result unchanged.
      this.with(context, () => target.apply(undefined, args));

    // SAFETY: run forwards target's arguments and result unchanged.
    return run as T;
  }

  enable() {
    return this;
  }

  disable() {
    this.#storage.disable();

    return this;
  }
}

/**
 * An isolate without the global makes the constructor throw; then spans keep
 * their parent only until the first await, and requests still log.
 */
function contextManager(): ContextManager {
  try {
    return new AsyncContextManager();
  } catch (error) {
    console.warn("trace.async_context_unavailable", { error: String(error) });

    return new StackContextManager();
  }
}

/** Writes each finished span to the function's log. */
class LogSpanProcessor implements SpanProcessor {
  onStart() {}

  onEnd(span: ReadableSpan) {
    if (process.env.OTEL_TRACES_EXPORTER === "none") return;

    const { start: _start, end: _end, ...record } = spanRecord(span);

    console.info("trace.span", record);
  }

  forceFlush() {
    return Promise.resolve();
  }

  shutdown() {
    return Promise.resolve();
  }
}

installTracing({
  resource: {
    "service.name": "kvitto-backend",
    // Read without validation: a bad value must not stop every function from loading.
    "deployment.environment.name": process.env.RELEASE_CHANNEL ?? "development",
  },
  contextManager: contextManager(),
  processor: new LogSpanProcessor(),
});
