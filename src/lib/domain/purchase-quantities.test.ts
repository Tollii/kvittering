import { describe, expect, it } from "vitest";
import { batteryFixture } from "./receipt";
import {
  familyName,
  productProfileKey,
  purchaseEvidenceKey,
} from "./product-families";
import {
  normalizePurchase,
  packageCandidates,
  purchaseCandidates,
  quantityEvidence,
} from "./purchase-quantities";

const line = () => ({
  ...batteryFixture().lines[0],
  name: "COCA-COLA10PK BX",
  packageSize: null,
  packageUnit: null,
  quantity: 2,
  unit: "stk",
  catalogProduct: null,
});
describe("product families and purchased quantities", () => {
  it("keeps variants in family names and removes package notation", () => {
    expect(familyName(line())).toBe("COCA-COLA");
    expect(
      familyName({ ...line(), name: "Coca-Cola Zero 10 x 330ml Boks" }),
    ).toBe("Coca-Cola Zero");
  });
  it("finds glued pack counts and per-item and total measures without choosing their meaning", () => {
    const candidates = packageCandidates(
      quantityEvidence({
        ...line(),
        name: "COCA-COLA10PK BX 10x330ml",
        packageSize: 3.3,
        packageUnit: "l",
      }),
    );
    expect(candidates.counts).toContain(10);
    expect(candidates.measures).toEqual([
      { amount: 3300, unit: "ml" },
      { amount: 330, unit: "ml" },
    ]);
  });
  it("calculates two ten-packs as twenty cans and 6.6 litres without counting total pack size twice", () => {
    expect(
      normalizePurchase(
        {
          unitsPerPackage: 10,
          measurePerPackage: { amount: 3300, unit: "ml" },
        },
        { amount: 2, kind: "packages", source: "receipt" },
      ),
    ).toEqual({ packages: 2, units: 20, grams: null, millilitres: 6600 });
  });
  it("uses a weighed purchase without inventing a unit count", () => {
    const candidates = purchaseCandidates({
      ...line(),
      quantity: 0.75,
      unit: "kg",
    });
    const selected = candidates.find((candidate) => candidate.kind === "g")!;
    expect(
      normalizePurchase(
        { unitsPerPackage: null, measurePerPackage: null },
        selected,
      ),
    ).toEqual({ packages: null, units: null, grams: 750, millilitres: null });
  });
  it("preserves unknowns and converts individually counted items using the package ratio", () => {
    const profile = {
      unitsPerPackage: 10,
      measurePerPackage: { amount: 3300, unit: "ml" as const },
    };
    expect(normalizePurchase(profile, null).units).toBeNull();
    expect(
      normalizePurchase(profile, {
        amount: 2,
        kind: "units",
        source: "receipt",
      }),
    ).toEqual({ packages: null, units: 2, grams: null, millilitres: 660 });
    expect(
      normalizePurchase(profile, {
        amount: -1,
        kind: "packages",
        source: "refund",
      }).units,
    ).toBeNull();
  });
  it("reuses a product profile while invalidating changed purchase quantities", () => {
    const changed = { ...line(), quantity: 3 };
    expect(productProfileKey(changed)).toBe(productProfileKey(line()));
    expect(purchaseEvidenceKey(changed)).not.toBe(purchaseEvidenceKey(line()));
  });
});

it("does not copy size from a catalog product with a conflicting pack count", () => {
  const source = {
    ...line(),
    packageSize: 10,
    packageUnit: "pk",
    catalogProduct: {
      key: "wrong-pack",
      name: "Coca-Cola 330ml x 15pk",
      weight: 330,
      weightUnit: "ml",
    },
  };
  const evidence = quantityEvidence(source);
  expect(evidence.catalog.kind).toBe("pack-conflict");
  expect(packageCandidates(evidence).measures).toEqual([]);
  expect(packageCandidates(evidence).counts).toContain(10);
  expect(source.catalogProduct).not.toBeNull();
});

it("rejects conflicting BX package evidence without changing the source", () => {
  const source = {
    ...line(),
    name: "Cola 10BX",
    catalogProduct: { key: "other", name: "Cola 15BX 330ml" },
  };
  expect(packageCandidates(quantityEvidence(source)).measures).toEqual([]);
  expect(source.catalogProduct.name).toBe("Cola 15BX 330ml");
});

it("retains provenance and uncertain multiplier meaning in package evidence", async () => {
  const { parseProductEvidence } = await import("./product-evidence");
  const input = {
    source: "receipt" as const,
    name: "Gulrot 24x150g",
    packageSize: null,
  };
  const before = structuredClone(input);
  const evidence = parseProductEvidence(input);
  expect(evidence.counts).toEqual([24]);
  expect(evidence.ambiguousMultiplier).toBe(true);
  expect(evidence.source).toBe("receipt");
  expect(input).toEqual(before);
  expect(
    parseProductEvidence({ source: "receipt", name: "10PK" }).counts,
  ).toEqual(parseProductEvidence({ source: "receipt", name: "10 pk" }).counts);
  expect(
    parseProductEvidence({ source: "receipt", name: "Ukjent" }).measures,
  ).toEqual([]);
});
