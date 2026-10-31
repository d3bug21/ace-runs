// Cool-down (v1.0.1): after the finish celebration and before results, the runner holds 6 gentle
// static stretches (~22 s). A hold-timer ring fills for each pose; a heart slows from fast to calm,
// a muscle goes from tight zig-zags to soft waves and a "bendy" sparkle grows; it ends with a slow
// breathe in / out bubble. Auto-advances; Skip is always there.
import type { CharacterId, StretchMove } from '../contracts';
import type { Speaker } from '../app/types';
import { button, el, reducedMotion, Screen } from './dom';
import { glyph } from './icons';
import { COOLDOWN_SEQ, MOVE_NAME, MOVE_PART, partFigure } from './Stretch';

export interface CooldownDeps {
  setMove(move: StretchMove | null, opts?: { glow?: boolean; side?: 1 | -1 }): void;
  voice(speaker: Speaker, group: string, opts?: { priority?: boolean; interrupt?: boolean; delay?: number }): number;
  sfx(id: string): void;
}

const RING_C = 2 * Math.PI * 42;
const INTRO_S = 1.6;
const HEART = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 41s-16-9.6-16-21.2A9.2 9.2 0 0 1 24 13.8a9.2 9.2 0 0 1 16 6c0 11.6-16 21.2-16 21.2z" fill="#ff7a6b" stroke="#de5a4b" stroke-width="2"/><path d="M15 21a5 5 0 0 1 4-4" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".8"/></svg>`;
const MUSCLE = `<svg viewBox="0 0 48 48" aria-hidden="true">
  <path class="m-tight" d="M5 24l4-7 4 14 4-14 4 14 4-14 4 14 4-14 4 14 4-7" stroke="#e05a4b" stroke-width="3.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
  <path class="m-soft" d="M5 24c3.5-7 7.5-7 11 0s7.5 7 11 0 7.5-7 11 0 3.5 4 5 3" stroke="#2fb5a8" stroke-width="3.6" fill="none" stroke-linecap="round"/></svg>`;

export class CooldownScreen extends Screen {
  private ring: SVGCircleElement;
  private fig: HTMLElement;
  private name: HTMLElement;
  private steps: HTMLElement;
  private bubble: HTMLElement;
  private bubbleLabel: HTMLElement;
  private card: HTMLElement;
  private raf = 0;
  private timers: number[] = [];
  private token = 0;
  private t0 = 0;
  private holdStart = 0;
  private holdLen = 1;
  private onDone: (() => void) | null = null;
  private finished = false;

  constructor(private d: CooldownDeps) {
    super('cooldown');
    this.card = el('div', 'cool-card');
    const head = el('div', 'cool-head', `<h2 class="cool-title">${glyph.sparkle}<span>Cool down</span></h2>`);
    this.steps = el('div', 'cool-steps');
    head.append(this.steps);
    const body = el('div', 'cool-body');
    const hold = el('div', 'hold', `<svg class="hold-ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="hr-bg" cx="50" cy="50" r="42"/><circle class="hr-fg" cx="50" cy="50" r="42" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${RING_C.toFixed(2)}"/></svg><span class="hold-fig"></span>`);
    this.ring = hold.querySelector('.hr-fg') as SVGCircleElement;
    this.fig = hold.querySelector('.hold-fig')!;
    this.bubble = el('div', 'breathe-bubble', '<i></i><span></span>');
    this.bubbleLabel = this.bubble.querySelector('span')!;
    hold.append(this.bubble);
    const ben = el(
      'div',
      'benefits',
      `<span class="ben b-heart"><span class="ben-ic">${HEART}</span><small>Calm heart</small></span>
       <span class="ben b-muscle"><span class="ben-ic">${MUSCLE}</span><small>Soft muscles</small></span>
       <span class="ben b-bendy"><span class="ben-ic">${glyph.sparkle}</span><small>Bendy!</small></span>`,
    );
    body.append(hold, ben);
    this.name = el('p', 'cool-move', '');
    const dock = el('div', 'dock cool-dock');
    const skip = button({ cls: 'chip-btn cool-skip', html: `<span>Skip</span>${glyph.next}`, label: 'Skip cool-down', onClick: () => this.finish(true) });
    dock.append(skip);
    const foot = el('div', 'cool-foot');
    foot.append(this.name, dock);
    this.card.append(head, body, foot);
    this.el.append(this.card);
  }

  private later(s: number, fn: () => void): void {
    const tk = this.token;
    this.timers.push(window.setTimeout(() => tk === this.token && fn(), s * 1000));
  }

  /** Run the routine; onDone fires once (auto end or Skip). startAt = index to begin at (tests). */
  start(kid: CharacterId, onDone: () => void, startAt = 0): void {
    this.stop();
    this.token++;
    this.finished = false;
    this.onDone = onDone;
    const seq = COOLDOWN_SEQ.slice(Math.max(0, Math.min(COOLDOWN_SEQ.length - 1, startAt)));
    const total = INTRO_S + seq.reduce((n, s) => n + s.hold, 0);
    this.t0 = performance.now();
    this.holdStart = this.t0;
    this.holdLen = INTRO_S;
    this.setProgress(startAt / COOLDOWN_SEQ.length);
    this.renderSteps(startAt, startAt);
    this.fig.innerHTML = partFigure('arms');
    this.name.textContent = 'Great running! Time to cool down';
    this.bubble.className = 'breathe-bubble';
    this.d.setMove(null);
    if (startAt === 0) {
      this.d.voice('narrator', 'cooldown_intro', { interrupt: true });
      this.d.voice(kid, 'cooldown_go', { priority: true, delay: 0.4 });
    }
    let t = INTRO_S;
    seq.forEach((s, k) => {
      const i = startAt + k;
      this.later(t, () => this.beginHold(i, s.move, s.hold, s.side));
      t += s.hold;
      this.later(t - 0.05, () => {
        this.d.sfx('hold_chime');
        this.renderSteps(i + 1, i + 1);
        this.setProgress((i + 1) / COOLDOWN_SEQ.length);
      });
    });
    this.later(t + 0.1, () => {
      this.d.setMove(null);
      this.name.textContent = 'All bendy and calm!';
      this.d.voice(kid, 'cooldown_done', { priority: true, interrupt: true });
      this.d.voice('narrator', 'stretch_happy', { delay: 0.6 });
    });
    this.later(t + 2.4, () => this.finish(false));
    const loop = () => {
      const now = performance.now();
      const f = Math.max(0, Math.min(1, (now - this.holdStart) / (this.holdLen * 1000)));
      this.ring.style.strokeDashoffset = `${(RING_C * (1 - f)).toFixed(2)}`;
      if ((now - this.t0) / 1000 < total + 3) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private beginHold(i: number, move: StretchMove, hold: number, side?: 1 | -1): void {
    this.holdStart = performance.now();
    this.holdLen = hold;
    this.d.setMove(move, { glow: true, side });
    this.fig.innerHTML = partFigure(MOVE_PART[move]);
    this.name.textContent = MOVE_NAME[move];
    this.renderSteps(i, i);
    this.d.voice('narrator', `move_${move}`, { interrupt: true });
    if (i === 0) this.d.voice('narrator', 'hold', { delay: 0.2 });
    if (move === 'breathe') {
      this.bubble.className = 'breathe-bubble on in';
      this.bubbleLabel.textContent = 'Breathe in';
      this.d.voice('narrator', 'breathe_in', { interrupt: true, delay: 0.1 });
      this.later(hold / 2, () => {
        this.bubble.className = 'breathe-bubble on out';
        this.bubbleLabel.textContent = 'Breathe out';
        this.d.voice('narrator', 'breathe_out', { interrupt: true });
      });
    } else this.bubble.className = 'breathe-bubble';
  }

  private renderSteps(done: number, now: number): void {
    this.steps.innerHTML = COOLDOWN_SEQ.map((_, i) => `<i class="${i < done ? 'done' : i === now ? 'now' : ''}"></i>`).join('');
  }

  /** p 0..1 across the routine: heart slows, muscle softens, sparkle grows. */
  private setProgress(p: number): void {
    const s = this.card.style;
    s.setProperty('--soft', p.toFixed(3));
    s.setProperty('--beat', `${(0.34 + p * 0.8).toFixed(2)}s`);
    s.setProperty('--bendy', p.toFixed(3));
    this.card.classList.toggle('calm', p >= 0.99);
    void reducedMotion;
  }

  private finish(_skipped: boolean): void {
    if (this.finished) return;
    this.finished = true;
    this.stop();
    this.d.setMove(null);
    const cb = this.onDone;
    this.onDone = null;
    cb?.();
  }

  stop(): void {
    this.token++;
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    cancelAnimationFrame(this.raf);
  }

  protected override onHide(): void {
    this.stop();
  }

  override back(): boolean {
    this.finish(true);
    return true;
  }
}
