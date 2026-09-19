import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/react-native";
import { reportError } from "./observability";
import { errorDetails } from "./diagnostics";
import { defaultStackParser, exceptionFromError } from "@sentry/browser";
import { prepareErrorEvent } from "./sentry-event";

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace the native SDK or environment boundary; application behavior remains under test.
vi.mock("@sentry/react-native", () => ({
  addBreadcrumb: vi.fn<typeof Sentry.addBreadcrumb>(),
  logger: { info: vi.fn<typeof Sentry.logger.info>(), warn: vi.fn<typeof Sentry.logger.warn>(), error: vi.fn<typeof Sentry.logger.error>() },
  captureException: vi.fn<typeof Sentry.captureException>(() => "verification-event-id"),
}));

beforeEach(() => vi.clearAllMocks());

describe("operational diagnostics", () => {
  it("records known temporary failures without creating issues", () => {
    reportError(new TypeError("Network request failed"), "test.network");
    reportError({ data: { code: "SERVICE_PAUSED" } }, "test.pause");
    reportError(new Error("rate limit"), "test.rate_limit", { status: 429 });
    expect(Sentry.logger.warn).toHaveBeenCalledTimes(3);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("keeps correlation and stack frames without sending receipt or provider payloads", () => {
    const cause = new Error("Native upload failed");

    const error = Object.assign(
      new Error('Upload failed: {"receipt":"PRIVATE_RECEIPT_TEXT"}', { cause }),
      {
        data: { receipt: "PRIVATE_RECEIPT_TEXT", token: "PRIVATE_TOKEN" },
      },
    );

    error.stack = `Error: ${error.message}\n    at upload (app.ts:4:1)`;
    reportError(error, "test.upload", {
      receiptId: "receipt-123",
      position: 1,
    });

    const [captured, context] = vi.mocked(Sentry.captureException).mock
      .calls[0];

    expect(captured).toBe(error);

    if (!(captured instanceof Error))
      throw new Error("Expected an Error event");
    expect(captured.cause).toBe(cause);

    const event = prepareErrorEvent({
      type: undefined,
      exception: {
        values: [exceptionFromError(defaultStackParser, captured)],
      },
    });

    expect(event.exception?.values?.[0].stacktrace?.frames?.[0].function).toBe(
      "upload",
    );
    expect(JSON.stringify(event)).not.toContain("PRIVATE");
    expect(JSON.stringify(context)).not.toContain("PRIVATE");
    expect(context).toMatchObject({
      contexts: { operation: { receiptId: "receipt-123", position: 1 } },
    });
  });

  it("limits repeated background failures but keeps different receipts separate", () => {
    for (let index = 0; index < 3; index++) {
      reportError(new Error("failed"), "test.retry", {
        receiptId: "receipt-a",
      });
    }

    reportError(new Error("failed"), "test.retry", { receiptId: "receipt-b" });
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
  });

  it("does not include arbitrary error fields in server logs", () => {
    expect(
      errorDetails({
        name: "APIError",
        status: 503,
        message: "PRIVATE",
        request: { token: "PRIVATE" },
      }),
    ).toEqual({ errorType: "APIError", status: 503, expected: false });
  });

  it("retains SDK error messages and codes and links the error log to the event", () => {
    reportError(
      Object.assign(
        new Error("You cannot check for updates in development mode."),
        {
          code: "ERR_UPDATES_CHECK",
        },
      ),
      "test.update",
    );

    const [captured, context] = vi.mocked(Sentry.captureException).mock
      .calls[0];

    if (!(captured instanceof Error))
      throw new Error("Expected an Error event");
    expect(captured.message).toBe(
      "You cannot check for updates in development mode.",
    );
    expect(context).toMatchObject({
      contexts: { operation: { code: "ERR_UPDATES_CHECK" } },
    });
    expect(context).toMatchObject({
      tags: { error_code: "ERR_UPDATES_CHECK" },
    });
    expect(Sentry.logger.error).toHaveBeenCalledWith(
      "You cannot check for updates in development mode.",
      expect.objectContaining({
        operation: "test.update",
        sentry_event_id: "verification-event-id",
      }),
    );
  });

  it("keeps distinct failure messages from being suppressed as the same error", () => {
    reportError(new Error("Invalid update manifest"), "test.distinct");
    reportError(new Error("Update download failed"), "test.distinct");
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
  });

  it("extracts the Convex request ID and SDK codes containing digits", () => {
    const error = Object.assign(
      new Error("[Request ID: 4b0f765f131105b9] Server Error"),
      { code: "ERR_HTTP_503" },
    );

    expect(errorDetails(error)).toMatchObject({
      requestId: "4b0f765f131105b9",
      code: "ERR_HTTP_503",
    });
  });

  it.each(["provider input with spaces", "TOKEN=value", 503, "X".repeat(61)])(
    "rejects invalid SDK error codes: %s",
    (code) => {
      expect(errorDetails({ code })).toEqual({
        errorType: "Error",
        expected: false,
      });
    },
  );
});
