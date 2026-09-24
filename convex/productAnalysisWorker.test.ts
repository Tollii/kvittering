import { present } from "../src/lib/testing/receipts";
import { expect, it } from "vitest";
import { batteryFixture } from "../src/lib/domain/receipt";
import { profileDecision, profileQuestions } from "./productAnalysisWorker";

it("scopes independent profile questions and rejects an incomplete response", () => {
  const context = {
    line: present(batteryFixture().lines[0]),
    profile: null,
    families: [],
    catalog: null,
  };

  const before = structuredClone(context);
  const request = profileQuestions(context, "items[2].");
  expect(JSON.stringify(request.questions)).toContain("items[2].product");
  expect(Object.keys(request.questions)).toHaveLength(6);
  expect(() => profileDecision(context, request.candidates, {})).toThrow(
    "Missing profile answer",
  );

  const answers = Object.fromEntries(
    Object.keys(request.questions).map((key) => [
      key,
      { choice: "unknown", confidence: 0.5 },
    ]),
  );

  expect(profileDecision(context, request.candidates, answers)).toMatchObject({
    family: null,
    package: { unitsPerPackage: null, measurePerPackage: null },
  });
  expect(context).toEqual(before);
});
