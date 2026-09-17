import { reconcile, type ReceiptData, type ReceiptLine } from './receipt';

export const categoryReviewThreshold = 0.5;

export function lineReviewIssues(line: ReceiptLine): string[] {
	const issues = [...line.issues];
	if (!['summary', 'vat'].includes(line.kind) && line.amountOre === null)
		issues.push('Beløpet mangler.');
	if (line.kind === 'product' && !line.name.trim()) issues.push('Varenavnet mangler.');
	return [...new Set(issues)];
}

export function receiptReviewIssues(data: ReceiptData): string[] {
	return [
		...new Set([
			...data.issues,
			...reconcile(data).issues,
			...(!data.store?.trim() ? ['Butikken mangler.'] : []),
			...(!data.lines.some((line) => line.kind === 'product') ? ['Ingen varer er lest.'] : [])
		])
	];
}

/** Product matching and optional package information do not require receipt review. */
export function canAcceptReceipt(data: ReceiptData, unresolvedDuplicate: boolean): boolean {
	return (
		!unresolvedDuplicate &&
		receiptReviewIssues(data).length === 0 &&
		data.lines.every((line) => lineReviewIssues(line).length === 0)
	);
}
