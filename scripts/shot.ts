import { chromium } from '@playwright/test';

// Usage: node scripts/shot.ts <url> <width> <height> <out.png> [card codes to click...]
const [url, width, height, out, ...clicks] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) }, deviceScaleFactor: 2 });
await page.goto(url);
await page.waitForFunction(() => (window as unknown as { freecell?: { ready: boolean } }).freecell?.ready);
for (const code of clicks) {
  if (code === 'hint') await page.keyboard.press('h');
  else await page.locator(`[data-card="${code}"]`).click({ position: { x: 10, y: 6 } });
  await page.waitForTimeout(1200);
}
await page.waitForTimeout(700);
await page.screenshot({ path: out });
await browser.close();
