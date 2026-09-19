import { expect, it } from "vitest";
import { broaderProductSearch, productSearch } from "./search";
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

it("recognizes glued multipack evidence and keeps missing counts unknown", () => {
  const [pack, bottle] = normalizeProducts({
    data: [
      { id: 1, name: "Coca-Cola 10pk bx" },
      { id: 2, name: "Coca-Cola 330ml" },
    ],
  });
  const line = { ...emptyLine(), name: "COCA-COLA10PK BX" };
  expect(compatibleCatalogProduct(line, pack)).toBe(true);
  expect(compatibleCatalogProduct(line, bottle)).toBe(true);
  expect(line.name).toBe("COCA-COLA10PK BX");
});

it.each([
  ["CHEEZ DOODLES XL", "cheez doodles"],
  ["Coca-Cola 500ml", "coca-cola"],
  ["Coca-Cola Zero 10PK BX", "coca-cola zero"],
  ["Vitamin B12 100 G", "vitamin b12"],
  ["Jordan Individual", null],
  ["Milk 1L", null],
  ["500ml 10pk", null],
])(
  "broadens %s without discarding brand numbers or flavour",
  (name, expected) => {
    expect(broaderProductSearch(name)).toBe(expected);
  },
);
