import { expect, it } from "vitest";
import { defaultStackParser, exceptionFromError } from "@sentry/browser";
import { diagnosticText, prepareErrorEvent } from "./sentry-event";

it("retains Hermes named and anonymous frames through the SDK parser", () => {
  const error = new Error("Update check failed");
  error.stack =
    "Error: Update check failed\ncheck@http://localhost:8081/index.bundle:16:4\n@http://localhost:8081/index.bundle:20:1";

  const event = prepareErrorEvent({
    type: undefined,
    exception: { values: [exceptionFromError(defaultStackParser, error)] },
  });

  expect(event.exception?.values?.[0].stacktrace?.frames).toHaveLength(2);
  expect(event.contexts?.diagnostics?.stack_source).toBe("original");
});

it("uses a labelled capture stack when a native rejection has no JavaScript frames", () => {
  const frames = defaultStackParser(
    "Error: capture\n    at check (release-settings.tsx:43:7)",
  );

  const event = prepareErrorEvent(
    {
      type: undefined,
      exception: {
        values: [{ type: "Error", value: "Native update check rejected" }],
      },
    },
    frames,
  );

  expect(event.exception?.values?.[0].stacktrace?.frames).toEqual(frames);
  expect(event.contexts?.diagnostics?.stack_source).toBe("capture");
});

it("retains native causes and original frames instead of replacing them with the capture stack", () => {
  const event = prepareErrorEvent(
    {
      type: undefined,
      exception: {
        values: [
          {
            type: "Error",
            value: "Update failed",
            stacktrace: { frames: [{ filename: "update.ts", lineno: 9 }] },
          },
          {
            type: "NSError",
            value: "Connection refused",
            stacktrace: { frames: [{ instruction_addr: "0x1234" }] },
          },
        ],
      },
    },
    [{ filename: "report.ts", lineno: 3 }],
  );

  expect(event.exception?.values).toHaveLength(2);
  expect(event.exception?.values?.[0].stacktrace?.frames?.[0].filename).toBe(
    "update.ts",
  );
  expect(event.exception?.values?.[1].value).toBe("Connection refused");
});

it("removes credentials and payload dumps while keeping the failure explanation", () => {
  const text = diagnosticText(
    'HTTP 401 https://user:password@example.com/api/query?token=PRIVATE_QUERY Authorization: Bearer PRIVATE_BEARER token=PRIVATE_TOKEN person@example.com Args: {"receipt":"PRIVATE_RECEIPT"}',
  );

  expect(text).toContain("HTTP 401 https://example.com/api/query");
  expect(text).not.toContain("PRIVATE");
  expect(text).not.toContain("password");
  expect(text).not.toContain("person@example.com");
});

it("keeps HTTP status and app milestones without request bodies or UI labels", () => {
  const event = prepareErrorEvent({
    type: undefined,
    breadcrumbs: [
      {
        category: "http",
        data: {
          method: "POST",
          url: "https://example.com/api/query?token=PRIVATE",
          status_code: 503,
          body: "PRIVATE",
        },
      },
      { category: "kvitto", message: "update.check_started" },
      { category: "ui.click", message: "PRIVATE_RECEIPT" },
    ],
    request: {
      url: "https://example.com/path?token=PRIVATE",
      headers: { Authorization: "PRIVATE" },
      data: "PRIVATE",
    },
    extra: { __serialized__: { receipt: "PRIVATE" } },
  });

  expect(event.breadcrumbs).toHaveLength(2);
  expect(event.breadcrumbs?.[0].data).toEqual({
    method: "POST",
    url: "https://example.com/api/query",
    status_code: 503,
  });
  expect(JSON.stringify(event)).not.toContain("PRIVATE");
});
