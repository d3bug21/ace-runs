// Device / browser detection for touch glyphs, compact HUD and desktop-only niceties.
// Desktop browsers and the Electron app are never `handheld`.

export interface DesktopBridge {
  isDesktop: boolean;
  platform: string;
  toggleFullscreen(): Promise<boolean>;
  isFullscreen(): Promise<boolean>;
  quit(): Promise<void>;
}

export interface DeviceInfo {
  /** Running inside the Ace Runs! desktop (Electron) app. */
  desktopApp: boolean;
  /** Phone or tablet browser (incl. iPadOS that reports itself as a Mac). */
  handheld: boolean;
  ios: boolean;
  android: boolean;
  /** Primary input is touch: show swipe glyphs instead of key caps. */
  touchPrimary: boolean;
  /** Browser Fullscreen API is usable (false on iPhone Safari). */
  canFullscreen: boolean;
  bridge: DesktopBridge | null;
}

export function desktopBridge(win: Window = window): DesktopBridge | null {
  const b = (win as unknown as { aceRunsDesktop?: DesktopBridge }).aceRunsDesktop;
  return b && b.isDesktop ? b : null;
}

export function detectDevice(nav: Navigator = navigator, win: Window = window): DeviceInfo {
  const ua = nav.userAgent || '';
  const bridge = desktopBridge(win);
  const desktopApp = !!bridge || /Electron\//.test(ua);
  const maxTouch = typeof nav.maxTouchPoints === 'number' ? nav.maxTouchPoints : 0;
  const coarse = !!win.matchMedia?.('(pointer: coarse)').matches;
  const noHover = !!win.matchMedia?.('(hover: none)').matches;
  // iPadOS 13+ Safari reports a Mac user agent; it is the only "Mac" with multi-touch.
  const ipadOS = /Macintosh/.test(ua) && maxTouch > 1;
  const ios = /iPhone|iPad|iPod/i.test(ua) || ipadOS;
  const android = /Android/i.test(ua);
  const mobileUA = /Mobi|iPhone|iPad|iPod|Android|Silk|Kindle|PlayBook|BlackBerry|Opera Mini|IEMobile|webOS/i.test(ua);
  const touchFirst = maxTouch > 0 && coarse && noHover;
  const handheld = !desktopApp && (mobileUA || ipadOS || touchFirst);
  const touchPrimary = !desktopApp && (coarse || (maxTouch > 0 && handheld));
  const doc = win.document as Document & { webkitFullscreenEnabled?: boolean };
  const canFullscreen = desktopApp || !!(doc.fullscreenEnabled || doc.webkitFullscreenEnabled);
  return { desktopApp, handheld, ios, android, touchPrimary, canFullscreen, bridge };
}

/** Toggle fullscreen: Electron via the bridge, web via the Fullscreen API. Resolves to the new state. */
export async function toggleFullscreen(dev: DeviceInfo): Promise<boolean> {
  if (dev.bridge) return dev.bridge.toggleFullscreen();
  const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      if (doc.exitFullscreen) await doc.exitFullscreen();
      else doc.webkitExitFullscreen?.();
      return false;
    }
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else el.webkitRequestFullscreen?.();
    return true;
  } catch {
    return isFullscreenNow();
  }
}

export function isFullscreenNow(): boolean {
  const doc = document as Document & { webkitFullscreenElement?: Element };
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
}
