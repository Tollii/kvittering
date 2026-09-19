import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/react-native";
import { reportError } from "./observability";
import { errorDetails } from "./diagnostics";

vi.mock("@sentry/react-native", () => ({
  addBreadcrumb: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn() },
  captureException: vi.fn(),
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
    const error = Object.assign(new Error("PRIVATE_RECEIPT_TEXT"), {
      data: { receipt: "PRIVATE_RECEIPT_TEXT", token: "PRIVATE_TOKEN" },
    });
    error.stack = "Error: PRIVATE_RECEIPT_TEXT\n    at upload (app.ts:4:1)";
    reportError(error, "test.upload", {
      receiptId: "receipt-123",
      position: 1,
    });
    const [captured, context] = vi.mocked(Sentry.captureException).mock
      .calls[0];
    expect((captured as Error).stack).toContain("at upload");
    expect((captured as Error).stack).not.toContain("PRIVATE");
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
});
