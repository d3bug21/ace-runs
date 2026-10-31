// Small DOM helpers shared by every screen: element factory, ghost-click guard, spatial
// keyboard navigation and a tiny screen base class with enter/leave transitions.

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export interface ButtonOpts {
  cls?: string;
  html: string;
  label?: string; // aria-label / title (for icon-only buttons)
  onClick: (e: MouseEvent) => void;
  id?: string;
}

export function button(o: ButtonOpts): HTMLButtonElement {
  const b = el('button', `btn ${o.cls ?? ''}`.trim(), o.html);
  b.type = 'button';
  if (o.label) {
    b.setAttribute('aria-label', o.label);
    b.title = o.label;
  }
  if (o.id) b.dataset.id = o.id;
  b.addEventListener('click', (e) => o.onClick(e));
  return b;
}

const now = () => performance.now();

/**
 * Ghost-click protection for touch screens:
 *  - clicks within `ms` after a new screen appears are ignored (the tap that opened it);
 *  - a pointer click only counts if the pointer went DOWN on the same button
 *    (a swipe that ends on a button never activates it).
 * Keyboard-generated clicks (detail === 0) are only subject to the time guard.
 */
export class TapGuard {
  private until = 0;
  private downBtn: Element | null = null;
  private downAt = 0;
  private downX = 0;
  private downY = 0;
  lastPointerType = '';

  constructor(root: Document = document) {
    root.addEventListener(
      'pointerdown',
      (e) => {
        this.lastPointerType = e.pointerType;
        this.downBtn = (e.target as Element | null)?.closest?.('button, [role="button"], a, label') ?? null;
        this.downAt = now();
        this.downX = e.clientX;
        this.downY = e.clientY;
      },
      true,
    );
    root.addEventListener(
      'click',
      (e) => {
        const target = (e.target as Element | null)?.closest?.('button, [role="button"], a, label') ?? null;
        if (!target) return;
        let block = now() < this.until;
        if (!block && e.detail > 0) {
          const moved = Math.hypot(e.clientX - this.downX, e.clientY - this.downY);
          // Different element, or a long swipe that happened to end here.
          if (this.downBtn !== target || (moved > 40 && this.lastPointerType === 'touch')) block = true;
          if (now() - this.downAt > 4000) block = false; // stale down (e.g. synthetic) - allow
        }
        if (block) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      },
      true,
    );
  }

  /** Ignore clicks for the next `ms` milliseconds (call when a screen/overlay appears). */
  arm(ms = 350): void {
    this.until = Math.max(this.until, now() + ms);
  }

  disarm(): void {
    this.until = 0;
  }
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function visibleFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((e) => {
    if (e.closest('[inert], .hidden, [aria-hidden="true"]')) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

/** Move focus to the nearest focusable in the arrow direction. Returns true if it moved. */
export function spatialMove(root: HTMLElement, dir: 'left' | 'right' | 'up' | 'down'): boolean {
  const items = visibleFocusables(root);
  if (!items.length) return false;
  const cur = document.activeElement as HTMLElement | null;
  if (!cur || !items.includes(cur)) {
    (root.querySelector<HTMLElement>('[data-autofocus]') ?? items[0]).focus({ preventScroll: false });
    return true;
  }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const it of items) {
    if (it === cur) continue;
    const r = it.getBoundingClientRect();
    const bx = r.left + r.width / 2;
    const by = r.top + r.height / 2;
    const dx = bx - ax;
    const dy = by - ay;
    let main: number;
    let cross: number;
    if (dir === 'left') [main, cross] = [-dx, dy];
    else if (dir === 'right') [main, cross] = [dx, dy];
    else if (dir === 'up') [main, cross] = [-dy, dx];
    else [main, cross] = [dy, dx];
    if (main <= 4) continue;
    const score = main + Math.abs(cross) * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = it;
    }
  }
  if (best) {
    best.focus();
    best.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    return true;
  }
  return false;
}

export function reducedMotion(): boolean {
  return document.documentElement.classList.contains('reduced');
}

/** Screen base: an absolutely positioned layer with enter/leave transitions. */
export abstract class Screen {
  readonly el: HTMLElement;
  shown = false;
  private hideTimer = 0;

  constructor(cls: string) {
    this.el = el('section', `screen ${cls} hidden`);
  }

  /** Esc / back button. Return false when the screen has no back action. */
  back(): boolean {
    return false;
  }

  protected onShow(): void {}
  protected onHide(): void {}

  show(): void {
    clearTimeout(this.hideTimer);
    this.el.classList.remove('hidden', 'leaving');
    this.el.removeAttribute('inert');
    // restart the enter animation
    this.el.classList.remove('entering');
    void this.el.offsetWidth;
    this.el.classList.add('entering');
    this.shown = true;
    this.onShow();
    const af = this.el.querySelector<HTMLElement>('[data-autofocus]');
    if (af) af.focus({ preventScroll: true });
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.el.setAttribute('inert', '');
    this.el.classList.remove('entering');
    this.onHide();
    if (reducedMotion()) {
      this.el.classList.add('hidden');
      return;
    }
    this.el.classList.add('leaving');
    this.hideTimer = window.setTimeout(() => {
      this.el.classList.add('hidden');
      this.el.classList.remove('leaving');
    }, 220);
  }
}

export function fmtDist(m: number): string {
  return `${Math.max(0, Math.round(m)).toLocaleString('en-NZ')} m`;
}

export function starsHTML(n: number, max = 3): string {
  let s = '';
  for (let i = 0; i < max; i++) s += `<span class="st ${i < n ? 'on' : ''}">★</span>`;
  return s;
}
