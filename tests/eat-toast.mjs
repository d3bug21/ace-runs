// Captures the eat animation frame by frame and the merged food toasts: node tests/eat-toast.mjs <baseUrl> <outDir> [w h]
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
const [base, out, W = '1280', H = '720'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-angle=metal'] });
const ctx = await browser.newContext({ viewport: { width: +W, height: +H } });
await ctx.addInitScript(readFileSync(new URL('./bot.js', import.meta.url), 'utf8'));
await ctx.addInitScript(() => { if (!sessionStorage.getItem('s')) { localStorage.setItem('ace-runs-save-v1', JSON.stringify({ tutorialDone: true })); sessionStorage.setItem('s', '1'); } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(base + '/?ui-test=1');
await p.waitForFunction(() => window.__aceRuns?.app);
await p.evaluate(() => window.__aceRuns.app.startRunDirect({ character: 'ciela', ride: 'shoes', stage: 'indoor', mode: 'adventure', seed: 3, skipCountdown: true }));
await p.evaluate(() => { window.__eats = 0; window.__aceRuns.engine.on((e) => { if (e.type === 'food') window.__eats++; }); window.__startBot(); });
await p.waitForFunction(() => window.__eats >= 1, null, { timeout: 30000 });
for (let i = 0; i < 5; i++) { await p.screenshot({ path: `${out}/eat-${i}.png` }); await p.waitForTimeout(40); }
await p.waitForFunction(() => window.__eats >= 4, null, { timeout: 30000 });
await p.waitForTimeout(150);
await p.screenshot({ path: `${out}/toast-merged.png` });
// Magnet moment (test-only: switch the power on through the engine's own state).
await p.evaluate(() => { window.__aceRuns.engine.power.magnet = 8; });
for (let i = 0; i < 6; i++) { await p.waitForTimeout(120); await p.screenshot({ path: `${out}/magnet-${i}.png` }); }
const toasts = await p.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => ({ name: t.querySelector('.toast-name')?.textContent, count: t.querySelector('.toast-count')?.textContent, hidden: t.querySelector('.toast-count')?.classList.contains('hidden'), color: getComputedStyle(t.querySelector('.toast-name')).color, size: getComputedStyle(t.querySelector('.toast-name')).fontSize })));
console.log(JSON.stringify({ toasts, errs }));
await browser.close();
