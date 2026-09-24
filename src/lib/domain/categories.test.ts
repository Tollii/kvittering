import { expect, it } from "vitest";
import {
  category,
  categoryOf,
  isDecidedCategory,
  parseCategoryId,
  unclearCategoryId,
} from "./categories";

it("parses current ids and maps merged legacy ids", () => {
  expect(parseCategoryId("drinks.soft-drinks")).toBe("drinks.soft-drinks");
  expect(parseCategoryId("drinks.energy-drinks")).toBe("drinks.soft-drinks");
  expect(parseCategoryId("not-a-category")).toBeNull();
  expect(parseCategoryId(null)).toBeNull();
});

it("reads unknown stored ids as unclear", () => {
  expect(categoryOf("not-a-category").id).toBe(unclearCategoryId);
  expect(categoryOf(undefined).name).toBe(category(unclearCategoryId).name);
  expect(categoryOf("drinks.energy-drinks").id).toBe("drinks.soft-drinks");
});

it("treats only known, specific categories as decided", () => {
  expect(isDecidedCategory("drinks.soft-drinks")).toBe(true);
  expect(isDecidedCategory(unclearCategoryId)).toBe(false);
  expect(isDecidedCategory("not-a-category")).toBe(false);
  expect(isDecidedCategory(null)).toBe(false);
});
