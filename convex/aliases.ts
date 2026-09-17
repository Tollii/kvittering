import { v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import { aliasKey } from '../src/lib/domain/receipt';
/** Apply a confirmed exact match in bounded batches. Item-only corrections keep their category. */
export const applyToMatching = internalMutation({
	args: { householdId: v.id('households'), key: v.string(), cursor: v.union(v.string(), v.null()) },
	returns: v.null(),
	handler: async (ctx, args) => {
		const alias = await ctx.db
			.query('aliases')
			.withIndex('by_householdId_and_key', (q) =>
				q.eq('householdId', args.householdId).eq('key', args.key)
			)
			.unique();
		if (!alias) return null;
		const page = await ctx.db
			.query('receipts')
			.withIndex('by_householdId', (q) => q.eq('householdId', args.householdId))
			.paginate({ cursor: args.cursor, numItems: 10 });
		for (const receipt of page.page) {
			if (!receipt.data) continue;
			let changed = false;
			const data = structuredClone(receipt.data);
			for (const line of data.lines) {
				if (line.kind !== 'product' || aliasKey(data, line) !== args.key) continue;
				const categoryId = line.manual ? line.categoryId : alias.categoryId;
				if (line.productKey !== args.key || line.categoryId !== categoryId) {
					line.productKey = args.key;
					line.categoryId = categoryId;
					changed = true;
				}
			}
			if (changed) {
				await ctx.db.insert('revisions', {
					receiptId: receipt._id,
					data: receipt.data,
					editor: alias.confirmedBy,
					revision: receipt.revision
				});
				await ctx.db.patch('receipts', receipt._id, { data, revision: receipt.revision + 1 });
			}
		}
		if (!page.isDone)
			await ctx.scheduler.runAfter(0, internal.aliases.applyToMatching, {
				...args,
				cursor: page.continueCursor
			});
		return null;
	}
});
