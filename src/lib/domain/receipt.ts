import { v, type Infer } from 'convex/values';
import { categoryById } from './categories';
const nullableString = v.union(v.string(), v.null());
const nullableNumber = v.union(v.number(), v.null());
export const lineKinds = [
	'product',
	'item_discount',
	'receipt_discount',
	'deposit',
	'deposit_return',
	'adjustment',
	'summary',
	'vat'
] as const;
export const lineValidator = v.object({
	id: v.string(),
	kind: v.union(...lineKinds.map((kind) => v.literal(kind))),
	originalText: v.string(),
	name: v.string(),
	amountOre: nullableNumber,
	quantity: nullableNumber,
	unit: nullableString,
	unitPriceOre: nullableNumber,
	packageSize: nullableNumber,
	packageUnit: nullableString,
	brand: nullableString,
	attributes: v.array(v.string()),
	relatedLineId: nullableString,
	categoryId: nullableString,
	confidence: nullableNumber,
	tags: v.array(v.string()),
	issues: v.array(v.string()),
	manual: v.boolean(),
	productKey: nullableString
});
export const receiptDataValidator = v.object({
	store: nullableString,
	branch: nullableString,
	purchaseDate: nullableString,
	purchaseTime: nullableString,
	receiptNumber: nullableString,
	currency: nullableString,
	totalOre: nullableNumber,
	originalText: v.string(),
	lines: v.array(lineValidator),
	issues: v.array(v.string())
});
export type ReceiptLine = Infer<typeof lineValidator>;
export type ReceiptData = Infer<typeof receiptDataValidator>;
export function emptyLine(id: string = crypto.randomUUID()): ReceiptLine {
	return {
		id,
		kind: 'product',
		originalText: '',
		name: '',
		amountOre: null,
		quantity: null,
		unit: null,
		unitPriceOre: null,
		packageSize: null,
		packageUnit: null,
		brand: null,
		attributes: [],
		relatedLineId: null,
		categoryId: 'fallback.unclear',
		confidence: null,
		tags: [],
		issues: [],
		manual: true,
		productKey: null
	};
}
export function parseOre(text: string): number | null {
	const value = text.trim().replaceAll(/\s/g, '').replace('−', '-').replace(',', '.');
	if (!value) return null;
	if (!/^-?\d+(\.\d{1,2})?$/.test(value)) throw new Error('Bruk et beløp med høyst to desimaler.');
	const [whole, fraction = ''] = value.replace('-', '').split('.');
	const result =
		(Number(whole) * 100 + Number(fraction.padEnd(2, '0'))) * (value.startsWith('-') ? -1 : 1);
	if (!Number.isSafeInteger(result) || Math.abs(result) > 100_000_000)
		throw new Error('Beløpet er for stort.');
	return result;
}
export const formatMoney = (ore: number | null) =>
	ore === null
		? 'Ukjent'
		: new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK' }).format(ore / 100);
export const moneyInput = (ore: number | null) =>
	ore === null ? '' : (ore / 100).toFixed(2).replace('.', ',');
export const osloDate = (time = Date.now()) =>
	new Intl.DateTimeFormat('sv-SE', {
		timeZone: 'Europe/Oslo',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(time);
export const normalizeAlias = (text: string) =>
	text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleUpperCase('nb-NO');
export function aliasKey(data: ReceiptData, line: ReceiptLine): string | null {
	if (!data.store || !line.name.trim()) return null;
	return JSON.stringify([
		normalizeAlias(data.store),
		normalizeAlias(line.name),
		line.brand ? normalizeAlias(line.brand) : null,
		line.packageSize,
		line.packageUnit,
		line.unit
	]);
}
export function validateReceipt(data: ReceiptData) {
	if (data.lines.length > 300 || data.originalText.length > 60000)
		throw new Error('Kvitteringen er for stor. Del den opp.');
	const ids = new Set<string>();
	for (const line of data.lines) {
		if (ids.has(line.id)) throw new Error('Varelinjene må ha ulike ID-er.');
		ids.add(line.id);
		for (const value of [line.amountOre, line.unitPriceOre])
			if (value !== null && (!Number.isSafeInteger(value) || Math.abs(value) > 100_000_000))
				throw new Error('Beløp må være hele øre.');
		for (const value of [line.quantity, line.packageSize])
			if (value !== null && (!Number.isFinite(value) || value <= 0))
				throw new Error('Mengde må være større enn null.');
		if (line.categoryId && !categoryById.has(line.categoryId)) throw new Error('Ukjent kategori.');
		if (line.name.length > 500 || line.originalText.length > 1500 || line.tags.length > 10)
			throw new Error('Varelinjen er for lang.');
	}
	if (
		data.totalOre !== null &&
		(!Number.isSafeInteger(data.totalOre) || Math.abs(data.totalOre) > 100_000_000)
	)
		throw new Error('Totalen må være hele øre.');
	if (
		data.purchaseDate &&
		(!/^\d{4}-\d{2}-\d{2}$/.test(data.purchaseDate) ||
			new Date(data.purchaseDate).toISOString().slice(0, 10) !== data.purchaseDate)
	)
		throw new Error('Ugyldig dato.');
}
export function reconcile(data: ReceiptData) {
	const issues: string[] = [];
	const discountsSeen = new Set<string>();
	let products = 0,
		discounts = 0,
		deposits = 0,
		returns = 0,
		adjustments = 0,
		unknown = 0;
	for (const line of data.lines) {
		if (line.kind === 'summary' || line.kind === 'vat') continue;
		if (line.amountOre === null) {
			unknown++;
			continue;
		}
		if (line.kind === 'product') products += line.amountOre;
		if (line.kind === 'item_discount' || line.kind === 'receipt_discount') {
			const key = JSON.stringify([line.kind, line.name, line.amountOre, line.relatedLineId]);
			if (discountsSeen.has(key)) issues.push('Like rabattlinjer må kontrolleres.');
			discountsSeen.add(key);
			discounts += line.amountOre;
			if (line.amountOre > 0) issues.push('En rabatt er positiv.');
		}
		if (line.kind === 'deposit') deposits += line.amountOre;
		if (line.kind === 'deposit_return') {
			returns += line.amountOre;
			if (line.amountOre > 0) issues.push('En pantretur er positiv.');
		}
		if (line.kind === 'adjustment') adjustments += line.amountOre;
		if (
			line.kind === 'product' &&
			line.quantity !== null &&
			line.unitPriceOre !== null &&
			Math.abs(Math.round(line.quantity * line.unitPriceOre) - line.amountOre) > 1
		)
			issues.push(`Mengde og enhetspris stemmer ikke: ${line.name}`);
	}
	const calculated = products + discounts + deposits + returns + adjustments;
	if (unknown) issues.push(`${unknown} linje(r) mangler beløp.`);
	if (data.totalOre === null) issues.push('Betalt beløp er ukjent.');
	if (data.currency !== 'NOK') issues.push('Valuta må kontrolleres.');
	if (!data.purchaseDate) issues.push('Kjøpsdato er ukjent.');
	const difference = data.totalOre === null ? null : calculated - data.totalOre;
	if (difference !== null && difference !== 0)
		issues.push(`Avvik mot betalt: ${formatMoney(difference)}.`);
	return {
		products,
		discounts,
		deposits,
		returns,
		adjustments,
		productSpending: products + discounts + adjustments,
		calculated,
		difference,
		unknown,
		issues
	};
}
/** Allocate receipt discounts in whole øre. Keep unlinked adjustments visible. */
export function spendingLines(data: ReceiptData) {
	const products = data.lines
		.filter((line) => line.kind === 'product')
		.map((line) => ({ ...line, netOre: line.amountOre ?? 0 }));
	let unallocated = 0;
	for (const line of data.lines) {
		if (line.kind === 'item_discount') {
			const product = products.find((product) => product.id === line.relatedLineId);
			if (product) product.netOre += line.amountOre ?? 0;
			else unallocated += line.amountOre ?? 0;
		}
		if (line.kind === 'adjustment') unallocated += line.amountOre ?? 0;
	}
	const discount = data.lines
		.filter((line) => line.kind === 'receipt_discount')
		.reduce((sum, line) => sum + (line.amountOre ?? 0), 0);
	const basis = products.reduce((sum, line) => sum + Math.max(0, line.netOre), 0);
	let assigned = 0;
	products.forEach((line, index) => {
		const share =
			basis > 0
				? index === products.length - 1
					? discount - assigned
					: Math.trunc((discount * Math.max(0, line.netOre)) / basis)
				: 0;
		assigned += share;
		line.netOre += share;
	});
	unallocated += discount - assigned;
	return { products, unallocated };
}
export function batteryFixture(): ReceiptData {
	const product = {
		...emptyLine('battery'),
		name: 'BATTERY REMIX',
		originalText: 'BATTERY REMIX 25,90',
		amountOre: 2590,
		categoryId: 'drinks.energy-drinks',
		manual: false
	};
	return {
		store: 'Eksempelbutikk',
		branch: null,
		purchaseDate: '2026-09-17',
		purchaseTime: null,
		receiptNumber: null,
		currency: 'NOK',
		totalOre: 2531,
		originalText: 'BATTERY REMIX 25,90\nRABATT -2,59\nPANT 2,00\nBETALT 25,31',
		issues: [],
		lines: [
			product,
			{
				...emptyLine('discount'),
				kind: 'item_discount',
				name: 'Produktrabatt',
				originalText: 'RABATT -2,59',
				amountOre: -259,
				relatedLineId: 'battery',
				categoryId: null,
				manual: false
			},
			{
				...emptyLine('deposit'),
				kind: 'deposit',
				name: 'Pant',
				originalText: 'PANT 2,00',
				amountOre: 200,
				categoryId: null,
				manual: false
			}
		]
	};
}

/** Send only product evidence to the classifier, including a linked offer's product description. */
export function classificationInputs(data: ReceiptData) {
	return data.lines
		.filter((line) => line.kind === 'product' && !line.productKey)
		.map((line) => ({
			id: line.id,
			description: JSON.stringify({
				name: line.name,
				brand: line.brand,
				packageSize: line.packageSize,
				packageUnit: line.packageUnit,
				attributes: line.attributes,
				relatedProductDescriptions: data.lines
					.filter((other) => other.relatedLineId === line.id && other.kind === 'item_discount')
					.map((other) => other.name.replace(/\d+(?:[.,]\d+)?\s*%/g, '').trim())
			})
		}));
}
