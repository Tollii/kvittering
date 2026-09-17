/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { batteryFixture } from '../src/lib/domain/receipt';
const modules = import.meta.glob('./**/*.ts');
it('keeps unresolved extraction issues, mismatches, duplicates and mock results in review', async () => {
	const t = convexTest(schema, modules);
	const user = t.withIdentity({ subject: 'reviewer', issuer: 'https://test.local' });
	const householdId = await user.mutation(api.households.create, {
		name: 'Home',
		invitation: '0123456789abcdef0123456789abcdef'
	});
	let previousId;
	for (const scenario of ['issue', 'mismatch', 'duplicate', 'mock', 'clean']) {
		const id = await user.mutation(api.receipts.reserve, {
			clientId: `review-policy-${scenario}`,
			imageCount: 1,
			householdId
		});
		await t.run((ctx) =>
			ctx.db.patch('receipts', id, {
				status: 'processing',
				generation: 1,
				...(scenario === 'duplicate' ? { duplicateOf: previousId } : {})
			})
		);
		const data = batteryFixture();
		if (scenario === 'issue') data.lines[0].issues.push('Varenavnet er usikkert.');
		if (scenario === 'mismatch') data.totalOre! += 100;
		await t.mutation(internal.processing.finish, {
			id,
			generation: 1,
			data,
			original: data,
			provider: scenario === 'mock' ? 'mock' : 'test'
		});
		const receipt = (await user.query(api.receipts.detail, { id })).receipt;
		expect(receipt.status).toBe(scenario === 'clean' ? 'reviewed' : 'needs_review');
		expect(receipt.autoAccepted).toBe(scenario === 'clean');
		previousId = id;
	}
});
