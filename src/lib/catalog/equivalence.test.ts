import { present } from "../testing/receipts";
import { expect, it } from "vitest";
import { normalizeProducts } from "../../../convex/kassalapp/normalize";
import { emptyLine } from "../domain/receipt";
import {
  packageCandidates,
  quantityEvidence,
} from "../domain/purchase-quantities";
import { catalogIdentity } from "./model";
import { automaticCatalogProduct, compatibleCatalogProduct } from "./matching";
import { selectCatalogMatch } from "./decisions";
import { equivalentCatalogProduct, groupCatalogProducts } from "./equivalence";

const products = (names: string[]) =>
  normalizeProducts({
    data: names.map((name, index) => ({
      id: index + 1,
      name,
      ean: `703000000000${index}`,
      image: `https://example.com/${index}.png`,
    })),
  });

it("links interchangeable Crispi records as one group without importing package facts", () => {
  const candidates = products([
    "Salat Crispi",
    "Crispi Salat 150g",
    "Crispi Salat 150g pakke",
    "Crispi Salat 150g Flowpk",
    "Crispi Salat 150g Økologisk",
  ]);

  const groups = groupCatalogProducts(candidates);
  expect(groups).toHaveLength(2);
  const line = { ...emptyLine("salad"), name: "SALAT CRISPI" };
  const match = automaticCatalogProduct(line, groups)!;
  expect(match.equivalence?.candidateKeys).toHaveLength(4);
  expect(
    groupCatalogProducts([...candidates].reverse()).find(
      (group) => group.equivalence,
    ),
  ).toEqual(match);
  const identity = catalogIdentity(equivalentCatalogProduct(match));
  expect(identity).toMatchObject({
    name: "Crispi Salat",
    image: present(candidates[1]).image,
  });
  expect(identity.ean).toBeUndefined();
  expect(identity.weight).toBeUndefined();
  expect(identity.brand).toBeUndefined();
  expect(
    packageCandidates(quantityEvidence({ ...line, catalogProduct: identity }))
      .measures,
  ).toEqual([]);
  expect(
    packageCandidates(
      quantityEvidence({
        ...line,
        name: "SALAT CRISPI 150G",
        catalogProduct: identity,
      }),
    ).measures,
  ).toEqual([{ amount: 150, unit: "g" }]);
});

it("does not let missing size or brand connect conflicting groups", () => {
  const candidates = products([
    "Crispi Salat",
    "Crispi Salat 150g",
    "Crispi Salat 200g",
  ]);

  expect(groupCatalogProducts(candidates)).toHaveLength(3);

  const branded = candidates.map((product, index) => ({
    ...product,
    name: "Crispi Salat 150g",
    weight: 150,
    weightUnit: "g",
    brand: [undefined, "Gartner", "Bama"][index],
  }));

  expect(groupCatalogProducts(branded)).toHaveLength(3);
  expect(
    automaticCatalogProduct(
      { ...emptyLine("salad"), name: "Crispi Salat" },
      candidates,
    ),
  ).toBeNull();
});

it("keeps recipes, organic labels and explicit pack counts separate", () => {
  const candidates = products([
    "Coca-Cola 500ml",
    "Coca-Cola Zero 500ml",
    "Coca-Cola Light 500ml",
    "Coca-Cola 10x500ml",
    "Coca-Cola 15x500ml",
    "Coca-Cola Vanilla 500ml",
  ]);

  expect(groupCatalogProducts(candidates)).toHaveLength(candidates.length);
  const salad = products(["Crispi Salat 150g", "Crispi Salat 150g"]);
  present(salad[1]).labels = ["Økologisk"];
  expect(groupCatalogProducts(salad)).toHaveLength(2);
  expect(
    compatibleCatalogProduct(
      { ...emptyLine("s"), name: "Crispi Salat" },
      present(salad[1]),
    ),
  ).toBe(false);
});

it("accepts a supported group but preserves competing sizes and missing model answers", () => {
  const groups = groupCatalogProducts(
    products([
      "BigOne BBQ Chicken 560g",
      "BigOne BBQ Chicken 560g pose",
      "BigOne BBQ Chicken 700g",
    ]),
  );

  const line = { ...emptyLine("pizza"), name: "BigOne BBQ Chicken" };
  expect(selectCatalogMatch(line, groups, [0.9, 0.91]).productKey).toBeNull();
  expect(selectCatalogMatch(line, groups, [0.92, 0.2])).toMatchObject({
    productKey: present(groups[0]).key,
    reason: "equivalent_match",
    equivalentKeys: present(groups[0]).equivalence?.candidateKeys,
  });
  expect(selectCatalogMatch(line, groups, [null, null]).productKey).toBeNull();
  expect(
    selectCatalogMatch(
      { ...line, packageSize: 700, packageUnit: "g" },
      groups,
      [0.99, 0.2],
    ).productKey,
  ).toBeNull();
});

it("does not group generic names or conflicting catalog measurements", () => {
  expect(groupCatalogProducts(products(["Agurk", "Agurk"]))).toHaveLength(2);
  const candidates = products(["Crispi Salat 150g", "Crispi Salat 150g"]);
  present(candidates[1]).weight = 200;
  present(candidates[1]).weightUnit = "g";
  expect(groupCatalogProducts(candidates)).toHaveLength(2);
});
