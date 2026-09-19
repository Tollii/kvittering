import { expect, it } from "vitest";
import {
  normalizeMeasureText,
  parseProductEvidence,
  removePackageText,
} from "./product-evidence";

it.each([
  ["Cola 6 x 500ml", [6], 500],
  ["Cola 500ml x 6", [6], 500],
  ["Cola 6pk 0,5l", [6], 500],
  ["Mel 1.5kg", [], 1500],
])(
  "reads package counts and decimal measures in %s",
  (name, counts, amount) => {
    const evidence = parseProductEvidence({ source: "receipt", name });
    expect(evidence.counts).toEqual(counts);
    expect(evidence.measures.map((value) => value.amount)).toEqual([amount]);
    expect(removePackageText(name).trim()).toBe(name.split(" ")[0]);
  },
);

it("preserves brand numbers while normalizing package measures", () => {
  expect(normalizeMeasureText("Vitamin B12 0,1kg")).toBe("Vitamin B12  100g ");

  const evidence = parseProductEvidence({
    source: "receipt",
    name: "9".repeat(20000) + " invalid 500ml",
  });

  expect(evidence.measures.map((value) => value.amount)).toEqual([500]);
  expect(evidence.counts).toEqual([]);
});
