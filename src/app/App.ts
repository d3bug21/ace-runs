// App flow / state machine: boot -> title -> character -> ride -> (tutorial) -> stages -> run
// -> results, plus the book, pause and settings overlays. Owns saves, settings, menu audio and
// narration; the engine owns in-run gameplay, in-run SFX/music and character reactions.
import { STAGES, type BenefitId, type CharacterId, type JunkEffectId, type RideId, type RunMode, type StageId, type StretchMove } from '../contracts';
import type { Engine, EngineEvent, MenuView, RunOptions, RunStats } from '../engine/api';
import { SaveData, type RunOutcome } from './Save';
import { detectDevice, isFullscreenNow, toggleFullscreen, type DeviceInfo } from './Device';
import { Viewport } from './Viewport';
import type { AudioPort, Bus, Speaker } from './types';
import type { AppApi, UiSound } from '../ui/ctx';
import { el, Screen, spatialMove, TapGuard } from '../ui/dom';
import { loadFoodArt } from '../ui/foodArt';
import { BootScreen, CharacterScreen, IntroScreen, RideScreen, StageScreen, TitleScreen } from '../ui/screens';
import { WarmupController, WarmupView } from '../ui/Stretch';
import { CooldownScreen } from '../ui/Cooldown';
import { Hud } from '../ui/Hud';
import { ResultsScreen } from '../ui/Results';
import { BookScreen } from '../ui/Book';
import { PauseModal, SettingsModal } from '../ui/Modals';
import { STAGE_ART, STAGE_NAME } from '../ui/icons';
import { sectionIcon } from '../ui/icons';

export type AppState = 'boot' | 'title' | 'character' | 'ride' | 'stage' | 'intro' | 'run' | 'cooldown' | 'results' | 'book';
export type DirectRunOptions = RunOptions & { skipCountdown?: boolean };

const WASD: Record<string, string> = { a: 'arrowleft', d: 'arrowright', w: 'arrowup', s: 'arrowdown' };
const SOUND_ID: Record<UiSound, string> = { click: 'ui_click', back: 'ui_back', select: 'ui_select', unlock: 'ui_unlock', page: 'ui_page', star: 'star' };

export interface AppOptions {
  save?: SaveData;
  device?: DeviceInfo;
}

export class App implements AppApi {
  readonly save: SaveData;
  readonly device: DeviceInfo;
  readonly viewport: Viewport;
  readonly guard: TapGuard;
  state: AppState = 'boot';

  private ui: HTMLElement;
  private screensLayer: HTMLElement;
  private modalLayer: HTMLElement;
  private curtain: HTMLElement;
  private boot: BootScreen;
  private title: TitleScreen;
  private character: CharacterScreen;
  private ride: RideScreen;
  private stages: StageScreen;
  private results: ResultsScreen;
  private book: BookScreen;
  private intro: IntroScreen;
  private cooldown: CooldownScreen;
  readonly warmup: WarmupController;
  private pending: { stage: StageId; mode: RunMode } | null = null;
  private pauseModal: PauseModal;
  private settings: SettingsModal;
  readonly hud: Hud;

  private current: Screen | null = null;
  private modals: Screen[] = [];
  private bookReturn: AppState = 'title';
  private music: string | null = null;
  private runOpts: DirectRunOptions | null = null;
  private runToken = 0;
  private hudRaf = 0;
  private pauseShown = false;
  private idleTimer = 0;
  private welcomed = false;
  private bootDone = false;
  // in-run narration throttles
  private runSeenFoods = new Set<string>();
  private benefitsHeard = new Set<string>();
  private junkHeard = new Set<string>();
  private lastBenefitAt = -1e9;
  private lastSometimesAt = -1e9;
  private lastGlowAt = -1e9;
  private lastNarrAt = -1e9;
  private lastResults: { stats: RunStats; out: RunOutcome } | null = null;

  constructor(private root: HTMLElement, readonly engine: Engine, readonly audio: AudioPort, opts: AppOptions = {}) {
    this.save = opts.save ?? new SaveData();
    this.device = opts.device ?? detectDevice();
    const cl = document.documentElement.classList;
    cl.toggle('touch', this.device.touchPrimary);
    cl.toggle('handheld', this.device.handheld);
    cl.toggle('desktop-app', this.device.desktopApp);
    this.viewport = new Viewport(root);
    this.guard = new TapGuard();

    this.ui = el('div', 'ui-root');
    this.ui.id = 'ui';
    this.screensLayer = el('div', 'screens');
    this.modalLayer = el('div', 'modals');
    this.curtain = el('div', 'curtain hidden', '<div class="curtain-inner"><span class="c-art"></span><span class="c-name"></span><span class="dots"><i></i><i></i><i></i></span></div>');
    this.hud = new Hud({ onPause: () => this.requestPause(), onSkipTutorial: () => this.skipTutorial(), touchGlyphs: () => this.touchGlyphs() });
    this.ui.append(this.hud.el, this.screensLayer, this.modalLayer, this.curtain);
    root.append(this.ui);

    this.warmup = new WarmupController({
      setMove: (m, o) => this.menuMove(m, o),
      voice: (sp, g, o) => this.voice(sp, g, o),
      sfx: (id) => this.audio.playSfx(id),
      kid: () => this.save.state.character,
      enabled: () => this.save.settings.stretches,
      reduced: () => document.documentElement.classList.contains('reduced'),
    });
    this.boot = new BootScreen(this, () => this.onBootPlay());
    this.title = new TitleScreen(this);
    this.character = new CharacterScreen(this);
    this.ride = new RideScreen(this);
    this.stages = new StageScreen(this);
    this.results = new ResultsScreen(this, {
      again: () => this.runAgain(),
      next: (s) => {
        this.save.state.stage = s;
        this.save.write();
        this.startStage(s, 'adventure');
      },
      stages: () => this.goStages(),
      book: () => this.openBook(),
    });
    this.book = new BookScreen(this);
    this.book.onClose = () => this.closeBook();
    this.intro = new IntroScreen(this, { go: () => this.goFromIntro(), back: () => this.goRide() });
    this.cooldown = new CooldownScreen({ setMove: (m, o) => this.menuMove(m, o), voice: (sp, g, o) => this.voice(sp, g, o), sfx: (id) => this.audio.playSfx(id) });
    this.pauseModal = new PauseModal(this, {
      resume: () => this.resumeRun(),
      restart: () => this.restartRun(),
      settings: () => this.openSettings(),
      exit: () => this.exitRun(),
    });
    this.settings = new SettingsModal(this, {
      onVolume: (bus, v, commit) => this.setVolume(bus, v, commit),
      onToggle: (k, v) => {
        this.save.settings[k] = v;
        this.save.write();
        this.applySettings();
      },
      toggleFullscreen: () => toggleFullscreen(this.device),
      isFullscreen: () => isFullscreenNow(),
      resetProgress: () => {
        this.save.resetProgress();
        this.stages.markUnlocked(null);
      },
      close: () => this.closeModal(this.settings),
    });
    for (const s of [this.boot, this.title, this.character, this.ride, this.stages, this.intro, this.cooldown, this.results, this.book]) this.screensLayer.append(s.el);
    for (const m of [this.pauseModal, this.settings]) this.modalLayer.append(m.el);

    this.applySettings();
    this.installInput();
    engine.on((e) => this.onEngine(e));
  }

  // ================================================================ AppApi
  newWarmView(): WarmupView {
    return new WarmupView(() => {
      this.sound('click');
      this.warmup.toggleGuided();
    });
  }

  warmGuided(): boolean {
    return this.warmup?.isGuided ?? false;
  }

  pendingRun(): { stage: StageId; mode: RunMode } | null {
    return this.pending;
  }

  private menuMove(m: StretchMove | null, o?: { glow?: boolean; side?: 1 | -1 }): void {
    try {
      this.engine.setMenuMove(m, o);
    } catch {
      /* engine without stretch support: kids just idle */
    }
  }

  touchGlyphs(): boolean {
    if (this.guard.lastPointerType) return this.guard.lastPointerType === 'touch' || this.guard.lastPointerType === 'pen';
    return this.device.touchPrimary;
  }

  sound(s: UiSound): void {
    this.audio.playSfx(SOUND_ID[s]);
  }

  voice(speaker: Speaker, group: string, opts?: { priority?: boolean; interrupt?: boolean; delay?: number }): number {
    try {
      return this.audio.playVoice(speaker, group, opts);
    } catch {
      return 0;
    }
  }

  goTitle(): void {
    this.menuScene('title');
    this.menuMusic();
    this.switchTo(this.title, 'title');
    if (!this.welcomed) {
      this.welcomed = true;
      this.whenUnlocked(() => {
        if (this.state !== 'title') return;
        this.voice('narrator', 'title', { interrupt: true });
        this.voice('narrator', 'welcome');
      });
    }
  }

  goCharacter(): void {
    this.pending = null;
    this.menuScene('character');
    this.menuMusic();
    this.switchTo(this.character, 'character');
    this.voice('narrator', 'pick_character', { interrupt: true });
    this.armIdle();
  }

  goRide(): void {
    this.menuScene('ride');
    this.menuMusic();
    this.switchTo(this.ride, 'ride');
    if (!this.pending) this.voice('narrator', 'pick_ride', { interrupt: true });
    this.armIdle();
  }

  afterRide(): void {
    if (this.pending) this.goIntro();
    else if (!this.save.state.tutorialDone) this.startTutorial();
    else this.goStages();
  }

  /** Brief place intro after the ride (re-)pick: stage backdrop, narrator intro, warm-up, Go. */
  private goIntro(): void {
    const p = this.pending;
    if (!p) return this.goStages();
    this.menuScene('stage', undefined, p.stage);
    this.menuMusic();
    this.intro.present(p.stage, p.mode, this.save.state.ride);
    this.switchTo(this.intro, 'intro');
    this.voice('narrator', p.mode === 'endless' ? 'endless' : `stage_${p.stage}`, { interrupt: true });
  }

  private goFromIntro(): void {
    const p = this.pending;
    if (!p || !this.save.isUnlocked(p.stage)) return this.goStages();
    this.pending = null;
    void this.beginRun({ character: this.save.state.character, ride: this.save.state.ride, stage: p.stage, mode: p.mode }, 'none');
  }

  goStages(): void {
    this.pending = null;
    this.leaveRunState();
    this.menuScene('stage');
    this.menuMusic();
    this.switchTo(this.stages, 'stage');
    this.voice('narrator', 'pick_stage', { interrupt: true });
  }

  openBook(): void {
    if (this.state !== 'book') this.bookReturn = this.state;
    this.menuScene('book');
    if (this.state !== 'results') this.menuMusic();
    this.switchTo(this.book, 'book');
  }

  private closeBook(): void {
    const r = this.bookReturn;
    if (r === 'results' && this.lastResults) {
      this.menuScene('results', this.lastResults.stats.finished);
      this.switchTo(this.results, 'results');
    } else if (r === 'stage') this.goStages();
    else this.goTitle();
  }

  openSettings(): void {
    this.openModal(this.settings);
  }

  selectCharacter(c: CharacterId, announce: boolean): void {
    if (this.save.state.character === c && !announce) return;
    this.save.state.character = c;
    this.save.write();
    this.menuScene('character');
    if (announce) {
      this.sound('select');
      this.voice(c, 'hello', { priority: true, interrupt: true });
      this.voice('narrator', `char_${c}`, { interrupt: true, delay: 0.15 });
    }
    this.armIdle();
  }

  selectRide(r: RideId, announce: boolean): void {
    this.save.state.ride = r;
    this.save.write();
    this.menuScene('ride');
    if (announce) {
      this.sound('select');
      this.voice(this.save.state.character, `ride_${r}`, { priority: true, interrupt: true });
      this.voice('narrator', `ride_${r}`, { interrupt: true, delay: 0.1 });
    }
    this.armIdle();
  }

  previewStage(s: StageId): void {
    this.engine.showMenu({ view: 'stage', character: this.save.state.character, ride: this.save.state.ride, stage: s });
  }

  startTutorial(): void {
    void this.beginRun({ character: this.save.state.character, ride: this.save.state.ride, stage: 'indoor', mode: 'tutorial' }, 'none');
  }

  /** Picking a place (stage select / "Next place") goes through the ride re-pick, then the intro. */
  startStage(stage: StageId, mode: RunMode): void {
    if (!this.save.isUnlocked(stage)) return;
    this.save.state.stage = stage;
    this.save.write();
    this.pending = { stage, mode };
    this.goRide();
  }

  quitApp(): void {
    void this.device.bridge?.quit();
  }

  // ================================================================ boot
  /** Show the boot/loading screen and warm caches in the background (never blocks forever). */
  start(): void {
    this.menuScene('title');
    this.switchTo(this.boot, 'boot');
    const withTimeout = (p: Promise<unknown>, ms: number) =>
      Promise.race([p.catch(() => undefined), new Promise((r) => setTimeout(r, ms))]);
    const tasks: [string, Promise<unknown>][] = [
      ['Warming up…', withTimeout((document as Document & { fonts?: FontFaceSet }).fonts?.ready ?? Promise.resolve(), 2500)],
      ['Washing the veggies…', withTimeout(loadFoodArt(160, 7000), 7500).then(() => this.boot.refreshArt())],
      [
        'Tuning the ukulele…',
        withTimeout(
          this.audio.preload(['mus_title', 'sfx:ui_*', 'star', 'narrator:title', 'narrator:welcome', 'narrator:pick_*', 'narrator:char_*', 'narrator:ride_*', 'ace:hello', 'ciela:hello']),
          6000,
        ),
      ],
    ];
    let done = 0;
    this.boot.setProgress(0.06, tasks[0][0]);
    for (const [, p] of tasks) {
      void p.then(() => {
        done++;
        const nextLabel = tasks[Math.min(done, tasks.length - 1)][0];
        this.boot.setProgress(0.1 + (done / tasks.length) * 0.9, done < tasks.length ? nextLabel : '');
      });
    }
    void Promise.all(tasks.map((t) => t[1])).then(() => {
      this.bootDone = true;
      this.boot.ready(this.current === this.boot);
      if (this.current === this.boot) this.guard.arm(250);
    });
  }

  /** Run `fn` once the audio context is really running (unlock() resumes asynchronously). */
  private whenUnlocked(fn: () => void, timeoutMs = 2500): void {
    const t0 = performance.now();
    const tick = () => {
      if (this.audio.unlocked) fn();
      else if (performance.now() - t0 < timeoutMs) window.setTimeout(tick, 60);
    };
    tick();
  }

  private onBootPlay(): void {
    this.audio.unlock();
    this.sound('select');
    this.goTitle();
  }

  // ================================================================ runs
  /** Probe/dev entry: straight into a run with the HUD, no menus, no gesture needed. */
  async startRunDirect(opts: DirectRunOptions): Promise<void> {
    this.closeAllModals();
    this.current?.hide();
    this.current = null;
    this.curtain.classList.add('hidden');
    this.guard.disarm();
    const token = ++this.runToken;
    this.enterRunState(opts);
    await this.engine.startRun(opts as RunOptions);
    if (token !== this.runToken) return;
    this.engine.setInputEnabled(true);
  }

  private async beginRun(opts: DirectRunOptions, intro: 'stage' | 'endless' | 'countdown' | 'none'): Promise<void> {
    const token = ++this.runToken;
    clearTimeout(this.idleTimer);
    this.engine.setInputEnabled(false);
    this.closeAllModals();
    // curtain in
    const art = this.curtain.querySelector('.c-art')!;
    art.innerHTML = STAGE_ART[opts.stage];
    this.curtain.querySelector('.c-name')!.textContent = opts.mode === 'tutorial' ? 'How to play' : STAGE_NAME[opts.stage];
    this.curtain.classList.remove('hidden', 'out');
    void this.curtain.offsetWidth;
    this.curtain.classList.add('in');
    await wait(document.documentElement.classList.contains('reduced') ? 60 : 340);
    if (token !== this.runToken) return;
    this.current?.hide();
    this.current = null;
    this.enterRunState(opts);
    try {
      await this.engine.startRun(opts as RunOptions);
    } catch (e) {
      console.error('[app] startRun failed', e);
    }
    if (token !== this.runToken) return;
    this.curtain.classList.remove('in');
    this.curtain.classList.add('out');
    window.setTimeout(() => this.curtain.classList.add('hidden'), 420);
    this.engine.setInputEnabled(true);
    if (intro === 'stage') this.voice('narrator', `stage_${opts.stage}`, { interrupt: true });
    else if (intro === 'endless') this.voice('narrator', 'endless', { interrupt: true });
    else if (intro === 'countdown') this.voice('narrator', 'countdown', { interrupt: true });
    if (opts.mode !== 'tutorial' && this.save.settings.hints && this.save.state.totals.runs < 3) window.setTimeout(() => token === this.runToken && this.state === 'run' && this.hud.showRunHint(), 3600);
  }

  private enterRunState(opts: DirectRunOptions): void {
    this.runOpts = { ...opts };
    this.state = 'run';
    this.music = null; // the engine owns music during a run
    this.warmup.leave();
    this.warmup.reset();
    this.pending = null;
    this.pauseShown = false;
    this.lastResults = null;
    this.resetRunNarration();
    this.hud.show(opts.mode);
    this.hud.setPauseEnabled(true);
    this.startHudLoop();
  }

  private leaveRunState(): void {
    cancelAnimationFrame(this.hudRaf);
    this.hudRaf = 0;
    this.hud.hide();
    this.pauseShown = false;
  }

  private resetRunNarration(): void {
    this.runSeenFoods.clear();
    this.benefitsHeard.clear();
    this.junkHeard.clear();
    this.lastBenefitAt = this.lastSometimesAt = this.lastGlowAt = this.lastNarrAt = -1e9;
  }

  private startHudLoop(): void {
    cancelAnimationFrame(this.hudRaf);
    const tick = () => {
      if (this.state !== 'run') return;
      try {
        this.hud.update(this.engine.hud());
      } catch (e) {
        console.warn('[app] hud update failed', e);
      }
      this.hudRaf = requestAnimationFrame(tick);
    };
    this.hudRaf = requestAnimationFrame(tick);
  }

  private runAgain(): void {
    const o = this.runOpts;
    if (!o) return this.goStages();
    void this.beginRun({ character: this.save.state.character, ride: this.save.state.ride, stage: o.stage, mode: o.mode }, 'countdown');
  }

  requestPause(): void {
    if (this.state !== 'run' || this.pauseShown) return;
    if (!this.engine.paused) this.engine.pause();
    this.showPause();
  }

  private showPause(): void {
    if (this.pauseShown) return;
    this.pauseShown = true;
    this.engine.setInputEnabled(false);
    this.hud.setPauseEnabled(false);
    this.hud.el.classList.add('dimmed');
    this.openModal(this.pauseModal);
    this.voice('narrator', 'paused', { interrupt: true });
  }

  private hidePause(): void {
    this.pauseShown = false;
    this.closeAllModals();
    this.hud.el.classList.remove('dimmed');
    this.hud.setPauseEnabled(true);
  }

  resumeRun(): void {
    if (this.state !== 'run') return;
    this.hidePause();
    // The engine queues P/Esc presses made while paused (it drains them after resuming), so an Esc
    // that closed this menu would immediately re-pause. Clearing input first drops that queue.
    this.engine.setInputEnabled(false);
    if (this.engine.paused) this.engine.resume();
    this.engine.setInputEnabled(true);
  }

  private restartRun(): void {
    if (this.state !== 'run') return;
    this.hidePause();
    this.resetRunNarration();
    this.hud.reset();
    this.engine.setInputEnabled(false);
    this.engine.restartRun();
    this.engine.setInputEnabled(true);
  }

  private exitRun(): void {
    this.runToken++;
    this.hidePause();
    this.engine.quitRun();
    this.engine.setInputEnabled(false);
    this.goStages();
  }

  private skipTutorial(): void {
    if (this.state !== 'run' || this.runOpts?.mode !== 'tutorial') return;
    this.sound('click');
    this.runToken++;
    this.engine.quitRun();
    this.engine.setInputEnabled(false);
    this.save.state.tutorialDone = true;
    this.save.write();
    this.goStages();
  }

  // ================================================================ engine events
  private onEngine(e: EngineEvent): void {
    if (e.type === 'loading') {
      this.curtain.style.setProperty('--load', String(Math.max(0, Math.min(1, e.progress))));
      return;
    }
    if (this.state !== 'run') return;
    const t = performance.now() / 1000;
    switch (e.type) {
      case 'countdown':
        this.hud.countdown(e.n);
        break;
      case 'food': {
        const f = e.food;
        const isNew = !this.save.discovered(f.id) && !this.runSeenFoods.has(f.id);
        this.runSeenFoods.add(f.id);
        this.hud.foodToast(f, isNew);
        if (f.kind === 'healthy' && f.benefit) this.benefitCallout(f.benefit, t);
        else if (f.kind === 'junk' && f.junk) this.junkCallout(f.junk, t);
        break;
      }
      case 'glow':
        if (e.full && t - this.lastGlowAt > 20) {
          this.lastGlowAt = t;
          this.lastNarrAt = t;
          this.voice('narrator', 'glow_full');
          this.hud.messageBanner(`<span class="b-label">Healthy &amp; happy!</span>`, 'gold', 1800);
        }
        break;
      case 'section': {
        const s = e.section;
        const ic = sectionIcon(s.id, s.season);
        if (!ic) break;
        this.hud.sectionBanner(s);
        if (s.season) this.voice('narrator', `season_${s.season}`, { interrupt: true });
        else this.voice('narrator', `sport_${s.id}`, { interrupt: true });
        this.lastNarrAt = t;
        break;
      }
      case 'tutorial':
        this.hud.tutorial(e.step);
        this.voice('narrator', `tut_${e.step}`, { interrupt: true });
        break;
      case 'nearMiss':
        this.hud.nearMiss();
        break;
      case 'pause':
        if (e.paused) this.showPause();
        else if (this.pauseShown) {
          this.hidePause();
          this.engine.setInputEnabled(true);
        }
        break;
      case 'end':
        this.onRunEnd(e.stats);
        break;
      default:
        break;
    }
  }

  private benefitCallout(b: BenefitId, t: number): void {
    const first = !this.benefitsHeard.has(b);
    if (!first && t - this.lastBenefitAt < 15) return;
    if (t - this.lastNarrAt < 3.5) return;
    this.benefitsHeard.add(b);
    this.lastBenefitAt = this.lastNarrAt = t;
    this.voice('narrator', `benefit_${b}`);
  }

  private junkCallout(j: JunkEffectId, t: number): void {
    if (t - this.lastNarrAt < 3.5) return;
    if (!this.junkHeard.has(j)) {
      this.junkHeard.add(j);
      this.lastNarrAt = t;
      this.voice('narrator', `junk_${j}`);
      return;
    }
    if (t - this.lastSometimesAt > 20) {
      this.lastSometimesAt = this.lastNarrAt = t;
      this.voice('narrator', 'sometimes');
    }
  }

  private onRunEnd(stats: RunStats): void {
    const token = this.runToken;
    this.engine.setInputEnabled(false);
    this.hud.setPauseEnabled(false);
    this.closeAllModals();
    const out = this.save.recordRun(stats);
    if (stats.mode === 'tutorial') {
      this.save.state.tutorialDone = true;
      this.save.write();
      this.hud.messageBanner(`<span class="b-label">You're ready!</span>`, 'gold', 1400);
      window.setTimeout(() => token === this.runToken && this.goStages(), 1700);
      return;
    }
    if (stats.finished) this.voice('narrator', 'finish', { interrupt: true });
    const cool = this.wantsCooldown(stats);
    window.setTimeout(() => token === this.runToken && (cool ? this.showCooldown(stats, out) : this.showResults(stats, out)), stats.finished ? 1400 : 1000);
  }

  /** Cool down after a real effort: a finished adventure, or an endless run of a minute or more. */
  private wantsCooldown(stats: RunStats): boolean {
    if (!this.save.settings.stretches) return false;
    if (stats.mode === 'adventure') return !!stats.finished;
    return stats.mode === 'endless' && (stats.timeSec ?? 0) >= 60;
  }

  private showCooldown(stats: RunStats, out: RunOutcome, startAt = 0): void {
    this.leaveRunState();
    this.lastResults = { stats, out };
    this.menuScene('cooldown', false, stats.stage);
    this.menuMusic();
    this.switchTo(this.cooldown, 'cooldown');
    const token = this.runToken;
    this.cooldown.start(stats.character, () => token === this.runToken && this.state === 'cooldown' && this.showResults(stats, out), startAt);
  }

  /** Dev / test hook: the cool-down for canned stats (startAt = hold index). */
  debugCooldown(stats: RunStats, startAt = 0): void {
    this.runOpts = { character: stats.character, ride: stats.ride, stage: stats.stage, mode: stats.mode };
    const out = this.save.recordRun(stats);
    this.showCooldown(stats, out, startAt);
  }

  private showResults(stats: RunStats, out: RunOutcome): void {
    this.leaveRunState();
    this.lastResults = { stats, out };
    this.stages.markUnlocked(out.unlockedStage);
    const celebrate = (stats.finished && stats.mode === 'adventure') || (stats.mode === 'endless' && stats.healthyTotal >= 10);
    this.menuScene('results', celebrate, stats.stage);
    this.playMusic('mus_results');
    this.results.present(stats, out);
    this.switchTo(this.results, 'results');
  }

  /** Dev / test hook: present results for canned stats without a run. */
  debugResults(stats: RunStats): void {
    this.runOpts = { character: stats.character, ride: stats.ride, stage: stats.stage, mode: stats.mode };
    const out = this.save.recordRun(stats);
    this.showResults(stats, out);
  }

  /** Dev / test hook: jump to a screen. */
  debugScreen(name: string): void {
    this.closeAllModals();
    switch (name) {
      case 'boot':
        this.leaveRunState();
        this.switchTo(this.boot, 'boot');
        if (this.bootDone) this.boot.ready(true);
        break;
      case 'title':
        this.leaveRunState();
        this.goTitle();
        break;
      case 'character':
        this.leaveRunState();
        this.goCharacter();
        break;
      case 'ride':
        this.leaveRunState();
        this.goRide();
        break;
      case 'stage':
        this.goStages();
        break;
      case 'book':
        this.leaveRunState();
        this.openBook();
        break;
      case 'settings':
        this.openSettings();
        break;
      case 'repick':
        this.leaveRunState();
        this.goStages();
        this.startStage(this.save.state.stage, 'adventure');
        break;
      case 'intro':
        this.leaveRunState();
        this.goStages();
        this.startStage(this.save.state.stage, 'adventure');
        this.afterRide();
        break;
      case 'pause':
        this.requestPause();
        break;
    }
  }

  // ================================================================ screens, modals, input
  private switchTo(s: Screen, state: AppState): void {
    if (state !== 'character' && state !== 'ride') clearTimeout(this.idleTimer);
    if (this.current !== s) {
      this.current?.hide();
      this.current = s;
    }
    if (state !== 'run') this.leaveRunStateIfNeeded(state);
    this.state = state;
    s.show();
    const warmView = s === this.character ? this.character.warm : s === this.ride ? this.ride.warm : s === this.intro ? this.intro.warm : null;
    if (warmView) this.warmup.enter(warmView);
    else this.warmup.leave();
    this.guard.arm(350);
  }

  private leaveRunStateIfNeeded(next: AppState): void {
    if (this.state === 'run' && next !== 'run') this.leaveRunState();
  }

  private openModal(m: Screen): void {
    if (!this.modals.includes(m)) this.modals.push(m);
    this.modalLayer.classList.add('on');
    for (const x of this.modals) x.el.classList.toggle('under', x !== m);
    this.current?.el.setAttribute('inert', '');
    m.show();
    this.guard.arm(300);
  }

  private closeModal(m: Screen): void {
    this.modals = this.modals.filter((x) => x !== m);
    m.hide();
    const top = this.modals[this.modals.length - 1];
    if (top) {
      top.el.classList.remove('under');
      top.el.removeAttribute('inert');
      top.el.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
    } else {
      this.modalLayer.classList.remove('on');
      if (this.current?.shown) this.current.el.removeAttribute('inert');
    }
  }

  private closeAllModals(): void {
    for (const m of [...this.modals]) m.hide();
    this.modals = [];
    this.modalLayer.classList.remove('on');
    if (this.current?.shown) this.current.el.removeAttribute('inert');
  }

  private navRoot(): HTMLElement | null {
    const top = this.modals[this.modals.length - 1];
    if (top) return top.el;
    if (this.current === this.book) return this.book.navRoot();
    if (this.state === 'run') return null;
    return this.current?.el ?? null;
  }

  private installInput(): void {
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('touchend', unlock, true);
    window.addEventListener('keydown', unlock, true);
    const cl = document.documentElement.classList;
    window.addEventListener('pointerdown', () => cl.remove('kbd'), true);
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('pointerdown', () => this.armIdle(), true);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.state === 'run') this.requestPause();
        this.audio.suspend();
      } else this.audio.resume();
    });
    // Trackpad/mouse wheel scrolls horizontal stage list naturally.
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKey(e: KeyboardEvent): void {
    let k = e.key.toLowerCase();
    const inRunNoMenu = this.state === 'run' && this.modals.length === 0;
    // During a run the engine owns gameplay keys + P/Esc (it listens on window). Never swallow them.
    if (inRunNoMenu) return;
    // Menus: A/D/W/S work like the arrows (the same keys as the game).
    const textInput = document.activeElement instanceof HTMLInputElement && document.activeElement.type !== 'range';
    if (!textInput && !e.ctrlKey && !e.metaKey && !e.altKey && k in WASD) k = WASD[k];
    if (k === 'tab' || k.startsWith('arrow')) document.documentElement.classList.add('kbd');
    if (k === 'escape' || (k === 'p' && this.pauseShown && this.modals[this.modals.length - 1] === this.pauseModal)) {
      if (e.repeat) return;
      const top = this.modals[this.modals.length - 1];
      if (top) top.back();
      else this.current?.back();
      e.preventDefault();
      return;
    }
    if (k.startsWith('arrow')) {
      const root = this.navRoot();
      if (!root) return;
      const a = document.activeElement as HTMLElement | null;
      if (a instanceof HTMLInputElement && a.type === 'range' && (k === 'arrowleft' || k === 'arrowright')) return;
      if (spatialMove(root, k.slice(5) as 'left' | 'right' | 'up' | 'down')) e.preventDefault();
      return;
    }
    if (this.state === 'boot' && (k === 'enter' || k === ' ') && this.bootDone && !(document.activeElement instanceof HTMLButtonElement)) {
      this.onBootPlay();
      e.preventDefault();
    }
  }

  private armIdle(): void {
    clearTimeout(this.idleTimer);
    if (this.state !== 'character' && this.state !== 'ride') return;
    this.idleTimer = window.setTimeout(() => {
      if (this.state === 'character' || this.state === 'ride') {
        this.voice(this.save.state.character, 'idle');
        this.armIdle();
      }
    }, 16000);
  }

  // ================================================================ audio + settings
  private menuMusic(): void {
    this.playMusic('mus_title');
  }

  private playMusic(id: string | null): void {
    // AudioManager queues beds requested before the first gesture and starts them on unlock.
    if (this.music === id) return;
    this.music = id;
    this.audio.playMusic(id, 1.2);
  }

  private setVolume(bus: Bus, v: number, commit: boolean): void {
    this.audio.setVolume(bus, v);
    this.save.settings[bus] = v;
    if (commit) {
      this.save.write();
      if (bus === 'sfx') this.sound('click');
      if (bus === 'voice') this.voice(this.save.state.character, 'yum', { priority: true, interrupt: true });
    }
  }

  private applySettings(): void {
    const s = this.save.settings;
    this.audio.setVolume('music', s.music);
    this.audio.setVolume('voice', s.voice);
    this.audio.setVolume('sfx', s.sfx);
    const prefersReduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const reduced = s.reducedMotion || prefersReduced;
    document.documentElement.classList.toggle('reduced', reduced);
    document.documentElement.classList.toggle('no-hints', !s.hints);
    this.warmup?.refresh();
    try {
      this.engine.setSettings({ reducedMotion: reduced, quality: 'auto' });
    } catch {
      /* engine not ready */
    }
  }

  private menuScene(view: MenuView, celebrate?: boolean, stage?: StageId): void {
    // Menus lose the run-time track; engine audio was the run's.
    if (view !== 'results' && this.music === 'mus_results') this.music = null;
    try {
      this.engine.showMenu({
        view,
        character: this.save.state.character,
        ride: this.save.state.ride,
        stage: stage ?? (view === 'stage' || view === 'results' ? this.save.state.stage : undefined),
        celebrate,
      });
    } catch (e) {
      console.warn('[app] showMenu failed', e);
    }
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const ALL_STAGES = STAGES;
