import { choice, noul } from "@typesafe-ai/sdk";
import type { Experimental_DecisionModel } from "ai";
import { expect, it } from "vitest";
import { judgmentClient } from "./decisions";

type DecisionModelV4 = Extract<
  Experimental_DecisionModel,
  { doDecide: unknown }
>;

type DecideOptions = Parameters<DecisionModelV4["doDecide"]>[0];

function recordingModel(calls: DecideOptions[]): DecisionModelV4 {
  return {
    specificationVersion: "v4",
    provider: "test.decision",
    modelId: "recording",
    supportedQuestionTypes: ["choice", "boolean"],
    async doDecide(options) {
      calls.push(options);

      return {
        answers: {
          store: {
            type: "choice",
            choice: "rema",
            probabilities: { rema: 0.9, kiwi: 0.1 },
          },
          organic: { type: "boolean", probability: 0.2 },
          fresh: { type: "boolean", probability: 0.7 },
        },
        warnings: [],
      };
    },
  };
}

it("sends judgment state and criteria to the decision model as JSON", async () => {
  const calls: DecideOptions[] = [];

  const result = await judgmentClient(recordingModel(calls), {
    timeoutMs: 1000,
  }).systemOne({
    state: [{ name: "Melk" }],
    questions: {
      store: choice({ ask: "Which store?" }, { rema: "REMA 1000", kiwi: null }),
      organic: noul("Is it organic?", { true: "Labelled organic" }),
      fresh: noul("Is it fresh?"),
    },
  });

  expect(calls[0]?.state).toEqual([
    { type: "json", value: [{ name: "Melk" }] },
  ]);
  expect(calls[0]?.questions).toEqual({
    store: {
      type: "choice",
      instructions: { ask: "Which store?" },
      criteria: { rema: "REMA 1000", kiwi: null },
    },
    organic: {
      type: "boolean",
      instructions: "Is it organic?",
      criteria: { true: "Labelled organic" },
    },
    fresh: { type: "boolean", instructions: "Is it fresh?" },
  });
  expect(result.answers).toEqual({
    store: {
      type: "choice",
      choice: "rema",
      confidence: 0,
      probabilities: { rema: 0.9, kiwi: 0.1 },
    },
    organic: { type: "noul", noul: 0.2 },
    fresh: { type: "noul", noul: 0.7 },
  });
});
