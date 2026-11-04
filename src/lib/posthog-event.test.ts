import { describe, expect, it } from "vitest";
import { redactExceptions } from "./posthog-event";

type StackFrame = { platform: string; chunk_id?: string };

describe("PostHog exception redaction", () => {
  it("filters credentials and contact details from exception messages", () => {
    const event = redactExceptions({
      event: "$exception",
      properties: {
        $exception_list: [
          {
            type: "Error",
            value:
              "Upload failed for ola@example.no with Bearer abc.def at https://example.convex.site/upload?token=secret",
            stacktrace: { type: "raw", frames: [] },
          },
        ],
        household_id: "household-1",
      },
    });

    expect(event?.properties).toEqual({
      $exception_list: [
        {
          type: "Error",
          value:
            "Upload failed for [Filtered] with Bearer [Filtered] at https://example.convex.site/upload",
          stacktrace: { type: "raw", frames: [] },
        },
      ],
      household_id: "household-1",
    });
  });

  it("filters messages when a stack frame has no source map chunk", () => {
    // PostHog sets chunk_id to undefined for a frame it cannot map.
    const frame: StackFrame = {
      platform: "hermes",
      chunk_id: undefined,
    };

    const event = redactExceptions({
      event: "$exception",
      properties: {
        $exception_list: [
          {
            type: "Error",
            value: "Sign-in failed for ola@example.no",
            stacktrace: {
              type: "raw",
              frames: [frame],
            },
          },
        ],
      },
    });

    expect(event?.properties?.$exception_list).toEqual([
      {
        type: "Error",
        value: "Sign-in failed for [Filtered]",
        stacktrace: { type: "raw", frames: [{ platform: "hermes" }] },
      },
    ]);
  });

  it("drops an exception list it cannot read instead of sending it", () => {
    expect(
      redactExceptions({
        event: "$exception",
        properties: { $exception_list: "Sign-in failed for ola@example.no" },
      }),
    ).toBeNull();
  });

  it("passes other events through unchanged", () => {
    const event = {
      event: "$screen",
      properties: { $screen_name: "receipt/[id]" },
    };

    expect(redactExceptions(event)).toBe(event);
  });
});
