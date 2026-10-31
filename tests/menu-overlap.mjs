// Checks that floating menu foods never overlap the kids on screen, in every menu view and size.
// node tests/menu-overlap.mjs <baseUrl>
import { chromium } from 'playwright-core';
const base = process.argv[2];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-angle=metal'] });
const sizes = [[1920, 1080], [1280, 800], [1366, 768], [390, 844], [844, 390], [360, 640]];
const views = ['title', 'character', 'ride', 'stage', 'results', 'book'];
let total = 0; const hits = [];
for (const [w, h] of sizes) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  await p.goto(base + '/?ui-test=1');
  await p.waitForFunction(() => window.__aceRuns?.engine);
  for (const view of views) {
    await p.evaluate((v) => window.__aceRuns.engine.showMenu({ view: v, character: 'ciela', ride: 'bike', stage: 'jungle', celebrate: true }), view);
    for (let k = 0; k < 10; k++) {
      await p.waitForTimeout(1000);
      const r = await p.evaluate(() => window.__aceRuns.engine.menu.overlapReport());
      if (!r) throw new Error('no report hook');
      total++;
      for (const o of r) hits.push(`${w}x${h} ${view} t${k}: ${o}`);
    }
  }
  await p.close();
}
console.log(JSON.stringify({ samples: total, overlaps: hits.length, examples: hits.slice(0, 12) }));
await browser.close();
