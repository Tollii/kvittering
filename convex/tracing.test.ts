/// <reference types="vite/client" />
import {
  ROOT_CONTEXT,
  SpanKind,
  TraceFlags,
  context,
  trace,
} from "@opentelemetry/api";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { api } from "./_generated/api";
import schema from "./schema";
import "./tracing";
import {
  annotate,
  annotateFailure,
  annotateFailureCode,
  count,
  traced,
  tracedFetch,
  tracedRequest,
} from "../src/lib/tracing";
import { separateHouseholds, testUser } from "../src/lib/testing/households";

const modules = import.meta.glob("./**/*.ts");

const spanLine = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  name: z.string(),
  failed: z.boolean(),
  attributes: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean()]),
  ),
});

let logged: z.infer<typeof spanLine>[] = [];

beforeEach(() => {
  logged = [];
  vi.stubEnv("OTEL_TRACES_EXPORTER", "");

  const collect = (event?: string, fields?: z.input<typeof spanLine>) => {
    if (event === "trace.span" || event === "request.completed")
      logged.push(spanLine.parse(fields));
  };

  vi.spyOn(console, "info").mockImplementation(collect);
  vi.spyOn(console, "warn").mockImplementation(collect);
  vi.spyOn(console, "error").mockImplementation(collect);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** The caller's span when a test continues a remote trace. */
const remoteSpanId = "00f067aa0ba902b7";

const rootOf = (name: string) =>
  logged.filter(
    (span) =>
      span.name === name &&
      (!span.parentSpanId || span.parentSpanId === remoteSpanId),
  );

/**
 * A remote caller's context. The detail sample reads the trace id's last
 * eight hex digits, so one ending in zeros is always in it and one ending in
 * f's never is.
 */
const remoteParent = (traceId: string) =>
  trace.setSpanContext(ROOT_CONTEXT, {
    traceId,
    spanId: remoteSpanId,
    traceFlags: TraceFlags.SAMPLED,
    isRemote: true,
  });

const sampledParent = remoteParent("4bf92f3577b34da6a3ce929d00000000");

const unsampledParent = remoteParent("4bf92f3577b34da6a3ce929dffffffff");

/** Runs work in a trace that falls in the detail sample, so its inner spans log too. */
const inSampledTrace = <T>(work: () => Promise<T>) =>
  context.with(sampledParent, work);

const request = (work: () => Promise<void>) =>
  tracedRequest(
    "tracing.test.request",
    { kind: SpanKind.SERVER, parent: context.active(), attributes: {} },
    work,
  );

it("names each call's span after its function and puts the caller's account and household on every span of it", async () => {
  const t = convexTest(schema, modules);
  const { first, householdId } = await separateHouseholds(t);

  logged = [];
  await inSampledTrace(() =>
    first.query(api.notifications.enabled, { token: "none" }),
  );

  const [root] = rootOf("notifications:enabled");
  const spans = logged.filter((span) => span.traceId === root?.traceId);

  expect(root?.attributes["kvitto.outcome"]).toBe("success");
  // The access check is a child span that ends before the query does.
  expect(spans.map((span) => span.name)).toContain("access.requireMember");

  for (const span of spans) {
    expect(span.attributes["user.id"]).toBe("first");
    expect(span.attributes["kvitto.household.id"]).toBe(householdId);
  }
});

it("keeps the accounts of requests that run at the same time apart", async () => {
  const t = convexTest(schema, modules);
  const { first, other } = await separateHouseholds(t);

  logged = [];
  await Promise.all([
    first.query(api.notifications.enabled, { token: "none" }),
    other.query(api.notifications.enabled, { token: "none" }),
    first.query(api.notifications.enabled, { token: "none" }),
  ]);

  const roots = rootOf("notifications:enabled");

  const accounts = roots
    .map((root) => String(root.attributes["user.id"]))
    .toSorted((a, b) => a.localeCompare(b));

  expect(accounts).toEqual(["first", "first", "other"]);

  for (const root of roots) {
    const spans = logged.filter((span) => span.traceId === root.traceId);

    expect(
      new Set(spans.map((span) => span.attributes["kvitto.household.id"])),
    ).toHaveLength(1);
  }
});

it("records a refusal as an expected failure, without its message", async () => {
  const t = convexTest(schema, modules);
  const stranger = testUser(t, "stranger");

  await expect(
    stranger.mutation(api.households.join, { invitation: "unknown" }),
  ).rejects.toThrow("Invitasjonen er ugyldig.");

  const [root] = rootOf("households:join");

  expect(root).toMatchObject({
    failed: false,
    attributes: {
      "user.id": "stranger",
      "kvitto.outcome": "expected_failure",
      "error.type": "REJECTED",
    },
  });
  expect(JSON.stringify(logged)).not.toContain("Invitasjonen");
});

it("records an unexpected error as a failed span", async () => {
  const work = traced("tracing.test.failing", async () => {
    throw new TypeError("Receipt line 'Melk 2 l' could not be read.");
  });

  await expect(work()).rejects.toThrow(TypeError);

  expect(logged).toHaveLength(1);
  expect(logged[0]).toMatchObject({
    name: "tracing.test.failing",
    failed: true,
    attributes: { "kvitto.outcome": "failure", "error.type": "TypeError" },
  });
  expect(JSON.stringify(logged)).not.toContain("Melk");
});

it("bounds the lines a request logs and counts the spans it leaves out", async () => {
  const inner = traced("tracing.test.row", async () => {});

  await inSampledTrace(() =>
    request(async () => {
      for (let row = 0; row < 300; row += 1) await inner();
    }),
  );

  const [root] = rootOf("tracing.test.request");
  const rows = logged.filter((span) => span.name === "tracing.test.row");

  expect(logged.length).toBeLessThan(100);
  expect(rows.length + Number(root?.attributes["kvitto.spans.omitted"])).toBe(
    300,
  );
});

it("continues the caller's trace in an HTTP action", async () => {
  const t = convexTest(schema, modules);
  const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
  const parentId = remoteSpanId;

  await t.fetch("/receipt-image", {
    method: "OPTIONS",
    headers: { traceparent: `00-${traceId}-${parentId}-01` },
  });

  expect(
    logged.find((span) => span.name === "HTTP OPTIONS /receipt-image"),
  ).toMatchObject({
    traceId,
    parentSpanId: parentId,
    attributes: {
      "http.response.status_code": 204,
      "url.path": "/receipt-image",
    },
  });
});

it("forwards the trace to the services it calls, without the request's path", async () => {
  const sent = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(null, { status: 503 })),
  );

  vi.stubGlobal("fetch", sent);

  await traced("tracing.test.caller", () =>
    tracedFetch("https://api.example.test/v1/orders/1234?token=secret", {
      headers: { Authorization: "Bearer secret" },
    }),
  )();
  vi.unstubAllGlobals();

  const headers = new Headers(sent.mock.calls[0]?.[1]?.headers);
  const client = logged.find((span) => span.name === "HTTP GET");

  expect(headers.get("Authorization")).toBe("Bearer secret");
  expect(headers.get("traceparent")).toBe(
    `00-${client?.traceId}-${client?.spanId}-01`,
  );
  expect(client?.attributes).toMatchObject({
    "server.address": "api.example.test",
    "http.response.status_code": 503,
    "kvitto.outcome": "failure",
  });
  expect(JSON.stringify(logged)).not.toMatch(/orders|secret/);
});

it("logs an ordinary request as one wide event carrying its business context", async () => {
  const step = traced("tracing.test.step", async () => {
    annotate({ "kvitto.receipt.line_count": 12 });
  });

  await context.with(unsampledParent, () =>
    request(async () => {
      annotate({ "kvitto.receipt.id": "receipt-1" });
      await step();
      await step();
    }),
  );

  expect(logged).toHaveLength(1);
  expect(logged[0]).toMatchObject({
    name: "tracing.test.request",
    attributes: {
      "kvitto.outcome": "success",
      "kvitto.receipt.id": "receipt-1",
      "kvitto.receipt.line_count": 12,
      "kvitto.spans.unlogged": 2,
    },
  });
});

it("keeps the inner spans of a request that handled a failure, without the error's message", async () => {
  const step = traced("tracing.test.step", async () => {
    annotateFailure(
      "tracing.provider",
      new TypeError("Receipt line 'Melk 2 l' could not be read."),
    );
  });

  await context.with(unsampledParent, () => request(step));

  const root = logged.find((span) => span.name === "tracing.test.request");

  expect(logged.map((span) => span.name)).toContain("tracing.test.step");
  expect(root?.attributes).toMatchObject({
    "kvitto.outcome": "success",
    "kvitto.failures.handled": 1,
    "kvitto.tracing.provider.error.type": "TypeError",
  });
  expect(JSON.stringify(logged)).not.toContain("Melk");
});

it("keeps business context off the request's inner spans", async () => {
  const step = traced("tracing.test.step", async () => {
    annotate({ "kvitto.receipt.id": "receipt-1" });
  });

  await inSampledTrace(() => request(step));

  const inner = logged.find((span) => span.name === "tracing.test.step");

  expect(inner).toBeDefined();
  expect(inner?.attributes).not.toHaveProperty("kvitto.receipt.id");
});

it("keeps the fields of requests that run at the same time apart", async () => {
  const pause = () => new Promise((resolve) => setTimeout(resolve, 1));

  const receipt = (id: string) =>
    request(async () => {
      annotate({ "kvitto.receipt.id": id });
      await pause();
      count("kvitto.receipt.steps");
      await pause();
      count("kvitto.receipt.steps");
    });

  await Promise.all([receipt("first"), receipt("second")]);

  const lines = rootOf("tracing.test.request").map((span) => span.attributes);

  expect(lines).toHaveLength(2);
  expect(lines).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        "kvitto.receipt.id": "first",
        "kvitto.receipt.steps": 2,
      }),
      expect.objectContaining({
        "kvitto.receipt.id": "second",
        "kvitto.receipt.steps": 2,
      }),
    ]),
  );
});

it("logs a failed request and a handled defect as errors, with their inner spans", async () => {
  const error = vi.mocked(console.error);
  const step = traced("tracing.test.step", async () => {});

  await expect(
    context.with(unsampledParent, () =>
      request(async () => {
        await step();
        throw new TypeError("Receipt line 'Melk 2 l' could not be read.");
      }),
    ),
  ).rejects.toThrow(TypeError);
  await context.with(unsampledParent, () =>
    request(async () => {
      await step();
      annotateFailureCode("tracing.config", "key_missing", { defect: true });
    }),
  );
  await context.with(unsampledParent, () =>
    request(async () => {
      await step();
      annotateFailureCode("tracing.provider", "busy");
    }),
  );

  const errors = error.mock.calls.filter(
    ([event]) => event === "request.completed",
  );

  expect(errors).toHaveLength(2);
  expect(
    logged.filter((span) => span.name === "tracing.test.step"),
  ).toHaveLength(3);
});
