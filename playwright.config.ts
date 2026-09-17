import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests',
	testMatch: '**/*.e2e.ts',
	use: { ...devices['iPhone 13'], browserName: 'chromium', baseURL: 'http://localhost:5180' },
	webServer: {
		command: 'bun run build && bun run preview --host localhost --port 5180 --strictPort',
		url: 'http://localhost:5180',
		reuseExistingServer: !process.env.CI,
		timeout: 120000
	}
});
