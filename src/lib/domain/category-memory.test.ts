import { expect, it } from "vitest";
import { weeklyShopFixture } from "./receipt";
import {
  applyCategoryMemory,
  categoryMemoryKey,
  categoryMemoryThreshold,
  learnableLine,
  recordCategoryDecision,
} from "./category-memory";

it("keys memory on store and receipt name only", () => {
  expect(categoryMemoryKey("REMA 1000", "tine  lettmelk 1l")).toBe(
    categoryMemoryKey("rema 1000", "TINE LETTMELK 1L"),
  );
  expect(categoryMemoryKey(null, "Melk")).toBeNull();
  expect(categoryMemoryKey("REMA 1000", " ")).toBeNull();
});

it("counts agreeing approvals and restarts on a correction", () => {
  const first = recordCategoryDecision(null, "dairy.milk");
  expect(first).toEqual({ categoryId: "dairy.milk", confirmations: 1 });
  expect(recordCategoryDecision(first, "dairy.milk")).toEqual({
    categoryId: "dairy.milk",
    confirmations: 2,
  });
  expect(recordCategoryDecision(first, "dairy.plant-milk")).toEqual({
    categoryId: "dairy.plant-milk",
    confirmations: 1,
  });
  expect(recordCategoryDecision(null, "dairy.milk", 3).confirmations).toBe(3);
});

it("learns only from settled product lines", () => {
  const data = weeklyShopFixture();
  const byId = (id: string) => data.lines.find((line) => line.id === id)!;
  expect(learnableLine(byId("milk"))).toBe(true);
  expect(learnableLine(byId("cheez"))).toBe(false); // still uncertain
  expect(learnableLine(byId("deposit"))).toBe(false);
  expect(
    learnableLine({ ...byId("milk"), categoryId: "fallback.unclear" }),
  ).toBe(false);
});

it("settles an uncertain line once memory is trusted, never a manual one", () => {
  const data = weeklyShopFixture();
  const cheez = data.lines.find((line) => line.id === "cheez")!;
  expect(
    applyCategoryMemory(cheez, {
      categoryId: "snacks.crisps",
      confirmations: categoryMemoryThreshold - 1,
    }),
  ).toBe(false);
  expect(cheez.issues).toContain("Kategorien er usikker.");
  expect(
    applyCategoryMemory(cheez, {
      categoryId: "snacks.crisps",
      confirmations: categoryMemoryThreshold,
    }),
  ).toBe(true);
  expect(cheez.issues).toEqual([]);
  expect(cheez.confidence).toBe(1);
  const manual = { ...cheez, manual: true, categoryId: "snacks.sweets" };
  expect(
    applyCategoryMemory(manual, {
      categoryId: "snacks.crisps",
      confirmations: 5,
    }),
  ).toBe(false);
  expect(manual.categoryId).toBe("snacks.sweets");
});

it("ignores memories and approvals for categories outside the current taxonomy", () => {
  const line = weeklyShopFixture().lines[0];
  const before = structuredClone(line);
  expect(
    applyCategoryMemory(line, {
      categoryId: "removed.category",
      confirmations: 2,
    }),
  ).toBe(false);
  expect(line).toEqual(before);
  expect(learnableLine({ ...line, categoryId: "removed.category" })).toBe(
    false,
  );
});
