// In-run HUD. Everything is pointer-events: none except real buttons (pause, skip), hugs the
// top edge / corners so the runner and oncoming obstacles stay clear, and is safe-area aware.
import type { BenefitId, FoodDef, JunkEffectId, StageSection } from '../contracts';
import { BENEFIT_LABEL, JUNK_LABEL } from '../content/foods';
import type { ActiveEffect, HudState, TutorialStep } from '../engine/api';
import { button, el } from './dom';
import { benefitIcon, foodPic, junkIcon } from './foodArt';
import { EXTRA_ICON, glyph, sectionIcon, SEASON_NAME } from './icons';

type Dir = 'left' | 'right' | 'up' | 'down';

const HAND = `<svg class="hand" viewBox="0 0 48 56" aria-hidden="true"><path d="M17 30V8.5a4.5 4.5 0 0 1 9 0V24l.4-3.2a4.2 4.2 0 0 1 8.3 1l-.2 2.6.6-1.8a4 4 0 0 1 7.6 2.4l-1 3.4c3.2-.2 5 2.4 4.3 5.6L44 42c-1.6 7.4-7.6 12-15 12h-3.6c-5 0-9-2.4-11.8-6.6L5.2 35.6a4 4 0 0 1 6.2-5z" fill="#fff4e0" stroke="#2b3440" stroke-width="2.6" stroke-linejoin="round"/><path d="M26 24v10M34.6 26v8M42 30v5" stroke="#2b3440" stroke-width="2.2" stroke-linecap="round" opacity=".35"/></svg>`;
const ARROW: Record<Dir, string> = { left: '←', right: '→', up: '↑', down: '↓' };
const KEY: Record<Dir, string> = { left: 'A', right: 'D', up: 'W', down: 'S' };

/** Swipe-hand animation (touch) or key caps (keyboard) for one move. */
export function moveGlyph(dir: Dir, touch: boolean): string {
  if (touch) return `<span class="swipe s-${dir}" aria-label="Swipe ${dir}"><span class="trail"></span>${HAND}</span>`;
  return `<span class="keys" aria-label="Press ${KEY[dir]} or the ${dir} arrow"><kbd>${KEY[dir]}</kbd><span class="or">or</span><kbd>${ARROW[dir]}</kbd></span>`;
}

export function allMovesGlyph(touch: boolean): string {
  if (touch) return `<span class="swipe-all">${(['left', 'right', 'up', 'down'] as Dir[]).map((d) => `<span class="mini-arrow m-${d}">${ARROW[d]}</span>`).join('')}${HAND}</span>`;
  return `<span class="keys grid-keys"><kbd class="k-up">W</kbd><kbd class="k-left">A</kbd><kbd class="k-down">S</kbd><kbd class="k-right">D</kbd></span>`;
}

interface PowerEl {
  el: HTMLElement;
  ring: SVGCircleElement;
  last: number;
}

const RING_C = 2 * Math.PI * 21;

export interface HudCallbacks {
  onPause(): void;
  onSkipTutorial(): void;
  touchGlyphs(): boolean;
}

export class Hud {
  readonly el: HTMLElement;
  private hearts: HTMLElement;
  private food: HTMLElement;
  private foodNum: HTMLElement;
  private progress: HTMLElement;
  private progFill: HTMLElement;
  private progDot: HTMLElement;
  private progMarks: HTMLElement;
  private dist: HTMLElement;
  private glow: HTMLElement;
  private powers: HTMLElement;
  private toasts: HTMLElement;
  private banner: HTMLElement;
  private countdownEl: HTMLElement;
  private tut: HTMLElement;
  private hint: HTMLElement;
  private skipBtn: HTMLButtonElement;
  private pauseBtn: HTMLButtonElement;
  private powerEls = new Map<string, PowerEl>();
  private last = { hearts: -1, maxHearts: -1, healthy: -1, glow: -1, full: false, prog: -1, dist: -1, sectionsKey: '', mode: '' };
  private bannerTimer = 0;
  private hintTimer = 0;
  private cdTimer = 0;

  constructor(private cb: HudCallbacks) {
    this.el = el('div', 'hud hidden');
    this.el.setAttribute('aria-hidden', 'false');
    const top = el('div', 'hud-top');
    const left = el('div', 'hud-left');
    this.hearts = el('div', 'hearts');
    this.food = el('div', 'food-count', `<span class="fc-pic">${foodPic('carrot', 'food-pic')}</span><b>0</b>`);
    this.foodNum = this.food.querySelector('b')!;
    left.append(this.hearts, this.food);
    const mid = el('div', 'hud-mid');
    this.progress = el('div', 'progress', `<div class="prog-track"><i class="prog-fill"></i></div><div class="prog-marks"></div><span class="prog-dot">${EXTRA_ICON.runner}</span><span class="prog-flag">${EXTRA_ICON.finish}</span>`);
    this.progFill = this.progress.querySelector('.prog-fill')!;
    this.progDot = this.progress.querySelector('.prog-dot')!;
    this.progMarks = this.progress.querySelector('.prog-marks')!;
    this.dist = el('div', 'dist hidden', `${glyph.infinity}<b>0 m</b>`);
    mid.append(this.progress, this.dist);
    const right = el('div', 'hud-right');
    this.glow = el('div', 'glow-meter', `<span class="glow-face">${EXTRA_ICON.glow}</span><span class="pips">${'<i></i>'.repeat(5)}</span>`);
    this.glow.setAttribute('aria-label', 'Healthy and happy glow');
    this.skipBtn = button({ cls: 'hud-btn skip hidden', html: `<span>Skip</span>${glyph.next}`, label: 'Skip tutorial', onClick: () => cb.onSkipTutorial() });
    this.pauseBtn = button({ cls: 'hud-btn pause', html: glyph.pause, label: 'Pause', onClick: () => cb.onPause() });
    right.append(this.glow, this.pauseBtn);
    top.append(left, mid, this.skipBtn, right);
    this.powers = el('div', 'powers');
    this.toasts = el('div', 'toasts');
    this.banner = el('div', 'banner hidden');
    this.countdownEl = el('div', 'countdown hidden');
    this.tut = el('div', 'tut-bubble hidden');
    this.hint = el('div', 'run-hint hidden');
    this.el.append(top, this.powers, this.toasts, this.banner, this.countdownEl, this.tut, this.hint);
  }

  show(mode: 'adventure' | 'endless' | 'tutorial'): void {
    this.reset();
    this.last.mode = mode;
    this.el.classList.remove('hidden');
    this.el.classList.toggle('mode-tutorial', mode === 'tutorial');
    this.el.classList.toggle('mode-endless', mode === 'endless');
    this.skipBtn.classList.toggle('hidden', mode !== 'tutorial');
    this.progress.classList.toggle('hidden', mode === 'endless');
    this.dist.classList.toggle('hidden', mode !== 'endless');
  }

  hide(): void {
    this.el.classList.add('hidden');
    this.hideTutorial();
    this.countdownEl.classList.add('hidden');
  }

  reset(): void {
    this.last = { hearts: -1, maxHearts: -1, healthy: -1, glow: -1, full: false, prog: -1, dist: -1, sectionsKey: '', mode: this.last.mode };
    for (const p of this.powerEls.values()) p.el.remove();
    this.powerEls.clear();
    this.toasts.innerHTML = '';
    this.toastMap.clear();
    this.banner.classList.add('hidden');
    this.hint.classList.add('hidden');
    this.hideTutorial();
  }

  setPauseEnabled(on: boolean): void {
    this.pauseBtn.disabled = !on;
  }

  /** Per-frame sync from engine.hud(). Only touches the DOM when values change. */
  update(h: HudState): void {
    const L = this.last;
    if (h.hearts !== L.hearts || h.maxHearts !== L.maxHearts) {
      const lost = L.hearts > h.hearts && L.hearts >= 0;
      const gained = L.hearts >= 0 && h.hearts > L.hearts;
      let s = '';
      for (let i = 0; i < h.maxHearts; i++) s += `<span class="heart ${i < h.hearts ? 'on' : 'off'} ${gained && i === h.hearts - 1 ? 'pop' : ''}">${glyph.heart}</span>`;
      this.hearts.innerHTML = s;
      this.hearts.setAttribute('aria-label', `${h.hearts} hearts`);
      if (lost) this.flash(this.hearts, 'shake');
      L.hearts = h.hearts;
      L.maxHearts = h.maxHearts;
    }
    if (h.healthy !== L.healthy) {
      this.foodNum.textContent = String(h.healthy);
      if (L.healthy >= 0 && h.healthy > L.healthy) this.flash(this.food, 'bump');
      L.healthy = h.healthy;
    }
    const lvl = Math.max(0, Math.min(5, Math.round(h.power?.glowLevel ?? 0)));
    const full = !!h.power?.happyAndHealthy;
    if (lvl !== L.glow || full !== L.full) {
      this.glow.querySelectorAll('.pips i').forEach((p, i) => p.classList.toggle('on', i < lvl));
      this.glow.classList.toggle('full', full);
      if (lvl > L.glow && L.glow >= 0) this.flash(this.glow, 'bump');
      L.glow = lvl;
      L.full = full;
    }
    if (h.mode === 'endless') {
      const d = Math.floor(h.distance);
      if (d !== L.dist) {
        this.dist.querySelector('b')!.textContent = `${d.toLocaleString('en-NZ')} m`;
        L.dist = d;
      }
    } else {
      const key = (h.sections ?? []).map((s) => `${s.id}@${s.start}`).join('|') + `/${h.goal}`;
      if (key !== L.sectionsKey) {
        this.renderMarks(h.sections ?? [], h.goal);
        L.sectionsKey = key;
      }
      const p = Math.max(0, Math.min(1, h.progress || 0));
      if (Math.abs(p - L.prog) > 0.001) {
        this.progFill.style.transform = `scaleX(${p})`;
        this.progDot.style.left = `${p * 100}%`;
        L.prog = p;
      }
    }
    this.syncPowers([...(h.powers ?? []).map((p) => ({ ...p, junk: false })), ...(h.junkEffects ?? []).map((p) => ({ ...p, junk: true }))]);
    if (h.countdown <= 0 && !this.countdownEl.classList.contains('hidden') && !this.countdownEl.classList.contains('go')) this.countdownEl.classList.add('hidden');
  }

  private renderMarks(sections: StageSection[], goal: number | null): void {
    this.progMarks.innerHTML = '';
    if (!goal || sections.length < 2) return;
    for (const s of sections) {
      if (s.start <= 0 || s.start >= goal) continue;
      const ic = sectionIcon(s.id, s.season);
      const m = el('span', 'mark', ic ?? '<i class="dot"></i>');
      m.style.left = `${(s.start / goal) * 100}%`;
      m.title = s.label;
      this.progMarks.append(m);
    }
    // first section icon at the start
    const first = sections[0];
    const ic0 = first ? sectionIcon(first.id, first.season) : null;
    if (ic0) {
      const m = el('span', 'mark start', ic0);
      m.style.left = '0%';
      this.progMarks.append(m);
    }
  }

  private syncPowers(list: (ActiveEffect<string> & { junk: boolean })[]): void {
    const seen = new Set<string>();
    for (const p of list) {
      if (!(p.t > 0)) continue;
      const key = `${p.junk ? 'j' : 'p'}:${p.id}`;
      seen.add(key);
      let pe = this.powerEls.get(key);
      if (!pe) {
        const icon = p.junk ? junkIcon(p.id as JunkEffectId | 'slump') : benefitIcon(p.id as BenefitId | 'magnet');
        const e = el('div', `pw ${p.junk ? 'junk' : 'good'} enter`, `<svg class="ring" viewBox="0 0 48 48" aria-hidden="true"><circle class="bg" cx="24" cy="24" r="21"/><circle class="fg" cx="24" cy="24" r="21" stroke-dasharray="${RING_C.toFixed(2)}"/></svg><span class="pw-ic">${icon}</span>`);
        e.title = p.junk ? (JUNK_LABEL[p.id as JunkEffectId] ?? 'Sleepy slump') : p.id === 'magnet' ? 'Food magnet' : BENEFIT_LABEL[p.id as BenefitId];
        this.powers.append(e);
        pe = { el: e, ring: e.querySelector('circle.fg') as SVGCircleElement, last: -1 };
        this.powerEls.set(key, pe);
      }
      const f = p.max > 0 ? Math.max(0, Math.min(1, p.t / p.max)) : 0;
      if (Math.abs(f - pe.last) > 0.004) {
        pe.ring.style.strokeDashoffset = `${(RING_C * (1 - f)).toFixed(2)}`;
        pe.el.classList.toggle('ending', p.t < 2);
        pe.last = f;
      }
    }
    for (const [k, pe] of this.powerEls) {
      if (!seen.has(k)) {
        pe.el.remove();
        this.powerEls.delete(k);
      }
    }
  }

  private flash(e: HTMLElement, cls: string): void {
    e.classList.remove(cls);
    void e.offsetWidth;
    e.classList.add(cls);
  }

  // ---------------------------------------------------------------- one-shot moments
  foodToast(food: FoodDef, isNew: boolean): void {
    // Repeats of the same food merge into ONE card whose ×N count bumps, so trails never stack copies.
    const live = this.toastMap.get(food.id);
    if (live && live.el.isConnected && !live.el.classList.contains('out')) {
      live.n++;
      const c = live.el.querySelector('.toast-count') as HTMLElement;
      c.textContent = `×${live.n}`;
      c.classList.remove('hidden');
      this.flash(c, 'bump');
      if (live.el !== this.toasts.firstElementChild) this.toasts.prepend(live.el);
      this.armToast(food.id, live);
      return;
    }
    const good = food.kind === 'healthy';
    const effect = good ? benefitIcon(food.benefit ?? 'tummy') : junkIcon(food.junk ?? 'sugar');
    const t = el('div', `toast ${good ? 'good' : 'junk'}`, `${foodPic(food.id, 'food-pic')}<span class="arrow">${good ? '+' : ''}</span><span class="fx">${effect}</span>${isNew ? '<span class="new-badge">NEW!</span>' : ''}<span class="toast-name">${food.name}</span><b class="toast-count hidden">×1</b>`);
    this.toasts.prepend(t);
    const entry = { el: t, n: 1, timers: [] as number[] };
    this.toastMap.set(food.id, entry);
    this.armToast(food.id, entry);
    // Cap the visible stack: 3 distinct foods on roomy screens, 2 on phones / short landscapes.
    const cap = window.innerWidth < 720 || window.innerHeight < 480 ? 2 : 3;
    while (this.toasts.children.length > cap) {
      const last = this.toasts.lastElementChild as HTMLElement;
      for (const [id, v] of this.toastMap) if (v.el === last) this.toastMap.delete(id);
      last.remove();
    }
  }

  private toastMap = new Map<string, { el: HTMLElement; n: number; timers: number[] }>();

  private armToast(id: string, entry: { el: HTMLElement; n: number; timers: number[] }): void {
    for (const t of entry.timers) window.clearTimeout(t);
    entry.timers = [
      window.setTimeout(() => entry.el.classList.add('out'), 1700),
      window.setTimeout(() => {
        entry.el.remove();
        if (this.toastMap.get(id) === entry) this.toastMap.delete(id);
      }, 2100),
    ];
  }

  sectionBanner(section: StageSection): void {
    const ic = sectionIcon(section.id, section.season);
    const label = section.season ? SEASON_NAME[section.season] : section.label;
    this.banner.innerHTML = `${ic ? `<span class="b-ic">${ic}</span>` : ''}<span class="b-label">${label}</span>`;
    this.clearChips();
    this.banner.className = `banner ${section.season ? `season ${section.season}` : 'sport'}`;
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.banner.classList.add('out'), 2300);
    window.setTimeout(() => this.banner.classList.add('hidden'), 2700);
  }

  messageBanner(html: string, cls = 'gold', ms = 2200): void {
    this.banner.innerHTML = html;
    this.clearChips();
    this.banner.className = `banner ${cls}`;
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.banner.classList.add('out'), ms);
    window.setTimeout(() => {
      if (this.banner.classList.contains('out')) this.banner.classList.add('hidden');
    }, ms + 400);
  }

  countdown(n: number): void {
    window.clearTimeout(this.cdTimer);
    const go = n <= 0;
    this.countdownEl.className = `countdown ${go ? 'go' : ''}`;
    this.countdownEl.innerHTML = `<span class="cd-n" data-n="${go ? 'go' : n}">${go ? 'GO!' : n}</span>`;
    if (go) this.cdTimer = window.setTimeout(() => this.countdownEl.classList.add('hidden'), 750);
  }

  nearMiss(): void {
    const t = el('div', 'near-chip', `${glyph.sparkle}<span>Phew!</span>`);
    this.el.append(t);
    this.keepChipClear(t);
    window.setTimeout(() => t.remove(), 900);
  }

  /** A "Phew!" cheer never sits on a banner: it drops just below one that is showing. */
  private keepChipClear(t: HTMLElement): void {
    const b = this.banner;
    if (b.classList.contains('hidden')) return; // a fading ('out') banner still counts
    const br = b.getBoundingClientRect();
    const host = this.el.getBoundingClientRect();
    if (br.height < 2) return;
    t.style.top = `${Math.round(br.bottom - host.top + 34)}px`;
  }

  /** Banners clear any "Phew!" cheer that is on screen so the two never overlap. */
  private clearChips(): void {
    this.el.querySelectorAll('.near-chip').forEach((c) => c.remove());
  }

  // ---------------------------------------------------------------- tutorial + hints
  tutorial(step: TutorialStep): void {
    // A hint bubble takes over from a lingering "GO!" so the two never overlap.
    window.clearTimeout(this.cdTimer);
    this.countdownEl.classList.add('hidden');
    const touch = this.cb.touchGlyphs();
    let pic = '';
    let text = '';
    switch (step) {
      case 'intro':
        pic = `<span class="tut-pic">${EXTRA_ICON.runner}</span>`;
        text = "Let's learn the moves!";
        break;
      case 'left':
        pic = moveGlyph('left', touch);
        text = 'Move left';
        break;
      case 'right':
        pic = moveGlyph('right', touch);
        text = 'Move right';
        break;
      case 'jump':
        pic = moveGlyph('up', touch);
        text = 'Jump over low things';
        break;
      case 'slide':
        pic = moveGlyph('down', touch);
        text = 'Slide under high things';
        break;
      case 'healthy':
        pic = `<span class="tut-foods">${foodPic('carrot', 'food-pic')}${foodPic('broccoli', 'food-pic')}<span class="eq">=</span><span class="fx">${benefitIcon('vision')}</span><span class="fx">${benefitIcon('muscles')}</span></span>`;
        text = 'Healthy food powers you up!';
        break;
      case 'junk':
        pic = `<span class="tut-foods">${foodPic('fizzy_can', 'food-pic')}<span class="eq">=</span><span class="fx">${junkIcon('slump')}</span></span>`;
        text = 'Treats slow you down a bit. Sometimes foods!';
        break;
      case 'done':
        pic = `<span class="tut-pic star">${glyph.star}</span>`;
        text = "You're ready!";
        break;
    }
    this.tut.className = `tut-bubble step-${step}`;
    this.tut.innerHTML = `<span class="tut-glyph">${pic}</span><span class="tut-text">${text}</span>`;
  }

  hideTutorial(): void {
    this.tut.classList.add('hidden');
  }

  /** Subtle first-run hint in normal runs (all four moves). */
  showRunHint(ms = 5200): void {
    const touch = this.cb.touchGlyphs();
    this.hint.innerHTML = `${allMovesGlyph(touch)}<span>${touch ? 'Swipe to move' : 'Move with keys'}</span>`;
    this.hint.className = 'run-hint';
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.hint.classList.add('out'), ms);
    window.setTimeout(() => this.hint.classList.add('hidden'), ms + 500);
  }
}
