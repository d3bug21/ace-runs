// Gameplay input: keyboard (A/D/W/S + arrows, P/Esc pause) and swipes (Pointer Events, multi-touch safe).
// Everything becomes a semantic action in the runner's frame: 'left' always means the runner's
// (and the screen's) left, because the camera always looks along the runner's forward direction.

export type Action = 'left' | 'right' | 'jump' | 'slide' | 'pause';

const KEY_CODES: Record<string, Action> = {
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyW: 'jump',
  ArrowUp: 'jump',
  Space: 'jump',
  KeyS: 'slide',
  ArrowDown: 'slide',
  KeyP: 'pause',
  Escape: 'pause',
};
// Fallbacks when `code` is missing (some virtual keyboards / synthetic events).
const KEY_NAMES: Record<string, Action> = {
  a: 'left',
  A: 'left',
  ArrowLeft: 'left',
  Left: 'left',
  d: 'right',
  D: 'right',
  ArrowRight: 'right',
  Right: 'right',
  w: 'jump',
  W: 'jump',
  ArrowUp: 'jump',
  Up: 'jump',
  ' ': 'jump',
  s: 'slide',
  S: 'slide',
  ArrowDown: 'slide',
  Down: 'slide',
  p: 'pause',
  P: 'pause',
  Escape: 'pause',
  Esc: 'pause',
};

interface Swipe {
  x: number;
  y: number;
  t: number;
  fired: boolean;
}

export class Input {
  private queue: Action[] = [];
  enabled = false;
  /** Pause key works even while gameplay input is disabled (when a run is active). */
  pauseEnabled = false;
  private swipes = new Map<number, Swipe>();
  onAny: (() => void) | null = null;
  lastSource: 'keyboard' | 'touch' | 'mouse' = 'keyboard';

  constructor(private surface: HTMLElement) {
    window.addEventListener('keydown', this.onKey, { capture: true });
    surface.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove, { passive: false });
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    surface.style.touchAction = 'none';
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const a = KEY_CODES[e.code] ?? KEY_NAMES[e.key];
    if (!a) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (a === 'pause') {
      if (!this.pauseEnabled || e.repeat) return;
      this.queue.push(a);
      e.preventDefault();
      return;
    }
    if (!this.enabled) return;
    e.preventDefault(); // no page scrolling (also inside an iframe)
    if (e.repeat) return;
    this.lastSource = 'keyboard';
    this.queue.push(a);
    this.onAny?.();
  };

  private threshold(): number {
    const m = Math.min(window.innerWidth, window.innerHeight);
    return Math.max(22, Math.min(48, m * 0.06));
  }

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    this.swipes.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), fired: false });
    this.lastSource = e.pointerType === 'mouse' ? 'mouse' : 'touch';
  };

  private onMove = (e: PointerEvent): void => {
    const s = this.swipes.get(e.pointerId);
    if (!s || s.fired || !this.enabled) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const th = this.threshold();
    if (Math.abs(dx) < th && Math.abs(dy) < th) return;
    s.fired = true;
    if (e.cancelable) e.preventDefault();
    let a: Action;
    if (Math.abs(dx) > Math.abs(dy)) a = dx > 0 ? 'right' : 'left';
    else a = dy < 0 ? 'jump' : 'slide';
    this.queue.push(a);
    this.onAny?.();
  };

  private onUp = (e: PointerEvent): void => {
    const s = this.swipes.get(e.pointerId);
    if (!s) return;
    this.swipes.delete(e.pointerId);
    if (s.fired || !this.enabled) return;
    // A quick flick released before crossing the move threshold still counts if it was fast.
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const dt = performance.now() - s.t;
    const th = this.threshold() * 0.6;
    if (dt < 260 && (Math.abs(dx) > th || Math.abs(dy) > th)) {
      if (Math.abs(dx) > Math.abs(dy)) this.queue.push(dx > 0 ? 'right' : 'left');
      else this.queue.push(dy < 0 ? 'jump' : 'slide');
      this.onAny?.();
    }
  };

  drain(): Action[] {
    if (!this.queue.length) return this.queue;
    const q = this.queue;
    this.queue = [];
    return q;
  }

  clear(): void {
    this.queue.length = 0;
    this.swipes.clear();
  }
}
