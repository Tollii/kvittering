import { z } from "zod";

const modelRequest = z.object({
  state: z
    .looseObject({
      products: z
        .array(
          z.looseObject({
            catalogCandidates: z
              .array(z.looseObject({ alternativeNames: z.array(z.string()) }))
              .optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  questions: z.record(
    z.string(),
    z.looseObject({ type: z.string(), criteria: z.unknown().optional() }),
  ),
});

export type ModelRequest = z.infer<typeof modelRequest>;

/** Parse the JSON body a TypeSafe client sent to a stubbed `fetch`. */
export function readModelRequest(init: RequestInit | undefined): ModelRequest {
  return modelRequest.parse(JSON.parse(z.string().parse(init?.body)));
}

/** A TypeSafe choice answer, which gives every option a probability. */
export function choiceAnswer(
  question: ModelRequest["questions"][string] | undefined,
  choice: string,
  confidence: number,
) {
  const options = Object.keys(
    z.record(z.string(), z.unknown()).parse(question?.criteria),
  );

  return {
    type: "choice",
    choice,
    confidence,
    probabilities: Object.fromEntries(
      options.map((option) => [option, option === choice ? 1 : 0]),
    ),
  };
}
