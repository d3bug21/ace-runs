// Renders the app icon SVGs to PNGs locally (no downloads): PWA icons, apple-touch-icon, Electron icon.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
const CHROME = process.env.CHROME_PATH || join(homedir(), 'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const jobs = [
  ['build/icon.svg', 'public/icons/icon-192.png', 192, true],
  ['build/icon.svg', 'public/icons/icon-512.png', 512, true],
  ['build/icon-maskable.svg', 'public/icons/maskable-192.png', 192, false],
  ['build/icon-maskable.svg', 'public/icons/maskable-512.png', 512, false],
  ['build/icon-apple.svg', 'public/icons/apple-touch-icon.png', 180, false],
  ['build/icon.svg', 'build/icon.png', 1024, true],
  ['build/icon-maskable.svg', 'build/icon-maskable.png', 1024, false],
];
const b = await chromium.launch({ executablePath: CHROME });
for (const [src, out, size, transparent] of jobs) {
  const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const svg = readFileSync(src, 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" `);
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await p.screenshot({ path: out, omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  await p.close();
  console.log('wrote', out);
}
await b.close();
