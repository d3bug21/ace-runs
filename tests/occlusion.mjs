#!/usr/bin/env node
// Ace Runs! layout + occlusion check. For every screen at every viewport it screenshots the page
// and probes each visible interactive control with document.elementFromPoint at its centre and
// at four corners inset 4 px (pulled further in along the diagonal for rounded controls so the
// probe stays inside the shape). A control passes when every probe hits it (or a descendant)
// and it lies fully inside the (visual) viewport. Controls clipped by a scroll container are
// reported as "scroll" (reachable by scrolling), not as failures, as long as the container and
// at least one item are visible.
//
// Usage:
//   node tests/occlusion.mjs [--url http://localhost:5201/dev/ui.html] [--out ../.tmp/shots/ui]
//                            [--sizes 360x640,390x844] [--screens title,stage] [--no-shots]
// Works against the dev harness (FakeEngine) or the real app: index.html?ui-test=1
// (dev server or a static server of dist/). Requires window.__aceRuns = { app, ... }.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
    return acc;
  }, []),
);
const URL_BASE = args.url || 'http://localhost:5201/dev/ui.html';
const OUT = resolve(args.out || '../.tmp/shots/ui');
const SHOTS = !args['no-shots'];
const CHROME =
  process.env.CHROME_PATH ||
  join(homedir(), 'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

// name, width, height, mobile(touch)
const ALL_SIZES = [
  ['360x640', 360, 640, true],
  ['390x844', 390, 844, true],
  ['844x390', 844, 390, true],
  ['640x360', 640, 360, true],
  ['874x350', 874, 350, true],
  ['402x760', 402, 760, true],
  // reduced visual viewports (browser toolbars eat 60-100 px)
  ['360x560r', 360, 560, true],
  ['390x744r', 390, 744, true],
  ['844x320r', 844, 320, true],
  ['402x680r', 402, 680, true],
  ['1280x800', 1280, 800, false],
  ['1366x768', 1366, 768, false],
  ['1440x900', 1440, 900, false],
  ['1920x1080', 1920, 1080, false],
];
const sizes = args.sizes ? ALL_SIZES.filter((s) => args.sizes.split(',').includes(s[0])) : ALL_SIZES;

const STATS = {
  stage: 'indoor', mode: 'adventure', character: 'ace', ride: 'shoes', distance: 1500, goal: 1500, finished: true, timeSec: 92, score: 4200,
  healthy: { carrot: 4, broccoli: 2, milk: 3, kiwifruit: 2, banana: 5, water: 3, egg: 1, fruit_salad: 1, kumara: 2, feijoa: 1, corn: 2 },
  junk: { fizzy_can: 1, lollies: 1 }, healthyTotal: 24, junkTotal: 2, nearMisses: 6, bumps: 1, bestGlowLevel: 5, happyAndHealthy: 2,
  sectionsSeen: [], seasonsSeen: [], stars: 3,
};

// Each screen: setup(page) brings the app there. Every setup starts from a fresh page load.
const SCREENS = {
  boot: async (p) => p.evaluate(() => window.__aceRuns.app.debugScreen('boot')),
  title: async (p) => p.evaluate(() => window.__aceRuns.app.debugScreen('title')),
  character: async (p) => p.evaluate(() => window.__aceRuns.app.debugScreen('character')),
  ride: async (p) => p.evaluate(() => window.__aceRuns.app.debugScreen('ride')),
  stage: async (p) => p.evaluate(() => window.__aceRuns.app.debugScreen('stage')),
  book: async (p) => p.evaluate(() => window.__aceRuns.app.debugScreen('book')),
  'book-sometimes': async (p) => {
    await p.evaluate(() => window.__aceRuns.app.debugScreen('book'));
    await p.waitForTimeout(450);
    await p.locator('.book .tab-sometimes').click();
  },
  'book-detail': async (p) => {
    await p.evaluate(() => window.__aceRuns.app.debugScreen('book'));
    await p.waitForTimeout(450);
    await p.locator('.book .food-card.found').first().click();
  },
  settings: async (p) => {
    await p.evaluate(() => window.__aceRuns.app.debugScreen('title'));
    await p.waitForTimeout(100);
    await p.evaluate(() => window.__aceRuns.app.debugScreen('settings'));
  },
  'settings-confirm': async (p) => {
    await p.evaluate(() => window.__aceRuns.app.debugScreen('stage'));
    await p.evaluate(() => window.__aceRuns.app.debugScreen('settings'));
    await p.waitForTimeout(450);
    await p.locator('.settings .btn.danger').click();
  },
  run: async (p) => {
    await p.evaluate(async () => {
      const a = window.__aceRuns;
      await a.app.startRunDirect({ stage: 'sports', mode: 'adventure', character: 'ciela', ride: 'bike', skipCountdown: true });
      a.fake?.busy();
    });
  },
  'run-endless': async (p) => {
    await p.evaluate(async () => {
      const a = window.__aceRuns;
      await a.app.startRunDirect({ stage: 'parks', mode: 'endless', character: 'ace', ride: 'skate', skipCountdown: true });
      a.fake?.busy();
    });
  },
  countdown: async (p) => {
    await p.evaluate(async () => {
      const a = window.__aceRuns;
      await a.app.startRunDirect({ stage: 'jungle', mode: 'adventure', character: 'ace', ride: 'scooter' });
    });
    await p.waitForTimeout(250);
  },
  tutorial: async (p) => {
    await p.evaluate(async () => {
      const a = window.__aceRuns;
      await a.app.startRunDirect({ stage: 'indoor', mode: 'tutorial', character: 'ace', ride: 'shoes', skipCountdown: true });
      if (a.fake) setTimeout(() => a.fake.emit({ type: 'tutorial', step: 'jump' }), 450);
    });
    await p.waitForTimeout(300);
  },
  'tutorial-food': async (p) => {
    await p.evaluate(async () => {
      const a = window.__aceRuns;
      await a.app.startRunDirect({ stage: 'indoor', mode: 'tutorial', character: 'ciela', ride: 'shoes', skipCountdown: true });
      if (a.fake) setTimeout(() => a.fake.emit({ type: 'tutorial', step: 'healthy' }), 450);
    });
    await p.waitForTimeout(300);
  },
  pause: async (p) => {
    await p.evaluate(async () => {
      const a = window.__aceRuns;
      await a.app.startRunDirect({ stage: 'outdoor', mode: 'adventure', character: 'ace', ride: 'shoes', skipCountdown: true });
    });
    await p.waitForTimeout(400);
    await p.locator('.hud-btn.pause').click();
  },
  'pause-settings': async (p) => {
    await p.evaluate(async () => {
      const a = window.__aceRuns;
      await a.app.startRunDirect({ stage: 'arcade', mode: 'adventure', character: 'ciela', ride: 'skate', skipCountdown: true });
      a.app.requestPause();
    });
    await p.waitForTimeout(450);
    await p.locator('.modal-layer.pause .btn.chip-btn', { hasText: 'Settings' }).click();
  },
  warmup: async (p) => {
    await p.evaluate(() => window.__aceRuns.app.debugScreen('character'));
    await p.waitForTimeout(450);
    await p.locator('.character .stretch-btn').click();
    await p.waitForTimeout(2600);
  },
  'ride-repick': async (p) => p.evaluate(() => window.__aceRuns.app.debugScreen('repick')),
  'ride-warmup': async (p) => {
    await p.evaluate(() => window.__aceRuns.app.debugScreen('repick'));
    await p.waitForTimeout(450);
    await p.locator('.ride .stretch-btn').click();
    await p.waitForTimeout(2600);
  },
  intro: async (p) => p.evaluate(() => window.__aceRuns.app.debugScreen('intro')),
  'intro-stretch': async (p) => {
    await p.evaluate(() => window.__aceRuns.app.debugScreen('intro'));
    await p.waitForTimeout(450);
    await p.locator('.intro .stretch-btn').click();
    await p.waitForTimeout(2600);
  },
  cooldown: async (p) => p.evaluate((s) => window.__aceRuns.app.debugCooldown(s, 0), { ...STATS, stage: 'outdoor' }),
  'cooldown-hold': async (p) => {
    await p.evaluate((s) => window.__aceRuns.app.debugCooldown(s, 3), { ...STATS, stage: 'jungle', character: 'ciela' });
    await p.waitForTimeout(1500);
  },
  'cooldown-breathe': async (p) => {
    await p.evaluate((s) => window.__aceRuns.app.debugCooldown(s, 5), { ...STATS, stage: 'parks' });
    await p.waitForTimeout(1300);
  },
  results: async (p) => p.evaluate((s) => window.__aceRuns.app.debugResults(s), { ...STATS, stage: 'outdoor' }),
  'results-try': async (p) =>
    p.evaluate((s) => window.__aceRuns.app.debugResults(s), { ...STATS, stage: 'jungle', finished: false, stars: 1, distance: 640, healthy: { carrot: 2, water: 1 }, healthyTotal: 3, junk: {}, junkTotal: 0, happyAndHealthy: 0 }),
  'results-full': async (p) =>
    p.evaluate((s) => window.__aceRuns.app.debugResults(s), { ...STATS, healthy: Object.fromEntries(['carrot_sticks','carrot','broccoli','spinach','peas','milk','yoghurt','cheese','orange','kiwifruit','feijoa','strawberry','banana','corn','kumara','bread','water','watermelon','egg','chicken'].map((id, i) => [id, 20 - i])), healthyTotal: 210, junk: { fizzy_can: 2, lollies: 1, chips: 1, mouldy_bread: 1, ice_cream: 1 }, junkTotal: 6 }),
  'results-endless': async (p) =>
    p.evaluate((s) => window.__aceRuns.app.debugResults(s), { ...STATS, mode: 'endless', goal: null, distance: 3120, stars: 0 }),
};
const screenNames = args.screens ? args.screens.split(',') : Object.keys(SCREENS);

// Seed a mid-game save (3 places cleared, some foods found) so locked + cleared states both show.
const SAVE = (() => {
  const stages = {};
  ['indoor', 'arcade', 'outdoor', 'sports', 'jungle', 'parks'].forEach((id, i) => {
    stages[id] = { unlocked: i <= 3, cleared: i < 3, bestDistance: i < 3 ? 1200 + i * 130 : 0, bestEndless: i === 0 ? 2240 : 0, stars: i < 3 ? [3, 2, 3][i] : 0, plays: i < 3 ? 2 : 0 };
  });
  const foods = {};
  for (const id of ['carrot', 'carrot_sticks', 'broccoli', 'milk', 'yoghurt', 'cheese', 'orange', 'kiwifruit', 'banana', 'corn', 'water', 'egg', 'apple_slices', 'fizzy_can', 'ice_cream'])
    foods[id] = { count: (id.length % 5) + 1, firstSeen: 1 };
  return { version: 1, settings: { music: 0.6, voice: 0.95, sfx: 0.8, hints: true, reducedMotion: false }, character: 'ace', ride: 'shoes', stage: 'outdoor', tutorialDone: true, stages, foods, totals: { runs: 9, distance: 9000, healthy: 120, junk: 6, nearMisses: 20 } };
})();

/** Runs inside the page: probe every visible control. */
function probe() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sel = '#ui button, #ui input, #ui [role="button"], #ui a[href], #ui .res-junk, #ui .res-head, #ui .toast';
  const desc = (e) => {
    const t = (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
    return `${e.tagName.toLowerCase()}.${[...e.classList].slice(0, 3).join('.')}${t ? ` "${t}"` : ''}`;
  };
  const isShown = (e) => {
    if (e.closest('[inert], .hidden, .leaving')) return false;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let n = e; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05) return false;
    }
    return getComputedStyle(e).pointerEvents !== 'none';
  };
  const scrollClip = (e) => {
    const r = e.getBoundingClientRect();
    for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY) && (n.scrollHeight > n.clientHeight + 1 || n.scrollWidth > n.clientWidth + 1)) {
        const c = n.getBoundingClientRect();
        if (r.left < c.left - 1 || r.right > c.right + 1 || r.top < c.top - 1 || r.bottom > c.bottom + 1) return n;
      }
    }
    return null;
  };
  const out = { controls: 0, ok: 0, scroll: 0, fails: [], small: [] };
  for (const e of document.querySelectorAll(sel)) {
    if (!isShown(e)) continue;
    out.controls++;
    if (scrollClip(e)) {
      out.scroll++;
      continue;
    }
    const r = e.getBoundingClientRect();
    const problems = [];
    if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) problems.push(`off-screen [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
    const rad = parseFloat(getComputedStyle(e).borderTopLeftRadius) || 0;
    const rr = Math.min(rad, r.width / 2, r.height / 2);
    const inset = Math.max(4, rr * (1 - Math.SQRT1_2) + 3);
    const pts = [
      ['c', r.left + r.width / 2, r.top + r.height / 2],
      ['tl', r.left + inset, r.top + inset],
      ['tr', r.right - inset, r.top + inset],
      ['bl', r.left + inset, r.bottom - inset],
      ['br', r.right - inset, r.bottom - inset],
    ];
    for (const [name, x, y] of pts) {
      if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(hit === e || e.contains(hit))) problems.push(`${name} covered by ${hit ? desc(hit) : 'nothing'}`);
    }
    if (e.tagName !== 'INPUT' && (r.width < 44 || r.height < 44)) out.small.push(`${desc(e)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    if (problems.length) out.fails.push(`${desc(e)}: ${problems.join('; ')}`);
    else out.ok++;
  }
  return out;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=metal'] });
  const report = [];
  const t0 = Date.now();
  for (const [sname, w, h, mobile] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
    await ctx.addInitScript((save) => {
      try {
        if (!sessionStorage.getItem('__seeded')) {
          localStorage.setItem('ace-runs-save-v1', save);
          sessionStorage.setItem('__seeded', '1');
        }
      } catch {}
    }, JSON.stringify(SAVE));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    for (const scr of screenNames) {
      const setup = SCREENS[scr];
      if (!setup) continue;
      await page.evaluate(() => sessionStorage.removeItem('__seeded')).catch(() => {});
      const url = URL_BASE + (URL_BASE.includes('?') ? '&' : '?') + 'ui-test=1';
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => !!window.__aceRuns?.app, null, { timeout: 30000 });
      await page.waitForTimeout(300);
      let setupErr = null;
      try {
        await setup(page);
      } catch (e) {
        setupErr = String(e.message || e).split('\n')[0];
      }
      await page.waitForTimeout(scr.startsWith('results') ? 3400 : 950);
      const res = await page.evaluate(probe);
      let shot = null;
      if (SHOTS) {
        shot = join(OUT, `${sname}__${scr}.png`);
        try {
          await page.screenshot({ path: shot, timeout: 15000 });
        } catch {
          await page.waitForTimeout(500);
          await page.screenshot({ path: shot, timeout: 30000 }).catch(() => (shot = null));
        }
      }
      report.push({ size: sname, screen: scr, ...res, setupErr, errors: [...errors], shot });
      errors.length = 0;
      const flag = setupErr ? 'SETUP-ERR' : res.fails.length ? 'FAIL' : 'ok';
      console.log(`${sname.padEnd(10)} ${scr.padEnd(17)} ${flag.padEnd(9)} controls=${res.controls} ok=${res.ok} scroll=${res.scroll} fails=${res.fails.length}${setupErr ? ` (${setupErr})` : ''}`);
      for (const f of res.fails) console.log(`    - ${f}`);
    }
    await ctx.close();
  }
  await browser.close();
  // markdown table: rows = screens, cols = sizes
  const sizeNames = sizes.map((s) => s[0]);
  let md = `| screen | ${sizeNames.join(' | ')} |\n|---|${sizeNames.map(() => '---').join('|')}|\n`;
  for (const scr of screenNames) {
    md += `| ${scr} | ${sizeNames
      .map((sz) => {
        const r = report.find((x) => x.size === sz && x.screen === scr);
        if (!r) return '-';
        if (r.setupErr) return 'ERR';
        return r.fails.length ? `FAIL ${r.fails.length}` : `ok ${r.ok}${r.scroll ? `+${r.scroll}s` : ''}`;
      })
      .join(' | ')} |\n`;
  }
  const failsTotal = report.reduce((n, r) => n + r.fails.length + (r.setupErr ? 1 : 0), 0);
  writeFileSync(join(OUT, 'occlusion-report.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(OUT, 'occlusion-report.md'), md);
  console.log(`\n${md}\nTotal failures: ${failsTotal}  (${((Date.now() - t0) / 1000).toFixed(0)} s)  report: ${join(OUT, 'occlusion-report.md')}`);
  process.exitCode = failsTotal ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
