import type { Id } from '../../../convex/_generated/dataModel';
import { expect, it } from 'vitest';
import { matchingKey, compatibleProduct, similarProducts } from './product-matching';
import { emptyLine, batteryFixture } from './receipt';
import { productHistory, comparableUnitPrice, type Receipt } from './insights';

it('normalizes only case and whitespace, preserving flavour, size and zero', () => {
	expect(matchingKey('  PEPSI   Max ZERO  0,5L ')).toBe('pepsi max zero 0,5l');
	expect(matchingKey('Battery Orange')).not.toBe(matchingKey('Battery Original'));
});
it('rejects conflicting sizes, brands and zero variants before semantic matching', () => {
	const product = {
		...emptyLine(),
		name: 'Cola Zero',
		brand: 'Brand',
		packageSize: 500,
		packageUnit: 'ml'
	};
	expect(compatibleProduct(product, { ...product, packageSize: 1, packageUnit: 'l' })).toBe(false);
	expect(compatibleProduct(product, { ...product, packageSize: 0.5, packageUnit: 'l' })).toBe(true);
	expect(compatibleProduct(product, { ...product, name: 'Cola' })).toBe(false);
	expect(compatibleProduct(product, { ...product, brand: 'Another' })).toBe(false);
	expect(compatibleProduct(product, { ...product, packageSize: null })).toBe(false);
	expect(similarProducts(product, [{ ...product, packageSize: 1000 }, product])).toEqual([product]);
});
it('groups linked products across receipt descriptions and keeps unknown items separate', () => {
	const data = batteryFixture();
	const id = 'product-id' as Id<'products'>;
	data.lines[0].productId = id;
	data.lines[0].productName = 'Battery Remix';
	const first = { _id: 'first', data } as Receipt;
	const second = {
		...first,
		_id: 'second',
		data: {
			...data,
			totalOre: 3131,
			lines: data.lines.map((l) => ({
				...l,
				name: l.id === 'battery' ? 'BAT REMIX' : l.name,
				amountOre: l.id === 'battery' ? 3190 : l.amountOre
			}))
		}
	} as Receipt;
	const history = productHistory([first, second]);
	expect(history).toHaveLength(1);
	expect(history[0].purchases.size).toBe(2);
	expect(history[0].amountOre).toBe(5262);
	expect(history[0].name).toBe('Battery Remix');
	expect(history[0].contributions.map((c) => c.amountOre)).toEqual([2331, 2931]);
	const separate = {
		...second,
		data: { ...second.data!, lines: second.data!.lines.map((l) => ({ ...l, productId: null })) }
	};
	expect(productHistory([first, separate])).toHaveLength(2);
	expect(
		comparableUnitPrice({ ...data.lines[0], quantity: 1, packageSize: null }, 2331)
	).toBeNull();
});
