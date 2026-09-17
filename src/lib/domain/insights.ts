import type { Doc } from '../../../convex/_generated/dataModel';
import { categoryById } from './categories';
import { reconcile, spendingLines, type ReceiptLine } from './receipt';
export type Receipt = Doc<'receipts'>;
export type Contribution = { receipt: Receipt; line: ReceiptLine | null; amountOre: number };
export type SpendingGroup = {
	id: string;
	name: string;
	amountOre: number;
	contributions: Contribution[];
};
export function monthBefore(month: string) {
	const [year, number] = month.split('-').map(Number);
	const date = new Date(Date.UTC(year, number - 2, 1));
	return date.toISOString().slice(0, 7);
}
export function receiptMonth(receipt: Receipt) {
	return receipt.data?.purchaseDate?.slice(0, 7) ?? null;
}
export function monthlyInsights(receipts: Receipt[], month: string, reviewedOnly = false) {
	const eligible = receipts.filter(
		(r) =>
			!r.excluded &&
			r.data &&
			receiptMonth(r) === month &&
			(!reviewedOnly || r.status === 'reviewed')
	);
	const unconverted = eligible.filter((receipt) => receipt.data!.currency !== 'NOK');
	const selected = eligible.filter((receipt) => receipt.data!.currency === 'NOK');
	const category = new Map<string, SpendingGroup>();
	const stores = new Map<string, SpendingGroup>();
	let paid = 0,
		products = 0,
		discounts = 0,
		deposits = 0,
		returns = 0,
		unknownTotals = 0,
		unknownAmounts = 0;
	const add = (
		map: Map<string, SpendingGroup>,
		id: string,
		name: string,
		contribution: Contribution
	) => {
		const group = map.get(id) ?? { id, name, amountOre: 0, contributions: [] };
		group.amountOre += contribution.amountOre;
		group.contributions.push(contribution);
		map.set(id, group);
	};
	for (const receipt of selected) {
		const data = receipt.data!;
		const totals = reconcile(data);
		unknownAmounts += totals.unknown;
		paid += data.totalOre ?? 0;
		products += totals.productSpending;
		discounts += totals.discounts;
		deposits += totals.deposits;
		returns += totals.returns;
		if (data.totalOre === null) unknownTotals++;
		const lines = spendingLines(data);
		for (const line of lines.products) {
			const found = categoryById.get(line.categoryId ?? '');
			add(category, line.categoryId ?? 'fallback.unclear', found?.name ?? 'Ukjent vare', {
				receipt,
				line,
				amountOre: line.netOre
			});
		}
		if (lines.unallocated)
			add(category, 'unallocated', 'Ufordelte rabatter og justeringer', {
				receipt,
				line: null,
				amountOre: lines.unallocated
			});
		add(stores, data.store ?? 'unknown', data.store ?? 'Ukjent butikk', {
			receipt,
			line: null,
			amountOre: totals.productSpending
		});
	}
	const groups = new Map<string, SpendingGroup>();
	for (const leaf of category.values()) {
		const found = categoryById.get(leaf.id);
		for (const contribution of leaf.contributions)
			add(groups, found?.group ?? 'fallback', found?.groupName ?? 'Uavklart', contribution);
	}
	const purchaseTypes = new Map<string, SpendingGroup>();
	for (const leaf of category.values()) {
		const found = categoryById.get(leaf.id);
		const type =
			found?.group === 'household'
				? 'household'
				: found?.group === 'personal-care'
					? 'personal-care'
					: found?.group === 'pets'
						? 'pets'
						: found?.group === 'other-purchases' || leaf.id === 'fallback.non-food'
							? 'other'
							: (found?.group === 'fallback' && leaf.id !== 'fallback.food') ||
								  leaf.id === 'unallocated'
								? 'unknown'
								: 'food';
		const names: Record<string, string> = {
			food: 'Mat og drikke',
			household: 'Husholdning',
			'personal-care': 'Personlig pleie',
			pets: 'Kjæledyr',
			other: 'Andre varer',
			unknown: 'Uavklart'
		};
		for (const contribution of leaf.contributions)
			add(purchaseTypes, type, names[type], contribution);
	}
	return {
		selected,
		unconverted,
		paid,
		products,
		discounts,
		deposits,
		returns,
		unknownTotals,
		unknownAmounts,
		purchaseTypes: [...purchaseTypes.values()],
		discrepancies: selected.filter((receipt) => {
			const result = reconcile(receipt.data!);
			return result.difference !== null && result.difference !== 0;
		}),
		suspectedDuplicates: selected.filter(
			(receipt) => receipt.duplicateOf && !receipt.duplicateResolved
		),
		provisional: selected.filter((r) => r.status !== 'reviewed').length,
		categories: [...category.values()].sort((a, b) => b.amountOre - a.amountOre),
		groups: [...groups.values()].sort((a, b) => b.amountOre - a.amountOre),
		stores: [...stores.values()].sort((a, b) => b.amountOre - a.amountOre),
		undated: receipts.filter((r) => !r.excluded && r.data && !r.data.purchaseDate)
	};
}
export function productHistory(receipts: Receipt[]) {
	const products = new Map<
		string,
		{
			key: string;
			name: string;
			confirmed: boolean;
			quantity: number;
			purchases: Set<string>;
			amountOre: number;
			contributions: Contribution[];
		}
	>();
	for (const receipt of receipts) {
		if (!receipt.data || receipt.excluded || receipt.data.currency !== 'NOK') continue;
		for (const line of spendingLines(receipt.data).products) {
			// Unconfirmed items remain separate; similar names do not establish identity.
			const key = line.productId ?? `${receipt._id}:${line.id}`;
			const product = products.get(key) ?? {
				key,
				name: line.productName || line.name,
				confirmed: !!line.productId,
				quantity: 0,
				purchases: new Set<string>(),
				amountOre: 0,
				contributions: []
			};
			product.amountOre += line.netOre;
			product.quantity += line.quantity ?? 0;
			product.purchases.add(receipt._id);
			product.contributions.push({ receipt, line, amountOre: line.netOre });
			products.set(key, product);
		}
	}
	return [...products.values()].sort((a, b) => b.amountOre - a.amountOre);
}
/** Compare only explicit mass/volume quantities; never derive size from product names. */
export function comparableUnitPrice(line: ReceiptLine, netOre: number) {
	if (line.quantity === null) return null;
	let amount: number;
	let unit: string;
	if (line.unit === 'kg' || line.unit === 'l') {
		amount = line.quantity;
		unit = line.unit;
	} else if (line.packageSize !== null && line.packageUnit) {
		const factor = line.packageUnit === 'g' || line.packageUnit === 'ml' ? 0.001 : 1;
		unit = ['g', 'kg'].includes(line.packageUnit)
			? 'kg'
			: ['ml', 'l'].includes(line.packageUnit)
				? 'l'
				: '';
		amount = line.quantity * line.packageSize * factor;
	} else return null;
	return amount > 0 && unit ? { ore: Math.round(netOre / amount), unit } : null;
}
