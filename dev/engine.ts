// Lead's engine harness: runs the real engine with a silent audio stub. Query: ?stage=jungle&ride=bike&char=ciela&mode=adventure
import { createEngine, type AudioLike } from '../src/engine/Engine';
import { installProbeIfRequested } from '../src/engine/Probe';
import type { CharacterId, RideId, RunMode, StageId } from '../src/contracts';

const log: string[] = [];
const audio: AudioLike = {
  playSfx: (id) => { log.push('sfx:' + id); },
  playVoice: (s, g) => { log.push(`voice:${s}:${g}`); return 0; },
  playMusic: () => {}, playAmbience: () => {},
  loop: () => ({ setVolume() {}, setRate() {}, stop() {} }),
};
const q = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
const engine = createEngine(app, audio);
const events: string[] = [];
engine.on((e) => { if (e.type === 'end') (window as unknown as { __end: unknown }).__end = e.stats; if (e.type === 'bump') ((window as unknown as { __bumps: number[] }).__bumps ||= []).push(Math.round(engine.hud().distance)); events.push(e.type + ('step' in e ? ':' + e.step : '') + ('food' in e ? ':' + e.food.id : '')); if (events.length > 14) events.shift(); });
const opts = {
  character: (q.get('char') || 'ace') as CharacterId, ride: (q.get('ride') || 'shoes') as RideId,
  stage: (q.get('stage') || 'indoor') as StageId, mode: (q.get('mode') || 'adventure') as RunMode,
};
const fakeApp = { async startRunDirect(o: Parameters<typeof engine.startRun>[0] & { skipCountdown?: boolean }) { engine.setInputEnabled(true); await engine.startRun(o); engine.setInputEnabled(true); } };
installProbeIfRequested({ app: fakeApp, engine });
if (q.get('menu')) engine.showMenu({ view: q.get('menu') as 'title', character: opts.character, ride: opts.ride, stage: opts.stage });
else if (!q.has('oneshot-directional-probe')) { engine.setInputEnabled(true); void engine.startRun({ ...opts, skipCountdown: q.has('skip') } as never); }
(window as unknown as { __engine: unknown; __log: string[] }).__engine = engine;
(window as unknown as { __log: string[] }).__log = log;
const hud = document.getElementById('hud')!;
setInterval(() => { const h = engine.hud(); hud.textContent = `d=${h.distance.toFixed(1)} hearts=${h.hearts} healthy=${h.healthy} junk=${h.junk} glow=${h.power.glow.toFixed(2)} lvl=${h.power.glowLevel} sec=${h.section.id}\npowers=${h.powers.map((p) => p.id).join(',')} junkfx=${h.junkEffects.map((p) => p.id).join(',')}\n${events.join(' ')}`; }, 200);

// ---- autopilot (?bot=1): plays through real keyboard events to soak-test patterns.
if (q.has('bot')) {
  type Ob = { kind: string; x: number; dc: number; len: number; span: number; knocked: number; height: number; toX: number; moveT: number };
  const press = (code: string) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
  };
  let cool = 0;
  setInterval(() => {
    const e = engine as unknown as { track: { obstacles: Ob[]; groundAt(x: number, d: number): number } | null; dist: number; lane: number; y: number; grounded: boolean; speed: number; phase: string };
    if (!e.track || e.phase !== 'run') return;
    cool -= 40;
    const d = e.dist;
    const occupies = (o: Ob, lane: number) => Math.abs(o.x - lane * 2.2) < o.span * 1.1 + 0.2 || ((o.kind === 'moverBlock' || o.kind === 'moverLow') && Math.abs(o.toX - lane * 2.2) < 0.3);
    const threat = (lane: number, from: number, to: number, onTop: boolean) =>
      e.track!.obstacles.filter((o) => o.knocked < 0 && occupies(o, lane) && o.dc + o.len / 2 > d + from && o.dc - o.len / 2 < d + to && o.kind !== 'ramp' && !(onTop && o.kind === 'platform'));
    const onTop = e.y > 1.5;
    const reach = Math.max(7, e.speed * 0.62);
    const here = threat(e.lane, -0.5, reach, onTop);
    if (!here.length || cool > 0) return;
    const o = here.sort((a, b) => a.dc - b.dc)[0];
    if ((o.kind === 'low' || o.kind === 'moverLow') && e.grounded) { if (o.dc - o.len / 2 - d < e.speed * 0.32) { press('KeyW'); cool = 300; } return; }
    if (o.kind === 'high') { if (o.dc - o.len / 2 - d < e.speed * 0.3) { press('KeyS'); cool = 300; } return; }
    // block / platform / moverBlock: change lane toward the safest neighbour.
    const cands = [e.lane - 1, e.lane + 1].filter((l) => l >= -1 && l <= 1);
    const score = (l: number) => {
      const t = threat(l, -1.5, 18, false);
      const hard = t.filter((x) => x.kind === 'block' || x.kind === 'moverBlock' || x.kind === 'platform').length;
      const ramp = e.track!.obstacles.some((x) => x.kind === 'ramp' && occupies(x, l) && x.dc > d && x.dc < d + 14);
      return hard * 10 + t.length - (ramp ? 5 : 0);
    };
    cands.sort((a, b) => score(a) - score(b));
    if (o.kind === 'platform' && e.track.obstacles.some((x) => x.kind === 'ramp' && occupies(x, e.lane) && x.dc < o.dc && x.dc > d - 6)) return;
    const best = cands[0];
    if (best === undefined) return;
    press(best < e.lane ? 'KeyA' : 'KeyD');
    cool = 160;
  }, 40);
}
