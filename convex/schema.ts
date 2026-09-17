import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { receiptDataValidator } from '../src/lib/domain/receipt';
export const statusValidator = v.union(
	v.literal('uploading'),
	v.literal('uploaded'),
	v.literal('processing'),
	v.literal('needs_review'),
	v.literal('reviewed'),
	v.literal('failed')
);
export const receiptFields = {
	householdId: v.id('households'),
	uploadedBy: v.string(),
	uploaderName: v.string(),
	clientId: v.string(),
	imageCount: v.number(),
	status: statusValidator,
	revision: v.number(),
	generation: v.number(),
	data: v.union(receiptDataValidator, v.null()),
	provider: v.string(),
	error: v.union(v.string(), v.null()),
	duplicateOf: v.union(v.id('receipts'), v.null()),
	duplicateResolved: v.boolean(),
	excluded: v.boolean()
};
export default defineSchema({
	products: defineTable({
		householdId: v.id('households'),
		retailer: v.string(),
		name: v.string(),
		brand: v.union(v.string(), v.null()),
		packageSize: v.union(v.number(), v.null()),
		packageUnit: v.union(v.string(), v.null()),
		attributes: v.array(v.string())
	})
		.index('by_householdId_and_retailer', ['householdId', 'retailer'])
		.searchIndex('search_name', { searchField: 'name', filterFields: ['householdId', 'retailer'] }),
	productMappings: defineTable({
		householdId: v.id('households'),
		retailer: v.string(),
		key: v.string(),
		productId: v.union(v.id('products'), v.null()),
		confirmedBy: v.union(v.string(), v.null())
	}).index('by_householdId_and_retailer_and_key', ['householdId', 'retailer', 'key']),
	samples: defineTable({ name: v.string(), description: v.string() }).index('by_name', ['name']),
	households: defineTable({ name: v.string(), invitation: v.string() }).index('by_invitation', [
		'invitation'
	]),
	members: defineTable({ householdId: v.id('households'), identity: v.string(), name: v.string() })
		.index('by_identity', ['identity'])
		.index('by_householdId', ['householdId']),
	receipts: defineTable(receiptFields)
		.index('by_duplicateOf', ['duplicateOf'])
		.index('by_householdId', ['householdId'])
		.index('by_householdId_and_clientId', ['householdId', 'clientId']),
	images: defineTable({
		receiptId: v.id('receipts'),
		position: v.number(),
		storageId: v.id('_storage'),
		sha256: v.string()
	})
		.index('by_receiptId', ['receiptId'])
		.index('by_receiptId_and_position', ['receiptId', 'position'])
		.index('by_sha256', ['sha256']),
	extractions: defineTable({
		receiptId: v.id('receipts'),
		generation: v.number(),
		data: receiptDataValidator,
		provider: v.string()
	})
		.index('by_receiptId', ['receiptId'])
		.index('by_receiptId_and_generation', ['receiptId', 'generation']),
	revisions: defineTable({
		receiptId: v.id('receipts'),
		data: receiptDataValidator,
		editor: v.string(),
		revision: v.number()
	}).index('by_receiptId', ['receiptId']),
	aliases: defineTable({
		householdId: v.id('households'),
		key: v.string(),
		categoryId: v.string(),
		confirmedBy: v.string()
	}).index('by_householdId_and_key', ['householdId', 'key'])
});
