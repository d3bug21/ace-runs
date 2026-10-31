// Replica of the coordinator's directional-control gate, for local self-checks.
// Usage: node tests/directional.mjs <url-with-?oneshot-directional-probe=1> [holdMs]
// Fresh browser context per key, clock paused at 2000-01-01, 16 ms run_for steps, CDP key events.
import { chromium } from 'playwright-core';

const url = process.argv[2];
const hold = Number(process.argv[3] || 400);
const KEYS = [['KeyA', 'left'], ['ArrowLeft', 'left'], ['KeyD', 'right'], ['ArrowRight', 'right']];
const PROBE = '__ONESHOT_DIRECTIONAL_CONTROL_PROBE__';

async function evaluateClocked(page, expr) {
  await page.evaluate((expression) => {
    const state = { status: 'pending' };
    window.__EVAL__ = state;
    Promise.resolve().then(() => (0, eval)(expression)).then(
      (v) => { state.value = v; state.status = 'resolved'; },
      (e) => { state.error = String(e); state.status = 'rejected'; });
  }, expr);
  for (let el = 0; el <= 15000; el += 16) {
    const s = await page.evaluate(() => window.__EVAL__);
    if (s.status === 'resolved') return s.value;
    if (s.status === 'rejected') throw new Error(s.error);
    await page.clock.runFor(16);
  }
  throw new Error('evaluation exceeded virtual time');
}

const results = [];
for (const [code, expected] of KEYS) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.clock.pauseAt(new Date('2000-01-01T00:00:00Z'));
    await context.addInitScript('void Date.now();');
    await page.goto(url, { waitUntil: 'load' });
    let ok = false;
    for (let el = 0; el <= 15000; el += 16) {
      if (await page.evaluate((g) => document.readyState === 'complete' && Boolean(window[g]), PROBE)) { ok = true; break; }
      await page.clock.runFor(16);
    }
    if (!ok) throw new Error('probe missing; errors: ' + errors.join(' | '));
    const t0 = Date.now();
    const before = await evaluateClocked(page, `(async () => { const p = window.${PROBE}; await p.reset(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return await p.sample(); })()`);
    const resetMs = Date.now() - t0;
    await page.keyboard.down(code);
    await page.clock.runFor(hold);
    await page.keyboard.up(code);
    const after = await evaluateClocked(page, `(async () => { const p = window.${PROBE}; await new Promise(r => requestAnimationFrame(r)); return await p.sample(); })()`);
    const r = before.right; const m = Math.hypot(...r);
    const delta = after.position.map((v, i) => v - before.position[i]);
    const value = delta.reduce((s, d, i) => s + d * r[i] / m, 0);
    const passed = expected === 'left' ? value < -1e-4 : value > 1e-4;
    results.push({ code, expected, frame: before.frame, value: Number(value.toFixed(4)), passed, before: before.position.map((v) => +v.toFixed(3)), after: after.position.map((v) => +v.toFixed(3)), right: r, resetWallMs: resetMs, errors });
  } finally { await browser.close(); }
}
console.log(JSON.stringify(results, null, 1));
process.exit(results.every((r) => r.passed) ? 0 : 1);
