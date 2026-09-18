import { expect, it } from "vitest";
import { catalogInsights } from "./insights";
import { productHistory, type Receipt } from "../domain/insights";
import { batteryFixture } from "../domain/receipt";
import { normalizeProducts } from "../../../convex/kassalapp/normalize";
import { catalogIdentity } from "./model";
it("groups a barcode across shops using receipt amounts and preserves uncatalogued spending", () => {
  const product = catalogIdentity(
    normalizeProducts({
      data: {
        id: 1,
        name: "Battery Original",
        ean: "7037710000001",
        brand: "Battery",
      },
    })[0],
  );
  const data = batteryFixture();
  data.lines[0].catalogProduct = product;
  data.physicalStore = {
    id: 2,
    name: "KIWI Test",
    chain: "KIWI",
    address: "Test 2",
    latitude: null,
    longitude: null,
  };
  const first = { _id: "first", data, excluded: false } as Receipt;
  const second = {
    _id: "second",
    data: { ...data, store: "MENY", physicalStore: null },
    excluded: false,
  } as Receipt;
  const unknown = {
    ...first,
    _id: "third",
    data: {
      ...data,
      lines: data.lines.map((line) => ({ ...line, catalogProduct: null })),
    },
  } as Receipt;
  const result = catalogInsights([
    first,
    second,
    unknown,
    { ...first, excluded: true },
  ]);
  expect(result.linked).toBe(2);
  expect(result.total).toBe(3);
  expect(result.products).toHaveLength(1);
  expect(result.products[0].amountOre).toBe(4662);
  expect(result.brands[0].amountOre).toBe(4662);
  expect(result.stores[0].amountOre).toBe(4662);
  expect(productHistory([first, second])[0].purchases.size).toBe(2);
});
