// Sizes the app root from window.visualViewport so mobile browser toolbars (which shrink the
// visual viewport) never push buttons off-screen. Publishes CSS vars + layout classes on <html>.

export interface ViewportInfo {
  w: number;
  h: number;
  x: number;
  y: number;
  portrait: boolean;
  /** Short landscape (phones on their side): compact layouts. */
  short: boolean;
  /** Narrow portrait (small phones). */
  narrow: boolean;
}

type Listener = (v: ViewportInfo) => void;

export class Viewport {
  info: ViewportInfo = { w: 0, h: 0, x: 0, y: 0, portrait: true, short: false, narrow: false };
  private listeners: Listener[] = [];
  private raf = 0;

  constructor(private root: HTMLElement) {
    const q = () => this.queue();
    window.addEventListener('resize', q);
    window.addEventListener('orientationchange', () => {
      this.queue();
      // iOS reports stale sizes right after rotating.
      setTimeout(q, 250);
      setTimeout(q, 600);
    });
    window.visualViewport?.addEventListener('resize', q);
    window.visualViewport?.addEventListener('scroll', q);
    this.apply();
  }

  onChange(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private queue(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.apply();
    });
  }

  apply(): void {
    const vv = window.visualViewport;
    // Layout viewport is the fallback; the visual viewport wins when it is smaller (toolbars, zoom).
    let w = window.innerWidth;
    let h = window.innerHeight;
    let x = 0;
    let y = 0;
    if (vv && vv.width > 0 && vv.height > 0) {
      w = Math.min(w, Math.round(vv.width));
      h = Math.min(h, Math.round(vv.height));
      x = Math.max(0, Math.round(vv.offsetLeft));
      y = Math.max(0, Math.round(vv.offsetTop));
    }
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    const portrait = h >= w;
    const short = !portrait && h < 480;
    const narrow = portrait && w < 420;
    const prev = this.info;
    this.info = { w, h, x, y, portrait, short, narrow };
    const s = document.documentElement.style;
    s.setProperty('--app-w', `${w}px`);
    s.setProperty('--app-h', `${h}px`);
    s.setProperty('--app-x', `${x}px`);
    s.setProperty('--app-y', `${y}px`);
    const cl = document.documentElement.classList;
    cl.toggle('portrait', portrait);
    cl.toggle('landscape', !portrait);
    cl.toggle('vh-short', short);
    cl.toggle('vh-tiny', !portrait && h < 380);
    cl.toggle('vw-narrow', narrow);
    this.root.style.transform = x || y ? `translate(${x}px, ${y}px)` : '';
    if (prev.w !== w || prev.h !== h || prev.x !== x || prev.y !== y) for (const l of this.listeners) l(this.info);
  }
}
