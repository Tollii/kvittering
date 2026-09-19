import { productReferenceValidator } from "../src/lib/domain/product-reference";
import { productLinkUndoValidator } from "../src/lib/domain/product-linking";
import {
  policyValidator,
  storedPolicyValidator,
  platformValidator,
  channelValidator,
  clientValidator,
} from "../src/lib/releases/policy";
import { productAttributesValidator } from "../src/lib/domain/product-attributes";
import { correctionFields } from "../src/lib/domain/corrections";
import { lineValidator, receiptDataValidator } from "../src/lib/domain/receipt";
import { catalogDecision } from "../src/lib/catalog/decisions";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  catalogProductValidator,
  catalogRequestValidator,
  catalogResultValidator,
  physicalStoreValidator,
} from "../src/lib/catalog/model";
import { vEventId, vWorkflowId } from "@convex-dev/workflow";
import {
  packageProfileValidator,
  productAnalysisValidator,
} from "../src/lib/domain/product-families";

export const statusValidator = v.union(
  v.literal("uploading"),
  v.literal("uploaded"),
  v.literal("processing"),
  v.literal("needs_review"),
  v.literal("reviewed"),
  v.literal("failed"),
);

export const receiptFields = {
  householdId: v.id("households"),
  uploadedBy: v.string(),
  uploaderName: v.string(),
  clientId: v.string(),
  imageCount: v.number(),
  status: statusValidator,
  revision: v.number(),
  generation: v.number(),
  data: v.union(receiptDataValidator, v.null()),
  provider: v.string(),
  error: v.string().optional(),
  duplicateOf: v.id("receipts").optional(),
  duplicateResolved: v.boolean(),
  excluded: v.boolean(),
  autoAccepted: v.boolean().optional(),
  receiptReadyNotified: v.boolean().optional(),
  catalogStatus: v
    .union(v.literal("pending"), v.literal("complete"), v.literal("error"))
    .optional(),
  catalogWorkflowId: vWorkflowId.optional(),
  catalogDecisions: v.array(catalogDecision).optional(),
  productAnalysis: productAnalysisValidator.optional(),
  productLinkUndo: productLinkUndoValidator.optional(),
};

export default defineSchema({
  clientReleases: defineTable({
    identity: v.string(),
    installationId: v.string(),
    client: clientValidator,
    policyRevision: v.number(),
    lastSeen: v.number(),
  })
    .index("by_identity_and_installationId", ["identity", "installationId"])
    .index("by_lastSeen", ["lastSeen"]),
  featureFlags: defineTable({
    platform: platformValidator,
    channel: channelValidator,
    revision: v.number(),
    values: v.record(v.string(), v.boolean()),
  }).index("by_platform_and_channel", ["platform", "channel"]),
  featureFlagHistory: defineTable({
    platform: platformValidator,
    channel: channelValidator,
    revision: v.number(),
    previous: v.record(v.string(), v.boolean()),
    values: v.record(v.string(), v.boolean()),
    operator: v.string(),
    reason: v.string(),
  }),
  releasePolicies: defineTable(storedPolicyValidator).index(
    "by_platform_and_channel",
    ["platform", "channel"],
  ),
  releasePolicyHistory: defineTable({
    previous: policyValidator,
    policy: policyValidator,
    operator: v.string(),
    reason: v.string(),
  }),
  corrections: defineTable(correctionFields)
    .index("by_householdId", ["householdId"])
    .index("by_receiptId", ["receiptId"]),
  correctionBatches: defineTable({
    householdId: v.id("households"),
    correctionId: v.id("corrections"),
    undone: v.boolean(),
    changes: v.array(
      v.object({
        receiptId: v.id("receipts"),
        revision: v.number(),
        before: v.array(lineValidator),
      }),
    ),
  }).index("by_householdId", ["householdId"]),
  productFamilies: defineTable({
    householdId: v.id("households"),
    key: v.string(),
    name: v.string(),
    categoryId: v.string(),
    representative: v.object({
      name: v.string(),
      brand: v.union(v.string(), v.null()),
      attributes: v.array(v.string()),
    }),
  })
    .index("by_householdId_and_key", ["householdId", "key"])
    .index("by_householdId_and_categoryId", ["householdId", "categoryId"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["householdId"],
    }),
  productProfiles: defineTable({
    householdId: v.id("households"),
    key: v.string(),
    familyId: v.union(v.id("productFamilies"), v.null()),
    package: packageProfileValidator,
    attributes: productAttributesValidator.optional(),
    decisions: v.array(
      v.object({
        question: v.string(),
        choice: v.string(),
        confidence: v.number(),
      }),
    ),
  }).index("by_householdId_and_key", ["householdId", "key"]),
  catalogRequests: defineTable({
    key: v.string(),
    request: catalogRequestValidator,
    state: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("ready"),
      v.literal("error"),
    ),
    result: catalogResultValidator,
    fetchedAt: v.number().optional(),
    expiresAt: v.number(),
    attempts: v.number(),
    scheduledAt: v.number(),
    error: v.string().optional(),
  }).index("by_key", ["key"]),
  catalogProducts: defineTable({
    key: v.string(),
    product: catalogProductValidator,
    fetchedAt: v.number(),
    detailsFetchedAt: v.number().optional(),
  }).index("by_key", ["key"]),
  catalogStores: defineTable({
    externalId: v.number(),
    store: physicalStoreValidator,
    fetchedAt: v.number(),
  }).index("by_externalId", ["externalId"]),
  catalogRequestWaiters: defineTable({
    requestId: v.id("catalogRequests"),
    eventId: vEventId(),
  }).index("by_requestId", ["requestId"]),
  deviceSubscriptions: defineTable({
    identity: v.string(),
    householdId: v.id("households"),
    token: v.string(),
  })
    .index("by_token", ["token"])
    .index("by_identity", ["identity"]),
  products: defineTable({
    catalogKey: v.string().optional(),
    householdId: v.id("households"),
    retailer: v.string(),
    name: v.string(),
    brand: v.union(v.string(), v.null()),
    packageSize: v.union(v.number(), v.null()),
    packageUnit: v.union(v.string(), v.null()),
    attributes: v.array(v.string()),
  })
    .index("by_householdId_and_retailer", ["householdId", "retailer"])
    .index("by_householdId_and_retailer_and_catalogKey", [
      "householdId",
      "retailer",
      "catalogKey",
    ])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["householdId", "retailer"],
    }),
  productMappings: defineTable({
    revision: v.number().optional(),
    householdId: v.id("households"),
    retailer: v.string(),
    key: v.string(),
    productId: v.union(v.id("products"), v.null()),
    reference: productReferenceValidator.optional(),
    confirmedBy: v.union(v.string(), v.null()),
  }).index("by_householdId_and_retailer_and_key", [
    "householdId",
    "retailer",
    "key",
  ]),
  households: defineTable({
    name: v.string(),
    invitation: v.string(),
    /** Monthly product-spending budget in øre; unset means no budget. */
    monthlyBudgetOre: v.number().optional(),
  }).index("by_invitation", ["invitation"]),
  members: defineTable({
    householdId: v.id("households"),
    identity: v.string(),
    name: v.string(),
  })
    .index("by_identity", ["identity"])
    .index("by_householdId", ["householdId"]),
  receipts: defineTable(receiptFields)
    .index("by_householdId_and_purchaseDate", [
      "householdId",
      "data.purchaseDate",
    ])
    .index("by_householdId_and_status", ["householdId", "status"])
    .index("by_duplicateOf", ["duplicateOf"])
    .index("by_householdId", ["householdId"])
    .index("by_householdId_and_clientId", ["householdId", "clientId"]),
  images: defineTable({
    receiptId: v.id("receipts"),
    position: v.number(),
    storageId: v.id("_storage"),
    sha256: v.string(),
  })
    .index("by_receiptId", ["receiptId"])
    .index("by_receiptId_and_position", ["receiptId", "position"])
    .index("by_sha256", ["sha256"]),
  extractions: defineTable({
    receiptId: v.id("receipts"),
    generation: v.number(),
    data: receiptDataValidator,
    provider: v.string(),
    classifiedData: receiptDataValidator.optional(),
    durationMs: v.number().optional(),
  })
    .index("by_receiptId", ["receiptId"])
    .index("by_receiptId_and_generation", ["receiptId", "generation"]),
  revisions: defineTable({
    receiptId: v.id("receipts"),
    data: receiptDataValidator,
    editor: v.string(),
    revision: v.number(),
  }).index("by_receiptId", ["receiptId"]),
  aliases: defineTable({
    householdId: v.id("households"),
    key: v.string(),
    categoryId: v.string(),
    confirmedBy: v.string(),
  }).index("by_householdId_and_key", ["householdId", "key"]),
  /** Categories the household has approved, by store and receipt name. */
  categoryMemory: defineTable({
    householdId: v.id("households"),
    key: v.string(),
    categoryId: v.string(),
    confirmations: v.number(),
    confirmedBy: v.string(),
  }).index("by_householdId_and_key", ["householdId", "key"]),
});
