import { present } from "../testing/receipts";
import { Ore } from "./ore";
import { expect, it } from "vitest";
import { batteryFixture, reconcile, weeklyShopFixture } from "./receipt";
import {
  balanceWithAdjustment,
  canAcceptReceipt,
  canConfirmSuggestedCategory,
  confirmLineCategory,
  confirmSuggestedCategories,
  lineReviewIssues,
  quickApproveData,
  reviewSummary,
  reviewTasks,
} from "./receipt-review";

it("accepts balanced receipts without optional package details or product links", () => {
  const data = batteryFixture();
  expect(present(data.lines[0]).productId).toBeUndefined();
  expect(present(data.lines[0]).packageSize).toBeNull();
  expect(canAcceptReceipt(data, false)).toBe(true);
  expect(canAcceptReceipt(data, true)).toBe(false);
});

it("requires review for amounts, identity, overlap and missing receipt information", () => {
  for (const modify of [
    (data: ReturnType<typeof batteryFixture>) => {
      data.totalOre = Ore.add(data.totalOre!, Ore.of(1));
    },
    (data: ReturnType<typeof batteryFixture>) => {
      data.purchaseDate = null;
    },
    (data: ReturnType<typeof batteryFixture>) => {
      data.store = null;
    },
    (data: ReturnType<typeof batteryFixture>) => {
      present(data.lines[0]).name = "";
    },
    (data: ReturnType<typeof batteryFixture>) => {
      present(data.lines[0]).amountOre = null;
    },
    (data: ReturnType<typeof batteryFixture>) => {
      present(data.lines[0]).issues = ["Mulig overlapp."];
    },
    (data: ReturnType<typeof batteryFixture>) => {
      data.issues = ["Kvitteringen er ufullstendig."];
    },
  ]) {
    const data = batteryFixture();
    modify(data);
    expect(canAcceptReceipt(data, false)).toBe(false);
  }
});

it("keeps a missing amount visible after a general warning is acknowledged", () => {
  const line = present(batteryFixture().lines[0]);
  line.amountOre = null;
  expect(lineReviewIssues(line)).toEqual([{ code: "amount_missing" }]);
});

it("resolves category uncertainty without dismissing other review requirements", () => {
  const line = present(batteryFixture().lines[0]);
  line.issues = ["Kategorien er usikker.", "Mulig overlapp."];
  line.amountOre = null;
  const corrected = confirmLineCategory(line, "drinks.soft-drinks");
  expect(corrected.categoryId).toBe("drinks.soft-drinks");
  expect(corrected.manual).toBe(true);
  expect(lineReviewIssues(corrected)).toEqual([
    { code: "reader_issue", message: "Mulig overlapp." },
    { code: "amount_missing" },
  ]);
  expect(line.issues).toContain("Kategorien er usikker.");
  expect(confirmLineCategory(line, "fallback.unclear").issues).toContain(
    "Kategorien er usikker.",
  );
});

it("lists nothing to do for an acceptable receipt", () => {
  expect(reviewTasks(batteryFixture(), false)).toEqual([]);
  expect(reviewSummary(null, false)).toEqual([]);
});

it("groups review work into receipt facts and line fixes", () => {
  const data = batteryFixture();
  data.store = null;
  data.totalOre = null;
  present(data.lines[0]).issues = ["Kategorien er usikker."];
  present(data.lines[1]).amountOre = null;
  const tasks = reviewTasks(data, true);
  expect(tasks.map((task) => task.kind)).toEqual([
    "duplicate",
    "store",
    "total",
    "amounts",
  ]);
  expect(reviewSummary(data, true)).toEqual([
    "Mulig duplikat",
    "Butikk mangler",
    "Betalt beløp mangler",
    "1 beløp mangler",
  ]);
});

it("hides the total difference while amounts are still missing", () => {
  const data = batteryFixture();
  present(data.lines[1]).amountOre = null;
  expect(reviewTasks(data, false).map((task) => task.kind)).toEqual([
    "amounts",
  ]);
  present(data.lines[1]).amountOre = Ore.of(-100);
  expect(reviewTasks(data, false)).toEqual([
    { kind: "difference", amountOre: Ore.of(159) },
  ]);
});

it("balances a receipt with an explicit adjustment line", () => {
  const data = batteryFixture();
  data.totalOre = Ore.of(2500);
  const balanced = balanceWithAdjustment(data, "fix");
  expect(balanced.lines.at(-1)).toMatchObject({
    id: "fix",
    kind: "adjustment",
    amountOre: Ore.of(-31),
    categoryId: null,
    manual: true,
  });
  expect(reconcile(balanced).difference).toBe(0);
  expect(canAcceptReceipt(balanced, false)).toBe(true);
  expect(balanceWithAdjustment(batteryFixture(), "noop").lines).toHaveLength(3);
});

it("confirms suggested categories in bulk without touching unclear or other issues", () => {
  const data = batteryFixture();
  present(data.lines[0]).issues = ["Kategorien er usikker."];
  data.lines.push({
    ...present(data.lines[0]),
    id: "unclear",
    categoryId: "fallback.unclear",
    issues: ["Kategorien er usikker."],
  });
  data.lines.push({
    ...present(data.lines[0]),
    id: "overlap",
    issues: ["Kategorien er usikker.", "Mulig overlapp."],
  });
  expect(canConfirmSuggestedCategory(present(data.lines[0]))).toBe(true);
  expect(canConfirmSuggestedCategory(present(data.lines[3]))).toBe(false);
  const confirmed = confirmSuggestedCategories(data);
  expect(present(confirmed.lines[0]).issues).toEqual([]);
  expect(present(confirmed.lines[0]).confidence).toBe(1);
  expect(present(confirmed.lines[0]).manual).toBe(true);
  expect(present(confirmed.lines[3]).issues).toEqual([
    "Kategorien er usikker.",
  ]);
  expect(present(confirmed.lines[4]).issues).toEqual(["Mulig overlapp."]);
  expect(present(data.lines[0]).issues).toEqual(["Kategorien er usikker."]);
  expect(reviewTasks(confirmed, false).map((task) => task.kind)).toEqual([
    "difference",
    "line-issues",
  ]);
});

it("approves receipt facts without confirming uncertain or unknown categories", () => {
  const data = batteryFixture();
  present(data.lines[0]).issues = ["Kategorien er usikker."];
  present(data.lines[0]).confidence = 0.3;
  present(data.lines[0]).manual = false;
  const approved = quickApproveData(data, false);
  expect(approved).toEqual(data);
  expect(approved?.lines[0]).toMatchObject({
    issues: ["Kategorien er usikker."],
    confidence: 0.3,
    manual: false,
  });
  expect(quickApproveData(data, true)).toBeNull();
  present(data.lines[1]).amountOre = null;
  expect(quickApproveData(data, false)).toBeNull();
  expect(quickApproveData(null, false)).toBeNull();
  const unclear = batteryFixture();
  present(unclear.lines[0]).categoryId = "fallback.unclear";
  present(unclear.lines[0]).issues = ["Kategorien er usikker."];
  expect(quickApproveData(unclear, false)).toEqual(unclear);
});

it("walks a weekly shop from reading to approval", () => {
  const data = weeklyShopFixture();
  // 239+399+1499+429+949+35 = 3550 products, -300 -122 discounts, +200 -430 deposits = 2898; unknown coffee line
  expect(reviewTasks(data, false).map((task) => task.kind)).toEqual([
    "amounts",
  ]);
  expect(reviewSummary(data, false)).toEqual(["1 beløp mangler"]);
  data.lines.find((line) => line.id === "unknown")!.amountOre = Ore.of(13000);
  // Now the lines sum to 41980 minus nothing missing: check reconcile agrees with the printed total.
  expect(reconcile(data).difference).toBe(0);
  expect(
    quickApproveData(data, false)?.lines.find((line) => line.id === "cheez")
      ?.issues,
  ).toEqual(data.lines.find((line) => line.id === "cheez")?.issues);
  expect(canAcceptReceipt(confirmSuggestedCategories(data), false)).toBe(true);

  const balanced = balanceWithAdjustment(
    { ...data, totalOre: Ore.of(42000) },
    "adj",
  );

  expect(reconcile(balanced).difference).toBe(0);
  expect(balanced.lines.at(-1)?.amountOre).toBe(20);
});

it("uses stable codes and preserves reader text independently of category confirmation", async () => {
  const { categoryUncertainIssue } = await import("./receipt-issues");
  const { parseReceipt } = await import("./receipt");
  const { assessReceipt } = await import("./receipt-review");
  const data = batteryFixture();
  present(data.lines[0]).issues = [
    categoryUncertainIssue,
    "Reader wording changed",
  ];
  const before = structuredClone(data);
  const parsed = parseReceipt(data);
  expect(parsed.kind).toBe("parsed");

  if (parsed.kind !== "parsed") throw new Error("Fixture must parse");
  expect(assessReceipt(parsed.receipt, false)).toMatchObject({
    acceptable: false,
    tasks: [{ kind: "line-issues" }],
  });
  expect(
    confirmLineCategory(present(data.lines[0]), "drinks.soft-drinks").issues,
  ).toEqual(["Reader wording changed"]);
  expect(data).toEqual(before);
});

it("parses structural invariants separately from approval", async () => {
  const { parseReceipt } = await import("./receipt");
  const incomplete = batteryFixture();
  present(incomplete.lines[0]).amountOre = null;
  expect(parseReceipt(incomplete).kind).toBe("parsed");
  expect(canAcceptReceipt(incomplete, false)).toBe(false);
  expect(parseReceipt({ ...incomplete, totalOre: 0.5 }).kind).toBe("rejected");
  expect(
    parseReceipt({
      ...incomplete,
      lines: [incomplete.lines[0], incomplete.lines[0]],
    }).kind,
  ).toBe("rejected");
  expect(parseReceipt({ ...incomplete, purchaseDate: "2026-02-30" }).kind).toBe(
    "rejected",
  );
  expect(parseReceipt({ unexpected: true }).kind).toBe("rejected");
});
