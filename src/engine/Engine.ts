// Ace Runs! engine: the lane-runner simulation, camera, gameplay audio and the 3D menu backdrop.
import * as THREE from 'three';
import type {
  Avatar,
  AvatarMotion,
  BenefitId,
  EffectsSystem,
  FoodDef,
  JunkEffectId,
  PowerState,
  RideId,
  StageModule,
  StageSection,
} from '../contracts';
import { LANE_WIDTH, PLATFORM_TOP, laneX } from '../contracts';
import { FOOD_BY_ID } from '../content/foods';
import { blobShadow, clamp, damp, lerp, smooth } from '../kit/kit';
import type { Engine, EngineEvent, EngineSettings, HudState, MenuSceneOptions, RunOptions, RunStats, TutorialStep } from './api';
import { Input, type Action } from './Input';
import { MenuScene } from './MenuScene';
import { createAvatar, createEffects, createFoodModel, createStage } from './modules';
import { createFallbackStage } from './FallbackStage';
import { Track, type FoodItem, type Obstacle } from './Track';

/** Structural audio interface (implemented by src/audio/AudioManager). */
export interface AudioLike {
  playSfx(id: string, opts?: { volume?: number; rate?: number; pan?: number; delay?: number }): void;
  playVoice(speaker: 'ace' | 'moana' | 'narrator', group: string, opts?: { priority?: boolean; minGap?: number; interrupt?: boolean; delay?: number }): number;
  playMusic(id: string | null, fade?: number): void;
  playAmbience(id: string | null, fade?: number): void;
  loop(key: string, id: string | null, volume?: number): { setVolume(v: number): void; setRate(r: number): void; stop(fade?: number): void } | null;
}

export interface InternalRunOptions extends RunOptions {
  skipCountdown?: boolean;
}

const G = 30; // gravity m/s^2 (snappy, cartoon)
const JUMP_H = 1.5;
const SLIDE_TIME = 0.62;
const LANE_TIME = 0.15;
const MAX_HEARTS = 3;
const COUNTDOWN = 2.4;

const RIDE_LOOP: Record<RideId, string> = {
  shoes: 'footsteps_loop',
  bike: 'bike_freewheel_loop',
  scooter: 'scooter_rattle_loop',
  skate: 'skate_roll_loop',
};
const BENEFIT_SFX: Record<BenefitId, string> = {
  vision: 'sparkle_vision',
  muscles: 'flex_muscle',
  bones: 'ding_bones',
  shield: 'shield_up',
  energy: 'zoom_boost',
  refresh: 'splash_water',
  grow: 'grow_chart',
  tummy: 'happy_tummy',
};
const BENEFIT_VOICE: Record<BenefitId, string> = {
  vision: 'vision',
  muscles: 'muscles',
  bones: 'bones',
  shield: 'shield',
  energy: 'energy',
  refresh: 'refresh',
  grow: 'grow',
  tummy: 'tummy_happy',
};
const JUNK_SFX: Record<JunkEffectId, string> = {
  sugar: 'sugar_buzz',
  teeth: 'sticky_squelch',
  freeze: 'brain_freeze',
  slow: 'slow_heavy',
  tummy: 'tummy_rumble',
};
const POWER_MAX = { vision: 8, muscles: 7, bones: 8, shield: 12, energy: 4, magnet: 8, refresh: 1.5, happyTummy: 3 };

function freshPower(): PowerState {
  return {
    vision: 0, muscles: 0, bones: 0, shield: 0, energy: 0, magnet: 0, refresh: 0, happyTummy: 0,
    sugarRush: 0, slump: 0, teeth: 0, freeze: 0, slow: 0, tummyAche: 0,
    junkLoad: 0, glow: 0, glowLevel: 0, happyAndHealthy: false,
  };
}

type Phase = 'countdown' | 'run' | 'finish' | 'puffed' | 'over';

interface TutorialGate {
  step: TutorialStep;
  at: number; // distance where the hint is announced
  gate: number; // distance where time slows until the action is done (0 = no gate)
  done: boolean;
  announced: boolean;
  check: () => boolean;
}

class GameEngine implements Engine {
  readonly canvas: HTMLCanvasElement;
  private layer: HTMLElement;
  private overlay: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  private menu = new MenuScene();
  private input: Input;
  private listeners = new Set<(e: EngineEvent) => void>();
  private settings: EngineSettings = { reducedMotion: false, quality: 'auto' };
  private last = 0;
  private w = 1;
  private h = 1;
  private pixelRatio = 1;
  private frameAvg = 16;
  private slowFrames = 0;

  // run state
  private opts: InternalRunOptions | null = null;
  private stage: StageModule | null = null;
  private track: Track | null = null;
  private avatar: Avatar | null = null;
  private shadow: THREE.Mesh | null = null;
  private effects: EffectsSystem;
  private phase: Phase = 'over';
  private _paused = false;
  private runActive = false; // game scene is shown
  private t = 0;
  private phaseT = 0;
  private dist = 0;
  private speed = 0;
  private lane = 0;
  private prevLane = 0;
  private x = 0;
  private prevX = 0;
  private tweenFrom = 0;
  private tweenT = 1;
  private lateral = 0;
  private y = 0;
  private vy = 0;
  private grounded = true;
  private groundY = 0;
  private jumpT = -1;
  private slideT = -1;
  private slideQueued = false;
  private landT = 999;
  private bumpT = 999;
  private invuln = 0;
  private recover = 1;
  private hearts = MAX_HEARTS;
  private power = freshPower();
  private pendingSlump = 0;
  private flexT = 99;
  private hhT = 0;
  private stats!: RunStats;
  private sectionIndex = 0;
  private lastNearMiss = -9;
  private lastBenefitFx: Partial<Record<string, number>> = {};
  private healthyStreak = 0;
  private camGround = 0;
  private shake = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private fogFar = 110;
  private rideLoop: ReturnType<AudioLike['loop']> = null;
  private nextSprinkle = 6;
  private nextBell = 12;
  private timeScale = 1;
  private gates: TutorialGate[] = [];
  private tutorialStep: TutorialStep | null = null;
  private guideTex: { up: THREE.Texture; down: THREE.Texture } | null = null;
  private seedCounter = 0;

  constructor(private container: HTMLElement, private audio: AudioLike) {
    this.layer = document.createElement('div');
    this.layer.className = 'engine-layer';
    Object.assign(this.layer.style, { position: 'absolute', inset: '0', overflow: 'hidden', touchAction: 'none', userSelect: 'none', webkitUserSelect: 'none' });
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'engine-canvas';
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', transition: 'filter 0.4s ease' });
    this.overlay = document.createElement('div');
    this.overlay.className = 'fx-overlay';
    Object.assign(this.overlay.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' });
    this.layer.append(this.canvas, this.overlay);
    container.prepend(this.layer);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = (new URLSearchParams(location.search).get('tm') === 'aces') ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.input = new Input(this.layer);
    this.effects = createEffects({
      scene: this.scene, camera: this.camera, renderer: this.renderer, canvas: this.canvas, overlay: this.overlay,
      reducedMotion: false,
    });

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    window.visualViewport?.addEventListener('resize', () => this.resize());
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.phase === 'run' && !this._paused && this.runActive) {
        this.pause();
        this.emit({ type: 'pause', paused: true });
      }
    });
    this.resize();
    requestAnimationFrame(this.tick);
  }

  // ------------------------------------------------------------------ public API
  get running(): boolean {
    return this.runActive && this.phase !== 'over';
  }
  get paused(): boolean {
    return this._paused;
  }

  on(fn: (e: EngineEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(e: EngineEvent): void {
    for (const l of [...this.listeners]) {
      try {
        l(e);
      } catch (err) {
        console.error(err);
      }
    }
  }

  setSettings(s: EngineSettings): void {
    this.settings = { ...s };
    this.applyQuality();
  }

  setInputEnabled(on: boolean): void {
    this.input.enabled = on && this.phase === 'run' && !this._paused;
    this.wantInput = on;
    if (!on) this.input.clear();
  }
  private wantInput = false;

  showMenu(o: MenuSceneOptions): void {
    if (this.runActive && this.phase !== 'over') this.quitRun();
    this.teardownRun();
    this.menu.show(o);
  }

  async startRun(o: RunOptions): Promise<void> {
    const opts = o as InternalRunOptions;
    this.teardownRun();
    this.opts = { ...opts, seed: opts.seed ?? ((Date.now() ^ (++this.seedCounter * 7919)) >>> 0) };
    this.emit({ type: 'loading', progress: 0 });
    let stage: StageModule;
    try {
      stage = createStage(opts.stage);
    } catch (err) {
      console.error('stage failed, using fallback', err);
      stage = createFallbackStage(opts.stage);
    }
    this.stage = stage;
    this.scene = new THREE.Scene();
    stage.build({ scene: this.scene, renderer: this.renderer, camera: this.camera, quality: this.qualityLevel() });
    if (this.scene.fog instanceof THREE.Fog) this.fogFar = this.scene.fog.far;
    const goal = opts.mode === 'adventure' ? stage.length : opts.mode === 'tutorial' ? 330 : null;
    this.track = new Track({
      stage, scene: this.scene, seed: this.opts.seed!, goal: opts.mode === 'tutorial' ? null : goal, makeFood: createFoodModel,
      scripted: opts.mode === 'tutorial', endless: opts.mode === 'endless',
    });
    this.avatar = createAvatar(opts.character, opts.ride);
    this.scene.add(this.avatar.root);
    this.shadow = blobShadow(1.3, 1.6, 0.32);
    this.scene.add(this.shadow);
    this.effects.dispose();
    this.effects = createEffects({
      scene: this.scene, camera: this.camera, renderer: this.renderer, canvas: this.canvas, overlay: this.overlay,
      reducedMotion: this.settings.reducedMotion,
    });
    this.effects.setAvatar(this.avatar);
    this.resetRunState(goal);
    if (opts.mode === 'tutorial') this.setupTutorial();
    this.track.update(0);
    this.runActive = true;
    this.phase = opts.skipCountdown ? 'run' : 'countdown';
    this.phaseT = 0;
    this.input.pauseEnabled = true;
    this.input.enabled = this.phase === 'run' && this.wantInput;
    this.input.clear();
    this.placeCamera(true);
    this.audio.playMusic(stage.music, 1.2);
    this.audio.playAmbience(stage.ambienceAt(0), 1.2);
    this.rideLoop = this.audio.loop('ride', RIDE_LOOP[opts.ride], 0);
    this.emit({ type: 'loading', progress: 1 });
    this.emit({ type: 'section', section: this.track.sectionAt(0), index: 0 });
    if (this.phase === 'countdown') this.emit({ type: 'countdown', n: 3 });
    else this.onGo();
  }

  pause(): void {
    if (!this.runActive || this.phase === 'over') return;
    this._paused = true;
    this.input.enabled = false;
    this.input.clear();
    this.rideLoop?.setVolume(0);
  }

  resume(): void {
    if (!this.runActive) return;
    this._paused = false;
    this.input.clear(); // drop pause presses queued while the pause menu was open
    this.input.enabled = this.phase === 'run' && this.wantInput;
    this.last = performance.now();
  }

  restartRun(): void {
    if (!this.opts) return;
    const o = { ...this.opts, seed: undefined };
    void this.startRun(o);
  }

  quitRun(): void {
    this.teardownRun();
    this.audio.loop('ride', null);
  }

  hud(): HudState {
    const p = this.power;
    const powers: HudState['powers'] = [];
    const add = (id: BenefitId | 'magnet', t: number, max: number) => {
      if (t > 0) powers.push({ id, t, max });
    };
    add('vision', p.vision, POWER_MAX.vision);
    add('muscles', p.muscles, POWER_MAX.muscles);
    add('bones', p.bones, POWER_MAX.bones);
    add('shield', p.shield, POWER_MAX.shield);
    add('energy', p.energy, POWER_MAX.energy);
    add('magnet', p.magnet, POWER_MAX.magnet);
    add('tummy', p.happyTummy, POWER_MAX.happyTummy);
    const junk: HudState['junkEffects'] = [];
    const addJ = (id: JunkEffectId | 'slump', t: number, max: number) => {
      if (t > 0) junk.push({ id, t, max });
    };
    addJ('sugar', p.sugarRush, 2.5);
    addJ('slump', p.slump, 4);
    addJ('teeth', p.teeth, 6);
    addJ('freeze', p.freeze, 1.6);
    addJ('slow', p.slow, 5);
    addJ('tummy', p.tummyAche, 5);
    const goal = this.stats?.goal ?? null;
    const sections = this.stage
      ? this.stage.sections.filter((s) => goal === null || s.start < goal).slice(0, goal === null ? 1 : 40)
      : [];
    return {
      running: this.running,
      paused: this._paused,
      mode: this.opts?.mode ?? 'adventure',
      stage: this.opts?.stage ?? 'indoor',
      hearts: this.hearts,
      maxHearts: MAX_HEARTS,
      healthy: this.stats?.healthyTotal ?? 0,
      junk: this.stats?.junkTotal ?? 0,
      score: Math.round(this.stats?.score ?? 0),
      distance: this.dist,
      goal,
      progress: goal ? clamp(this.dist / goal, 0, 1) : 0,
      section: this.track ? this.track.sectionAt(this.dist) : { id: 'indoor', label: '', start: 0 },
      sections,
      powers,
      junkEffects: junk,
      power: { ...p },
      countdown: this.phase === 'countdown' ? Math.max(0, Math.ceil(((COUNTDOWN - this.phaseT) / COUNTDOWN) * 3)) : 0,
      tutorialStep: this.tutorialStep,
    };
  }

  // ------------------------------------------------------------------ probe support (production state)
  /** Position of the runner in world space and the camera's visible right basis. */
  probeSample(): { position: [number, number, number]; forward: [number, number, number]; right: [number, number, number] } {
    this.camera.updateMatrixWorld();
    const e = this.camera.matrixWorld.elements;
    // Camera right (column 0), flattened onto the ground and made perpendicular to the runner's forward (-Z).
    const fwd = new THREE.Vector3(0, 0, -1);
    const right = new THREE.Vector3(e[0], 0, e[2]);
    right.addScaledVector(fwd, -right.dot(fwd));
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    right.normalize();
    return { position: [this.x, this.y, -this.dist], forward: [0, 0, -1], right: [right.x, right.y, right.z] };
  }

  get isReadyForControl(): boolean {
    return this.runActive && this.phase === 'run' && !this._paused && this.input.enabled;
  }

  // ------------------------------------------------------------------ internals
  private qualityLevel(): 'low' | 'high' {
    if (this.settings.quality !== 'auto') return this.settings.quality;
    const handheld = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
    return handheld && Math.min(screen.width, screen.height) < 500 ? 'low' : 'high';
  }

  private applyQuality(): void {
    const dpr = window.devicePixelRatio || 1;
    const cap = this.settings.quality === 'low' ? 1.25 : this.settings.quality === 'high' ? 2 : this.qualityLevel() === 'low' ? 1.75 : 2;
    this.pixelRatio = Math.min(dpr, cap);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.w, this.h, false);
  }

  private resize(): void {
    const r = this.container.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.applyQuality();
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    this.menu.aspect = this.w / this.h;
  }

  private teardownRun(): void {
    if (this.track) this.track.dispose();
    this.track = null;
    if (this.stage) {
      try {
        this.stage.dispose();
      } catch (err) {
        console.error(err);
      }
    }
    this.stage = null;
    if (this.avatar) {
      this.scene.remove(this.avatar.root);
      this.avatar.dispose();
    }
    this.avatar = null;
    this.effects.setAvatar(null);
    this.effects.reset();
    this.canvas.style.filter = '';
    this.runActive = false;
    this.phase = 'over';
    this._paused = false;
    this.input.enabled = false;
    this.input.pauseEnabled = false;
    this.input.clear();
    this.tutorialStep = null;
    this.gates = [];
    this.rideLoop?.stop(0.3);
    this.rideLoop = null;
  }

  private resetRunState(goal: number | null): void {
    const o = this.opts!;
    this.t = 0;
    this.dist = 0;
    this.speed = 0;
    this.lane = 0;
    this.prevLane = 0;
    this.x = 0;
    this.prevX = 0;
    this.tweenFrom = 0;
    this.tweenT = 1;
    this.lateral = 0;
    this.y = 0;
    this.vy = 0;
    this.grounded = true;
    this.groundY = 0;
    this.jumpT = -1;
    this.slideT = -1;
    this.slideQueued = false;
    this.landT = 999;
    this.bumpT = 999;
    this.invuln = 0;
    this.recover = 1;
    this.hearts = MAX_HEARTS;
    this.power = freshPower();
    this.pendingSlump = 0;
    this.flexT = 99;
    this.hhT = 0;
    this.sectionIndex = 0;
    this.lastNearMiss = -9;
    this.lastBenefitFx = {};
    this.healthyStreak = 0;
    this.camGround = 0;
    this.shake = 0;
    this.timeScale = 1;
    this.nextSprinkle = 5 + Math.random() * 4;
    this.nextBell = 8;
    this.stats = {
      stage: o.stage, mode: o.mode, character: o.character, ride: o.ride,
      distance: 0, goal, finished: false, timeSec: 0, score: 0,
      healthy: {}, junk: {}, healthyTotal: 0, junkTotal: 0, nearMisses: 0, bumps: 0,
      bestGlowLevel: 0, happyAndHealthy: 0, sectionsSeen: [this.stage!.sections[0].id], seasonsSeen: [], stars: 0,
    };
    const s0 = this.stage!.sections[0];
    if (s0.season) this.stats.seasonsSeen.push(s0.season);
  }

  private onGo(): void {
    this.phase = 'run';
    this.phaseT = 0;
    this.input.enabled = this.wantInput && !this._paused;
    this.speed = this.baseSpeed() * 0.8;
    const o = this.opts!;
    if (o.mode !== 'tutorial') this.voice('start', { priority: true });
    if (o.ride === 'bike') this.audio.playSfx('bike_bell', { volume: 0.7 });
  }

  private voice(group: string, opts?: { priority?: boolean; minGap?: number }): void {
    if (!this.opts) return;
    this.audio.playVoice(this.opts.character, group, opts);
  }

  private baseSpeed(): number {
    const o = this.opts!;
    if (o.mode === 'tutorial') return 9.5;
    if (o.mode === 'endless') return 11 + 9 * (1 - Math.exp(-this.dist / 2600));
    const goal = this.stats.goal ?? 1500;
    return 10.5 + 4.8 * clamp(this.dist / goal, 0, 1);
  }

  private speedMult(): number {
    const p = this.power;
    let m = 1;
    if (p.energy > 0) m *= 1.45;
    if (p.sugarRush > 0) m *= 1.1;
    if (p.slump > 0) m *= 0.82;
    if (p.slow > 0) m *= 0.78;
    if (p.tummyAche > 0) m *= 0.9;
    if (p.freeze > 0) m *= 0.85;
    return Math.max(0.62, m) * this.recover;
  }

  private tick = (now: number): void => {
    requestAnimationFrame(this.tick);
    let dt = (now - (this.last || now)) / 1000;
    this.last = now;
    if (!(dt >= 0)) dt = 0;
    dt = Math.min(dt, 0.05);
    this.adaptQuality(dt);
    if (this.runActive) {
      if (!this._paused) this.updateRun(dt);
      else this.avatar?.update(this.motion(0));
      this.renderer.render(this.scene, this.camera);
    } else {
      this.menu.update(dt);
      this.renderer.render(this.menu.scene, this.menu.camera);
    }
  };

  private adaptQuality(dt: number): void {
    if (this.settings.quality !== 'auto' || dt <= 0) return;
    this.frameAvg = lerp(this.frameAvg, dt * 1000, 0.05);
    if (this.frameAvg > 24 && this.pixelRatio > 1) {
      if (++this.slowFrames > 90) {
        this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.renderer.setSize(this.w, this.h, false);
        this.slowFrames = 0;
      }
    } else this.slowFrames = Math.max(0, this.slowFrames - 1);
  }

  // ------------------------------------------------------------------ simulation
  private updateRun(realDt: number): void {
    const track = this.track!;
    const stage = this.stage!;
    this.phaseT += realDt;
    if (this.phase === 'countdown') {
      const before = this.phaseT - realDt;
      for (const [at, n] of [[0.8, 2], [1.6, 1], [COUNTDOWN, 0]] as const) {
        if (before < at && this.phaseT >= at) {
          this.emit({ type: 'countdown', n });
          this.audio.playSfx(n === 0 ? 'go' : 'countdown_beep');
          if (n === 0) this.onGo();
        }
      }
    }
    if (this.phase === 'run') this.updateTutorial();
    const dt = realDt * this.timeScale;
    this.t += dt;
    if (this.phase === 'run') {
      for (const a of this.input.drain()) this.handleAction(a);
    } else {
      for (const a of this.input.drain()) if (a === 'pause') this.handleAction(a);
    }
    if (!this.runActive) return; // a pause action may not stop; quit can
    this.updatePowers(dt);

    // Forward motion.
    let target = 0;
    if (this.phase === 'run') target = this.baseSpeed() * this.speedMult();
    else if (this.phase === 'finish') target = Math.max(0, this.speed - 9 * dt);
    else if (this.phase === 'puffed') target = 0;
    this.speed = this.phase === 'run' ? damp(this.speed, target, 3.5, dt) : damp(this.speed, target, this.phase === 'puffed' ? 3 : 2, dt);
    if (this.phase === 'countdown') this.speed = 0;
    this.recover = Math.min(1, this.recover + dt * 0.45);
    this.dist += this.speed * dt;

    // Lateral lane tween.
    this.prevX = this.x;
    if (this.tweenT < 1) {
      this.tweenT = Math.min(1, this.tweenT + dt / LANE_TIME);
      const e = 1 - Math.pow(1 - this.tweenT, 3);
      this.x = lerp(this.tweenFrom, laneX(this.lane), e);
    } else this.x = laneX(this.lane);
    this.lateral = dt > 0 ? (this.x - this.prevX) / dt : 0;

    // Vertical.
    this.updateVertical(dt);

    // Obstacles, food, track streaming.
    this.updateObstacles(dt);
    this.updateFood(dt);
    track.junkLoadHint = this.power.junkLoad;
    track.update(this.dist);
    const pos = new THREE.Vector3(this.x, this.y, -this.dist);
    try {
      stage.update(this.t, dt, this.dist, pos);
    } catch (err) {
      console.error(err);
    }
    this.updateSections();
    this.sprinkle(dt);
    this.stats.distance = this.dist;
    this.stats.timeSec += dt;
    if (this.phase === 'run') this.stats.score += this.speed * dt * 0.5;

    // Finish / puffed out.
    if (this.phase === 'run' && this.stats.goal !== null && this.opts!.mode === 'adventure' && this.dist >= this.stats.goal) this.startFinish();
    if ((this.phase === 'finish' && this.phaseT > 2.8) || (this.phase === 'puffed' && this.phaseT > 2.2)) this.endRun();

    // Avatar + effects.
    const av = this.avatar!;
    av.root.position.set(this.x, this.y, -this.dist);
    av.root.rotation.y = 0;
    if (this.invuln > 0 && this.phase === 'run') av.setBlink(Math.floor(this.invuln * 12) % 2 === 0);
    else av.setBlink(true);
    av.update(this.motion(dt));
    this.shadow!.position.set(this.x, this.groundY + 0.02, -this.dist);
    const sh = clamp(1 - (this.y - this.groundY) / 3, 0.35, 1);
    this.shadow!.scale.set(1.3 * sh, 1.6 * sh, 1);
    try {
      this.effects.update(realDt, this.t, this.power);
    } catch (err) {
      console.error(err);
    }
    this.updateFog(dt);
    this.updateRideAudio();
    this.placeCamera(false, realDt);
  }

  private motion(dt: number): AvatarMotion {
    const p = this.power;
    const sleepyTarget = p.slump > 0 ? 1 : p.slow > 0 ? 0.6 : p.junkLoad * 0.3;
    const wobble = p.tummyAche > 0 ? 1 : p.sugarRush > 0 ? 0.55 : p.freeze > 0 ? 0.4 : 0;
    const flex = this.flexT < 1.3 ? Math.sin((this.flexT / 1.3) * Math.PI) : 0;
    const celebrate = this.phase === 'finish' ? clamp(this.phaseT * 1.5, 0, 1) : 0;
    const countdownIdle = this.phase === 'countdown';
    return {
      time: this.t, dt, speed: countdownIdle ? 0 : this.speed, lateral: this.lateral,
      airborne: !this.grounded, vy: this.vy, jumpT: this.jumpT, sliding: this.slideT >= 0, slideT: this.slideT,
      landT: this.landT, bumpT: this.bumpT, boost: p.energy > 0 ? 1 : 0, sleepy: sleepyTarget, wobble,
      mood: clamp(p.glow - p.junkLoad * 1.2 + (p.happyAndHealthy ? 0.5 : 0), -1, 1), flex,
      celebrate: this.phase === 'puffed' ? 0 : celebrate, menu: countdownIdle || this.phase === 'puffed',
    };
  }

  private handleAction(a: Action): void {
    if (a === 'pause') {
      if (this._paused) this.resume();
      else this.pause();
      this.emit({ type: 'pause', paused: this._paused });
      return;
    }
    if (this.phase !== 'run') return;
    const fromLane = this.lane;
    if (a === 'left' || a === 'right') {
      const nl = clamp(this.lane + (a === 'left' ? -1 : 1), -1, 1);
      if (nl === this.lane) {
        // Gentle edge nudge so the press still feels acknowledged.
        this.tweenFrom = this.x + (a === 'left' ? -0.35 : 0.35);
        this.tweenT = 0.35;
        return;
      }
      this.prevLane = this.lane;
      this.lane = nl;
      this.tweenFrom = this.x;
      this.tweenT = 0;
      this.audio.playSfx('whoosh_lane', { volume: 0.55, pan: a === 'left' ? -0.3 : 0.3 });
      this.markThreats(fromLane);
    } else if (a === 'jump') {
      if (this.grounded || this.coyote > 0) {
        if (this.slideT >= 0) this.slideT = -1;
        const p = this.power;
        const h = JUMP_H * (p.bones > 0 ? 1.75 : 1) * (p.teeth > 0 ? 0.88 : 1);
        this.vy = Math.sqrt(2 * G * h);
        this.grounded = false;
        this.coyote = 0;
        this.jumpT = 0;
        const ride = this.opts!.ride;
        this.audio.playSfx(ride === 'skate' ? 'skate_pop' : ride === 'bike' ? 'bike_hop' : 'jump', { volume: 0.7 });
        if (Math.random() < 0.18) this.voice('jump', { minGap: 3 });
        this.markThreats(fromLane);
      }
    } else if (a === 'slide') {
      if (!this.grounded) {
        this.vy = Math.min(this.vy, -22);
        this.slideQueued = true;
      } else {
        this.slideT = 0;
        this.audio.playSfx('slide', { volume: 0.6 });
      }
      this.markThreats(fromLane);
    }
  }
  private coyote = 0;

  /** Obstacles the runner dodged at the last moment become near-miss candidates. */
  private markThreats(lane: number): void {
    const lx = laneX(lane);
    const window = Math.max(3, this.speed * 0.42);
    for (const o of this.track!.obstacles) {
      if (o.kind === 'ramp' || o.kind === 'platform' || o.hit || o.knocked >= 0) continue;
      const ahead = o.dc - o.len / 2 - this.dist;
      if (ahead > 0 && ahead < window && Math.abs(o.x - lx) < o.span * LANE_WIDTH * 0.5) o.threatened = true;
    }
  }

  private updateVertical(dt: number): void {
    const track = this.track!;
    const g = track.groundAt(this.x, this.dist);
    const wasGrounded = this.grounded;
    if (this.jumpT >= 0) this.jumpT += dt;
    if (this.slideT >= 0) {
      this.slideT += dt;
      if (this.slideT > SLIDE_TIME) this.slideT = -1;
    }
    this.landT += dt;
    this.bumpT += dt;
    this.coyote = Math.max(0, this.coyote - dt);
    if (this.grounded) {
      if (g >= this.y - 0.001 && g - this.y < 0.6) {
        this.y = g; // walk up ramps
      } else if (g < this.y - 0.02) {
        this.grounded = false; // ran off a platform
        this.coyote = 0.1;
        this.vy = 0;
      }
    }
    if (!this.grounded) {
      this.vy -= G * dt;
      this.y += this.vy * dt;
      if (this.y <= g && this.vy <= 0) {
        this.y = g;
        this.vy = 0;
        this.grounded = true;
        this.jumpT = -1;
        if (!wasGrounded) {
          this.landT = 0;
          const ride = this.opts!.ride;
          this.audio.playSfx(ride === 'skate' ? 'skate_land' : 'land', { volume: 0.5 });
          if (this.slideQueued) {
            this.slideQueued = false;
            this.slideT = 0;
            this.audio.playSfx('slide', { volume: 0.6 });
          }
        }
      }
    }
    this.groundY = g;
  }

  private overlapX(px: number, o: Obstacle): boolean {
    return Math.abs(px - o.x) < o.span * LANE_WIDTH * 0.5 - 0.25 + 0.32;
  }

  private hits(o: Obstacle): boolean {
    const top = this.y + (this.slideT >= 0 ? 0.85 : 1.45);
    switch (o.kind) {
      case 'low':
      case 'moverLow':
        return this.y < o.height - 0.08;
      case 'high':
        return top > 1.05 + 0.1;
      case 'block':
      case 'moverBlock':
        return this.y < o.height - 0.1;
      case 'platform':
        return this.y < PLATFORM_TOP - 0.45;
      default:
        return false;
    }
  }

  private updateObstacles(dt: number): void {
    const track = this.track!;
    for (const o of track.obstacles) {
      // Movers start walking across when the runner gets close.
      if ((o.kind === 'moverBlock' || o.kind === 'moverLow') && o.knocked < 0) {
        const ahead = o.dc - this.dist;
        if (o.moveT < 0 && ahead < 42) o.moveT = 0;
        if (o.moveT >= 0 && o.moveT < 1) {
          o.moveT = Math.min(1, o.moveT + dt / (o.kind === 'moverBlock' ? 1.9 : 1.2));
          o.x = lerp(o.fromX, o.toX, smooth(o.moveT));
        }
      }
      if (o.knocked >= 0) {
        o.knocked += dt;
        const ob = o.visual.object;
        ob.position.x += o.knockDir * 10 * dt;
        ob.position.y = Math.sin(Math.min(1, o.knocked / 0.7) * Math.PI) * 1.6;
        ob.rotation.z += o.knockDir * 5 * dt;
        ob.scale.setScalar(Math.max(0.01, 1 - o.knocked / 0.8));
        if (o.guide) o.guide.visible = false;
      } else {
        o.visual.object.position.x = o.x;
      }
      // Once safely behind the runner, tuck obstacles away so they never block the chase camera's view.
      const behind = this.dist - (o.dc + o.len / 2);
      if (behind > 1.2 && o.kind !== 'platform' && o.kind !== 'ramp') o.visual.object.visible = false;
      else if (o.kind === 'platform' && behind > 0.5) o.visual.object.visible = false;
      try {
        o.visual.update?.(this.t, dt, o.dc - this.dist);
      } catch (err) {
        console.error(err);
      }
      this.updateGuide(o);
      if (this.phase !== 'run' || o.knocked >= 0 || o.hit || o.kind === 'ramp') continue;
      // Near-miss once safely past.
      if (!o.passed && o.dc + o.len / 2 < this.dist - 0.4) {
        o.passed = true;
        if (o.threatened && this.t - this.lastNearMiss > 1.2) {
          this.lastNearMiss = this.t;
          this.stats.nearMisses++;
          this.stats.score += 25;
          this.audio.playSfx('near_miss', { volume: 0.6 });
          if (Math.random() < 0.45) this.voice('near_miss', { minGap: 4 });
          this.emit({ type: 'nearMiss' });
        }
      }
      if (Math.abs(this.dist - o.dc) > o.len / 2 + 0.3) continue;
      if (!this.overlapX(this.x, o) || !this.hits(o)) continue;
      const side = !this.overlapX(this.prevX, o) && this.tweenT < 1;
      if (side && o.kind !== 'platform') this.sideHit(o);
      else this.frontHit(o);
    }
  }

  private sideHit(o: Obstacle): void {
    // Bounce back into the lane we came from: a stumble, never a lost heart.
    const back = this.prevLane;
    this.prevLane = this.lane;
    this.lane = back;
    this.tweenFrom = this.x;
    this.tweenT = 0;
    this.x = this.prevX;
    this.bumpT = 0;
    this.shake = Math.max(this.shake, 0.25);
    this.audio.playSfx('bump', { volume: 0.45 });
    o.visual.react?.('bump');
    this.avatar?.setExpression('oops', 0.8);
  }

  private knock(o: Obstacle, reaction: 'bonk' | 'bump'): void {
    o.knocked = 0;
    o.knockDir = Math.sign(o.x - this.x) || (Math.random() < 0.5 ? -1 : 1);
    o.visual.react?.(reaction);
  }

  private hopOnto(o: Obstacle): void {
    void o;
    this.y = PLATFORM_TOP;
    this.vy = 4;
    this.grounded = false;
    this.jumpT = 0;
  }

  private frontHit(o: Obstacle): void {
    const p = this.power;
    const platform = o.kind === 'platform';
    if (p.energy > 0 || this.invuln > 0) {
      if (platform) this.hopOnto(o);
      else if (p.energy > 0) {
        this.knock(o, 'bonk');
        this.audio.playSfx('bonk', { volume: 0.6 });
      } else o.hit = true; // pass through while blinking
      return;
    }
    if (p.muscles > 0) {
      if (platform) this.hopOnto(o);
      else this.knock(o, 'bonk');
      this.audio.playSfx('bonk', { volume: 0.7 });
      this.effects.onBonk();
      this.emit({ type: 'bonk' });
      return;
    }
    if (p.shield > 0) {
      p.shield = 0;
      if (platform) this.hopOnto(o);
      else this.knock(o, 'bump');
      this.invuln = 0.8;
      this.audio.playSfx('shield_bounce', { volume: 0.8 });
      this.effects.onShieldBlock();
      this.voice('shield_block', { priority: true });
      this.emit({ type: 'shieldBlock' });
      return;
    }
    // A gentle bump.
    o.hit = true;
    if (platform) this.hopOnto(o);
    else this.knock(o, 'bump');
    this.bumpT = 0;
    this.invuln = 1.6;
    this.recover = 0.5;
    this.shake = this.settings.reducedMotion ? 0 : 0.5;
    this.stats.bumps++;
    this.audio.playSfx('bump', { volume: 0.8 });
    this.effects.onBump();
    this.avatar?.setExpression('oops', 1.0);
    this.voice('bump', { priority: true });
    if (this.opts!.mode !== 'tutorial') this.hearts = Math.max(0, this.hearts - 1);
    this.emit({ type: 'bump', hearts: this.hearts });
    if (this.hearts <= 0) {
      this.phase = 'puffed';
      this.phaseT = 0;
      this.input.enabled = false;
    }
  }

  private updateFood(dt: number): void {
    const track = this.track!;
    const p = this.power;
    const cx = this.x;
    const cy = this.y + (this.slideT >= 0 ? 0.45 : 0.8);
    const mouth = this.avatar?.anchor('mouth');
    const mouthPos = new THREE.Vector3();
    if (mouth) mouth.getWorldPosition(mouthPos);
    else mouthPos.set(cx, cy + 0.6, -this.dist);
    const eatTarget = new THREE.Vector3();
    for (const f of track.foods) {
      const o = f.obj;
      if (f.taken) {
        // Eaten: pop small at once, then zip into a point just in front of the face (further from the
        // chase camera than the head), so the bite never covers the runner.
        f.takenT += dt;
        const k = Math.min(1, f.takenT / 0.16);
        const e = 1 - (1 - k) * (1 - k);
        eatTarget.set(mouthPos.x, mouthPos.y + 0.05, mouthPos.z - 0.45);
        o.position.lerp(eatTarget, Math.max(0.35, e));
        o.scale.setScalar(Math.max(0.01, Math.min(0.42, o.scale.x) * (1 - e)));
        o.visible = k < 1;
        continue;
      }
      const dz = f.d - this.dist;
      // Idle spin + bob (healthy food friends sparkle, treats just sit).
      o.rotation.y = this.t * 1.6 + f.phase;
      const bob = Math.sin(this.t * 3 + f.phase) * 0.08;
      if (p.magnet > 0 && f.def.kind === 'healthy' && dz < 16 && dz > -1.5 && this.phase === 'run') f.pulled = true;
      if (f.pulled) {
        // Magnet: fly toward a point just in front of the face (away from the chase camera) and shrink
        // on the way, so pulled food never covers the runner's body.
        const target = eatTarget.set(mouthPos.x, mouthPos.y + 0.05, mouthPos.z - 0.6);
        o.position.lerp(target, 1 - Math.exp(-12 * dt));
        const gap = o.position.distanceTo(target);
        o.scale.setScalar(clamp(gap / 3, 0.3, 1));
        f.d = -o.position.z;
        f.x = o.position.x;
        f.y = o.position.y;
        if (gap < 1.1) this.collect(f);
        continue;
      }
      o.position.set(f.x, f.y + bob, -f.d);
      // A missed food tucks away once behind the runner so it never sweeps past the chase camera.
      o.visible = dz > -0.8;
      if (this.phase !== 'run' && this.phase !== 'finish') continue;
      if (Math.abs(dz) < 0.95 && Math.abs(f.x - cx) < 1.0 && Math.abs(f.y - cy) < 1.25) this.collect(f);
    }
  }

  private collect(f: FoodItem): void {
    f.taken = true;
    f.takenT = 0;
    const def = f.def;
    const s = this.stats;
    this.audio.playSfx(def.sfx, { volume: 0.75, rate: 0.94 + Math.random() * 0.14 });
    if (def.kind === 'healthy') {
      s.healthy[def.id] = (s.healthy[def.id] ?? 0) + 1;
      s.healthyTotal++;
      s.score += def.points * (this.power.happyAndHealthy ? 2 : 1);
      this.applyHealthy(def, f.lead);
      this.emit({ type: 'food', food: def, count: s.healthy[def.id] });
    } else {
      s.junk[def.id] = (s.junk[def.id] ?? 0) + 1;
      s.junkTotal++;
      this.applyJunk(def);
      this.emit({ type: 'food', food: def, count: s.junk[def.id] });
    }
  }

  private clearJunk(which: 'all' | 'teeth' | 'tummy' | 'tired'): boolean {
    const p = this.power;
    let any = false;
    const z = (k: 'sugarRush' | 'slump' | 'teeth' | 'freeze' | 'slow' | 'tummyAche') => {
      if (p[k] > 0) {
        p[k] = 0;
        any = true;
      }
    };
    if (which === 'all') {
      z('sugarRush');
      z('slump');
      z('teeth');
      z('freeze');
      z('slow');
      z('tummyAche');
      this.pendingSlump = 0;
    } else if (which === 'teeth') z('teeth');
    else if (which === 'tummy') {
      z('tummyAche');
      z('slow');
    } else if (which === 'tired') {
      z('slump');
      z('slow');
    }
    return any;
  }

  private applyHealthy(def: FoodDef, lead: boolean): void {
    const p = this.power;
    const b = def.benefit!;
    let bounced = false;
    p.junkLoad = Math.max(0, p.junkLoad - 0.03);
    switch (b) {
      case 'vision':
        p.vision = POWER_MAX.vision;
        break;
      case 'muscles':
        p.muscles = POWER_MAX.muscles;
        break;
      case 'bones':
        p.bones = POWER_MAX.bones;
        bounced = this.clearJunk('teeth');
        break;
      case 'shield':
        p.shield = POWER_MAX.shield;
        break;
      case 'energy':
        p.energy = Math.max(p.energy, POWER_MAX.energy);
        bounced = this.clearJunk('tired');
        break;
      case 'refresh':
        p.refresh = POWER_MAX.refresh;
        p.junkLoad = Math.max(0, p.junkLoad - 0.15);
        bounced = this.clearJunk('all');
        break;
      case 'grow':
        p.magnet = POWER_MAX.magnet;
        break;
      case 'tummy':
        p.happyTummy = POWER_MAX.happyTummy;
        p.junkLoad = Math.max(0, p.junkLoad - 0.06);
        bounced = this.clearJunk('tummy');
        break;
    }
    const sinceFx = this.t - (this.lastBenefitFx[b] ?? -99);
    if (lead || sinceFx > 1.8) {
      this.lastBenefitFx[b] = this.t;
      if (b === 'muscles') this.flexT = 0;
      this.audio.playSfx(BENEFIT_SFX[b], { volume: 0.7 });
      try {
        this.effects.onHealthy(def, p);
      } catch (err) {
        console.error(err);
      }
      this.healthyStreak++;
      if (this.healthyStreak % 3 === 1) this.voice(BENEFIT_VOICE[b], { minGap: 2.5 });
      else this.voice('yum', { minGap: 2.5 });
    }
    if (bounced) {
      this.effects.onBounceBack();
      this.audio.playSfx('bounce_back', { volume: 0.7, delay: 0.15 });
      this.voice('bounce_back', { priority: true });
    }
    // Healthy & happy glow.
    if (!p.happyAndHealthy) {
      const cap = 1 - p.junkLoad * 0.5;
      p.glow = Math.min(cap, p.glow + 0.022);
      this.updateGlowLevel();
    }
  }

  private updateGlowLevel(): void {
    const p = this.power;
    const lvl = Math.min(5, Math.floor(p.glow * 5 + 1e-6));
    if (lvl > p.glowLevel) {
      p.glowLevel = lvl;
      this.stats.bestGlowLevel = Math.max(this.stats.bestGlowLevel, lvl);
      const full = p.glow >= 0.999;
      if (full) {
        p.happyAndHealthy = true;
        this.hhT = 10;
        this.stats.happyAndHealthy++;
        this.audio.playSfx('glow_full', { volume: 0.8 });
        this.voice('glow_full', { priority: true });
        if (this.hearts < MAX_HEARTS) {
          this.hearts++;
          this.audio.playSfx('heart_up', { volume: 0.7, delay: 0.4 });
          this.emit({ type: 'heart', hearts: this.hearts });
        }
      } else this.audio.playSfx('glow_level', { volume: 0.5 });
      this.effects.onGlowLevel(lvl, full);
      this.emit({ type: 'glow', level: lvl, full });
    } else p.glowLevel = lvl;
  }

  private applyJunk(def: FoodDef): void {
    const p = this.power;
    const m = 1 + p.junkLoad; // slower recovery as junk builds up
    switch (def.junk!) {
      case 'sugar':
        p.sugarRush = 2.5;
        this.pendingSlump = 4 * m;
        break;
      case 'teeth':
        p.teeth = 6 * m;
        break;
      case 'freeze':
        p.freeze = 1.6;
        this.pendingSlump = Math.max(this.pendingSlump, 2.5 * m);
        p.sugarRush = Math.max(p.sugarRush, 0.6);
        break;
      case 'slow':
        p.slow = 5 * m;
        break;
      case 'tummy':
        p.tummyAche = 5 * m;
        break;
    }
    p.junkLoad = Math.min(1, p.junkLoad + 0.22);
    if (!p.happyAndHealthy) {
      p.glow = Math.max(0, Math.min(p.glow - 0.12, 1 - p.junkLoad * 0.5));
      p.glowLevel = Math.min(5, Math.floor(p.glow * 5 + 1e-6));
    }
    this.healthyStreak = 0;
    this.audio.playSfx(JUNK_SFX[def.junk!], { volume: 0.7, delay: 0.1 });
    try {
      this.effects.onJunk(def, p);
    } catch (err) {
      console.error(err);
    }
    this.voice(def.junk!, { priority: true });
  }

  private updatePowers(dt: number): void {
    const p = this.power;
    const dec = (k: keyof PowerState) => {
      const v = p[k] as number;
      if (v > 0) (p[k] as number) = Math.max(0, v - dt);
    };
    const hadRush = p.sugarRush > 0;
    for (const k of ['vision', 'muscles', 'bones', 'shield', 'energy', 'magnet', 'refresh', 'happyTummy', 'sugarRush', 'slump', 'teeth', 'freeze', 'slow', 'tummyAche'] as const) dec(k);
    if (hadRush && p.sugarRush <= 0 && this.pendingSlump > 0) {
      p.slump = this.pendingSlump;
      this.pendingSlump = 0;
      this.audio.playSfx('sleepy_yawn', { volume: 0.6 });
      this.avatar?.setExpression('sleepy', 2.2);
    }
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    this.flexT += dt;
    if (p.happyAndHealthy) {
      this.hhT -= dt;
      if (this.hhT <= 0) {
        p.happyAndHealthy = false;
        p.glow = 0.45;
        p.glowLevel = 2;
      }
    }
    // Long-term junk load slowly fades on its own too.
    p.junkLoad = Math.max(0, p.junkLoad - dt * 0.004);
  }

  private updateSections(): void {
    const s = this.stage!.sections;
    const goal = this.stats.goal;
    let idx = this.sectionIndex;
    while (idx + 1 < s.length && s[idx + 1].start <= this.dist && (goal === null || s[idx + 1].start < goal)) idx++;
    if (idx !== this.sectionIndex) {
      this.sectionIndex = idx;
      const sec: StageSection = s[idx];
      if (!this.stats.sectionsSeen.includes(sec.id)) this.stats.sectionsSeen.push(sec.id);
      if (sec.season && !this.stats.seasonsSeen.includes(sec.season)) this.stats.seasonsSeen.push(sec.season);
      this.audio.playAmbience(this.stage!.ambienceAt(this.dist), 2.5);
      this.emit({ type: 'section', section: sec, index: idx });
    }
  }

  private sprinkle(dt: number): void {
    this.nextSprinkle -= dt;
    const st = this.stage! as StageModule & { sprinkleAt?: (d: number) => string[] };
    if (this.nextSprinkle <= 0) {
      this.nextSprinkle = 6 + Math.random() * 7;
      const list = st.sprinkleAt?.(this.dist) ?? st.sprinkleSfx;
      if (list && list.length) this.audio.playSfx(list[Math.floor(Math.random() * list.length)], { volume: 0.45, pan: Math.random() < 0.5 ? -0.6 : 0.6 });
    }
    if (this.opts!.ride === 'bike' && this.phase === 'run') {
      this.nextBell -= dt;
      if (this.nextBell <= 0) {
        this.nextBell = 20 + Math.random() * 20;
        this.audio.playSfx('bike_bell', { volume: 0.45 });
      }
    }
  }

  private updateRideAudio(): void {
    if (!this.rideLoop) return;
    const moving = this.phase === 'run' || this.phase === 'finish';
    const on = moving && this.grounded && this.slideT < 0 && this.speed > 1;
    this.rideLoop.setVolume(on ? 0.42 : 0);
    this.rideLoop.setRate(clamp(this.speed / 12, 0.8, 1.35));
  }

  private updateFog(dt: number): void {
    const fog = this.scene.fog;
    if (!(fog instanceof THREE.Fog)) return;
    const target = this.fogFar * (this.power.vision > 0 ? 1.55 : 1);
    fog.far = damp(fog.far, target, 2, dt);
  }

  private updateGuide(o: Obstacle): void {
    const want = this.power.vision > 0 && (o.kind === 'low' || o.kind === 'high' || o.kind === 'moverLow') && !o.passed && o.knocked < 0;
    if (!want) {
      if (o.guide) o.guide.visible = false;
      return;
    }
    if (!o.guide) {
      if (!this.guideTex) this.guideTex = { up: arrowTexture(true), down: arrowTexture(false) };
      const up = o.kind !== 'high';
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: up ? this.guideTex.up : this.guideTex.down, transparent: true, depthWrite: false }));
      sp.scale.set(0.9, 0.9, 1);
      o.guide = sp;
      o.visual.object.parent?.add(sp);
    }
    o.guide.visible = true;
    const bob = Math.sin(this.t * 6) * 0.12;
    o.guide.position.set(o.x, (o.kind === 'high' ? 0.55 : o.height + 0.75) + bob, -o.dc + o.len / 2);
  }

  private startFinish(): void {
    this.phase = 'finish';
    this.phaseT = 0;
    this.input.enabled = false;
    this.stats.finished = true;
    this.audio.playSfx('finish_fanfare', { volume: 0.9 });
    this.voice('finish', { priority: true });
    this.avatar?.setExpression('cheer', 3);
  }

  private endRun(): void {
    if (this.phase === 'over') return;
    const s = this.stats;
    if (this.opts!.mode === 'tutorial') s.finished = true;
    s.score = Math.round(s.score);
    let stars = 0;
    if (s.finished) {
      stars = 1;
      if (s.healthyTotal >= Math.round((s.goal ?? 1300) / 28)) stars++;
      if (s.happyAndHealthy > 0) stars++;
    } else if (this.opts!.mode === 'endless') {
      stars = s.distance > 2500 ? 3 : s.distance > 1200 ? 2 : s.distance > 400 ? 1 : 0;
    }
    s.stars = stars as RunStats['stars'];
    this.phase = 'over';
    this.input.enabled = false;
    this.input.pauseEnabled = false;
    this.rideLoop?.setVolume(0);
    this.emit({ type: 'end', stats: { ...s, healthy: { ...s.healthy }, junk: { ...s.junk } } });
  }

  // ------------------------------------------------------------------ tutorial
  private setupTutorial(): void {
    const tr = this.track!;
    const add = (kind: Obstacle['kind'], lane: number, d: number, span = 1) => {
      const len = kind === 'block' ? 2 : 1;
      const h = kind === 'block' ? 2.8 : kind === 'low' ? 0.8 : 2.6;
      tr.addObstacle(kind, span === 3 ? 0 : laneX(lane), d, len, h, span);
    };
    // left: blocks in the middle and right lanes
    add('block', 0, 62);
    add('block', 1, 62);
    // right: a block in the left lane
    add('block', -1, 104);
    // jump + slide across all lanes
    add('low', 0, 146, 3);
    add('high', 0, 188, 3);
    // healthy food in every lane
    const lanes = [-1, 0, 1];
    const healthy = ['carrot_sticks', 'broccoli', 'milk'];
    lanes.forEach((l, i) => tr.foodLine(212, l, 4, null, false, healthy[i]));
    lanes.forEach((l) => tr.foodLine(226, l, 2, null, false, 'orange'));
    // a treat to try, then water to bounce back
    lanes.forEach((l) => tr.addFood(FOOD_BY_ID.fizzy_can, 252, laneX(l), 0.95, true));
    lanes.forEach((l) => tr.foodLine(276, l, 3, null, false, 'water'));
    const T = this;
    this.gates = [
      { step: 'intro', at: 2, gate: 0, done: false, announced: false, check: () => true },
      { step: 'left', at: 30, gate: 50, done: false, announced: false, check: () => T.lane === -1 },
      { step: 'right', at: 76, gate: 92, done: false, announced: false, check: () => T.lane >= 0 },
      { step: 'jump', at: 118, gate: 136, done: false, announced: false, check: () => !T.grounded },
      { step: 'slide', at: 160, gate: 179, done: false, announced: false, check: () => T.slideT >= 0 },
      { step: 'healthy', at: 198, gate: 0, done: false, announced: false, check: () => true },
      { step: 'junk', at: 240, gate: 0, done: false, announced: false, check: () => true },
      { step: 'done', at: 300, gate: 0, done: false, announced: false, check: () => true },
    ];
  }

  private updateTutorial(): void {
    if (this.opts?.mode !== 'tutorial') return;
    let slow = false;
    for (const g of this.gates) {
      if (g.done) continue;
      if (!g.announced && this.dist >= g.at) {
        g.announced = true;
        this.tutorialStep = g.step;
        this.emit({ type: 'tutorial', step: g.step });
        if (g.step === 'done') {
          g.done = true;
          this.stats.finished = true;
          this.phase = 'finish';
          this.phaseT = 0;
          this.input.enabled = false;
          this.audio.playSfx('stage_clear', { volume: 0.8 });
          this.avatar?.setExpression('cheer', 3);
        }
      }
      if (g.announced && g.gate > 0 && !g.done) {
        if (g.check()) g.done = true;
        else if (this.dist >= g.gate) slow = true;
      } else if (g.announced && g.gate === 0) g.done = true;
    }
    this.timeScale = damp(this.timeScale, slow ? 0.06 : 1, slow ? 10 : 6, 1 / 60);
  }

  // ------------------------------------------------------------------ camera
  private placeCamera(snap: boolean, dt = 0.016): void {
    const aspect = this.w / this.h;
    const p = clamp((1.25 - aspect) / 0.8, 0, 1); // 0 = landscape, 1 = tall portrait
    const fovBase = lerp(58, 66, p);
    const back = lerp(6.2, 8.8, p);
    const height = lerp(3.4, 5.6, p);
    const lookAhead = lerp(7.5, 5.5, p);
    this.camGround = snap ? this.groundY : damp(this.camGround, Math.max(this.groundY, this.y * 0.45), 4.5, dt);
    const tx = this.x * 0.7;
    const behind = new THREE.Vector3(tx, height + this.camGround, -this.dist + back);
    const look = new THREE.Vector3(this.x * 0.85, 1.0 + this.camGround * 0.9, -this.dist - lookAhead);
    let pos = behind;
    // Special moments: swoop from the front during the countdown, swing round at the finish.
    let theta = 0;
    if (this.phase === 'countdown') theta = (1 - smooth(clamp(this.phaseT / COUNTDOWN, 0, 1))) * Math.PI * 0.82;
    else if (this.phase === 'finish') theta = smooth(clamp(this.phaseT / 1.6, 0, 1)) * Math.PI * 0.78;
    else if (this.phase === 'puffed') theta = smooth(clamp(this.phaseT / 1.4, 0, 1)) * Math.PI * 0.35;
    if (theta > 0.001) {
      const r = lerp(back, 4.6, theta / Math.PI);
      const cy = lerp(height, 1.9, theta / Math.PI) + this.camGround;
      pos = new THREE.Vector3(this.x + Math.sin(theta) * r, cy, -this.dist + Math.cos(theta) * r);
      look.lerp(new THREE.Vector3(this.x, 0.95 + this.y, -this.dist), clamp(theta * 1.5, 0, 1));
    }
    if (snap) {
      this.camPos.copy(pos);
      this.camLook.copy(look);
    } else {
      this.camPos.lerp(pos, 1 - Math.exp(-(theta > 0.001 ? 7 : 10) * dt));
      this.camLook.lerp(look, 1 - Math.exp(-10 * dt));
    }
    this.camera.position.copy(this.camPos);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.3;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.3;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    this.camera.lookAt(this.camLook);
    const boost = this.power.energy > 0 ? 7 : 0;
    const fov = fovBase + boost;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = snap ? fov : damp(this.camera.fov, fov, 4, dt);
      this.camera.updateProjectionMatrix();
    }
  }
}

function arrowTexture(up: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.translate(64, 64);
  if (!up) g.rotate(Math.PI);
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.strokeStyle = '#2fb5a8';
  g.lineWidth = 10;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(0, -46);
  g.lineTo(40, 2);
  g.lineTo(16, 2);
  g.lineTo(16, 44);
  g.lineTo(-16, 44);
  g.lineTo(-16, 2);
  g.lineTo(-40, 2);
  g.closePath();
  g.stroke();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export type { GameEngine };

export function createEngine(container: HTMLElement, audio: AudioLike): Engine & { probeSample: GameEngine['probeSample']; readonly isReadyForControl: boolean } {
  return new GameEngine(container, audio);
}
