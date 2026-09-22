import { expect, it } from "vitest";
import { nextReviewEvening } from "./receipt-notifications";

it("chooses the next local 20:00 without changing the supplied date", () => {
  const morning = new Date(2026, 8, 22, 9, 30);
  expect(nextReviewEvening(morning)).toEqual(new Date(2026, 8, 22, 20));
  expect(morning.getHours()).toBe(9);
  expect(nextReviewEvening(new Date(2026, 8, 22, 20))).toEqual(
    new Date(2026, 8, 23, 20),
  );
  expect(nextReviewEvening(new Date(2026, 11, 31, 23, 59))).toEqual(
    new Date(2027, 0, 1, 20),
  );
  expect(nextReviewEvening(new Date(2026, 2, 28, 22))).toEqual(
    new Date(2026, 2, 29, 20),
  );
});
