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
  questions: z.record(z.string(), z.looseObject({ type: z.string() })),
});

export type ModelRequest = z.infer<typeof modelRequest>;

/** Parse the JSON body a TypeSafe client sent to a stubbed `fetch`. */
export function readModelRequest(init: RequestInit | undefined): ModelRequest {
  return modelRequest.parse(JSON.parse(z.string().parse(init?.body)));
}
