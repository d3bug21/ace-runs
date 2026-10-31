// Autopilot (test-only, injected by tests): plays a run through real keyboard events.
window.__startBot = function () {
  const engine = window.__aceRuns.engine;
  const press = (code) => { window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true })); window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true })); };
  let cool = 0;
  return setInterval(() => {
    const e = engine;
    if (!e.track || e.phase !== 'run' || e._paused) return;
    cool -= 40;
    const d = e.dist;
    const occupies = (o, lane) => Math.abs(o.x - lane * 2.2) < o.span * 1.1 + 0.2 || ((o.kind === 'moverBlock' || o.kind === 'moverLow') && Math.abs(o.toX - lane * 2.2) < 0.3);
    const threat = (lane, from, to, onTop) => e.track.obstacles.filter((o) => o.knocked < 0 && occupies(o, lane) && o.dc + o.len / 2 > d + from && o.dc - o.len / 2 < d + to && o.kind !== 'ramp' && !(onTop && o.kind === 'platform'));
    const onTop = e.y > 1.5;
    const reach = Math.max(7, e.speed * 0.62);
    const here = threat(e.lane, -0.5, reach, onTop);
    if (!here.length || cool > 0) return;
    const o = here.sort((a, b) => a.dc - b.dc)[0];
    if ((o.kind === 'low' || o.kind === 'moverLow') && e.grounded) { if (o.dc - o.len / 2 - d < e.speed * 0.32) { press('KeyW'); cool = 300; } return; }
    if (o.kind === 'high') { if (o.dc - o.len / 2 - d < e.speed * 0.3) { press('KeyS'); cool = 300; } return; }
    const cands = [e.lane - 1, e.lane + 1].filter((l) => l >= -1 && l <= 1);
    const score = (l) => { const t = threat(l, -1.5, 18, false); const hard = t.filter((x) => x.kind === 'block' || x.kind === 'moverBlock' || x.kind === 'platform').length; const ramp = e.track.obstacles.some((x) => x.kind === 'ramp' && occupies(x, l) && x.dc > d && x.dc < d + 14); return hard * 10 + t.length - (ramp ? 5 : 0); };
    cands.sort((a, b) => score(a) - score(b));
    if (o.kind === 'platform' && e.track.obstacles.some((x) => x.kind === 'ramp' && occupies(x, e.lane) && x.dc < o.dc && x.dc > d - 6)) return;
    if (cands[0] === undefined) return;
    press(cands[0] < e.lane ? 'KeyA' : 'KeyD');
    cool = 160;
  }, 40);
};
