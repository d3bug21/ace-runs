// UI dev harness: the real App + AudioManager driven by a FakeEngine (2D canvas backdrop, canned
// HUD state, timed events) so every screen can be screenshotted and occlusion-tested in isolation.
// Query: ?engine=real to use the real engine instead; ?progress=fresh|some|all; ?touch=1.
import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import '../src/styles/main.css';
import { App } from '../src/app/App';
import { SaveData, sanitize } from '../src/app/Save';
import { AudioManager } from '../src/audio/AudioManager';
import { STAGES, type CharacterId, type PowerState, type RideId, type StageId, type StretchMove } from '../src/contracts';
import { FOOD_BY_ID, FOODS, HEALTHY } from '../src/content/foods';
import type { Engine, EngineEvent, EngineSettings, HudState, MenuSceneOptions, RunOptions, RunStats, TutorialStep } from '../src/engine/api';

const KID: Record<CharacterId, string> = { ace: '#eebb58', ciela: '#b59cf0' };
const BG: Record<string, [string, string]> = {
  title: ['#bfe6f5', '#fff1d6'],
  indoor: ['#ffe9c7', '#ffc9a8'],
  arcade: ['#3b3f78', '#6a4c9c'],
  outdoor: ['#bfe6f5', '#fff1c9'],
  sports: ['#a9dcf2', '#d8f0c6'],
  jungle: ['#bfe8c8', '#7fc79a'],
  parks: ['#d7ecf7', '#f4e3c8'],
};

function zeroPower(): PowerState {
  return {
    vision: 0, muscles: 0, bones: 0, shield: 0, energy: 0, magnet: 0, refresh: 0, happyTummy: 0,
    sugarRush: 0, slump: 0, teeth: 0, freeze: 0, slow: 0, tummyAche: 0, junkLoad: 0, glow: 0, glowLevel: 0, happyAndHealthy: false,
  };
}

/** Deterministic stand-in for the real engine (implements the Engine contract). */
export class FakeEngine implements Engine {
  readonly canvas: HTMLCanvasElement;
  running = false;
  paused = false;
  private listeners: ((e: EngineEvent) => void)[] = [];
  private menu: MenuSceneOptions = { view: 'title', character: 'ace', ride: 'shoes' };
  private run: (RunOptions & { skipCountdown?: boolean }) | null = null;
  private t0 = 0;
  private timers: number[] = [];
  private inputOn = false;
  private lane = 0;
  hudOverride: Partial<HudState> = {};
  /** Last setMenuMove call (tests read it). */
  menuMove: { move: StretchMove | null; glow: boolean; side: 1 | -1; at: number } = { move: null, glow: false, side: 1, at: 0 };
  menuMoveLog: (StretchMove | null)[] = [];
  private state: HudState;

  constructor(private host: HTMLElement) {
    this.canvas = document.createElement('canvas');
    host.append(this.canvas);
    this.state = this.freshHud('indoor', 'adventure');
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    const loop = () => {
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.addEventListener('keydown', (e) => {
      if (!this.running || !this.inputOn) return;
      const k = e.key.toLowerCase();
      if (k === 'p' || k === 'escape') {
        if (this.paused) this.resume();
        else this.pause();
        this.emit({ type: 'pause', paused: this.paused });
      }
      if (k === 'a' || k === 'arrowleft') this.lane = Math.max(-1, this.lane - 1);
      if (k === 'd' || k === 'arrowright') this.lane = Math.min(1, this.lane + 1);
    });
  }

  private freshHud(stage: StageId, mode: RunOptions['mode']): HudState {
    const sections =
      stage === 'parks'
        ? (['winter', 'spring', 'summer', 'autumn'] as const).map((s, i) => ({ id: s, label: s, start: i * 400, season: s }))
        : stage === 'sports'
          ? ['rugby', 'football', 'netball', 'tennis', 'swimming'].map((s, i) => ({ id: s, label: s[0].toUpperCase() + s.slice(1), start: i * 300 }))
          : [{ id: stage, label: stage, start: 0 }];
    return {
      running: true, paused: false, mode, stage, hearts: 3, maxHearts: 3, healthy: 0, junk: 0, score: 0, distance: 0,
      goal: mode === 'endless' ? null : mode === 'tutorial' ? 400 : 1500, progress: 0, section: sections[0], sections,
      powers: [], junkEffects: [], power: zeroPower(), countdown: 0, tutorialStep: null,
    };
  }

  private resize(): void {
    const r = this.host.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
  }

  on(fn: (e: EngineEvent) => void): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((l) => l !== fn));
  }
  emit(e: EngineEvent): void {
    for (const l of this.listeners) l(e);
  }
  showMenu(o: MenuSceneOptions): void {
    this.menu = { ...o };
    if (!this.run) this.running = false;
  }
  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }
  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
  async startRun(opts: RunOptions & { skipCountdown?: boolean }): Promise<void> {
    this.clearTimers();
    this.run = { ...opts };
    this.state = this.freshHud(opts.stage, opts.mode);
    for (let i = 1; i <= 4; i++) this.emit({ type: 'loading', progress: i / 4 });
    await new Promise((r) => setTimeout(r, 120));
    this.running = true;
    this.paused = false;
    this.t0 = performance.now();
    const cd = opts.skipCountdown ? 0 : 3;
    if (cd) {
      ([3, 2, 1, 0] as const).forEach((n, i) => this.later(i * 800, () => {
        this.state.countdown = n;
        this.emit({ type: 'countdown', n });
      }));
    }
    const go = cd ? 3200 : 0;
    this.later(go + 50, () => this.emit({ type: 'section', section: this.state.sections[0], index: 0 }));
    if (opts.mode === 'tutorial') {
      const steps: TutorialStep[] = ['intro', 'left', 'right', 'jump', 'slide', 'healthy', 'junk', 'done'];
      steps.forEach((s, i) => this.later(go + 200 + i * 3200, () => {
        this.state.tutorialStep = s;
        this.emit({ type: 'tutorial', step: s });
      }));
    }
    return;
  }
  pause(): void {
    if (this.running) this.paused = true;
  }
  resume(): void {
    this.paused = false;
  }
  restartRun(): void {
    if (this.run) void this.startRun({ ...this.run, seed: (this.run.seed ?? 0) + 1 });
  }
  quitRun(): void {
    this.clearTimers();
    this.run = null;
    this.running = false;
    this.paused = false;
  }
  hud(): HudState {
    if (this.running && !this.paused && this.run) {
      const el = (performance.now() - this.t0) / 1000;
      this.state.distance = el * 14;
      this.state.progress = this.state.goal ? Math.min(1, this.state.distance / this.state.goal) : 0;
    }
    return { ...this.state, ...this.hudOverride, running: this.running, paused: this.paused };
  }
  setSettings(_s: EngineSettings): void {}
  setMenuMove(move: StretchMove | null, opts?: { glow?: boolean; side?: 1 | -1 }): void {
    this.menuMove = { move, glow: opts?.glow !== false && !!move, side: opts?.side ?? 1, at: performance.now() };
    this.menuMoveLog.push(move);
    if (this.menuMoveLog.length > 50) this.menuMoveLog.shift();
  }
  setInputEnabled(on: boolean): void {
    this.inputOn = on;
  }

  // ---- harness helpers
  /** A busy mid-run HUD: powers, junk effects, glow, a lost heart and a toast. */
  busy(): void {
    const s = this.state;
    s.hearts = 2;
    s.healthy = 23;
    s.power = { ...zeroPower(), glowLevel: 4, glow: 0.8 };
    s.powers = [
      { id: 'shield', t: 6, max: 10 },
      { id: 'magnet', t: 3, max: 8 },
      { id: 'vision', t: 1.5, max: 8 },
    ];
    s.junkEffects = [{ id: 'teeth', t: 4, max: 6 }];
    this.t0 = performance.now() - 50_000;
    this.emit({ type: 'food', food: FOOD_BY_ID.carrot, count: 1 });
    this.emit({ type: 'food', food: FOOD_BY_ID.lollies, count: 1 });
    const sec = this.state.sections[1] ?? this.state.sections[0];
    this.emit({ type: 'section', section: sec, index: 1 });
  }
  finish(over: Partial<RunStats> = {}): void {
    const r = this.run!;
    this.emit({ type: 'end', stats: cannedStats({ stage: r.stage, mode: r.mode, character: r.character, ride: r.ride, ...over }) });
    this.running = false;
    this.run = null;
  }

  private draw(): void {
    const c = this.canvas;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    const st = this.run?.stage ?? this.menu.stage;
    const [top, bot] = BG[this.run ? st ?? 'indoor' : this.menu.view === 'stage' || this.menu.view === 'results' ? st ?? 'title' : 'title'];
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, top);
    grd.addColorStop(1, bot);
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    const t = performance.now() / 1000;
    const portrait = H > W;
    if (this.run) {
      // lanes in perspective
      const hz = H * 0.36;
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.moveTo(W * 0.46, hz);
      g.lineTo(W * 0.54, hz);
      g.lineTo(W * (portrait ? 1.05 : 0.8), H);
      g.lineTo(W * (portrait ? -0.05 : 0.2), H);
      g.fill();
      const d = (this.paused ? 0 : t * 1.2) % 1;
      for (let i = 0; i < 6; i++) {
        const z = (i + d) / 6;
        const y = hz + (H - hz) * z * z;
        const half = (portrait ? 0.55 : 0.3) * W * z * z + W * 0.04;
        g.fillStyle = 'rgba(255,122,107,0.8)';
        g.fillRect(W / 2 - half * 0.66 - 16 * z, y - 30 * z, 32 * z, 30 * z);
      }
      const rx = W / 2 + this.lane * (portrait ? 0.27 : 0.14) * W;
      this.kid(g, rx, H * (portrait ? 0.8 : 0.78), Math.min(W, H) * 0.1, KID[this.run.character]);
      return;
    }
    const v = this.menu.view;
    const s = Math.min(W, H) * (portrait ? 0.14 : 0.16);
    const baseY = portrait ? H * 0.42 : H * 0.6;
    let cx = W / 2;
    if (v === 'ride' && !portrait) cx = W * 0.62;
    if ((v === 'results' || v === 'cooldown') && !portrait) cx = W * 0.3;
    if ((v === 'stage' || v === 'book' || v === 'settings') && !portrait) cx = W * 0.18;
    if (v === 'title' || v === 'character') {
      this.kid(g, cx - s * 1.4, baseY + Math.sin(t * 2) * 4, s, KID.ace, this.menu.character === 'ace');
      this.kid(g, cx + s * 1.4, baseY + Math.cos(t * 2) * 4, s, KID.ciela, this.menu.character === 'ciela');
    } else this.kid(g, cx, baseY + Math.sin(t * 3) * 6, s, KID[this.menu.character], true);
    // stand-in for the avatar's stretch: a warm glow ring + the move name
    const mm = this.menuMove;
    if (mm.move) {
      const kx = v === 'character' || v === 'title' ? cx : cx;
      if (mm.glow) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 4);
        g.strokeStyle = `rgba(255,170,60,${0.35 + 0.35 * pulse})`;
        g.lineWidth = s * 0.12;
        g.beginPath();
        g.arc(kx, baseY, s * 1.9, 0, Math.PI * 2);
        g.stroke();
      }
      g.fillStyle = 'rgba(43,52,64,0.55)';
      g.font = `600 ${Math.round(s * 0.32)}px Fredoka, sans-serif`;
      g.textAlign = 'center';
      g.fillText(mm.move.replace('_', ' '), kx, baseY + s * 2.2);
    }
  }

  private kid(g: CanvasRenderingContext2D, x: number, y: number, s: number, col: string, hi = true): void {
    g.globalAlpha = hi ? 1 : 0.6;
    g.fillStyle = 'rgba(30,40,60,0.15)';
    g.beginPath();
    g.ellipse(x, y + s * 1.3, s * 0.9, s * 0.25, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    g.roundRect(x - s * 0.55, y - s * 0.1, s * 1.1, s * 1.3, s * 0.4);
    g.fill();
    g.fillStyle = '#f3c29b';
    g.beginPath();
    g.arc(x, y - s * 0.55, s * 0.6, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
}

export function cannedStats(o: Partial<RunStats> = {}): RunStats {
  return {
    stage: 'indoor', mode: 'adventure', character: 'ace', ride: 'shoes', distance: 1500, goal: 1500, finished: true, timeSec: 92, score: 4200,
    healthy: { carrot: 4, broccoli: 2, milk: 3, kiwifruit: 2, banana: 5, water: 3, egg: 1, fruit_salad: 1, kumara: 2 },
    junk: { fizzy_can: 1, lollies: 1 }, healthyTotal: 23, junkTotal: 2, nearMisses: 6, bumps: 1, bestGlowLevel: 5, happyAndHealthy: 2,
    sectionsSeen: [], seasonsSeen: [], stars: 3, ...o,
  };
}

function seedProgress(kind: string): void {
  const s = sanitize(null) as ReturnType<typeof sanitize>;
  if (kind === 'some' || kind === 'all') {
    const n = kind === 'all' ? STAGES.length : 3;
    STAGES.forEach((id, i) => {
      const p = s.stages[id];
      p.unlocked = i <= n;
      if (i < n) {
        p.cleared = true;
        p.stars = (([3, 2, 3, 1, 2, 3] as const)[i]);
        p.bestDistance = 1200 + i * 130;
        p.bestEndless = i === 0 ? 2240 : 0;
      }
    });
    const foods = kind === 'all' ? FOODS : [...HEALTHY.slice(0, 14), FOODS.find((f) => f.id === 'fizzy_can')!, FOODS.find((f) => f.id === 'ice_cream')!];
    for (const f of foods) s.foods[f.id] = { count: 1 + (f.id.length % 6), firstSeen: Date.now() };
    s.tutorialDone = true;
    s.stage = 'outdoor';
  }
  localStorage.setItem('ace-runs-save-v1', JSON.stringify(s));
}

// ------------------------------------------------------------------ boot the harness
const q = new URLSearchParams(location.search);
if (q.get('progress')) seedProgress(q.get('progress')!);
const root = document.getElementById('app')!;
const host = document.createElement('div');
host.className = 'stage-host';
root.append(host);
const audio = new AudioManager('/');

async function makeEngine(): Promise<Engine> {
  if (q.get('engine') === 'real') {
    const m = await import('../src/engine/Engine');
    return m.createEngine(host, audio);
  }
  return new FakeEngine(host);
}

void makeEngine().then((engine) => {
  const app = new App(root, engine, audio, { save: new SaveData() });
  app.start();
  const fake = engine instanceof FakeEngine ? engine : null;
  const api = {
    app,
    engine,
    audio,
    fake,
    cannedStats,
    seedProgress,
    async run(stage: StageId = 'indoor', mode: RunOptions['mode'] = 'adventure', character: CharacterId = 'ace', ride: RideId = 'shoes') {
      await app.startRunDirect({ stage, mode, character, ride, skipCountdown: true });
    },
  };
  (window as unknown as { __aceRuns: unknown }).__aceRuns = api;
});
