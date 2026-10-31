// Overlay modals: pause menu, settings (three volume sliders + toggles), confirm dialog.
import type { AppApi } from './ctx';
import type { Bus } from '../app/types';
import { button, el, Screen } from './dom';
import { glyph } from './icons';

export class PauseModal extends Screen {
  constructor(
    private app: AppApi,
    private act: { resume(): void; restart(): void; settings(): void; exit(): void },
  ) {
    super('modal-layer pause');
    const card = el('div', 'modal-card pause-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Paused');
    card.append(el('div', 'modal-badge', glyph.pause), el('h2', 'modal-title', 'Paused'));
    const resume = button({ cls: 'primary huge', html: `${glyph.play}<span>Keep going</span>`, label: 'Resume', onClick: () => { app.sound('select'); act.resume(); } });
    resume.dataset.autofocus = '';
    const grid = el('div', 'pause-grid');
    grid.append(
      button({ cls: 'chip-btn', html: `${glyph.retry}<span>Restart</span>`, label: 'Restart', onClick: () => { app.sound('click'); act.restart(); } }),
      button({ cls: 'chip-btn', html: `${glyph.gear}<span>Settings</span>`, label: 'Settings', onClick: () => { app.sound('click'); act.settings(); } }),
      button({ cls: 'chip-btn', html: `${glyph.stages}<span>Places</span>`, label: 'Exit to places', onClick: () => { app.sound('back'); act.exit(); } }),
    );
    card.append(resume, grid);
    this.el.append(card);
  }
  override back(): boolean {
    this.app.sound('select');
    this.act.resume();
    return true;
  }
}

export interface SettingsHooks {
  onVolume(bus: Bus, v: number, commit: boolean): void;
  onToggle(key: 'hints' | 'reducedMotion', v: boolean): void;
  toggleFullscreen(): Promise<boolean>;
  isFullscreen(): boolean;
  resetProgress(): void;
  close(): void;
}

export class SettingsModal extends Screen {
  private sliders = new Map<Bus, HTMLInputElement>();
  private toggles = new Map<string, HTMLButtonElement>();
  private fsBtn: HTMLButtonElement | null = null;
  private resetRow: HTMLElement;
  private confirming = false;

  constructor(private app: AppApi, private hooks: SettingsHooks) {
    super('modal-layer settings');
    const card = el('div', 'modal-card settings-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Settings');
    const head = el('div', 'modal-head');
    head.append(el('h2', 'modal-title', `${glyph.gear}<span>Settings</span>`));
    const done = button({ cls: 'round close', html: glyph.check, label: 'Done', onClick: () => this.back() });
    head.append(done);
    const body = el('div', 'modal-body');
    const vols: [Bus, string, string][] = [
      ['music', glyph.music, 'Music'],
      ['voice', glyph.voice, 'Voices'],
      ['sfx', glyph.sfx, 'Effects'],
    ];
    const volBox = el('div', 'set-group vols');
    for (const [bus, ic, label] of vols) {
      const row = el('label', 'set-row slider-row');
      const input = el('input', 'slider') as HTMLInputElement;
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.step = '5';
      input.setAttribute('aria-label', `${label} volume`);
      input.addEventListener('input', () => {
        this.paint(input);
        hooks.onVolume(bus, Number(input.value) / 100, false);
      });
      input.addEventListener('change', () => hooks.onVolume(bus, Number(input.value) / 100, true));
      row.append(el('span', 'set-ic', ic), el('span', 'set-label', label), input);
      this.sliders.set(bus, input);
      volBox.append(row);
    }
    const togBox = el('div', 'set-group toggles');
    const mkToggle = (key: 'hints' | 'reducedMotion', ic: string, label: string) => {
      const b = button({
        cls: 'set-row toggle-row',
        html: `<span class="set-ic">${ic}</span><span class="set-label">${label}</span><span class="switch"><i></i></span>`,
        label,
        onClick: () => {
          const v = b.getAttribute('aria-checked') !== 'true';
          b.setAttribute('aria-checked', String(v));
          app.sound('click');
          hooks.onToggle(key, v);
        },
      });
      b.setAttribute('role', 'switch');
      this.toggles.set(key, b);
      togBox.append(b);
    };
    mkToggle('hints', glyph.hint, 'Hints');
    mkToggle('reducedMotion', glyph.motion, 'Calm motion');
    if (app.device.canFullscreen) {
      this.fsBtn = button({
        cls: 'set-row toggle-row',
        html: `<span class="set-ic">${glyph.fullscreen}</span><span class="set-label">Full screen</span><span class="switch"><i></i></span>`,
        label: 'Full screen',
        onClick: async () => {
          app.sound('click');
          const on = await hooks.toggleFullscreen();
          this.fsBtn?.setAttribute('aria-checked', String(on));
        },
      });
      this.fsBtn.setAttribute('role', 'switch');
      togBox.append(this.fsBtn);
    }
    this.resetRow = el('div', 'set-group reset');
    body.append(volBox, togBox, this.resetRow, el('p', 'version', `Ace Runs! v${typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0'} · made with kai and aroha`));
    card.append(head, body);
    this.el.append(card);
  }

  private paint(input: HTMLInputElement): void {
    input.style.setProperty('--v', `${input.value}%`);
  }

  private renderReset(): void {
    this.resetRow.innerHTML = '';
    if (!this.confirming) {
      this.resetRow.append(
        button({ cls: 'chip-btn danger', html: `${glyph.trash}<span>Reset progress</span>`, label: 'Reset progress', onClick: () => { this.app.sound('click'); this.confirming = true; this.renderReset(); } }),
      );
      return;
    }
    const box = el('div', 'confirm-box', `<p><b>Start again from the beginning?</b><span>Places and food friends will be cleared.</span></p>`);
    const row = el('div', 'row');
    const keep = button({ cls: 'chip-btn', html: `${glyph.back}<span>Keep</span>`, label: 'Keep my progress', onClick: () => { this.app.sound('back'); this.confirming = false; this.renderReset(); } });
    keep.dataset.autofocus = '';
    row.append(
      keep,
      button({ cls: 'chip-btn danger solid', html: `${glyph.trash}<span>Reset</span>`, label: 'Yes, reset', onClick: () => { this.hooks.resetProgress(); this.confirming = false; this.renderReset(); this.app.sound('page'); } }),
    );
    box.append(row);
    this.resetRow.append(box);
    keep.focus({ preventScroll: false });
  }

  protected override onShow(): void {
    const s = this.app.save.settings;
    const vals: Record<Bus, number> = { music: s.music, voice: s.voice, sfx: s.sfx };
    for (const [bus, input] of this.sliders) {
      input.value = String(Math.round(vals[bus] * 100));
      this.paint(input);
    }
    this.toggles.get('hints')?.setAttribute('aria-checked', String(s.hints));
    this.toggles.get('reducedMotion')?.setAttribute('aria-checked', String(s.reducedMotion));
    this.fsBtn?.setAttribute('aria-checked', String(this.hooks.isFullscreen()));
    this.confirming = false;
    this.renderReset();
    this.sliders.get('music')?.focus({ preventScroll: true });
  }

  override back(): boolean {
    this.app.sound('back');
    this.hooks.close();
    return true;
  }
}
