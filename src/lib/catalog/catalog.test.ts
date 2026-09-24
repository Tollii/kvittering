import { present } from "../testing/receipts";
import { expect, it } from "vitest";
import { parse } from "convex-helpers/validators";
import {
  normalizeProducts,
  normalizePrices,
  normalizeStores,
} from "../../../convex/kassalapp/normalize";
import {
  compatibleCatalogProduct,
  exactPhysicalStore,
  productSearch,
  automaticCatalogProduct,
  rankCatalogProducts,
} from "./matching";
import { emptyLine } from "../domain/receipt";
import { requestKey, resultLifetime, day } from "./policy";
import { catalogProductValidator, emptyCatalogResult } from "./model";

it("parses missing and null provider metadata into optional catalog fields", () => {
  const products = normalizeProducts({
    data: [
      { id: 1, name: "Fresh baguette" },
      { id: 2, name: "Fresh baguette", brand: null, weight: null, image: null },
    ],
  });

  expect(products).toHaveLength(2);

  for (const product of products) {
    expect(parse(catalogProductValidator, product)).toEqual(product);
    expect(product.brand).toBeUndefined();
    expect(product.weight).toBeUndefined();
    expect(product.image).toBeUndefined();
  }

  expect(() =>
    parse(catalogProductValidator, { ...present(products[0]), brand: null }),
  ).toThrow(Error);
});

it("combines listings with the same EAN while retaining distinct variants and unknown barcodes", () => {
  const products = normalizeProducts({
    data: [
      { id: 1, name: "Stratos 150 g", ean: "7037710000001" },
      {
        id: 2,
        name: "Stratos 150g Nidar",
        ean: "7037710000001",
        ingredients: "Kakao",
        image: "https://example.com/product.png",
      },
      { id: 3, name: "Stratos 150 g", ean: "7037710000002" },
      { id: 4, name: "Stratos 150 g", ean: null },
      { id: 5, name: "Stratos 150 g", ean: null },
    ],
  });

  expect(products).toHaveLength(4);
  expect(products[0]).toMatchObject({
    ids: [1, 2],
    ingredients: "Kakao",
    image: "https://example.com/product.png",
  });
  expect(present(products[2]).key).not.toBe(present(products[3]).key);
});

it("rejects conflicting size, brand and sugar-free variants", () => {
  const product = present(
    normalizeProducts({
      data: {
        id: 1,
        name: "Cola Zero",
        brand: "Example",
        weight: 500,
        weight_unit: "ml",
      },
    })[0],
  );

  const line = { ...emptyLine(), name: "Cola Zero 50cl", brand: "Example" };
  expect(compatibleCatalogProduct(line, product)).toBe(true);
  expect(
    compatibleCatalogProduct({ ...line, name: "Cola Zero 1l" }, product),
  ).toBe(false);
  expect(
    compatibleCatalogProduct({ ...line, name: "Cola 50cl" }, product),
  ).toBe(false);
  expect(compatibleCatalogProduct({ ...line, brand: "Other" }, product)).toBe(
    false,
  );
  expect(
    compatibleCatalogProduct({ ...line, name: "Cola Zero" }, product),
  ).toBe(true);
});

it("normalizes searches and caches genuine empty results", () => {
  expect(productSearch("  STRATOS   150G ")).toBe("stratos 150g");
  expect(productSearch("COCA-COLA10PK BX")).toBe("coca-cola 10pk bx");
  expect(requestKey({ kind: "products", search: " Stratos  SPRØTT " })).toBe(
    requestKey({ kind: "products", search: "stratos sprøtt" }),
  );
  expect(
    resultLifetime(
      { kind: "products", search: "baguette" },
      emptyCatalogResult(),
    ),
  ).toBe(7 * day);
});

it("links ordinary Coca-Cola by receipt text even when Light is the first search result", () => {
  const products = normalizeProducts({
    data: [
      { id: 1, name: "Coca-Cola Light 500ml Flaske", ean: "5000112595567" },
      { id: 2, name: "Coca-Cola 500ml Flaske", ean: "5000112636833" },
      {
        id: 3,
        name: "Coca-Cola uten Sukker 500ml Flaske X 24",
        ean: "5000112636840",
      },
      { id: 4, name: "Coca-Cola 1.5l Flaske", ean: "5000112636871" },
    ],
  });

  const line = { ...emptyLine(), name: "COCA-COLA 500ML" };
  expect(present(rankCatalogProducts(line.name, products)[0]).product.key).toBe(
    present(products[1]).key,
  );
  expect(automaticCatalogProduct(line, products)?.key).toBe(
    present(products[1]).key,
  );
  expect(
    automaticCatalogProduct({ ...line, name: "Coca Cola 0,5L" }, products)?.key,
  ).toBe(present(products[1]).key);
  expect(compatibleCatalogProduct(line, present(products[0]))).toBe(false);
  expect(
    automaticCatalogProduct(line, [present(products[0]), present(products[2])]),
  ).toBeNull();
  expect(
    automaticCatalogProduct(line, [
      ...products,
      { ...present(products[1]), key: "ean:12345678", ean: "12345678" },
    ]),
  ).toBeNull();
});

it("links the only compatible product when package evidence agrees and additions are neutral", () => {
  const products = normalizeProducts({
    data: [
      { id: 1, name: "Battery Whirl Sugar 0,5l boks", ean: "7310865000001" },
      { id: 2, name: "Battery Whirl Zero 0,5l boks", ean: "7310865000002" },
    ],
  });

  const line = { ...emptyLine(), name: "BATTERY WHIRL" };
  expect(automaticCatalogProduct(line, products)?.key).toBe(
    present(products[0]).key,
  );
  // A second size makes the receipt ambiguous again.
  expect(
    automaticCatalogProduct(line, [
      ...products,
      ...normalizeProducts({
        data: [
          {
            id: 3,
            name: "Battery Whirl Sugar 0,33l boks",
            ean: "7310865000003",
          },
        ],
      }),
    ]),
  ).toBeNull();

  const cola = normalizeProducts({
    data: [
      { id: 4, name: "Coca-Cola 330ml Sleek X 10pk bx", ean: "5449000000001" },
      {
        id: 5,
        name: "Coca-Cola uten Sukker 330ml Sleek X 10pk bx",
        ean: "5449000000002",
      },
    ],
  });

  expect(
    automaticCatalogProduct({ ...line, name: "COCA-COLA10PK BX" }, cola)?.key,
  ).toBe(present(cola[0]).key);
});

it("does not let an exact name hide an unresolved size or pack alternative", () => {
  const line = { ...emptyLine(), name: "Battery Whirl" };

  const products = normalizeProducts({
    data: [
      {
        id: 1,
        name: "Battery Whirl",
        ean: "7310865000001",
        weight: 500,
        weight_unit: "ml",
      },
      { id: 2, name: "Battery Whirl 330ml", ean: "7310865000002" },
      { id: 3, name: "Battery Whirl X 24", ean: "7310865000003" },
    ],
  });

  expect(automaticCatalogProduct(line, products.slice(0, 2))).toBeNull();
  expect(
    automaticCatalogProduct(line, [present(products[0]), present(products[2])]),
  ).toBeNull();
  expect(automaticCatalogProduct(line, [present(products[2])])).toBeNull();
  expect(compatibleCatalogProduct(line, present(products[2]))).toBe(true);
  expect(
    compatibleCatalogProduct(
      { ...line, packageSize: 10, packageUnit: "pk" },
      present(products[2]),
    ),
  ).toBe(false);
});

it("keeps the original variant evidence after broader retrieval", () => {
  const products = normalizeProducts({
    data: [
      { id: 1, name: "Cheez Doodles 120g", brand: "OLW", ean: "7310865000001" },
    ],
  });

  expect(
    automaticCatalogProduct(
      { ...emptyLine(), name: "CHEEZ DOODLES XL" },
      products,
    ),
  ).toBeNull();
});

it("keeps multipacks, flavours, generic fresh food and missing package evidence distinct", () => {
  const products = normalizeProducts({
    data: [
      { id: 1, name: "Coca-Cola 500ml Flaske X 24" },
      { id: 2, name: "Coca-Cola Vanilla 500ml" },
      { id: 3, name: "Agurk" },
      { id: 4, name: "Coca-Cola 330ml Sleek X 10pk bx" },
    ],
  });

  const line = { ...emptyLine(), name: "COCA-COLA 500ML" };
  expect(compatibleCatalogProduct(line, present(products[0]))).toBe(true);
  expect(automaticCatalogProduct(line, products)).toBeNull();
  expect(
    automaticCatalogProduct({ ...line, name: "Agurk" }, products),
  ).toBeNull();
  expect(
    automaticCatalogProduct({ ...line, name: "Husets tacobaguette" }, products),
  ).toBeNull();
  expect(
    compatibleCatalogProduct(
      { ...line, name: "COCA-COLA10PK BX", packageSize: 10, packageUnit: "pk" },
      present(products[3]),
    ),
  ).toBe(true);
});

const stratosLine = {
  ...emptyLine("stratos"),
  name: "STRATOS SPRØTT",
  receiptName: "STRATOS SPRØTT",
  brand: "Stratos",
};

const stratosProducts = normalizeProducts({
  data: [
    {
      id: 224863,
      name: "Stratos Helt Sprøtt 150g Nidar",
      brand: "Stratos",
      ean: "7037710021424",
      weight: 150,
      weight_unit: "g",
    },
    {
      id: 227185,
      name: "Stratos Helt sprøtt 150 g",
      brand: "Stratos",
      weight: 150,
      weight_unit: "g",
    },
  ],
});

it("links a single compatible barcode supported by brand and product words", () => {
  expect(automaticCatalogProduct(stratosLine, stratosProducts)?.key).toBe(
    "ean:7037710021424",
  );
  expect(
    automaticCatalogProduct(stratosLine, [...stratosProducts].reverse())?.key,
  ).toBe("ean:7037710021424");
});

it.each(["Stratos Helt Sprøtt 200g", "Stratos Helt Sprøtt Hvit 150g"])(
  "keeps a second barcode unresolved: %s",
  (name) => {
    const alternatives = normalizeProducts({
      data: [{ id: 3, name, brand: "Stratos", ean: "7037710000002" }],
    });

    expect(
      automaticCatalogProduct(stratosLine, [
        ...stratosProducts,
        ...alternatives,
      ]),
    ).toBeNull();
  },
);

it.each([
  { name: "STRATOS 150G" },
  { name: "STRATOS PEANØTT" },
  { name: "STRATOS SPRØTT 200G" },
  { name: "STRATOS SPRØTT 2PK" },
  { name: "STRATOS SPRØTT ZERO" },
  { name: "STRATOS SPRØTT", brand: "Freia" },
])("does not infer identity from one search result: %j", (evidence) => {
  const line = { ...stratosLine, ...evidence, receiptName: evidence.name };
  expect(
    automaticCatalogProduct(line, [present(stratosProducts[0])]),
  ).toBeNull();
});

it("requires a barcode for a branded match with additional catalog words", () => {
  expect(
    automaticCatalogProduct(stratosLine, [present(stratosProducts[1])]),
  ).toBeNull();
});

it("requires a unique branch match and keeps price data separate from product identity", () => {
  const stores = normalizeStores({
    data: [
      {
        id: 1,
        name: "KIWI Majorstuen",
        address: "Test 1",
        position: { lat: "59.9", lng: "10.7" },
      },
    ],
  });

  expect(exactPhysicalStore("Majorstuen", stores)?.id).toBe(1);
  expect(
    exactPhysicalStore("Majorstuen", [
      ...stores,
      { ...present(stores[0]), id: 2 },
    ]),
  ).toBeNull();

  const result = normalizePrices({
    data: {
      products: [
        { store: { name: "KIWI" }, current_price: 29.9 },
        {
          store: { name: "MENY" },
          current_price: { price: 32.5, date: "2026-09-18" },
        },
      ],
    },
  });

  expect(result.prices.map((item) => item.priceOre)).toEqual([2990, 3250]);
  expect(result.products).toEqual([]);
});

it("recovers an omitted weight unit only from an explicit, consistent product name", () => {
  const result = normalizeProducts({
    data: [
      { id: 1, name: "Stratos 150g Nidar", weight: 150, weight_unit: null },
      { id: 2, name: "Stratos 150g Nidar", weight: 200, weight_unit: null },
    ],
  });

  expect(result[0]).toMatchObject({ weight: 150, weightUnit: "g" });
  expect(present(result[1]).weightUnit).toBeUndefined();
});
