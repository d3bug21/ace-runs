// Rendered control check across rides, characters and stages on a built app:
// node tests/controls-matrix.mjs <baseUrl>
import { chromium } from 'playwright-core';
const base = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(base + '/?ui-test=1');
await page.waitForFunction(() => window.__aceRuns?.app);
const rows = [];
const combos = [];
for (const ride of ['shoes', 'bike', 'scooter', 'skate']) for (const [character, stage] of [['ace', 'indoor'], ['ciela', 'jungle'], ['ace', 'parks'], ['ciela', 'arcade'], ['ace', 'sports'], ['ciela', 'outdoor']]) combos.push({ ride, character, stage });
for (const c of combos) {
  await page.evaluate((o) => window.__aceRuns.app.startRunDirect({ ...o, mode: 'adventure', seed: 7, skipCountdown: true }), c);
  await page.waitForTimeout(400);
  const r = {};
  for (const [code, kind] of [['KeyA', 'x'], ['ArrowLeft', 'x'], ['KeyD', 'x'], ['ArrowRight', 'x'], ['KeyW', 'y'], ['ArrowUp', 'y'], ['KeyS', 's'], ['ArrowDown', 's']]) {
    // every lateral key starts from the same fresh centre-lane state
    if (kind === 'x') { await page.evaluate((o) => window.__aceRuns.app.startRunDirect({ ...o, mode: 'adventure', seed: 7, skipCountdown: true }), c); await page.waitForTimeout(300); }
    const before = await page.evaluate(() => { const e = window.__aceRuns.engine; return { x: e.x, lane: e.lane, cam: e.probeSample().right }; });
    await page.keyboard.press(code);
    let v;
    if (kind === 'x') { await page.waitForTimeout(260); v = await page.evaluate(() => window.__aceRuns.engine.x); r[code] = +(v - before.x).toFixed(2); }
    else if (kind === 'y') { await page.waitForTimeout(150); v = await page.evaluate(() => window.__aceRuns.engine.y); r[code] = +v.toFixed(2); await page.waitForTimeout(700); }
    else { await page.waitForTimeout(120); v = await page.evaluate(() => window.__aceRuns.engine.slideT); r[code] = v >= 0 ? 'slide' : 'no'; await page.waitForTimeout(700); }
    r.right = before.cam.map((n) => +n.toFixed(3)).join(',');
  }
  rows.push({ ...c, ...r });
}
console.table(rows);
await browser.close();
