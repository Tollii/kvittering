import { present, receiptFixture } from "../testing/receipts";
import { expect, it } from "vitest";
import { catalogInsights } from "./insights";
import { productHistory } from "../domain/insights";
import { batteryFixture } from "../mock-receipts";
import { normalizeProducts } from "../../../convex/kassalapp/normalize";
import { catalogIdentity } from "./model";

it("groups a barcode across shops using receipt amounts and preserves uncatalogued spending", () => {
  const product = catalogIdentity(
    present(
      normalizeProducts({
        data: {
          id: 1,
          name: "Battery Original",
          ean: "7037710000001",
          brand: "Battery",
        },
      })[0],
    ),
  );

  const data = batteryFixture();
  present(data.lines[0]).catalogProduct = product;
  data.physicalStore = {
    id: 2,
    name: "KIWI Test",
    chain: "KIWI",
    address: "Test 2",
  };
  const first = receiptFixture({ _id: "first", data, excluded: false });

  const second = receiptFixture({
    _id: "second",
    data: { ...data, store: "MENY", physicalStore: null },
    excluded: false,
  });

  const unknown = receiptFixture({
    ...first,
    _id: "third",
    data: {
      ...data,
      lines: data.lines.map((line) => ({ ...line, catalogProduct: null })),
    },
  });

  const result = catalogInsights([
    first,
    second,
    unknown,
    { ...first, excluded: true },
  ]);

  expect(result.linked).toBe(2);
  expect(result.total).toBe(3);
  expect(result.products).toHaveLength(1);
  expect(present(result.products[0]).amountOre).toBe(4662);
  expect(present(result.brands[0]).amountOre).toBe(4662);
  expect(present(result.stores[0]).amountOre).toBe(4662);
  expect(present(productHistory([first, second])[0]).purchases.size).toBe(2);
});
