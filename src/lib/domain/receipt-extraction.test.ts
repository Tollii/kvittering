import { describe, expect, it } from 'vitest';
import { extractionSchema, prepareExtraction } from './receipt-extraction';
import { batteryFixture, reconcile } from './receipt';

const fixture = () => ({
	...batteryFixture(),
	lines: batteryFixture().lines.map((line) => ({
		...line,
		sourceImages: [1],
		overlapUncertain: false
	}))
});

describe('receipt image evidence', () => {
	it('counts a row visible in several images once and retains the original text', () => {
		const extracted = fixture();
		extracted.lines[0].sourceImages = [3, 1, 3];
		extracted.originalText = 'Image 1: BATTERY REMIX 25,90\nImage 3: BATTERY REMIX 25,90';
		const data = prepareExtraction(extractionSchema.parse(extracted), 3);
		expect(data.lines[0].sourceImages).toEqual([1, 3]);
		expect(data.originalText).toBe(extracted.originalText);
		expect(data.lines[0].originalText).toBe(extracted.lines[0].originalText);
		expect(reconcile(data).difference).toBe(0);
	});

	it('keeps separately printed equal products and their amounts', () => {
		const extracted = fixture();
		extracted.lines.push({ ...extracted.lines[0], id: 'second-battery' });
		extracted.totalOre! += 2590;
		const data = prepareExtraction(extractionSchema.parse(extracted), 1);
		expect(data.lines.filter((line) => line.kind === 'product')).toHaveLength(2);
		expect(reconcile(data).difference).toBe(0);
	});

	it('retains uncertain overlap and flags it without forcing the total to match', () => {
		const extracted = fixture();
		extracted.lines.push({
			...extracted.lines[0],
			id: 'possible-repeat',
			sourceImages: [2],
			overlapUncertain: true
		});
		const data = prepareExtraction(extractionSchema.parse(extracted), 2);
		expect(data.lines).toHaveLength(4);
		expect(data.lines[3].issues).toContain(
			'Mulig overlapp mellom bildene. Kontroller om varen er telt to ganger.'
		);
		expect(reconcile(data).difference).toBe(2590);
	});

	it('does not trust image references outside the uploaded set', () => {
		const extracted = fixture();
		extracted.lines[0].sourceImages = [0, 4];
		const data = prepareExtraction(extractionSchema.parse(extracted), 3);
		expect(data.lines[0].sourceImages).toEqual([]);
		expect(data.lines[0].issues).toContain('Kunne ikke knytte linjen sikkert til et bilde.');
		expect(data.lines[0].amountOre).toBe(2590);
	});
});

describe('missing purchase year', () => {
	it('uses the current year in Norway and leaves printed years unchanged', () => {
		const extracted = fixture();
		extracted.purchaseDate = '--08-20';
		const referenceTime = Date.parse('2026-12-31T23:30:00Z');
		const data = prepareExtraction(extractionSchema.parse(extracted), 1, referenceTime);
		expect(data.purchaseDate).toBe('2027-08-20');
		expect(data.issues).toEqual([]);
		extracted.purchaseDate = '2024-08-20';
		expect(
			prepareExtraction(extractionSchema.parse(extracted), 1, referenceTime).purchaseDate
		).toBe('2024-08-20');
	});
	it('keeps missing dates unknown and flags an invalid leap day without stopping extraction', () => {
		const extracted = fixture();
		extracted.purchaseDate = null;
		expect(prepareExtraction(extractionSchema.parse(extracted), 1).purchaseDate).toBeNull();
		extracted.purchaseDate = '--02-29';
		const data = prepareExtraction(extractionSchema.parse(extracted), 1, Date.parse('2026-09-17'));
		expect(data.purchaseDate).toBeNull();
		expect(data.issues).toContain(
			'Datoen er ikke gyldig i inneværende år. Kontroller kjøpsdatoen.'
		);
	});
});
