import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/react-native";
import { ConvexError } from "convex/values";
import { userError } from "../../convex/userErrors";
import { failureMessage } from "./failure-message";

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace the native SDK boundary; the message choice and reporting remain under test.
vi.mock("@sentry/react-native", () => ({
  addBreadcrumb: vi.fn<typeof Sentry.addBreadcrumb>(),
  logger: {
    info: vi.fn<typeof Sentry.logger.info>(),
    warn: vi.fn<typeof Sentry.logger.warn>(),
    error: vi.fn<typeof Sentry.logger.error>(),
  },
  captureException: vi.fn<typeof Sentry.captureException>(() => "event-id"),
}));

const fallback = "Kunne ikke lagre husstanden.";

beforeEach(() => vi.clearAllMocks());

describe("failure message", () => {
  it("shows the backend's message for a rejected request", () => {
    expect(
      failureMessage(
        userError("Ugyldig invitasjonskode."),
        "household.join",
        fallback,
      ),
    ).toBe("Ugyldig invitasjonskode.");
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("shows the fallback and reports a server failure instead of its trace", () => {
    const cause = new Error(
      "[CONVEX M(households:join)] [Request ID: 0123456789abcdef] Server Error\n  Called by client",
    );

    expect(failureMessage(cause, "household.join", fallback)).toBe(fallback);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      cause,
      expect.anything(),
    );
  });

  it("shows the fallback instead of English platform text", () => {
    expect(
      failureMessage(
        new TypeError("Network request failed"),
        "household.join",
        fallback,
      ),
    ).toBe(fallback);
  });

  it("shows a quota message the backend sends as plain error data", () => {
    const message = "Tjenestens bruksgrense er nådd. Prøv igjen senere.";

    expect(
      failureMessage(new ConvexError(message), "receipt.retry", fallback),
    ).toBe(message);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
