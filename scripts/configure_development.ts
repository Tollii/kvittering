// Bun loads .env and .env.local. Values are passed through stdin, never printed.
import { spawnSync } from 'node:child_process';
if (!process.env.CONVEX_DEPLOYMENT?.startsWith('dev:'))
	throw new Error('A development deployment is required.');
for (const [name, value] of Object.entries({
	OPENAI_API_KEY: process.env.OPENAI_API_KEY,
	TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY,
	BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
	SITE_URL: process.env.RECEIPT_SITE_URL ?? 'http://localhost:5180',
	OPENAI_RECEIPT_MODEL: process.env.OPENAI_RECEIPT_MODEL ?? 'gpt-5.6-luna',
	TYPESAFE_MODEL: process.env.TYPESAFE_MODEL ?? 'jev-latest'
})) {
	if (!value) continue;
	const result = spawnSync('bunx', ['convex', 'env', 'set', name], {
		input: value,
		encoding: 'utf8'
	});
	if (result.status !== 0)
		throw new Error(
			`Could not configure ${name}: ${result.stderr.replaceAll(value, '[redacted]')}`
		);
	console.log(`${name}: configured`);
}
