// Screenshot helper: node tests/shot.mjs <url> <out.png> [width] [height] [waitMs] [keys...]
// keys: e.g. "500:KeyA" = press KeyA after 500 ms (relative to previous action)
import { chromium } from 'playwright-core';
const [url, out, w = '1280', h = '720', wait = '3000', ...keys] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-angle=metal', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e));
await page.goto(url, { waitUntil: 'load' });
for (const k of keys) { const [ms, code] = k.split(':'); await page.waitForTimeout(+ms); if (code) await page.keyboard.press(code); }
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
const hud = await page.evaluate(() => document.getElementById('hud')?.textContent || '');
console.log(hud); console.log(logs.slice(0, 15).join('\n'));
await browser.close();
