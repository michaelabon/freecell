import { chromium } from '@playwright/test';

// Usage: node scripts/icons.ts
// Redraws the app icons in public/ from the same spade as the favicon in index.html.
// The background runs to the edges because iOS and macOS cut the corners themselves.
const SPADE =
  'M50 14 C60 32 86 46 86 64 C86 76 77 82 68 82 C61 82 56 79 54 74 C55 82 58 87 64 91 L36 91 C42 87 45 82 46 74 C44 79 39 82 32 82 C23 82 14 76 14 64 C14 46 40 32 50 14 Z';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#173038"/><g transform="translate(50 50) scale(0.74) translate(-50 -52.5)"><path fill="#f3b93f" d="${SPADE}"/></g></svg>`;

const sizes: [string, number][] = [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
];

const browser = await chromium.launch({ channel: 'chrome' });
for (const [name, size] of sizes) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: new URL(`../public/${name}`, import.meta.url).pathname });
  await page.close();
}
await browser.close();
