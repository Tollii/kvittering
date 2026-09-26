import { present } from "../src/lib/testing/receipts";
import { expect, it } from "vitest";
import { batteryFixture } from "../src/lib/mock-receipts";
import { profileDecision, profileQuestions } from "./productAnalysisWorker";

it("interprets package answers and preserves unknown or incomplete evidence", () => {
  const context = {
    line: { ...present(batteryFixture().lines[0]), name: "Cola 10x330ml" },
    profile: null,
    families: [],
    catalog: null,
  };

  const before = structuredClone(context);
  const request = profileQuestions(context);
  expect(() => profileDecision(context, request.candidates, {})).toThrow(
    "Missing profile answer",
  );

  const unknown = { choice: "unknown", confidence: 0.5 };

  const answers = {
    family: unknown,
    count: unknown,
    measure: unknown,
    attribute_type: unknown,
    attribute_sugar: unknown,
    attribute_preparation: unknown,
  };

  expect(
    profileDecision(context, request.candidates, {
      ...answers,
      family: { choice: "new", confidence: 0.95 },
      count: { choice: "count_1", confidence: 0.95 },
      measure: { choice: "each_0", confidence: 0.95 },
    }),
  ).toMatchObject({
    family: "new",
    package: {
      unitsPerPackage: 10,
      measurePerPackage: { amount: 3300, unit: "ml" },
    },
  });

  expect(profileDecision(context, request.candidates, answers)).toMatchObject({
    family: null,
    package: { unitsPerPackage: null, measurePerPackage: null },
  });
  expect(context).toEqual(before);
});
