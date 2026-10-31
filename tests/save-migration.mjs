#!/usr/bin/env node
// Ace Runs! v1.0.1 save migration check: a v1.0.0 save that picked the girl runner under her old id
// ('moana') must load as 'ciela' with every bit of progress intact, and the re-saved JSON must not
// contain 'moana' anywhere. Boots the real app (dev server or a static server of dist/).
// Usage: node tests/save-migration.mjs [--url http://localhost:5201/index.html]
// Exit code: 0 = all assertions passed, 1 = an assertion failed, 2 = harness error.
import { chromium } from 'playwright-core';
import { join } from 'node:path';
import { homedir } from 'node:os';

const urlArg = process.argv.indexOf('--url');
const URL_BASE = urlArg > 0 ? process.argv[urlArg + 1] : 'http://localhost:5201/index.html';
const CHROME =
  process.env.CHROME_PATH ||
  join(homedir(), 'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const KEY = 'ace-runs-save-v1';

/** A v1.0.0-era save: Moana picked everywhere, half the game done. */
function legacySave() {
  const stages = {};
  ['indoor', 'arcade', 'outdoor', 'sports', 'jungle', 'parks'].forEach((id, i) => {
    stages[id] = { unlocked: i <= 3, cleared: i < 3, bestDistance: i < 3 ? 1210 + i * 100 : 0, bestEndless: i === 0 ? 2480 : 0, stars: i < 3 ? [3, 2, 1][i] : 0, plays: i < 3 ? 4 - i : 0 };
  });
  return {
    version: 1,
    settings: { music: 0.35, voice: 0.7, sfx: 0.55, hints: false, reducedMotion: true },
    character: 'moana',
    lastCharacter: 'moana',
    ride: 'scooter',
    stage: 'outdoor',
    tutorialDone: true,
    stages,
    foods: { carrot: { count: 7, firstSeen: 1730000000000 }, kiwifruit: { count: 3, firstSeen: 1730000000001 }, fizzy_can: { count: 1, firstSeen: 1730000000002 } },
    totals: { runs: 12, distance: 15432, healthy: 211, junk: 9, nearMisses: 33 },
    // per-character keys an older build or a future field could carry
    perCharacter: { moana: { runs: 9 }, ace: { runs: 3 } },
    lastVoice: 'moana_hello_1',
  };
}

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`);
};

async function boot(browser, seed) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
  await ctx.addInitScript(
    ([key, json]) => {
      if (!sessionStorage.getItem('__seeded')) {
        localStorage.clear();
        localStorage.setItem(key, json);
        sessionStorage.setItem('__seeded', '1');
      }
    },
    [KEY, JSON.stringify(seed)],
  );
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL_BASE + (URL_BASE.includes('?') ? '&' : '?') + 'ui-test=1');
  await page.waitForFunction(() => !!window.__aceRuns?.app, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  return { ctx, page, errors };
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=metal'] });

  // ---- 1. full legacy save
  {
    const seed = legacySave();
    const { ctx, page, errors } = await boot(browser, seed);
    const st = await page.evaluate(() => window.__aceRuns.app.save.state);
    const stored = await page.evaluate((k) => localStorage.getItem(k), KEY);
    const parsed = JSON.parse(stored || '{}');
    check('character migrated to ciela (live state)', st.character === 'ciela', st.character);
    check('character migrated to ciela (re-saved JSON)', parsed.character === 'ciela', parsed.character);
    check("re-saved JSON contains no 'moana' (any case)", !/moana/i.test(stored || ''), (stored || '').match(/.{0,20}moana.{0,20}/i)?.[0] ?? '');
    check('legacy lastCharacter folded away', !('lastCharacter' in parsed));
    const sOk = ['indoor', 'arcade', 'outdoor', 'sports', 'jungle', 'parks'].every((id) => {
      const a = st.stages[id];
      const b = seed.stages[id];
      return a.unlocked === b.unlocked && a.cleared === b.cleared && a.bestDistance === b.bestDistance && a.bestEndless === b.bestEndless && a.stars === b.stars && a.plays === b.plays;
    });
    check('stage progress intact (unlocked/cleared/best/stars/plays for all 6)', sOk);
    check('foods intact', st.foods.carrot?.count === 7 && st.foods.kiwifruit?.count === 3 && st.foods.fizzy_can?.count === 1 && Object.keys(st.foods).length === 3);
    const se = st.settings;
    check('settings intact', se.music === 0.35 && se.voice === 0.7 && se.sfx === 0.55 && se.hints === false && se.reducedMotion === true);
    check('totals intact', JSON.stringify(st.totals) === JSON.stringify(seed.totals));
    check('ride / stage / tutorialDone intact', st.ride === 'scooter' && st.stage === 'outdoor' && st.tutorialDone === true);
    // the UI shows her as Ciela, selected
    await page.evaluate(() => window.__aceRuns.app.debugScreen('character'));
    await page.waitForTimeout(500);
    const ui = await page.evaluate(() => {
      const card = document.querySelector('.kid-card.ciela');
      return { selected: !!card?.classList.contains('selected'), name: card?.querySelector('.pick-name')?.textContent, label: card?.getAttribute('aria-label'), anyMoana: /moana/i.test(document.getElementById('ui')?.innerHTML ?? '') };
    });
    check('character select shows "Ciela" selected', ui.selected && ui.name === 'Ciela' && ui.label === 'Ciela', JSON.stringify(ui));
    check("no 'Moana' anywhere in the UI markup", !ui.anyMoana);
    check('no page errors', errors.length === 0, errors.join(' | '));
    // reload: still ciela, still no moana (idempotent)
    await page.reload();
    await page.waitForFunction(() => !!window.__aceRuns?.app);
    const again = await page.evaluate((k) => ({ c: window.__aceRuns.app.save.state.character, raw: localStorage.getItem(k) }), KEY);
    check('reload keeps ciela + clean JSON', again.c === 'ciela' && !/moana/i.test(again.raw || ''));
    await ctx.close();
  }

  // ---- 2. only the legacy field name, capitalised value
  {
    const { ctx, page } = await boot(browser, { lastCharacter: 'Moana', tutorialDone: true, stages: { indoor: { cleared: true, stars: 2 } } });
    const st = await page.evaluate(() => window.__aceRuns.app.save.state);
    const stored = await page.evaluate((k) => localStorage.getItem(k), KEY);
    check("lastCharacter:'Moana' alone -> ciela", st.character === 'ciela' && !/moana/i.test(stored || ''), st.character);
    check('cleared stage still opens the next place', st.stages.indoor.cleared && st.stages.arcade.unlocked && st.stages.indoor.stars === 2);
    await ctx.close();
  }

  // ---- 3. an Ace save is left alone
  {
    const { ctx, page } = await boot(browser, { ...legacySave(), character: 'ace', lastCharacter: undefined, perCharacter: undefined, lastVoice: undefined });
    const st = await page.evaluate(() => window.__aceRuns.app.save.state);
    check('ace save stays ace', st.character === 'ace' && st.totals.runs === 12);
    await ctx.close();
  }

  await browser.close();
  const fails = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - fails}/${results.length} passed`);
  process.exitCode = fails ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
