import { chromium } from '@playwright/test';

const [url, width, height, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: 2 });
await page.goto(url);
await page.waitForFunction(() => (window as unknown as { freecell?: { ready: boolean } }).freecell?.ready);
await page.waitForTimeout(700);
await page.screenshot({ path: out });
await browser.close();
