// Live-run HUD overlap check: every visible HUD block (hearts, food count, progress, glow meter, pause,
// each power icon, each toast, banner, near-miss cheer, hint, tutorial bubble, countdown) is tested
// pairwise for rectangle overlap on every animation frame while the autopilot plays.
// node tests/hud-overlap.mjs <baseUrl> <W> <H> <d|m> <stage> [mode]
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const [base, W, H, kind, stage, mode = 'adventure'] = process.argv.slice(2);
const mob = kind === 'm';
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-angle=metal'] });
const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: mob ? 3 : 1, isMobile: mob, hasTouch: mob });
await ctx.addInitScript(readFileSync(new URL('./bot.js', import.meta.url), 'utf8'));
const p = await ctx.newPage();
await p.goto(base + '/?ui-test=1');
await p.waitForFunction(() => window.__aceRuns?.app);
await p.evaluate(async ([s, m]) => {
  await window.__aceRuns.app.startRunDirect({ character: 'ciela', ride: 'bike', stage: s, mode: m, seed: 4, skipCountdown: m !== 'tutorial' });
  if (m !== 'tutorial') window.__startBot();
  window.__hits = []; window.__samples = 0;
  const shown = (e) => e.offsetParent !== null && !e.classList.contains('hidden') && +getComputedStyle(e).opacity > 0.05 && e.getBoundingClientRect().width > 2;
  const blocks = () => {
    const hud = document.querySelector('.hud');
    if (!hud) return [];
    const out = [];
    const pick = (sel) => hud.querySelectorAll(sel).forEach((e) => shown(e) && out.push(e));
    pick('.hearts'); pick('.food-count'); pick('.progress'); pick('.dist'); pick('.glow-meter'); pick('.hud-right button, .hud-top button');
    pick('.powers > *'); pick('.toasts > .toast'); pick('.banner'); pick('.near-chip'); pick('.run-hint'); pick('.tut-bubble'); pick('.countdown .cd-n');
    return out;
  };
  const tick = () => {
    window.__samples++;
    const bs = blocks();
    const rs = bs.map((e) => e.getBoundingClientRect());
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      if (bs[i].contains(bs[j]) || bs[j].contains(bs[i])) continue;
      const a = rs[i], c = rs[j];
      if (a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1 && window.__hits.length < 30)
        window.__hits.push(`${bs[i].className.slice(0, 24)} x ${bs[j].className.slice(0, 24)} @${Math.round(window.__aceRuns.engine.hud().distance)}m`);
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, [stage, mode]);
await p.waitForTimeout(mode === 'tutorial' ? 45000 : 70000);
console.log(W, H, stage, mode, JSON.stringify(await p.evaluate(() => ({ samples: window.__samples, overlaps: window.__hits.length, first: window.__hits.slice(0, 4) }))));
await b.close();
