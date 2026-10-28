// Renders the PWA PNG icons from the SVG sources with Playwright's bundled Chromium (ADR-10).
// The PNGs are committed, so the Vercel build does not need a browser. Run: npm run icons
import { copyFileSync, readFileSync } from 'node:fs';
// The browser lives inside node_modules (ADR-11); set the path before Playwright loads.
process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
const { chromium } = await import('@playwright/test');

const outputs = [
  { source: 'public/icons/icon.svg', file: 'public/icons/icon-192.png', size: 192 },
  { source: 'public/icons/icon.svg', file: 'public/icons/icon-512.png', size: 512 },
  { source: 'public/icons/icon-maskable.svg', file: 'public/icons/icon-maskable-512.png', size: 512 },
  { source: 'public/icons/icon-maskable.svg', file: 'public/icons/apple-touch-icon.png', size: 180 },
];

const browser = await chromium.launch();
try {
  for (const { source, file, size } of outputs) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    const svg = readFileSync(source, 'utf8');
    await page.setContent(
      `<html><body style="margin:0;background:transparent">` +
        `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block"></body></html>`,
    );
    await page.screenshot({ path: file, omitBackground: true });
    await page.close();
    console.log(`Wrote ${file}`);
  }
} finally {
  await browser.close();
}

copyFileSync('public/icons/icon.svg', 'public/favicon.svg');
console.log('Wrote public/favicon.svg');
