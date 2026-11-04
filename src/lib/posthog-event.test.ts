import { describe, expect, it } from "vitest";
import { redactExceptions } from "./posthog-event";

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

  it("passes other events through unchanged", () => {
    const event = {
      event: "$screen",
      properties: { $screen_name: "receipt/[id]" },
    };

    expect(redactExceptions(event)).toBe(event);
  });
});
