/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { api } from "./_generated/api";
import schema from "./schema";
import "./tracing";
import { traced, tracedFetch } from "../src/lib/tracing";
import {
  separateHouseholds,
  testUser,
} from "../src/lib/testing/households";

const modules = import.meta.glob("./**/*.ts");

const spanLine = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  name: z.string(),
  failed: z.boolean(),
  attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});

let logged: z.infer<typeof spanLine>[] = [];

beforeEach(() => {
  logged = [];
  vi.stubEnv("OTEL_TRACES_EXPORTER", "");
  vi.spyOn(console, "info").mockImplementation((event, fields) => {
    if (event === "trace.span") logged.push(spanLine.parse(fields));
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const rootOf = (name: string) =>
  logged.filter((span) => span.name === name && !span.parentSpanId);

it("names each call's span after its function and puts the caller's account and household on every span of it", async () => {
  const t = convexTest(schema, modules);
  const { first, householdId } = await separateHouseholds(t);

  logged = [];
  await first.query(api.notifications.enabled, { token: "none" });

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

  expect(roots.map((root) => root.attributes["user.id"]).sort()).toEqual([
    "first",
    "first",
    "other",
  ]);

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

  expect(logged).toEqual([
    expect.objectContaining({
      name: "tracing.test.failing",
      failed: true,
      attributes: expect.objectContaining({
        "kvitto.outcome": "failure",
        "error.type": "TypeError",
      }),
    }),
  ]);
  expect(JSON.stringify(logged)).not.toContain("Melk");
});

it("continues the caller's trace in an HTTP action", async () => {
  const t = convexTest(schema, modules);
  const traceId = "4bf92f3577b34da6a3ce929d0e0e4736";
  const parentId = "00f067aa0ba902b7";

  await t.fetch("/receipt-image", {
    method: "OPTIONS",
    headers: { traceparent: `00-${traceId}-${parentId}-01` },
  });

  expect(logged).toContainEqual(
    expect.objectContaining({
      name: "HTTP OPTIONS /receipt-image",
      traceId,
      parentSpanId: parentId,
      attributes: expect.objectContaining({
        "http.response.status_code": 204,
        "url.path": "/receipt-image",
      }),
    }),
  );
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
