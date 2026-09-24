import { describe, expect, it } from "vitest";
import { userError } from "../../convex/userErrors";
import { parseUserError } from "./user-errors";

describe("user errors", () => {
  it("reads the message and code the backend sends", () => {
    const parsed = parseUserError(
      userError(
        "Kvitteringen er endret. Hent siste versjon.",
        "RECEIPT_CHANGED",
      ),
    );

    expect(parsed?.message).toBe("Kvitteringen er endret. Hent siste versjon.");
    expect(parsed?.code).toBe("RECEIPT_CHANGED");
  });

  it("leaves release-policy, unknown, and plain failures to other handling", () => {
    expect(parseUserError({ data: { code: "UPDATE_REQUIRED" } })).toBeNull();
    expect(
      parseUserError({ data: { code: "NEW_CODE", message: "Senere" } }),
    ).toBeNull();
    expect(parseUserError(new Error("Server Error"))).toBeNull();
  });
});
