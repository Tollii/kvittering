import { present } from "../testing/receipts";
import { expect, it } from "vitest";
import {
  parseLegacyClassification,
  classificationEvidence,
} from "./classification";
import { classificationInputs } from "./receipt";
import { batteryFixture } from "../mock-receipts";

it("reads legacy evidence into the same checked object used by current classification", () => {
  const product = present(classificationInputs(batteryFixture())[0]);
  const before = structuredClone(product);
  expect(classificationEvidence(product)).toEqual(product.evidence);
  expect(
    parseLegacyClassification(
      JSON.stringify({
        ...product.evidence,
        irrelevant: "ignored",
        brand: null,
      }),
    ),
  ).toEqual(product.evidence);
  expect(product).toEqual(before);
  expect(() => parseLegacyClassification('{"name":42}')).toThrow(Error);
  expect(() =>
    parseLegacyClassification('{"name":"Milk","packageSize":"large"}'),
  ).toThrow(Error);
});
