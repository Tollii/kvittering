import { choice } from '@typesafe-ai/sdk';
import { z } from 'zod';
import { categories, categoryRules } from './categories';

const categoryDescriptions: Record<string, string> = {
	'drinks.energy-drinks':
		'Energy drinks / energidrikker, including Monster, Red Bull, Battery and Burn.',
	'convenience.sandwiches':
		'Prepared sandwiches, filled baguettes and ready-to-eat wraps, including taco baguettes.',
	'bakery.rolls':
		'Plain bread rolls and unfilled baguettes. Filled baguettes belong to prepared sandwiches.',
	'other-purchases.batteries':
		'Electrical batteries and light bulbs. Battery brand drinks belong to energy drinks.'
};
const criteria = Object.fromEntries(
	categories.map((category) => [
		category.id,
		categoryDescriptions[category.id] ?? `${category.groupName}: ${category.name}`
	])
);

/** Keep structured product evidence and omit absent details that cannot help category selection. */
export function classificationState(description: string) {
	const evidence = z.record(z.string(), z.json()).parse(JSON.parse(description));
	return Object.fromEntries(
		Object.entries(evidence).filter(
			([, value]) => value !== null && !(Array.isArray(value) && value.length === 0)
		)
	);
}

export function classificationQuestion(index: number) {
	return choice(
		{
			question: `Which grocery category best describes the product in \`products[${index}]\`?`,
			evidence:
				'Use the product name, recognizable brands and general product knowledge. Missing package size, ingredients or a separate brand field do not prevent category classification. Classify the kind of product, not its exact package or nutritional content. Related product descriptions provide supporting evidence.',
			rules: categoryRules
		},
		criteria
	);
}
