import { openDB, type DBSchema } from 'idb';
import type { Id } from '../../convex/_generated/dataModel';
export type LocalReceipt = {
	id: string;
	householdId: string;
	createdAt: number;
	images: Blob[];
	uploaded: boolean[];
	receiptId: Id<'receipts'> | null;
	state: 'saved' | 'uploading' | 'uploaded';
	error: string | null;
};
interface ReceiptDatabase extends DBSchema {
	uploads: { key: string; value: LocalReceipt };
}
const database = () =>
	openDB<ReceiptDatabase>('grocery-receipt-uploads', 1, {
		upgrade(db) {
			db.createObjectStore('uploads', { keyPath: 'id' });
		}
	});
export async function localReceipts(householdId: string) {
	return (await (await database()).getAll('uploads'))
		.filter((row) => row.householdId === householdId)
		.sort((a, b) => b.createdAt - a.createdAt);
}
/** Save the entire selection in one transaction so a failed save cannot leave a partial batch. */
export async function saveLocalReceipts(householdId: string, images: Blob[], combined = false) {
	if (!images.length || images.length > 8) throw new Error('Velg mellom ett og åtte bilder.');
	const groups = combined ? [images] : images.map((image) => [image]);
	const receipts: LocalReceipt[] = groups.map((group) => ({
		id: crypto.randomUUID(),
		householdId,
		createdAt: Date.now(),
		images: group,
		uploaded: group.map(() => false),
		receiptId: null,
		state: 'saved',
		error: null
	}));
	const transaction = (await database()).transaction('uploads', 'readwrite');
	await Promise.all([
		...receipts.map((receipt) => transaction.store.add(receipt)),
		transaction.done
	]);
	return receipts;
}
export async function removeLocalReceipt(id: string) {
	await (await database()).delete('uploads', id);
}
export interface UploadTransport {
	reserve: (id: string, count: number, householdId: string) => Promise<Id<'receipts'>>;
	upload: (receiptId: Id<'receipts'>, position: number, blob: Blob) => Promise<void>;
	complete: (receiptId: Id<'receipts'>) => Promise<void>;
}
/** Each completed step is stored before the next network request. Server steps are idempotent. */
export async function uploadReceipt(
	receipt: LocalReceipt,
	transport: UploadTransport,
	persist: (receipt: LocalReceipt) => Promise<void>
) {
	receipt.state = 'uploading';
	receipt.error = null;
	await persist(receipt);
	try {
		if (!receipt.receiptId) {
			receipt.receiptId = await transport.reserve(
				receipt.id,
				receipt.images.length,
				receipt.householdId
			);
			await persist(receipt);
		}
		for (let index = 0; index < receipt.images.length; index++)
			if (!receipt.uploaded[index]) {
				await transport.upload(receipt.receiptId, index, receipt.images[index]);
				receipt.uploaded[index] = true;
				await persist(receipt);
			}
		await transport.complete(receipt.receiptId);
		receipt.state = 'uploaded';
		await persist(receipt);
	} catch (error) {
		receipt.state = 'saved';
		receipt.error = error instanceof Error ? error.message : 'Opplasting mislyktes.';
		await persist(receipt);
		throw error;
	}
}
let running = false;
export async function drainQueue(
	householdId: string,
	transport: UploadTransport,
	onChange: () => Promise<void>
) {
	if (running || !navigator.onLine) return;
	running = true;
	try {
		for (const receipt of await localReceipts(householdId)) {
			if (!navigator.onLine) break;
			if (receipt.state === 'uploaded') {
				await removeLocalReceipt(receipt.id);
				continue;
			}
			try {
				await uploadReceipt(receipt, transport, async (value) => {
					await (await database()).put('uploads', value);
					await onChange();
				});
				await removeLocalReceipt(receipt.id);
				await onChange();
			} catch {
				break;
			}
		}
	} finally {
		running = false;
	}
}
export async function prepareImage(file: File): Promise<Blob> {
	if (file.size > 30 * 1024 * 1024) throw new Error('Bildet er større enn 30 MB.');
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		try {
			const { heicTo } = await import('heic-to');
			const jpeg = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.9 });
			bitmap = await createImageBitmap(jpeg);
		} catch {
			throw new Error(
				'Bildet kunne ikke åpnes. Velg JPEG, PNG eller HEIC, eller ta et nytt bilde.'
			);
		}
	}
	const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(bitmap.width * scale);
	canvas.height = Math.round(bitmap.height * scale);
	const context = canvas.getContext('2d');
	if (!context) throw new Error('Kameraet er ikke tilgjengelig.');
	context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error('Bildet kunne ikke lagres.'))),
			'image/jpeg',
			0.88
		)
	);
}
