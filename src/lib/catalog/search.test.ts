import { expect, it } from "vitest";
import { productSearch } from "./search";
import { requestKey } from "./policy";
import { matchingKey } from "../domain/product-matching";
import { compatibleCatalogProduct } from "./matching";
import { emptyLine } from "../domain/receipt";
import { normalizeProducts } from "../../../convex/kassalapp/normalize";

it("uses the same identity and cached request for receipt spacing and Unicode variations", () => {
  const names = [
    "COCA-COLA10PK BX",
    "Coca-Cola 10 PK BX",
    "ＣＯＣＡ–ＣＯＬＡ１０ＰＫ\u00a0BX",
    "COCA-CO\u200BLA10PK BX",
  ];
  expect(names.map(productSearch)).toEqual(
    names.map(() => "coca-cola 10pk bx"),
  );
  expect(new Set(names.map(matchingKey)).size).toBe(1);
  expect(
    new Set(names.map((search) => requestKey({ kind: "products", search })))
      .size,
  ).toBe(1);
  expect(productSearch("Vitamin B12 100 G")).toBe("vitamin b12 100g");
  expect(productSearch("COLA0,5 L")).toBe("cola 0.5l");
});

it("recognizes glued multipack evidence without requiring GPT package fields", () => {
  const [pack, bottle] = normalizeProducts({
    data: [
      { id: 1, name: "Coca-Cola 10pk bx" },
      { id: 2, name: "Coca-Cola 330ml" },
    ],
  });
  const line = { ...emptyLine(), name: "COCA-COLA10PK BX" };
  expect(compatibleCatalogProduct(line, pack, true)).toBe(true);
  expect(compatibleCatalogProduct(line, bottle, true)).toBe(false);
  expect(line.name).toBe("COCA-COLA10PK BX");
});
