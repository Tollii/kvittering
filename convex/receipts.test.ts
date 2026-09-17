/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { batteryFixture } from '../src/lib/domain/receipt';
const modules = import.meta.glob('./**/*.ts');
async function setup() {
	const t = convexTest(schema, modules);
	const first = t.withIdentity({ subject: 'first', issuer: 'https://test.local', name: 'First' });
	const second = t.withIdentity({
		subject: 'second',
		issuer: 'https://test.local',
		name: 'Second'
	});
	const outsider = t.withIdentity({
		subject: 'outsider',
		issuer: 'https://test.local',
		name: 'Outsider'
	});
	const householdId = await first.mutation(api.households.create, {
		name: 'Test household',
		invitation: '0123456789abcdef0123456789abcdef'
	});
	await second.mutation(api.households.join, { invitation: '0123456789abcdef0123456789abcdef' });
	return { t, first, second, outsider, householdId };
}
it('allows two household members, refuses a third, and rejects unauthenticated access', async () => {
	const { t, first, second, outsider, householdId } = await setup();
	await expect(
		outsider.mutation(api.households.join, { invitation: '0123456789abcdef0123456789abcdef' })
	).rejects.toThrow('to medlemmer');
	const id = await first.mutation(api.receipts.reserve, {
		clientId: 'capture-request-0001',
		householdId,
		imageCount: 1
	});
	expect((await second.query(api.receipts.detail, { id })).receipt._id).toBe(id);
	await expect(t.query(api.receipts.detail, { id })).rejects.toThrow('Logg inn');
});
it('enforces household checks for receipts and image access', async () => {
	const { first, outsider, householdId } = await setup();
	await outsider.mutation(api.households.create, {
		name: 'Other home',
		invitation: 'ffffffffffffffffffffffffffffffff'
	});
	const id = await first.mutation(api.receipts.reserve, {
		clientId: 'capture-request-0001',
		householdId,
		imageCount: 1
	});
	await expect(outsider.query(api.receipts.detail, { id })).rejects.toThrow('ikke tilgjengelig');
	await expect(outsider.query(internal.receipts.imageAccess, { id, position: 0 })).rejects.toThrow(
		'ikke tilgjengelig'
	);
	const result = await outsider.query(api.receipts.list, {
		paginationOpts: { cursor: null, numItems: 20 }
	});
	expect(result.page).toHaveLength(0);
});
it('reserves one receipt for repeated upload requests', async () => {
	const { first, householdId } = await setup();
	const args = { clientId: 'capture-request-0001', householdId, imageCount: 2 };
	const firstId = await first.mutation(api.receipts.reserve, args);
	expect(await first.mutation(api.receipts.reserve, args)).toBe(firstId);
	expect(
		(await first.query(api.receipts.list, { paginationOpts: { cursor: null, numItems: 20 } })).page
	).toHaveLength(1);
	await expect(first.mutation(api.receipts.completeUpload, { id: firstId })).rejects.toThrow(
		'bilder'
	);
});
it('duplicate processing commits once and preserves all manual edits during reprocessing', async () => {
	const { t, first, householdId } = await setup();
	const id = await first.mutation(api.receipts.reserve, {
		clientId: 'capture-request-0001',
		householdId,
		imageCount: 1
	});
	await t.run(async (ctx) => {
		await ctx.db.patch('receipts', id, { status: 'processing', generation: 1 });
	});
	const data = batteryFixture();
	const args = { id, generation: 1, data, original: data, provider: 'test fixture' };
	await t.mutation(internal.processing.finish, args);
	await t.mutation(internal.processing.finish, args);
	let detail = await first.query(api.receipts.detail, { id });
	expect(detail.extractions).toHaveLength(1);
	data.lines[0].name = 'Corrected product';
	data.lines = data.lines.filter((line) => line.id !== 'deposit');
	data.totalOre = 2331;
	await first.mutation(api.receipts.save, {
		id,
		revision: 0,
		data,
		reviewed: true,
		rememberLineIds: ['battery'],
		duplicateResolved: false,
		excluded: false
	});
	await t.run(async (ctx) => {
		await ctx.db.patch('receipts', id, { status: 'processing', generation: 2 });
	});
	await t.mutation(internal.processing.finish, {
		...args,
		generation: 2,
		data: batteryFixture(),
		original: batteryFixture()
	});
	detail = await first.query(api.receipts.detail, { id });
	expect(detail.receipt.data?.lines[0].name).toBe('Corrected product');
	expect(detail.receipt.data?.lines).toHaveLength(2);
	expect(detail.extractions).toHaveLength(2);
});
it('rejects stale edits and refuses approval when the total is unreadable', async () => {
	const { t, first, householdId } = await setup();
	const id = await first.mutation(api.receipts.reserve, {
		clientId: 'capture-request-0001',
		householdId,
		imageCount: 1
	});
	await t.run(async (ctx) => {
		await ctx.db.patch('receipts', id, { status: 'needs_review', data: batteryFixture() });
	});
	const data = batteryFixture();
	data.totalOre = null;
	const args = {
		id,
		revision: 0,
		data,
		reviewed: true,
		rememberLineIds: [],
		duplicateResolved: false,
		excluded: false
	};
	await expect(first.mutation(api.receipts.save, args)).rejects.toThrow('avvik');
	await first.mutation(api.receipts.save, { ...args, reviewed: false });
	await expect(first.mutation(api.receipts.save, { ...args, reviewed: false })).rejects.toThrow(
		'annen'
	);
});

it('refuses to reserve a queued photo for a different household after an account switch', async () => {
	const { first, outsider } = await setup();
	const otherId = await outsider.mutation(api.households.create, {
		name: 'Other',
		invitation: 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
	});
	await expect(
		first.mutation(api.receipts.reserve, {
			clientId: 'capture-request-0001',
			imageCount: 1,
			householdId: otherId
		})
	).rejects.toThrow('Husstanden er endret');
});

it('applies confirmed matches while keeping item-only category corrections', async () => {
	const { t, first, householdId } = await setup();
	const ids = [];
	for (let index = 0; index < 3; index++) {
		const id = await first.mutation(api.receipts.reserve, {
			clientId: `capture-request-000${index}`,
			imageCount: 1,
			householdId
		});
		ids.push(id);
		const data = batteryFixture();
		data.lines[0].categoryId = 'fallback.unclear';
		if (index === 2) {
			data.lines[0].manual = true;
			data.lines[0].categoryId = 'drinks.soft-drinks';
		}
		await t.run(async (ctx) => {
			await ctx.db.patch('receipts', id, { status: 'needs_review', data });
		});
	}
	const data = batteryFixture();
	await first.mutation(api.receipts.save, {
		id: ids[0],
		revision: 0,
		data,
		reviewed: true,
		rememberLineIds: ['battery'],
		duplicateResolved: false,
		excluded: false
	});
	const aliases = await t.run((ctx) =>
		ctx.db
			.query('aliases')
			.withIndex('by_householdId_and_key', (q) => q.eq('householdId', householdId))
			.take(1)
	);
	await t.mutation(internal.aliases.applyToMatching, {
		householdId,
		key: aliases[0].key,
		cursor: null
	});
	const matched = await first.query(api.receipts.detail, { id: ids[1] });
	const manual = await first.query(api.receipts.detail, { id: ids[2] });
	expect(matched.receipt.data?.lines[0].categoryId).toBe('drinks.energy-drinks');
	expect(matched.receipt.data?.lines[0].productKey).toBe(aliases[0].key);
	expect(manual.receipt.data?.lines[0].categoryId).toBe('drinks.soft-drinks');
});

it('deletes a household receipt, its images and history without allowing a late processing result', async () => {
	const { t, first, second, outsider, householdId } = await setup();
	await outsider.mutation(api.households.create, {
		name: 'Other home',
		invitation: 'ffffffffffffffffffffffffffffffff'
	});
	const id = await first.mutation(api.receipts.reserve, {
		clientId: 'delete-request-0001',
		householdId,
		imageCount: 1
	});
	const other = await first.mutation(api.receipts.reserve, {
		clientId: 'delete-request-0002',
		householdId,
		imageCount: 1
	});
	const storageId = await t.run(async (ctx) => {
		const storageId = await ctx.storage.store(new Blob(['receipt']));
		await ctx.db.insert('images', { receiptId: id, position: 0, storageId, sha256: 'test' });
		await ctx.db.insert('extractions', {
			receiptId: id,
			generation: 1,
			data: batteryFixture(),
			provider: 'test'
		});
		await ctx.db.insert('revisions', {
			receiptId: id,
			revision: 0,
			data: batteryFixture(),
			editor: 'test'
		});
		await ctx.db.patch('receipts', id, { status: 'processing', generation: 2, revision: 1 });
		await ctx.db.patch('receipts', other, { duplicateOf: id });
		return storageId;
	});
	await expect(outsider.mutation(api.receipts.remove, { id, revision: 1 })).rejects.toThrow(
		'ikke tilgjengelig'
	);
	await expect(t.mutation(api.receipts.remove, { id, revision: 1 })).rejects.toThrow('Logg inn');
	await expect(first.mutation(api.receipts.remove, { id, revision: 0 })).rejects.toThrow('endret');
	await second.mutation(api.receipts.remove, { id, revision: 1 });
	await second.mutation(api.receipts.remove, { id, revision: 1 });
	await t.mutation(internal.processing.finish, {
		id,
		generation: 2,
		data: batteryFixture(),
		original: batteryFixture(),
		provider: 'late result'
	});
	await t.run(async (ctx) => {
		expect(await ctx.db.get('receipts', id)).toBeNull();
		expect(await ctx.storage.get(storageId)).toBeNull();
		for (const table of ['images', 'extractions', 'revisions'] as const) {
			expect(
				await ctx.db
					.query(table)
					.withIndex('by_receiptId', (q) => q.eq('receiptId', id))
					.take(1)
			).toEqual([]);
		}
		expect((await ctx.db.get('receipts', other))?.duplicateOf).toBeNull();
	});
});

it('requires an upload to finish before deleting it', async () => {
	const { first, householdId } = await setup();
	const id = await first.mutation(api.receipts.reserve, {
		clientId: 'delete-request-0001',
		householdId,
		imageCount: 1
	});
	await expect(first.mutation(api.receipts.remove, { id, revision: 0 })).rejects.toThrow(
		'lastet opp'
	);
	expect((await first.query(api.receipts.detail, { id })).receipt.status).toBe('uploading');
});
