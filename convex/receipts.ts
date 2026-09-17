import { v } from 'convex/values';
import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { query, mutation, internalQuery, internalMutation } from './_generated/server';
import { internal } from './_generated/api';
import schema from './schema';
import { requireMember, requireReceipt } from './access';
import {
	receiptDataValidator,
	validateReceipt,
	reconcile,
	aliasKey
} from '../src/lib/domain/receipt';
import { start } from '@convex-dev/workflow';
export const list = query({
	args: { paginationOpts: paginationOptsValidator },
	returns: paginationResultValidator(schema.doc('receipts')),
	handler: async (ctx, args) => {
		const member = await requireMember(ctx);
		return ctx.db
			.query('receipts')
			.withIndex('by_householdId', (q) => q.eq('householdId', member.householdId))
			.order('desc')
			.paginate(args.paginationOpts);
	}
});
export const detail = query({
	args: { id: v.id('receipts') },
	returns: v.object({
		receipt: schema.doc('receipts'),
		images: v.array(schema.doc('images')),
		extractions: v.array(schema.doc('extractions'))
	}),
	handler: async (ctx, { id }) => {
		const { receipt } = await requireReceipt(ctx, id);
		return {
			receipt,
			images: await ctx.db
				.query('images')
				.withIndex('by_receiptId', (q) => q.eq('receiptId', id))
				.take(8),
			extractions: await ctx.db
				.query('extractions')
				.withIndex('by_receiptId', (q) => q.eq('receiptId', id))
				.order('desc')
				.take(10)
		};
	}
});
export const reserve = mutation({
	args: { clientId: v.string(), imageCount: v.number(), householdId: v.id('households') },
	returns: v.id('receipts'),
	handler: async (ctx, args) => {
		const member = await requireMember(ctx);
		if (member.householdId !== args.householdId)
			throw new Error('Husstanden er endret. Logg inn på nytt.');
		if (
			!/^[\w-]{16,80}$/.test(args.clientId) ||
			!Number.isInteger(args.imageCount) ||
			args.imageCount < 1 ||
			args.imageCount > 8
		)
			throw new Error('Ugyldig opplasting.');
		const existing = await ctx.db
			.query('receipts')
			.withIndex('by_householdId_and_clientId', (q) =>
				q.eq('householdId', member.householdId).eq('clientId', args.clientId)
			)
			.unique();
		if (existing) return existing._id;
		return ctx.db.insert('receipts', {
			householdId: member.householdId,
			uploadedBy: member.identity,
			uploaderName: member.name,
			clientId: args.clientId,
			imageCount: args.imageCount,
			status: 'uploading',
			revision: 0,
			generation: 0,
			data: null,
			provider: 'pending',
			error: null,
			duplicateOf: null,
			duplicateResolved: false,
			excluded: false
		});
	}
});
export const completeUpload = mutation({
	args: { id: v.id('receipts') },
	returns: v.null(),
	handler: async (ctx, { id }) => {
		const { receipt } = await requireReceipt(ctx, id);
		if (receipt.status !== 'uploading') return null;
		const images = await ctx.db
			.query('images')
			.withIndex('by_receiptId', (q) => q.eq('receiptId', id))
			.take(8);
		if (images.length !== receipt.imageCount) throw new Error('Noen bilder er ikke lastet opp.');
		await ctx.db.patch('receipts', id, { status: 'uploaded', generation: 1 });
		await start(ctx, internal.processing.processReceipt, { id, generation: 1 });
		return null;
	}
});
export const retry = mutation({
	args: { id: v.id('receipts') },
	returns: v.null(),
	handler: async (ctx, { id }) => {
		const { receipt } = await requireReceipt(ctx, id);
		if (['processing', 'uploaded', 'uploading'].includes(receipt.status))
			throw new Error('Kvitteringen behandles allerede.');
		const generation = receipt.generation + 1;
		await ctx.db.patch('receipts', id, { status: 'uploaded', generation, error: null });
		await start(ctx, internal.processing.processReceipt, { id, generation });
		return null;
	}
});
export const save = mutation({
	args: {
		id: v.id('receipts'),
		revision: v.number(),
		data: receiptDataValidator,
		reviewed: v.boolean(),
		rememberLineIds: v.array(v.string()),
		duplicateResolved: v.boolean(),
		excluded: v.boolean()
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { member, receipt } = await requireReceipt(ctx, args.id);
		if (receipt.revision !== args.revision)
			throw new Error('Kvitteringen ble endret av en annen. Åpne den på nytt.');
		if (
			receipt.status === 'processing' ||
			receipt.status === 'uploaded' ||
			receipt.status === 'uploading'
		)
			throw new Error('Vent til behandlingen er ferdig.');
		validateReceipt(args.data);
		const result = reconcile(args.data);
		if (
			args.reviewed &&
			(result.issues.length ||
				args.data.issues.length ||
				args.data.lines.some((l) => l.issues.length) ||
				(receipt.duplicateOf && !args.duplicateResolved))
		)
			throw new Error('Kontroller avvik og uklare felt før godkjenning.');
		for (const line of args.data.lines) {
			const previous = receipt.data?.lines.find((old) => old.id === line.id);
			if (!previous || JSON.stringify(previous) !== JSON.stringify(line)) line.manual = true;
			if (line.productKey && line.productKey !== aliasKey(args.data, line)) line.productKey = null;
			if (args.rememberLineIds.includes(line.id) && line.kind === 'product' && line.categoryId) {
				const key = aliasKey(args.data, line);
				if (!key) throw new Error('Butikk og originaltekst kreves for å huske en vare.');
				const existing = await ctx.db
					.query('aliases')
					.withIndex('by_householdId_and_key', (q) =>
						q.eq('householdId', member.householdId).eq('key', key)
					)
					.unique();
				if (existing)
					await ctx.db.patch('aliases', existing._id, {
						categoryId: line.categoryId,
						confirmedBy: member.identity
					});
				else
					await ctx.db.insert('aliases', {
						householdId: member.householdId,
						key,
						categoryId: line.categoryId,
						confirmedBy: member.identity
					});
				line.productKey = key;
				await ctx.scheduler.runAfter(0, internal.aliases.applyToMatching, {
					householdId: member.householdId,
					key,
					cursor: null
				});
			}
		}
		if (receipt.data)
			await ctx.db.insert('revisions', {
				receiptId: receipt._id,
				data: receipt.data,
				editor: member.identity,
				revision: receipt.revision
			});
		await ctx.db.patch('receipts', args.id, {
			data: args.data,
			revision: receipt.revision + 1,
			status: args.reviewed ? 'reviewed' : 'needs_review',
			duplicateResolved: args.duplicateResolved,
			excluded: args.excluded,
			error: null
		});
		return null;
	}
});
export const imageAccess = internalQuery({
	args: { id: v.id('receipts'), position: v.number() },
	returns: v.object({
		receipt: schema.doc('receipts'),
		image: v.union(schema.doc('images'), v.null())
	}),
	handler: async (ctx, args) => {
		const { receipt } = await requireReceipt(ctx, args.id);
		if (
			!Number.isInteger(args.position) ||
			args.position < 0 ||
			args.position >= receipt.imageCount
		)
			throw new Error('Ugyldig bilde.');
		return {
			receipt,
			image: await ctx.db
				.query('images')
				.withIndex('by_receiptId_and_position', (q) =>
					q.eq('receiptId', args.id).eq('position', args.position)
				)
				.unique()
		};
	}
});
export const attachImage = internalMutation({
	args: { id: v.id('receipts'), position: v.number(), storageId: v.id('_storage') },
	returns: v.null(),
	handler: async (ctx, args) => {
		const { receipt } = await requireReceipt(ctx, args.id);
		if (
			receipt.status !== 'uploading' ||
			!Number.isInteger(args.position) ||
			args.position < 0 ||
			args.position >= receipt.imageCount
		) {
			await ctx.storage.delete(args.storageId);
			return null;
		}
		const existing = await ctx.db
			.query('images')
			.withIndex('by_receiptId_and_position', (q) =>
				q.eq('receiptId', args.id).eq('position', args.position)
			)
			.unique();
		if (existing) {
			await ctx.storage.delete(args.storageId);
			return null;
		}
		const metadata = await ctx.db.system.get('_storage', args.storageId);
		if (!metadata) throw new Error('Bildet mangler.');
		const matches = await ctx.db
			.query('images')
			.withIndex('by_sha256', (q) => q.eq('sha256', metadata.sha256))
			.take(10);
		for (const match of matches) {
			const other = await ctx.db.get('receipts', match.receiptId);
			if (other && other._id !== receipt._id && other.householdId === receipt.householdId) {
				await ctx.db.patch('receipts', receipt._id, { duplicateOf: other._id });
				break;
			}
		}
		await ctx.db.insert('images', {
			receiptId: args.id,
			position: args.position,
			storageId: args.storageId,
			sha256: metadata.sha256
		});
		return null;
	}
});
