import { classificationEvidenceValidator } from "./classification";
import { v } from "convex/values";
import { lineValidator } from "./receipt";

export const correctionFields = {
  householdId: v.id("households"),
  receiptId: v.id("receipts"),
  revision: v.number(),
  lineId: v.string(),
  store: v.union(v.string(), v.null()),
  name: v.string(),
  field: v.union(v.literal("category"), v.literal("catalog")),
  previous: v.union(v.string(), v.null()),
  expected: v.union(v.string(), v.null()),
  description: v.string().optional(),
  classificationEvidence: classificationEvidenceValidator.optional(),
  evidence: lineValidator,
};

export const correctionTarget = v.object({
  receiptId: v.id("receipts"),
  lineId: v.string(),
  revision: v.number(),
});
