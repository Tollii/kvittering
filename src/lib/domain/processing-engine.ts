import { v, type Infer } from "convex/values";

/** Stored on receipts. "foundation" only appears on receipts read before the on-device engine was removed. */
export const processingEngineValidator = v.union(
  v.literal("gpt"),
  v.literal("foundation"),
);
export type ProcessingEngine = Infer<typeof processingEngineValidator>;
