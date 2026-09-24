import { oreValidator } from "../src/lib/domain/ore";
import { receiptStatusValidator } from "../src/lib/domain/receipt-state";
import { spendingTotalsValidator } from "../src/lib/domain/receipt-summary";
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

export const receiptFields = {
  householdId: v.id("households"),
  uploadedBy: v.string(),
  uploaderName: v.string(),
  clientId: v.string(),
  imageCount: v.number(),
  backgroundUpload: v.boolean().optional(),
  status: receiptStatusValidator,
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
  workflowJournals: defineTable({
    workflowId: vWorkflowId,
    component: v.union(v.literal("processing"), v.literal("analysis")),
    receiptId: v.id("receipts").optional(),
    expiresAt: v.number().optional(),
  })
    .index("by_component_and_workflowId", ["component", "workflowId"])
    .index("by_receiptId", ["receiptId"]),
  receiptReadModel: defineTable({
    name: v.literal("receipts-v1"),
    cursor: v.union(v.string(), v.null()),
    ready: v.boolean(),
  }).index("by_name", ["name"]),
  receiptSyncHeads: defineTable({
    householdId: v.id("households"),
    sequence: v.number(),
  }).index("by_householdId", ["householdId"]),
  receiptSummaries: defineTable({
    householdId: v.id("households"),
    receiptId: v.id("receipts"),
    sequence: v.number(),
    deleted: v.boolean(),
    createdAt: v.number(),
    status: statusValidator,
    store: v.union(v.string(), v.null()),
    purchaseDate: v.union(v.string(), v.null()),
    totalOre: v.union(v.number(), v.null()),
    spendingOre: v.number(),
    excluded: v.boolean(),
    totals: spendingTotalsValidator,
    categories: v.record(v.string(), v.number()),
  })
    .index("by_receiptId", ["receiptId"])
    .index("by_householdId_and_sequence", ["householdId", "sequence"])
    .index("by_householdId_and_purchaseDate", ["householdId", "purchaseDate"]),
  receiptDailyTotals: defineTable({
    householdId: v.id("households"),
    date: v.string(),
    totals: spendingTotalsValidator,
    categories: v.record(v.string(), v.number()),
  }).index("by_householdId_and_date", ["householdId", "date"]),
  receiptActivities: defineTable({
    identity: v.string(),
    householdId: v.id("households"),
    activityId: v.string(),
    environment: v.optional(
      v.union(v.literal("development"), v.literal("production")),
    ),
    receiptIds: v.array(v.id("receipts")),
    token: v.optional(v.string()),
    updatedAt: v.number(),
    expiresAt: v.number(),
    /** The scheduled expiry updates subscriptions; older registrations omit this field. */
    expired: v.optional(v.boolean()),
  })
    .index("by_activityId", ["activityId"])
    .index("by_identity", ["identity"])
    .index("by_householdId", ["householdId"]),
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
    payer: v
      .object({ identity: v.string(), householdId: v.id("households") })
      .optional(),
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
  })
    .index("by_key", ["key"])
    .index("by_state_and_expiresAt", ["state", "expiresAt"]),
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
  receiptReminders: defineTable({
    receiptId: v.id("receipts"),
    subscriptionId: v.id("deviceSubscriptions"),
    scheduledId: v.id("_scheduled_functions"),
  }).index("by_subscriptionId_and_receiptId", ["subscriptionId", "receiptId"]),
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
    monthlyBudgetOre: oreValidator.optional(),
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
    .index("by_householdId_and_status_and_excluded", [
      "householdId",
      "status",
      "excluded",
    ])
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
