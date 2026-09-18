import { v, type Infer } from "convex/values";

export const processingEngineValidator = v.union(
  v.literal("gpt"),
  v.literal("foundation"),
);
export type ProcessingEngine = Infer<typeof processingEngineValidator>;
export const processingEngineName = (engine: ProcessingEngine) =>
  engine === "foundation" ? "Foundation Models" : "GPT";
export const foundationResultValidator = v.object({
  extraction: v.string(),
  classifications: v.array(
    v.object({
      id: v.string(),
      categoryId: v.string(),
      uncertain: v.boolean(),
    }),
  ),
  durationMs: v.number(),
  systemVersion: v.string(),
});
export type FoundationResult = Infer<typeof foundationResultValidator>;
