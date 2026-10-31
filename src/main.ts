// Ace Runs! boot: AudioManager + Engine + App. Reaches the boot/title screen without a user
// gesture; the first tap only unlocks audio and advances.
import '@fontsource/fredoka/latin-400.css';
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './styles/main.css';
import { AudioManager } from './audio/AudioManager';
import { createEngine } from './engine/Engine';
import { installProbeIfRequested } from './engine/Probe';
import { App } from './app/App';
import { detectDevice } from './app/Device';

const root = document.getElementById('app')!;

function showFatal(msg: string): void {
  root.innerHTML = `<div class="fatal"><div class="fatal-card"><b>Oh no!</b><p>${msg}</p></div></div>`;
}

function boot(): void {
  const device = detectDevice();
  const stage = document.createElement('div');
  stage.className = 'stage-host';
  stage.id = 'stage';
  root.append(stage);
  const audio = new AudioManager('./');
  let engine: ReturnType<typeof createEngine>;
  try {
    engine = createEngine(stage, audio);
  } catch (e) {
    console.error(e);
    showFatal('Ace Runs! needs a device with 3D graphics (WebGL) turned on. Try another browser or update this one.');
    return;
  }
  const app = new App(root, engine, audio, { device });
  app.start();
  installProbeIfRequested({ app, engine });

  // Test hook for the automated layout/occlusion checks (opt-in via ?ui-test=1).
  if (import.meta.env.DEV || new URLSearchParams(location.search).get('ui-test') === '1') {
    (window as unknown as { __aceRuns?: unknown }).__aceRuns = { app, engine, audio };
  }

  // Offline support for the web build (versioned per deploy). Never in dev, file:// or the desktop app.
  if (import.meta.env.PROD && !device.desktopApp && location.protocol.startsWith('http') && 'serviceWorker' in navigator) {
    const reg = () => navigator.serviceWorker.register('./sw.js').catch(() => undefined);
    if (document.readyState === 'complete') reg();
    else window.addEventListener('load', reg, { once: true });
  }
}

boot();
