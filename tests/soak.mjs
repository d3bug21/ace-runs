// Autopilot soak: node tests/soak.mjs <baseUrl> stage ride char  -> plays an adventure to the end, prints stats
import { chromium } from 'playwright-core';
const [base, stage, ride = 'shoes', char = 'ace'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });
await page.goto(`${base}/dev/engine.html?bot=1&skip=1&stage=${stage}&ride=${ride}&char=${char}`);
const t0 = Date.now(); let end = null; let fps = [];
while (Date.now() - t0 < 330000) {
  await page.waitForTimeout(5000);
  end = await page.evaluate(() => window.__end || null);
  if (end) break;
}
const bumps = await page.evaluate(() => window.__bumps || []);
console.log(JSON.stringify({ stage, ride, char, wallS: Math.round((Date.now() - t0) / 1000), end: end && { finished: end.finished, dist: Math.round(end.distance), healthy: end.healthyTotal, junk: end.junkTotal, bumps: end.bumps, near: end.nearMisses, stars: end.stars, sections: end.sectionsSeen.length, seasons: end.seasonsSeen }, bumpsAt: bumps, errs: errs.slice(0, 5) }));
await browser.close();
