// Warm-up (v1.0.1): a calm looping dynamic warm-up on the character / ride pickers and the place
// intro, a "warming up" sun meter that fills into a "Ready to go!" lightning badge, and a small
// "Stretch with me!" button that runs a ~25 s guided count-along. Never blocks choosing: every
// warm-up element is pointer-events: none except its one button.
import type { CharacterId, CooldownMove, StretchMove, WarmupMove } from '../contracts';
import type { Speaker } from '../app/types';
import { button, el } from './dom';
import { glyph } from './icons';

export type BodyPart = 'head' | 'arms' | 'body' | 'legs';

export const MOVE_PART: Record<StretchMove, BodyPart> = {
  look: 'head', nod: 'head',
  arm_circles: 'arms', arm_swings: 'arms', reach_sky: 'arms', shoulder_stretch: 'arms',
  torso_twist: 'body', side_bend: 'body', side_reach: 'body', breathe: 'body',
  high_knees: 'legs', leg_swings: 'legs', hops: 'legs', ankle_circles: 'legs',
  quad_stretch: 'legs', calf_stretch: 'legs', toe_touch: 'legs', butterfly: 'legs',
};

export const MOVE_NAME: Record<StretchMove, string> = {
  look: 'Look left and right', nod: 'Nod up and down', arm_circles: 'Arm circles', arm_swings: 'Big arm swings',
  torso_twist: 'Twist', side_bend: 'Side bends', high_knees: 'High knees', leg_swings: 'Leg swings', hops: 'Bunny hops',
  ankle_circles: 'Ankle circles', reach_sky: 'Reach for the sky', side_reach: 'Side reach', shoulder_stretch: 'Shoulder hug',
  quad_stretch: 'Hold your foot', calf_stretch: 'Calf stretch', toe_touch: 'Reach for your toes', butterfly: 'Butterfly', breathe: 'Breathe',
};

/** Little stick-figure picture with the working body part lit up (picture-first for under-fives). */
export function partFigure(part: BodyPart, cls = 'part-fig'): string {
  const on = '#ff9a3c';
  const off = '#c9c1b3';
  const c = (p: BodyPart) => (p === part ? on : off);
  const w = (p: BodyPart) => (p === part ? 5.4 : 4.2);
  return `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">
    ${part !== 'head' ? '' : '<circle cx="32" cy="13" r="12" fill="#ffd9a8" opacity=".7"/>'}
    <circle cx="32" cy="13" r="7.5" fill="${part === 'head' ? on : '#e9e1d3'}" stroke="${c('head')}" stroke-width="2"/>
    <path d="M32 21v17" stroke="${c('body')}" stroke-width="${w('body')}" stroke-linecap="round"/>
    <path d="M32 25l-12-6M32 25l12-6" stroke="${c('arms')}" stroke-width="${w('arms')}" stroke-linecap="round"/>
    <path d="M32 38l-8 16M32 38l8 16" stroke="${c('legs')}" stroke-width="${w('legs')}" stroke-linecap="round"/>
    ${part === 'body' ? '<path d="M22 31c-3 3-3 7 0 10M42 31c3 3 3 7 0 10" stroke="#ffc94a" stroke-width="2.6" fill="none" stroke-linecap="round"/>' : ''}
    ${part === 'arms' ? '<path d="M14 14a8 8 0 0 1 6-6M50 14a8 8 0 0 0-6-6" stroke="#ffc94a" stroke-width="2.6" fill="none" stroke-linecap="round"/>' : ''}
    ${part === 'legs' ? '<path d="M18 58h8M38 58h8" stroke="#ffc94a" stroke-width="2.6" stroke-linecap="round"/>' : ''}
  </svg>`;
}

const SUN_C = 2 * Math.PI * 19;
const sunSVG = `<svg class="sun" viewBox="0 0 48 48" aria-hidden="true">
  <circle class="sun-track" cx="24" cy="24" r="19"/>
  <circle class="sun-fill" cx="24" cy="24" r="19" stroke-dasharray="${SUN_C.toFixed(2)}" stroke-dashoffset="${SUN_C.toFixed(2)}"/>
  <circle class="sun-core" cx="24" cy="24" r="12.5"/>
  <path class="sun-face" d="M19.4 23.2c1-1.3 2.6-1.3 3.6 0M25 23.2c1-1.3 2.6-1.3 3.6 0M19.6 27.4c2.4 2.8 6.4 2.8 8.8 0" fill="none" stroke-width="1.9" stroke-linecap="round"/>
</svg>`;
const BOLT = `<svg class="bolt" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="#ffc94a"/><path d="M27 7L14 27h9l-3 14 14-21h-9z" fill="#fff" stroke="#e09f27" stroke-width="1.6" stroke-linejoin="round"/><path d="M40 6l1.2 3 3 1.2-3 1.2L40 14.4l-1.2-3-3-1.2 3-1.2zM7 34l.9 2.2 2.2.9-2.2.9L7 40.2l-.9-2.2-2.2-.9 2.2-.9z" fill="#fff4b8"/></svg>`;
const STRETCH_ICON = `<svg class="g" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.6" r="2.2" fill="currentColor"/><path d="M4 7.5l8 2.5 8-2.5M12 10v5M12 15l-4 6M12 15l4 6"/></svg>`;

/** Per-screen DOM for the warm-up (each warm-up screen owns one; the controller drives the active one). */
export class WarmupView {
  readonly el: HTMLElement;
  private widget: HTMLElement;
  private sun: HTMLElement;
  private fill: SVGCircleElement;
  private badge: HTMLElement;
  readonly btn: HTMLButtonElement;
  private panel: HTMLElement;

  constructor(onButton: () => void) {
    this.el = el('div', 'warm');
    this.widget = el('div', 'warm-widget');
    this.sun = el('span', 'warm-sun', sunSVG);
    this.sun.setAttribute('role', 'img');
    this.sun.setAttribute('aria-label', 'Warming up');
    this.fill = this.sun.querySelector('.sun-fill') as SVGCircleElement;
    this.badge = el('span', 'ready-badge hidden', `${BOLT}<b>Ready!</b>`);
    this.btn = button({ cls: 'chip-btn stretch-btn', html: `${STRETCH_ICON}<span>Stretch with me!</span>`, label: 'Stretch with me', onClick: () => onButton() });
    this.widget.append(this.sun, this.badge, this.btn);
    this.panel = el('div', 'count-panel hidden');
    this.panel.setAttribute('aria-live', 'polite');
    this.el.append(this.widget, this.panel);
  }

  setEnabled(on: boolean): void {
    this.el.classList.toggle('hidden', !on);
  }

  setWarm(v: number, ready: boolean, justReady = false): void {
    const f = Math.max(0, Math.min(1, v));
    this.fill.style.strokeDashoffset = `${(SUN_C * (1 - f)).toFixed(2)}`;
    this.sun.style.setProperty('--warm', f.toFixed(3));
    this.sun.classList.toggle('hidden', ready);
    this.badge.classList.toggle('hidden', !ready);
    if (justReady) {
      this.badge.classList.remove('pop');
      void this.badge.offsetWidth;
      this.badge.classList.add('pop');
    }
  }

  setGuided(on: boolean): void {
    this.btn.innerHTML = on ? `${glyph.close}<span>Stop</span>` : `${STRETCH_ICON}<span>Stretch with me!</span>`;
    this.btn.setAttribute('aria-label', on ? 'Stop stretching' : 'Stretch with me');
    this.btn.title = on ? 'Stop stretching' : 'Stretch with me';
    this.btn.classList.toggle('on', on);
    this.panel.classList.toggle('hidden', !on);
    this.el.classList.toggle('guided', on);
  }

  /** Count-along panel: move picture + name, the big count, count dots and routine progress. */
  setStep(move: StretchMove, step: number, steps: number, count: number, counts: number): void {
    const dots = Array.from({ length: counts }, (_, i) => `<i class="${i < count ? 'on' : ''}"></i>`).join('');
    const prog = Array.from({ length: steps }, (_, i) => `<i class="${i < step ? 'done' : i === step ? 'now' : ''}"></i>`).join('');
    this.panel.innerHTML = `
      <span class="cp-fig">${partFigure(MOVE_PART[move])}</span>
      <span class="cp-main"><span class="cp-name">${MOVE_NAME[move]}</span><span class="cp-dots">${dots}</span></span>
      <span class="cp-count${count > 0 ? ' tick' : ''}" data-n="${count}">${count > 0 ? count : '•'}</span>
      <span class="cp-prog">${prog}</span>`;
  }

  /** "Ready!" end card of the routine. */
  setDone(steps: number): void {
    this.panel.innerHTML = `<span class="cp-fig">${BOLT}</span><span class="cp-main"><span class="cp-name">Warm and ready!</span></span><span class="cp-prog">${'<i class="done"></i>'.repeat(steps)}</span>`;
  }
}

export interface WarmupDeps {
  setMove(move: StretchMove | null, opts?: { glow?: boolean; side?: 1 | -1 }): void;
  voice(speaker: Speaker, group: string, opts?: { priority?: boolean; interrupt?: boolean; delay?: number }): number;
  sfx(id: string): void;
  kid(): CharacterId;
  /** Settings toggle "Warm-up & cool-down stretches". */
  enabled(): boolean;
  reduced(): boolean;
}

/** Calm idle loop: head, arms, body, legs, round and round. */
const IDLE_SEQ: WarmupMove[] = ['look', 'arm_circles', 'torso_twist', 'high_knees', 'nod', 'arm_swings', 'side_bend', 'leg_swings', 'ankle_circles', 'hops'];
const IDLE_MOVE_S = 6.5;
const IDLE_FILL_S = 20; // idle warming fills the sun in ~20 s
/** Guided follow-along: one move per body part + a hop finale (5 moves x 4 counts, ~26 s). */
const ROUTINE: WarmupMove[] = ['look', 'arm_circles', 'torso_twist', 'high_knees', 'hops'];
const COUNTS = 4;
const COUNT_S = 1.15;
const MOVE_INTRO_S = 1.3;

export class WarmupController {
  private view: WarmupView | null = null;
  private warm = 0;
  private ready = false;
  private announcedReady = false;
  private idleIdx = 0;
  private idleSide: 1 | -1 = 1;
  private idleTimer = 0;
  private tickTimer = 0;
  private lastTick = 0;
  private guided = false;
  private guidedToken = 0;
  private timers: number[] = [];
  private active = false;

  constructor(private d: WarmupDeps) {}

  get isGuided(): boolean {
    return this.guided;
  }
  get isReady(): boolean {
    return this.ready;
  }
  get warmth(): number {
    return this.warm;
  }

  /** A warm-up screen became visible: drive its view, keep any guided routine going. */
  enter(view: WarmupView): void {
    this.view = view;
    this.active = true;
    const on = this.d.enabled();
    view.setEnabled(on);
    view.setGuided(this.guided);
    view.setWarm(this.warm, this.ready);
    if (!on) {
      this.stopAll();
      return;
    }
    if (!this.guided) this.startIdle();
    this.startTick();
  }

  /** Left the warm-up screens (stage select, run, results...): back to the plain idle. */
  leave(): void {
    if (!this.active) return;
    this.active = false;
    this.stopAll();
    this.view = null;
  }

  /** New run: muscles cool off again. */
  reset(): void {
    this.warm = 0;
    this.ready = false;
    this.announcedReady = false;
  }

  /** Settings changed (stretches toggle / reduced motion). */
  refresh(): void {
    if (this.view && this.active) this.enter(this.view);
  }

  toggleGuided(): void {
    if (this.guided) this.stopGuided(true);
    else this.startGuided();
  }

  private stopAll(): void {
    this.stopGuided(false);
    clearTimeout(this.idleTimer);
    clearInterval(this.tickTimer);
    this.tickTimer = 0;
    this.d.setMove(null);
  }

  private startTick(): void {
    clearInterval(this.tickTimer);
    this.lastTick = performance.now();
    this.tickTimer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(1, (now - this.lastTick) / 1000);
      this.lastTick = now;
      // Idle warming only counts while the kid is actually moving (not in reduced motion).
      if (!this.guided && !this.d.reduced()) this.addWarm(dt / IDLE_FILL_S);
    }, 250);
  }

  private addWarm(v: number): void {
    if (this.ready) return;
    this.warm = Math.min(1, this.warm + v);
    const just = this.warm >= 1;
    if (just) this.ready = true;
    this.view?.setWarm(this.warm, this.ready, just);
    if (just && !this.announcedReady) {
      this.announcedReady = true;
      this.d.sfx('ready_sparkle');
      if (!this.guided) this.d.voice(this.d.kid(), 'ready', { delay: 0.2 });
    }
  }

  private startIdle(): void {
    clearTimeout(this.idleTimer);
    if (this.d.reduced()) {
      this.d.setMove(null);
      return;
    }
    const step = () => {
      const m = IDLE_SEQ[this.idleIdx % IDLE_SEQ.length];
      this.idleIdx++;
      this.idleSide = this.idleSide === 1 ? -1 : 1;
      this.d.setMove(m, { glow: true, side: this.idleSide });
      this.idleTimer = window.setTimeout(step, IDLE_MOVE_S * 1000);
    };
    step();
  }

  private later(token: number, s: number, fn: () => void): void {
    this.timers.push(
      window.setTimeout(() => {
        if (token === this.guidedToken && this.guided) fn();
      }, s * 1000),
    );
  }

  startGuided(): void {
    if (!this.d.enabled()) return;
    clearTimeout(this.idleTimer);
    this.guided = true;
    const token = ++this.guidedToken;
    this.view?.setGuided(true);
    const kid = this.d.kid();
    this.d.voice('narrator', 'stretch_with_me', { interrupt: true });
    this.d.voice(kid, 'warmup_go', { priority: true, delay: 0.3 });
    const startWarm = this.warm;
    const total = ROUTINE.length * (MOVE_INTRO_S + COUNTS * COUNT_S);
    let t = 1.6;
    this.view?.setStep(ROUTINE[0], 0, ROUTINE.length, 0, COUNTS);
    ROUTINE.forEach((m, i) => {
      const side: 1 | -1 = i % 2 ? -1 : 1;
      this.later(token, t, () => {
        this.d.setMove(m, { glow: true, side });
        this.d.sfx('stretch_whoosh');
        this.d.voice('narrator', `move_${m}`, { interrupt: true });
        this.view?.setStep(m, i, ROUTINE.length, 0, COUNTS);
      });
      t += MOVE_INTRO_S;
      for (let c = 1; c <= COUNTS; c++) {
        const tc = t;
        this.later(token, tc, () => {
          this.d.voice('narrator', `count_${c}`, { interrupt: true });
          this.view?.setStep(m, i, ROUTINE.length, c, COUNTS);
          const done = (i * COUNTS + c) / (ROUTINE.length * COUNTS);
          this.setWarmTo(startWarm + (1 - startWarm) * done);
        });
        t += COUNT_S;
      }
      if (i === 2) this.later(token, t - 0.3, () => this.d.voice(kid, 'stretch_cheer', { priority: true }));
    });
    this.later(token, t + 0.2, () => {
      this.view?.setDone(ROUTINE.length);
      this.setWarmTo(1);
      this.d.voice(kid, 'stretch_cheer', { priority: true, interrupt: true });
      this.d.voice('narrator', 'ready', { delay: 0.5 });
    });
    this.later(token, t + 3.2, () => this.stopGuided(false));
    void total;
  }

  private setWarmTo(v: number): void {
    if (v > this.warm) this.addWarm(v - this.warm);
  }

  stopGuided(user: boolean): void {
    if (!this.guided) return;
    this.guided = false;
    this.guidedToken++;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.view?.setGuided(false);
    if (user) this.d.voice('narrator', 'stretch_happy', { interrupt: true });
    if (this.active && this.d.enabled()) this.startIdle();
  }
}

export const COOLDOWN_SEQ: { move: CooldownMove; hold: number; side?: 1 | -1 }[] = [
  { move: 'reach_sky', hold: 3.2 },
  { move: 'side_reach', hold: 3.2, side: 1 },
  { move: 'shoulder_stretch', hold: 3.2, side: -1 },
  { move: 'quad_stretch', hold: 3.2, side: 1 },
  { move: 'toe_touch', hold: 3.2 },
  { move: 'breathe', hold: 5.2 },
];
