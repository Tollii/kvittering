import OpenAI from 'openai';
import { TypeSafeClient, choice } from '@typesafe-ai/sdk';
const model = process.env.OPENAI_RECEIPT_MODEL ?? 'gpt-5.6-luna';
try {
	const result = await new OpenAI().models.retrieve(model);
	console.log('OpenAI model available:', result.id);
} catch (error) {
	process.exitCode = 1;
	console.log('OpenAI model lookup failed:', (error as Error).message);
}
try {
	const result = await new TypeSafeClient().systemOne({
		model: process.env.TYPESAFE_MODEL ?? 'jev-latest',
		state: { product: 'BATTERY REMIX energidrikk' },
		questions: {
			category: choice('Choose the product category.', {
				energy_drinks: 'Energy drinks',
				other: 'Other products'
			})
		}
	});
	console.log('TypeSafe classification:', JSON.stringify(result.answers));
} catch (error) {
	process.exitCode = 1;
	console.log('TypeSafe verification failed:', (error as Error).message);
}
