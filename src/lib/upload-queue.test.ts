import { expect, it } from 'vitest';
import { uploadReceipt, type LocalReceipt, type UploadTransport } from './upload-queue';
import type { Id } from '../../convex/_generated/dataModel';
it('resumes an interrupted upload and commits once after all photos arrive', async () => {
	const receipt: LocalReceipt = {
		id: 'client-request-id',
		householdId: 'home',
		createdAt: 0,
		images: [new Blob(['first']), new Blob(['second'])],
		uploaded: [false, false],
		receiptId: null,
		state: 'saved',
		error: null
	};
	let reservations = 0;
	let completions = 0;
	let fail = true;
	const sent: number[] = [];
	let persisted: LocalReceipt = structuredClone(receipt);
	const transport: UploadTransport = {
		reserve: async () => {
			reservations++;
			return 'receipt' as Id<'receipts'>;
		},
		upload: async (_id, position) => {
			sent.push(position);
			if (position === 1 && fail) throw new Error('Network interrupted');
		},
		complete: async () => {
			completions++;
		}
	};
	const persist = async (row: LocalReceipt) => {
		persisted = structuredClone(row);
	};
	await expect(uploadReceipt(receipt, transport, persist)).rejects.toThrow('Network interrupted');
	expect(persisted.uploaded).toEqual([true, false]);
	expect(persisted.state).toBe('saved');
	expect(completions).toBe(0);
	fail = false;
	await uploadReceipt(persisted, transport, persist);
	expect(reservations).toBe(1);
	expect(sent).toEqual([0, 1, 1]);
	expect(completions).toBe(1);
	expect(persisted.state).toBe('uploaded');
});
