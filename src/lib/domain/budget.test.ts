import { receiptFixture } from "../testing/receipts";
import { expect, it } from "vitest";
import { budgetPace, paceLabel, weeklyDigest, daysInMonth } from "./budget";
import { weeklyShopFixture } from "./receipt";

// Intl formats money with non-breaking spaces.
const plain = (text: string) => text.replace(/\s/g, " ");

it("measures pace against the elapsed share of the month", () => {
  expect(daysInMonth("2026-09")).toBe(30);
  const pace = budgetPace(600000, 372000, "2026-09", "2026-09-18");
  expect(pace.dayOfMonth).toBe(18);
  expect(pace.elapsedShare).toBeCloseTo(0.6);
  expect(pace.expectedOre).toBe(360000);
  expect(pace.differenceOre).toBe(12000);
  expect(pace.status).toBe("on");
  expect(pace.dailyAllowanceOre).toBe(19000);
  expect(plain(paceLabel(pace))).toBe(
    "Dag 18 av 30 · 62 % brukt · 2 280,00 kr igjen",
  );
  expect(budgetPace(600000, 450000, "2026-09", "2026-09-18").status).toBe(
    "over",
  );
  expect(budgetPace(600000, 200000, "2026-09", "2026-09-18").status).toBe(
    "under",
  );
});

it("treats past months as complete and future months as untouched", () => {
  const past = budgetPace(600000, 650000, "2026-08", "2026-09-18");
  expect(past.dayOfMonth).toBe(31);
  expect(past.dailyAllowanceOre).toBeNull();
  expect(plain(paceLabel(past))).toBe("108 % av budsjettet · 500,00 kr over");
  expect(budgetPace(600000, 0, "2026-10", "2026-09-18").dayOfMonth).toBe(0);
});

it("summarises the week from Monday with the budget position", () => {
  const receipt = (purchaseDate: string) =>
    receiptFixture({
      _id: purchaseDate,
      excluded: false,
      status: "reviewed",
      data: { ...weeklyShopFixture(), purchaseDate },
    });

  const receipts = [
    receipt("2026-09-14"),
    receipt("2026-09-17"),
    receipt("2026-09-12"),
  ];

  const digest = weeklyDigest(receipts, 600000, "2026-09-18");
  expect(digest.weekStart).toBe("2026-09-14");
  expect(digest.weekReceipts).toBe(2);
  // products 35500 - discounts 4220 per receipt (coffee amount unknown counts as 0)
  expect(digest.weekSpentOre).toBe(2 * 31280);
  expect(plain(digest.body)).toContain(
    "Denne uken: 625,60 kr · 2 kvitteringer",
  );
  expect(digest.body).toContain("dag 18 av 30");
  expect(weeklyDigest([], null, "2026-09-18").title).toBe(
    "Ingen kvitteringer denne uken",
  );
});
