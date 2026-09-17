import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function waitForOfflineShell(page: import('@playwright/test').Page) {
	await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
	await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

test('the public application opens after a full offline reload', async ({ page, context }) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Logg inn', exact: true })).toBeVisible();
	await waitForOfflineShell(page);
	await context.setOffline(true);
	await page.reload();
	await expect(page.getByRole('button', { name: 'Logg inn', exact: true })).toBeVisible();
});

test('a saved photo remains in the local queue after an offline reload', async ({ browser }) => {
	test.skip(
		!process.env.E2E_STORAGE_STATE,
		'Set E2E_STORAGE_STATE to a test household browser session.'
	);
	const context = await browser.newContext({
		...devicesForCapture,
		storageState: process.env.E2E_STORAGE_STATE
	});
	try {
		const page = await context.newPage();
		await page.goto('http://localhost:5180');
		await expect(page.getByRole('button', { name: 'Ta bilde av kvittering' })).toBeVisible();
		await waitForOfflineShell(page);
		await page.waitForFunction(() => localStorage.getItem('receipt-household') !== null);
		await context.setOffline(true);
		await page.locator('input[type=file][multiple]').setInputFiles({
			name: 'receipt.png',
			mimeType: 'image/png',
			buffer: readFileSync('static/icon-192.png')
		});
		await page.getByRole('button', { name: 'Lagre kvittering', exact: true }).click();
		await expect(page.getByText('Lagret på denne enheten', { exact: true })).toBeVisible();
		await page.reload();
		await page
			.getByRole('navigation', { name: 'Mobilmeny' })
			.getByRole('button', { name: /Innboks/ })
			.click();
		await expect(page.getByText('Lagret på denne enheten', { exact: true })).toBeVisible();
		await expect(page.getByText('1 bilder · 0 lastet opp', { exact: true })).toBeVisible();
	} finally {
		await context.close();
	}
});

const devicesForCapture = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
