import { expect, it } from "vitest";
import { emptyLine } from "../domain/receipt";
import { normalizeProducts } from "../../../convex/kassalapp/normalize";
import { selectCatalogMatch } from "./decisions";

it("accepts a named product without a receipt size at the 0.80 boundary", () => {
  const line = {
    ...emptyLine("pizza"),
    name: "BIGONE BBQ CHICKEN",
    brand: "BIGONE",
  };

  const products = normalizeProducts({
    data: [
      {
        id: 1,
        name: "BigOne Bbq Chicken 560g",
        ean: "7039010576581",
        weight: 560,
        weight_unit: "g",
      },
    ],
  });

  expect(selectCatalogMatch(line, products, [0.799]).productKey).toBeNull();
  expect(selectCatalogMatch(line, products, [0.8])).toMatchObject({
    productKey: products[0].key,
    reason: "model_match",
  });
});

it("refuses explicit variant and pack conflicts even with a high probability", () => {
  const line = {
    ...emptyLine("cola"),
    name: "COCA-COLA 10PK BX",
    packageSize: 10,
    packageUnit: "pk",
  };

  for (const name of ["Coca-Cola 15pk", "Coca-Cola Zero 10pk"]) {
    const products = normalizeProducts({ data: [{ id: 1, name, ean: "123" }] });
    expect(selectCatalogMatch(line, products, [0.99])).toMatchObject({
      productKey: null,
      reason: "conflict",
    });
  }
});

it("does not choose arbitrarily between plausible package sizes", () => {
  const line = { ...emptyLine("pizza"), name: "BigOne BBQ Chicken" };

  const products = normalizeProducts({
    data: [
      { id: 1, name: "BigOne BBQ Chicken 560g", ean: "111" },
      { id: 2, name: "BigOne BBQ Chicken 700g", ean: "222" },
    ],
  });

  expect(selectCatalogMatch(line, products, [0.9, 0.88])).toMatchObject({
    productKey: null,
    reason: "ambiguous",
  });
  expect(selectCatalogMatch(line, products, [0.2, 0.91]).productKey).toBe(
    products[1].key,
  );
});
