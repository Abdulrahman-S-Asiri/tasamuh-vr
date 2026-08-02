import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const url = process.env.SMOKE_URL || 'http://127.0.0.1:4173/?pro=1&debug=1';
const pageErrors = [];
let browser;
let page;

try {
	browser = await chromium.launch({
		headless: true,
		args: ['--enable-unsafe-swiftshader']
	});
	page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
	page.on('pageerror', (error) => pageErrors.push(error.message));

	const response = await page.goto(url, {
		waitUntil: 'domcontentloaded',
		timeout: 60_000
	});
	if (!response?.ok()) {
		throw new Error(`Smoke URL returned ${response?.status() ?? 'no response'}`);
	}

	await page.waitForFunction(() => window._proReady instanceof Promise, null, {
		timeout: 30_000
	});
	await page.evaluate(() => window._proReady);
	await page.waitForTimeout(2_000);

	const state = await page.evaluate(() => ({
		proEnabled: document.documentElement.classList.contains('pro-enabled'),
		scenePresent: Boolean(document.querySelector('a-scene')),
		rgbeLoaderPresent: Boolean(window._RGBELoader),
		postFxPresent: Boolean(window._PostFX),
		initError: window._proInitError || null
	}));

	const failedChecks = Object.entries(state)
		.filter(([key, value]) => key !== 'initError' && value !== true)
		.map(([key]) => key);
	if (state.initError) failedChecks.push(`initError: ${state.initError}`);
	if (pageErrors.length) failedChecks.push(...pageErrors.map((error) => `pageerror: ${error}`));

	if (failedChecks.length) {
		throw new Error(`Browser smoke failed:\n${failedChecks.join('\n')}`);
	}

	console.log('Browser smoke passed:', state);
} catch (error) {
	await mkdir('test-results', { recursive: true });
	if (page) {
		await page.screenshot({ path: 'test-results/smoke-failure.png' }).catch(() => {});
	}
	throw error;
} finally {
	await browser?.close();
}
