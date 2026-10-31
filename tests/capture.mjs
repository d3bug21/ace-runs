// Drives the real built app through the whole flow and saves screenshots.
// node tests/capture.mjs <baseUrl> <outDir> [width height]
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
const [base, out, W = '1920', H = '1080'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const bot = readFileSync(new URL('./bot.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
async function ctx(save) {
  const c = await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
  await c.addInitScript(bot);
  if (save) await c.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ace-runs-save-v1', s); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(save));
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => { if (m.type() === 'error' && !/404|favicon/.test(m.text())) errors.push(m.text()); });
  await p.goto(base + '/?ui-test=1');
  await p.waitForFunction(() => window.__aceRuns?.app);
  return { c, p };
}
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` });
const state = (p) => p.evaluate(() => window.__aceRuns.app.state);
const click = (p, name) => p.getByRole('button', { name, exact: false }).first().click({ force: true });
const hud = (p) => p.evaluate(() => window.__aceRuns.engine.hud());
async function waitState(p, s, ms = 20000) { const t = Date.now(); while (Date.now() - t < ms) { if ((await state(p)) === s) return true; await p.waitForTimeout(200); } return false; }
async function waitDist(p, d, ms = 200000) { const t = Date.now(); while (Date.now() - t < ms) { const h = await hud(p); if (h.distance >= d || !h.running) return h; await p.waitForTimeout(250); } return hud(p); }

// ---- 1. first-time flow: boot -> title -> character -> ride -> tutorial -> stages
{
  const { c, p } = await ctx(null);
  await p.waitForTimeout(2500);
  await shot(p, '00-boot');
  await click(p, 'Play'); await waitState(p, 'title'); await p.waitForTimeout(1500);
  await shot(p, '01-title');
  await click(p, 'Play'); await waitState(p, 'character'); await p.waitForTimeout(1200);
  await click(p, 'Moana'); await p.waitForTimeout(1500);
  await shot(p, '02-character');
  await click(p, 'Next'); await waitState(p, 'ride'); await p.waitForTimeout(800);
  await click(p, 'Bike'); await p.waitForTimeout(1800);
  await shot(p, '03-ride');
  await click(p, "Let's go"); await p.waitForTimeout(500);
  // Tutorial: answer each hint with the right key.
  const keys = { left: 'KeyA', right: 'KeyD', jump: 'KeyW', slide: 'KeyS' };
  const done = new Set(); const t0 = Date.now(); let shotTut = false;
  while (Date.now() - t0 < 90000) {
    const st = await state(p);
    if (st !== 'run') { if (done.size) break; await p.waitForTimeout(200); continue; }
    const h = await hud(p);
    const step = h.tutorialStep;
    if (step && keys[step] && !done.has(step)) {
      await p.waitForTimeout(900);
      if (step === 'jump' && !shotTut) { await shot(p, '04-tutorial'); shotTut = true; }
      await p.keyboard.press(keys[step]); done.add(step);
    }
    if (step === 'healthy' && !done.has('h')) { done.add('h'); await p.waitForTimeout(1500); await shot(p, '04b-tutorial-healthy'); }
    if (step === 'junk' && !done.has('j')) { done.add('j'); await p.waitForTimeout(1800); await shot(p, '04c-tutorial-junk'); }
    await p.waitForTimeout(150);
  }
  await p.waitForTimeout(3000);
  console.log('after tutorial state', await state(p));
  if ((await state(p)) === 'results') { await shot(p, '04d-tutorial-results'); }
  await waitState(p, 'stage', 15000) || await p.evaluate(() => window.__aceRuns.app.goStages());
  await p.waitForTimeout(1500);
  await shot(p, '05-stages-fresh');
  await c.close();
}

// ---- 2. stage runs with everything unlocked
const unlocked = { tutorialDone: true, stages: Object.fromEntries(['indoor', 'arcade', 'outdoor', 'sports', 'jungle', 'parks'].map((s) => [s, { unlocked: true, cleared: true, bestDistance: 900, stars: 2 }])) };
const runs = [['indoor', 'ace', 'shoes', [260]], ['arcade', 'moana', 'skate', [300]], ['outdoor', 'ace', 'scooter', [280]], ['sports', 'moana', 'bike', [150, 560, 1150]], ['jungle', 'ace', 'skate', [320, 700]], ['parks', 'moana', 'shoes', [180, 630, 1080, 1540]]];
for (const [stage, ch, ride, at] of runs) {
  const { c, p } = await ctx(unlocked);
  await p.evaluate(([s, ch, r]) => { const a = window.__aceRuns.app; a.selectCharacter(ch, false); a.selectRide(r, false); a.startStage(s, 'adventure'); }, [stage, ch, ride]);
  await waitState(p, 'run'); await p.waitForTimeout(3600);
  await p.evaluate(() => window.__startBot());
  let i = 0;
  for (const d of at) { const h = await waitDist(p, d); await shot(p, `06-${stage}-${++i}-${h.section.id}`); }
  if (stage === 'indoor') {
    // a food-benefit moment
    await p.evaluate(() => { window.__foodShot = null; window.__aceRuns.engine.on((e) => { if (e.type === 'food' && e.food.kind === 'healthy' && e.count >= 2 && ['vision', 'shield', 'muscles', 'bones', 'refresh'].includes(e.food.benefit) && !window.__foodShot) window.__foodShot = e.food.benefit; }); });
    for (let k = 0; k < 400; k++) { await p.waitForTimeout(100); if (await p.evaluate(() => window.__foodShot)) break; }
    await p.waitForTimeout(350); await shot(p, '07-food-benefit');
    const h = await waitDist(p, 5000, 150000);
    await waitState(p, 'results', 20000); await p.waitForTimeout(4500);
    await shot(p, '08-results');
    await p.evaluate(() => window.__aceRuns.app.openBook()); await p.waitForTimeout(1500);
    await shot(p, '09-book');
    void h;
  }
  if (stage === 'parks') { await p.evaluate(() => window.__aceRuns.app.goStages?.()); }
  await c.close();
}
// ---- 3. menus with progress
{
  const { c, p } = await ctx(unlocked);
  await p.evaluate(() => window.__aceRuns.app.goStages()); await p.waitForTimeout(1800);
  await shot(p, '05-stages');
  await p.evaluate(() => window.__aceRuns.app.openSettings()); await p.waitForTimeout(1000);
  await shot(p, '10-settings');
  await c.close();
}
console.log('errors:', JSON.stringify(errors.slice(0, 10)));
await browser.close();
