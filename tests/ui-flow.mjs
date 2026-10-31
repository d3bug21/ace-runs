#!/usr/bin/env node
// Ace Runs! UI flow checks: keyboard-only navigation through the menus, Esc = back,
// ghost-click protection (the tap that opened a screen never activates the next one), a swipe
// that ends on a button never activates it, pause/resume gating of engine input, and save
// robustness (corrupted JSON). Usage: node tests/ui-flow.mjs [--url http://localhost:5201/dev/ui.html]
import { chromium } from 'playwright-core';
import { join } from 'node:path';
import { homedir } from 'node:os';

const urlArg = process.argv.indexOf('--url');
const URL_BASE = urlArg > 0 ? process.argv[urlArg + 1] : 'http://localhost:5201/dev/ui.html';
const CHROME = process.env.CHROME_PATH || join(homedir(), 'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};

const browser = await chromium.launch({ executablePath: CHROME });
const state = (p) => p.evaluate(() => window.__aceRuns.app.state);
const wait = (p, ms) => p.waitForTimeout(ms);

async function fresh(opts = {}, saveJson = null) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, ...opts });
  await ctx.addInitScript((s) => {
    if (s !== null && !sessionStorage.getItem('__seeded')) {
      localStorage.setItem('ace-runs-save-v1', s);
      sessionStorage.setItem('__seeded', '1');
    }
  }, saveJson);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  pageerror:', e.message));
  await p.goto(URL_BASE + (URL_BASE.includes('?') ? '&' : '?') + 'ui-test=1');
  await p.waitForFunction(() => !!window.__aceRuns?.app);
  return { ctx, p };
}

// 1. keyboard-only flow (desktop)
{
  const { ctx, p } = await fresh({}, JSON.stringify({ tutorialDone: true }));
  await p.waitForFunction(() => !document.querySelector('.boot .play-btn')?.classList.contains('hidden'), null, { timeout: 15000 });
  await wait(p, 400);
  await p.keyboard.press('Enter');
  await wait(p, 500);
  check('Enter on boot Play -> title', (await state(p)) === 'title');
  await p.keyboard.press('Enter');
  await wait(p, 500);
  check('Enter on title Play -> character', (await state(p)) === 'character');
  await p.keyboard.press('ArrowRight');
  await wait(p, 200);
  check('ArrowRight on character picker selects Moana', (await p.evaluate(() => window.__aceRuns.app.save.state.character)) === 'moana');
  await p.keyboard.press('ArrowLeft');
  await wait(p, 200);
  check('ArrowLeft selects Ace', (await p.evaluate(() => window.__aceRuns.app.save.state.character)) === 'ace');
  await p.keyboard.press('Escape');
  await wait(p, 500);
  check('Esc on character -> title', (await state(p)) === 'title');
  await p.keyboard.press('Enter');
  await wait(p, 500);
  // Tab to Next and press Space
  await p.evaluate(() => document.querySelector('.character .dock .btn')?.focus());
  await p.keyboard.press('Space');
  await wait(p, 500);
  check('Space on Next -> ride', (await state(p)) === 'ride');
  await p.keyboard.press('ArrowDown');
  await wait(p, 200);
  const ride = await p.evaluate(() => window.__aceRuns.app.save.state.ride);
  check('Arrow keys change ride', ride !== 'shoes', ride);
  await p.evaluate(() => document.querySelector('.ride .dock .btn')?.focus());
  await p.keyboard.press('Enter');
  await wait(p, 500);
  check("Let's go (tutorial done) -> stage select", (await state(p)) === 'stage');
  await p.keyboard.press('Escape');
  await wait(p, 450);
  check('Esc on stages -> ride', (await state(p)) === 'ride');
  await ctx.close();
}

// 2. ghost click: tap Play on title, then tap again at the same spot 60 ms later
{
  const { ctx, p } = await fresh({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, JSON.stringify({ tutorialDone: true }));
  await p.evaluate(() => window.__aceRuns.app.debugScreen('character'));
  await wait(p, 600);
  const box = await p.locator('.character .dock .btn').boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await p.mouse.click(x, y);
  await wait(p, 60);
  const under = await p.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('button')?.textContent?.trim() || '-', [x, y]);
  await p.mouse.click(x, y);
  await wait(p, 120);
  const c = await p.evaluate(() => window.__aceRuns.app.save.state.character);
  check('ghost tap within 350 ms is ignored', (await state(p)) === 'ride', `under="${under}" char=${c}`);
  await p.evaluate(() => window.__aceRuns.app.debugScreen('character'));
  // 3. a swipe that starts off-button and ends on the Next button does nothing
  await wait(p, 500);
  const nb = await p.locator('.character .dock .btn').boundingBox();
  await p.mouse.move(nb.x + nb.width / 2, nb.y - 220);
  await p.mouse.down();
  await p.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2, { steps: 6 });
  await p.mouse.up();
  await wait(p, 200);
  check('swipe ending on a button does not activate it', (await state(p)) === 'character');
  // a proper tap does
  await p.locator('.character .dock .btn').click();
  await wait(p, 300);
  check('a real tap on Next works', (await state(p)) === 'ride');
  await ctx.close();
}

// 4. pause / resume gating
{
  const { ctx, p } = await fresh({}, JSON.stringify({ tutorialDone: true }));
  const inputLog = await p.evaluate(async () => {
    const a = window.__aceRuns;
    const log = [];
    const orig = a.engine.setInputEnabled.bind(a.engine);
    a.engine.setInputEnabled = (on) => {
      log.push(on);
      orig(on);
    };
    window.__inputLog = log;
    await a.app.startRunDirect({ stage: 'indoor', mode: 'adventure', character: 'ace', ride: 'shoes', skipCountdown: true });
    return log.slice();
  });
  check('startRunDirect enables input', inputLog[inputLog.length - 1] === true);
  await wait(p, 400);
  await p.locator('.hud-btn.pause').click();
  await wait(p, 400);
  const paused = await p.evaluate(() => ({ s: window.__aceRuns.app.state, eng: window.__aceRuns.engine.paused, last: window.__inputLog[window.__inputLog.length - 1], shown: !document.querySelector('.modal-layer.pause').classList.contains('hidden') }));
  check('pause button pauses engine + disables input + shows menu', paused.eng && paused.last === false && paused.shown);
  await p.keyboard.press('Escape');
  await wait(p, 400);
  const resumed = await p.evaluate(() => ({ eng: window.__aceRuns.engine.paused, last: window.__inputLog[window.__inputLog.length - 1], hidden: document.querySelector('.modal-layer.pause').classList.contains('hidden') }));
  check('Esc in pause menu resumes + re-enables input', !resumed.eng && resumed.last === true && resumed.hidden, JSON.stringify(resumed));
  // gameplay keys are never swallowed by the UI during a run
  const isFake = await p.evaluate(() => !!window.__aceRuns.fake);
  const prevented = await p.evaluate(() => {
    const ks = ['a', 'd', 'w', 's', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    return ks.filter((k) => {
      const e = new KeyboardEvent('keydown', { key: k, cancelable: true, bubbles: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
  });
  // (the real engine itself preventDefaults gameplay keys to stop page scrolling; only the UI layer is checked)
  if (isFake) check('UI never preventDefaults gameplay keys in a run', prevented.length === 0, prevented.join(','));
  await ctx.close();
}

// 5. corrupted save is survivable
{
  const { ctx, p } = await fresh({}, '{"settings": {"music": "loud"}, "stages": [1,2], "foods": {"nope": 3, "carrot": {"count": -4}}, ');
  const s = await p.evaluate(() => window.__aceRuns.app.save.state);
  check('corrupted save -> fresh defaults, first place unlocked', s.stages.indoor.unlocked && !s.stages.arcade.unlocked && s.settings.music === 0.6);
  await ctx.close();
  const { ctx: c2, p: p2 } = await fresh({}, JSON.stringify({ settings: { music: 7, voice: -1 }, stages: { indoor: { cleared: true } }, foods: { carrot: { count: 2 }, fake: { count: 9 } } }));
  const s2 = await p2.evaluate(() => window.__aceRuns.app.save.state);
  check('partial save sanitised (clamped volumes, next place opened, unknown food dropped)', s2.settings.music === 1 && s2.settings.voice === 0 && s2.stages.arcade.unlocked && !s2.foods.fake && s2.foods.carrot.count === 2);
  await c2.close();
}

await browser.close();
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exitCode = fails ? 1 : 0;
