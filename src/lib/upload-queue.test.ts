import { expect, it, vi } from 'vitest';
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

it('stores selected images as separate receipts, with an explicit combined option', async () => {
	const indexedDatabase = await import('fake-indexeddb');
	for (const [name, value] of Object.entries(indexedDatabase)) {
		if (name === 'indexedDB' || name.startsWith('IDB')) vi.stubGlobal(name, value);
	}
	const { saveLocalReceipts, localReceipts } = await import('./upload-queue');
	const images = [new Blob(['first']), new Blob(['second']), new Blob(['third'])];
	const separate = await saveLocalReceipts('separate-home', images);
	expect(new Set(separate.map((row) => row.id)).size).toBe(3);
	expect(separate.map((row) => row.images.length)).toEqual([1, 1, 1]);
	expect(await localReceipts('separate-home')).toHaveLength(3);
	const combined = await saveLocalReceipts('combined-home', images, true);
	expect(combined).toHaveLength(1);
	expect(combined[0].images).toEqual(images);
	await expect(saveLocalReceipts('empty-home', [])).rejects.toThrow();
	expect(await localReceipts('empty-home')).toHaveLength(0);
});

it('rolls back the entire selection when one record cannot be saved', async () => {
	const { saveLocalReceipts, localReceipts } = await import('./upload-queue');
	const uuid = vi
		.spyOn(crypto, 'randomUUID')
		.mockReturnValue('00000000-0000-0000-0000-000000000001');
	try {
		await expect(
			saveLocalReceipts('rollback-home', [new Blob(['first']), new Blob(['second'])])
		).rejects.toThrow();
		expect(await localReceipts('rollback-home')).toHaveLength(0);
	} finally {
		uuid.mockRestore();
	}
});
