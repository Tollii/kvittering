import { present, receiptFixture, testId } from "../testing/receipts";
import { Ore } from "./ore";
import { expect, it } from "vitest";
import {
  matchingKey,
  compatibleProduct,
  similarProducts,
} from "./product-matching";
import { emptyLine, batteryFixture } from "./receipt";
import { productHistory } from "./insights";

it("normalizes formatting while preserving flavour, size and zero", () => {
  expect(matchingKey("  PEPSI   Max ZERO  0,5L ")).toBe("pepsi max zero 0.5l");
  expect(matchingKey("Battery Orange")).not.toBe(
    matchingKey("Battery Original"),
  );
});

it("rejects conflicting sizes, brands and zero variants before semantic matching", () => {
  const product = {
    ...emptyLine(),
    name: "Cola Zero",
    brand: "Brand",
    packageSize: 500,
    packageUnit: "ml",
  };

  expect(
    compatibleProduct(product, {
      ...product,
      packageSize: 1,
      packageUnit: "l",
    }),
  ).toBe(false);
  expect(
    compatibleProduct(product, {
      ...product,
      packageSize: 0.5,
      packageUnit: "l",
    }),
  ).toBe(true);
  expect(compatibleProduct(product, { ...product, name: "Cola" })).toBe(false);
  expect(compatibleProduct(product, { ...product, brand: "Another" })).toBe(
    false,
  );
  expect(compatibleProduct(product, { ...product, packageSize: null })).toBe(
    true,
  );
  expect(
    similarProducts(product, [{ ...product, packageSize: 1000 }, product]),
  ).toEqual([product]);
});

it("groups linked products across receipt descriptions and keeps unknown items separate", () => {
  const data = batteryFixture();
  const id = testId<"products">("product-id");
  present(data.lines[0]).productId = id;
  present(data.lines[0]).productName = "Battery Remix";
  const first = receiptFixture({ _id: "first", data });

  const second = receiptFixture({
    ...first,
    _id: "second",
    data: {
      ...data,
      totalOre: Ore.of(3131),
      lines: data.lines.map((l) => ({
        ...l,
        name: l.id === "battery" ? "BAT REMIX" : l.name,
        amountOre: l.id === "battery" ? Ore.of(3190) : l.amountOre,
      })),
    },
  });

  const history = productHistory([first, second]);
  expect(history).toHaveLength(1);
  expect(present(history[0]).purchases.size).toBe(2);
  expect(present(history[0]).amountOre).toBe(5262);
  expect(present(history[0]).name).toBe("Battery Remix");
  expect(present(history[0]).contributions.map((c) => c.amountOre)).toEqual([
    2331, 2931,
  ]);

  const separate = {
    ...second,
    data: {
      ...second.data!,
      lines: second.data!.lines.map((l) => ({ ...l, productId: null })),
    },
  };

  expect(productHistory([first, separate])).toHaveLength(2);
});

it("keeps missing pack counts eligible but rejects explicit count differences", () => {
  const unknown = { ...emptyLine(), name: "Big Beef Burger" };
  const pair = { ...unknown, name: "Big Beef Burger 2x180g" };
  expect(compatibleProduct(unknown, pair)).toBe(true);
  expect(compatibleProduct(pair, unknown)).toBe(true);
  expect(
    compatibleProduct(pair, { ...unknown, name: "Big Beef Burger 4x180g" }),
  ).toBe(false);
  expect(
    compatibleProduct(pair, { ...unknown, packageSize: 1, packageUnit: "pk" }),
  ).toBe(false);
});

it.each([
  [50, "cl"],
  [5, "dl"],
])("matches %s %s to 500 ml", (packageSize, packageUnit) => {
  const item = {
    ...emptyLine("item"),
    name: "Cola",
    packageSize: 500,
    packageUnit: "ml",
  };

  expect(compatibleProduct(item, { ...item, packageSize, packageUnit })).toBe(
    true,
  );
});
