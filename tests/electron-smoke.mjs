// Launches a packaged desktop build and checks it boots to the game: node tests/electron-smoke.mjs <path-to-executable> <out.png>
import { _electron as electron } from 'playwright-core';
const [exe, out] = process.argv.slice(2);
const app = await electron.launch({ executablePath: exe, args: [] });
const win = await app.firstWindow();
const errors = [];
win.on('pageerror', (e) => errors.push(String(e)));
await win.waitForTimeout(5000);
const info = await win.evaluate(() => ({ title: document.title, desktop: !!window.aceRunsDesktop?.isDesktop, canvas: !!document.querySelector('canvas'), text: document.body.innerText.slice(0, 80) }));
await win.screenshot({ path: out });
console.log(JSON.stringify({ ...info, errors }));
await app.close();
