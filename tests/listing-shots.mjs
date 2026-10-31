// Store-listing captures (1920x1080) driven through the real built app, plus an optional short WebM clip.
// node tests/listing-shots.mjs <baseUrl> <outDir> [--clip <out.webm>]
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const [base, out] = process.argv.slice(2);
const clipIdx = process.argv.indexOf('--clip');
const clipOut = clipIdx > 0 ? process.argv[clipIdx + 1] : null;
mkdirSync(out, { recursive: true });
const bot = readFileSync(new URL('./bot.js', import.meta.url), 'utf8');
const ALL = ['indoor', 'arcade', 'outdoor', 'sports', 'jungle', 'parks'];
const BOOK = ['carrot_sticks', 'carrot', 'broccoli', 'spinach', 'peas', 'milk', 'yoghurt', 'cheese', 'orange', 'kiwifruit', 'feijoa', 'strawberry', 'banana', 'corn', 'kumara', 'bread', 'water', 'watermelon', 'egg', 'chicken', 'fish', 'apple_slices', 'fruit_salad'];
const SAVE = { tutorialDone: true, character: 'ciela', foods: Object.fromEntries(BOOK.map((id, i) => [id, { count: 3 + (i % 7), firstSeen: 1767225600000 + i }])), stages: Object.fromEntries(ALL.map((s) => [s, { unlocked: true, cleared: true, bestDistance: 1200, stars: 3 }])) };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-angle=metal'] });
const errors = [];

async function page(w = 1920, h = 1080) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await ctx.addInitScript(bot);
  await ctx.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ace-runs-save-v1', s); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(SAVE));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(String(e)));
  await p.goto(base + '/?ui-test=1');
  await p.waitForFunction(() => window.__aceRuns?.app);
  return { ctx, p };
}
const run = (p, o) => p.evaluate((o) => window.__aceRuns.app.startRunDirect({ mode: 'adventure', skipCountdown: true, ...o }), o);
const startBot = (p) => p.evaluate(() => window.__startBot());
/** Wait until a page-side predicate over the engine holds (polling every 100 ms). */
async function until(p, fnSrc, ms = 120000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await p.evaluate(fnSrc)) return true;
    await p.waitForTimeout(100);
  }
  return false;
}

// 1. Cover art: title backdrop, both kids flexing, menu buttons hidden (logo kept).
{
  const { ctx, p } = await page();
  await p.evaluate(() => window.__aceRuns.app.goTitle());
  await p.waitForTimeout(1200);
  await p.addStyleTag({ content: '#ui .title button, #ui .title .row, #ui .title .chip-btn, #ui .title .primary { visibility: hidden !important; }' });
  await p.evaluate(() => { window.__aceRuns.engine.menu.poseOverride = { flex: 1 }; });
  await p.waitForTimeout(1800);
  await p.screenshot({ path: `${out}/00-cover-title.png` });
  await ctx.close();
}
// 2. Ride select: Ciela on the bike (real clicks).
{
  const { ctx, p } = await page();
  await p.evaluate(() => window.__aceRuns.app.goCharacter());
  await p.waitForTimeout(900);
  await p.getByRole('button', { name: 'Ciela' }).first().click({ force: true });
  await p.waitForTimeout(700);
  await p.getByRole('button', { name: 'Next' }).first().click({ force: true });
  await p.waitForTimeout(900);
  await p.getByRole('button', { name: 'Bike' }).first().click({ force: true });
  await p.waitForTimeout(2200);
  await p.screenshot({ path: `${out}/listing-ride-select-ciela-bike.png` });
  await ctx.close();
}
// 3. Places.
{
  const { ctx, p } = await page();
  await p.evaluate(() => window.__aceRuns.app.goStages());
  await p.waitForTimeout(2000);
  await p.screenshot({ path: `${out}/listing-places.png` });
  await ctx.close();
}
// 4. Indoor playground carrot power (Ciela).
{
  const { ctx, p } = await page();
  await run(p, { character: 'ciela', ride: 'shoes', stage: 'indoor', seed: 21 });
  await p.evaluate(() => { window.__hit = 0; window.__aceRuns.engine.on((e) => { if (e.type === 'food' && e.food.benefit === 'vision' && !window.__hit) window.__hit = 1; }); });
  await startBot(p);
  await until(p, () => window.__hit === 1);
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/listing-indoor-carrot-power-ciela.png` });
  await ctx.close();
}
// 5. Arcade glow (healthy-and-happy golden aura).
{
  const { ctx, p } = await page();
  await run(p, { character: 'ciela', ride: 'skate', stage: 'arcade', seed: 8 });
  await startBot(p);
  await until(p, () => window.__aceRuns.engine.hud().power.happyAndHealthy, 180000);
  await p.waitForTimeout(1600);
  await p.screenshot({ path: `${out}/listing-arcade-glow.png` });
  await ctx.close();
}
// 6. Sports rugby slide (Ciela).
{
  const { ctx, p } = await page();
  await run(p, { character: 'ciela', ride: 'shoes', stage: 'sports', seed: 5 });
  await startBot(p);
  await until(p, () => window.__aceRuns.engine.slideT > 0.12 && window.__aceRuns.engine.slideT < 0.4 && window.__aceRuns.engine.hud().section.id === 'rugby', 60000);
  await p.screenshot({ path: `${out}/listing-sports-rugby-slide-ciela.png` });
  await ctx.close();
}
// 7. Jungle: Ace on the skateboard with a shield, animals around.
{
  const { ctx, p } = await page();
  await run(p, { character: 'ace', ride: 'skate', stage: 'jungle', seed: 9 });
  await startBot(p);
  await until(p, () => {
    const e = window.__aceRuns.engine;
    if (e.power.shield <= 0) return false;
    return e.track.obstacles.some((o) => /mover|high/.test(o.kind) && o.dc - e.dist > 6 && o.dc - e.dist < 26);
  }, 180000);
  await p.waitForTimeout(150);
  await p.screenshot({ path: `${out}/listing-jungle-ace-skate-shield.png` });
  await ctx.close();
}
// 8. Parks in spring (Ciela).
{
  const { ctx, p } = await page();
  await run(p, { character: 'ciela', ride: 'scooter', stage: 'parks', seed: 3 });
  await startBot(p);
  await until(p, () => window.__aceRuns.engine.hud().section.id === 'spring' && window.__aceRuns.engine.dist > 560, 180000);
  await p.screenshot({ path: `${out}/listing-parks-spring-ciela.png` });
  await ctx.close();
}
// 9. Food friends book (with a good number of friends found).
{
  const { ctx, p } = await page();
  await p.evaluate(() => window.__aceRuns.app.openBook());
  await p.waitForTimeout(1800);
  await p.screenshot({ path: `${out}/listing-food-friends-book.png` });
  await ctx.close();
}
// 10. Optional ~8 s 640x360 gameplay clip of Ciela (canvas.captureStream + MediaRecorder, VP9/VP8).
if (clipOut) {
  const { ctx, p } = await page(640, 360);
  await run(p, { character: 'ciela', ride: 'shoes', stage: 'parks', seed: 12 });
  await startBot(p);
  await p.waitForTimeout(2500);
  const b64 = await p.evaluate(async () => {
    const canvas = document.querySelector('canvas.engine-canvas');
    const stream = canvas.captureStream(30);
    const type = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm;codecs=vp8';
    const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 380000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((r) => (rec.onstop = r));
    rec.start(250);
    await new Promise((r) => setTimeout(r, 8000));
    rec.stop();
    await done;
    const buf = new Uint8Array(await new Blob(chunks, { type }).arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { b64: btoa(s), type };
  });
  writeFileSync(clipOut, Buffer.from(b64.b64, 'base64'));
  console.log('clip', clipOut, b64.type, Buffer.from(b64.b64, 'base64').length, 'bytes');
  await ctx.close();
}
console.log('errors:', JSON.stringify(errors.slice(0, 8)));
await browser.close();
