// Menu screens: boot, title, character picker, ride picker, stage select.
import { CHARACTERS, RIDES, STAGES, type CharacterId, type RideId, type StageId } from '../contracts';
import { HEALTHY } from '../content/foods';
import type { AppApi } from './ctx';
import { button, el, fmtDist, Screen } from './dom';
import { foodPic } from './foodArt';
import {
  glyph,
  KID_ART,
  KID_COLOR,
  KID_NAME,
  RIDE_ICON,
  RIDE_NAME,
  STAGE_ART,
  STAGE_COLOR,
  STAGE_NAME,
} from './icons';
import { logoSVG } from './logo';

export function starRow(n: number, cls = 'stars'): string {
  let s = `<span class="${cls}" aria-label="${n} of 3 stars">`;
  for (let i = 0; i < 3; i++) s += `<span class="st ${i < n ? 'on' : ''}">${glyph.star}</span>`;
  return s + '</span>';
}

function topBar(title: string, onBack: (() => void) | null, extra: HTMLElement[] = []): HTMLElement {
  const bar = el('header', 'topbar');
  if (onBack) bar.append(button({ cls: 'round back', html: glyph.back, label: 'Back', onClick: onBack }));
  else bar.append(el('span', 'round-spacer'));
  bar.append(el('h2', 'screen-title', `<span class="pill-title">${title}</span>`));
  const right = el('div', 'topbar-right');
  right.append(...extra);
  bar.append(right);
  return bar;
}

// ------------------------------------------------------------------ boot
export class BootScreen extends Screen {
  private bar: HTMLElement;
  private playBtn: HTMLButtonElement;
  private status: HTMLElement;
  constructor(private app: AppApi, onPlay: () => void) {
    super('boot');
    const foods = ['carrot', 'kiwifruit', 'banana', 'broccoli', 'milk', 'water', 'strawberry', 'corn'];
    this.el.innerHTML = `
      <div class="boot-sky" aria-hidden="true">${foods.map((f, i) => `<span class="float f${i}">${foodPic(f, 'food-pic')}</span>`).join('')}</div>
      <div class="boot-inner">
        <div class="boot-logo">${logoSVG()}</div>
        <div class="boot-kids" aria-hidden="true"><span class="kid-bubble ace">${KID_ART.ace}</span><span class="kid-bubble moana">${KID_ART.moana}</span></div>
        <div class="boot-load"><div class="loadbar"><i></i></div><p class="boot-status">Packing healthy snacks…</p></div>
      </div>`;
    this.bar = this.el.querySelector('.loadbar i')!;
    this.status = this.el.querySelector('.boot-status')!;
    this.playBtn = button({ cls: 'primary huge play-btn', html: `${glyph.play}<span>Play</span>`, label: 'Play', onClick: onPlay });
    this.playBtn.dataset.autofocus = '';
    this.playBtn.classList.add('hidden');
    this.el.querySelector('.boot-load')!.append(this.playBtn);
    void this.app;
  }
  setProgress(p: number, status?: string): void {
    this.bar.style.transform = `scaleX(${Math.max(0.04, Math.min(1, p))})`;
    if (status) this.status.textContent = status;
  }
  refreshArt(): void {
    this.el.querySelectorAll<HTMLElement>('.boot-sky .float').forEach((n, i) => {
      const id = ['carrot', 'kiwifruit', 'banana', 'broccoli', 'milk', 'water', 'strawberry', 'corn'][i];
      n.innerHTML = foodPic(id, 'food-pic');
    });
  }
  ready(focus: boolean): void {
    this.setProgress(1, '');
    this.el.classList.add('ready');
    this.playBtn.classList.remove('hidden');
    if (focus) this.playBtn.focus({ preventScroll: true });
  }
}

// ------------------------------------------------------------------ title
export class TitleScreen extends Screen {
  constructor(private app: AppApi) {
    super('title');
    const logo = el('div', 'title-logo', logoSVG());
    const tag = el('p', 'tagline', `${glyph.heart}<span>Eat well, run far!</span>`);
    const head = el('div', 'title-head');
    head.append(logo, tag);
    const dock = el('div', 'dock title-dock');
    const play = button({ cls: 'primary huge', html: `${glyph.play}<span>Play</span>`, label: 'Play', onClick: () => { app.sound('select'); app.goCharacter(); } });
    play.dataset.autofocus = '';
    const book = button({ cls: 'chip-btn', html: `${glyph.book}<span>Food friends</span>`, label: 'Food Friends book', onClick: () => { app.sound('click'); app.openBook(); } });
    const settings = button({ cls: 'chip-btn', html: `${glyph.gear}<span>Settings</span>`, label: 'Settings', onClick: () => { app.sound('click'); app.openSettings(); } });
    const row = el('div', 'row');
    row.append(book, settings);
    if (app.device.desktopApp) row.append(button({ cls: 'chip-btn quiet', html: `${glyph.quit}<span>Quit</span>`, label: 'Quit', onClick: () => app.quitApp() }));
    dock.append(play, row);
    this.el.append(head, dock);
  }
}

// ------------------------------------------------------------------ character picker
export class CharacterScreen extends Screen {
  private cards = new Map<CharacterId, HTMLButtonElement>();
  constructor(private app: AppApi) {
    super('picker character');
    this.el.append(topBar("Who's running?", () => this.back()));
    const wrap = el('div', 'pick-cards kids');
    for (const c of CHARACTERS) {
      const b = button({
        cls: `pick-card kid-card ${c}`,
        html: `<span class="pick-art">${KID_ART[c]}</span><span class="pick-name">${KID_NAME[c]}</span><span class="tick">${glyph.check}</span>`,
        label: KID_NAME[c],
        onClick: () => this.choose(c, true),
      });
      b.style.setProperty('--accent', KID_COLOR[c]);
      b.dataset.selectOnFocus = '';
      b.addEventListener('focus', () => {
        if (document.documentElement.classList.contains('kbd') && this.app.save.state.character !== c) this.choose(c, true);
      });
      this.cards.set(c, b);
      wrap.append(b);
    }
    const dock = el('div', 'dock');
    const next = button({ cls: 'primary big', html: `<span>Next</span>${glyph.next}`, label: 'Next', onClick: () => { app.sound('select'); app.goRide(); } });
    dock.append(next);
    this.el.append(wrap, dock);
  }
  private choose(c: CharacterId, announce: boolean): void {
    this.app.selectCharacter(c, announce);
    this.sync();
  }
  sync(): void {
    const cur = this.app.save.state.character;
    for (const [c, b] of this.cards) {
      b.classList.toggle('selected', c === cur);
      b.setAttribute('aria-pressed', String(c === cur));
    }
  }
  protected override onShow(): void {
    this.sync();
    this.cards.get(this.app.save.state.character)?.focus({ preventScroll: true });
  }
  override back(): boolean {
    this.app.sound('back');
    this.app.goTitle();
    return true;
  }
}

// ------------------------------------------------------------------ ride picker
export class RideScreen extends Screen {
  private cards = new Map<RideId, HTMLButtonElement>();
  constructor(private app: AppApi) {
    super('picker ride');
    this.el.append(topBar('How will you go?', () => this.back()));
    const wrap = el('div', 'pick-cards rides');
    for (const r of RIDES) {
      const b = button({
        cls: `pick-card ride-card ${r}`,
        html: `<span class="pick-art">${RIDE_ICON[r]}</span><span class="pick-name">${RIDE_NAME[r]}</span><span class="tick">${glyph.check}</span>`,
        label: RIDE_NAME[r],
        onClick: () => this.choose(r, true),
      });
      b.addEventListener('focus', () => {
        if (document.documentElement.classList.contains('kbd') && this.app.save.state.ride !== r) this.choose(r, true);
      });
      this.cards.set(r, b);
      wrap.append(b);
    }
    const dock = el('div', 'dock');
    dock.append(button({ cls: 'primary big', html: `<span>Let's go!</span>${glyph.next}`, label: "Let's go", onClick: () => { app.sound('select'); app.afterRide(); } }));
    this.el.append(wrap, dock);
  }
  private choose(r: RideId, announce: boolean): void {
    this.app.selectRide(r, announce);
    this.sync();
  }
  sync(): void {
    const cur = this.app.save.state.ride;
    for (const [r, b] of this.cards) {
      b.classList.toggle('selected', r === cur);
      b.setAttribute('aria-pressed', String(r === cur));
    }
  }
  protected override onShow(): void {
    this.sync();
    this.cards.get(this.app.save.state.ride)?.focus({ preventScroll: true });
  }
  override back(): boolean {
    this.app.sound('back');
    this.app.goCharacter();
    return true;
  }
}

// ------------------------------------------------------------------ stage select
export class StageScreen extends Screen {
  private cards = new Map<StageId, HTMLButtonElement>();
  private list: HTMLElement;
  private goBtn: HTMLButtonElement;
  private endlessBtn: HTMLButtonElement;
  private selLabel: HTMLElement;
  private justUnlocked: StageId | null = null;

  constructor(private app: AppApi) {
    super('stages');
    const help = button({ cls: 'round', html: glyph.help, label: 'How to play', onClick: () => { app.sound('click'); app.startTutorial(); } });
    const book = button({ cls: 'round', html: glyph.book, label: 'Food Friends book', onClick: () => { app.sound('click'); app.openBook(); } });
    const gear = button({ cls: 'round', html: glyph.gear, label: 'Settings', onClick: () => { app.sound('click'); app.openSettings(); } });
    this.el.append(topBar('Where to?', () => this.back(), [help, book, gear]));
    this.list = el('div', 'stage-list');
    this.el.append(this.list);
    const dock = el('div', 'dock stage-dock');
    this.selLabel = el('div', 'sel-label');
    this.endlessBtn = button({ cls: 'endless', html: `${glyph.infinity}<span>Endless</span>`, label: 'Endless run', onClick: () => this.start('endless') });
    this.goBtn = button({ cls: 'primary big', html: `${glyph.play}<span>Go!</span>`, label: 'Go', onClick: () => this.start('adventure') });
    const btns = el('div', 'row');
    btns.append(this.endlessBtn, this.goBtn);
    dock.append(this.selLabel, btns);
    this.el.append(dock);
    this.build();
  }

  private build(): void {
    this.list.innerHTML = '';
    this.cards.clear();
    STAGES.forEach((s, i) => {
      const b = el('button', 'stage-card') as HTMLButtonElement;
      b.type = 'button';
      b.style.setProperty('--accent', STAGE_COLOR[s]);
      b.addEventListener('click', () => this.select(s, true));
      b.addEventListener('focus', () => {
        if (document.documentElement.classList.contains('kbd')) this.select(s, false);
      });
      b.addEventListener('dblclick', () => this.app.save.isUnlocked(s) && this.start('adventure'));
      this.cards.set(s, b);
      this.list.append(b);
      void i;
    });
  }

  private render(): void {
    const save = this.app.save;
    STAGES.forEach((s, i) => {
      const b = this.cards.get(s)!;
      const p = save.stage(s);
      const locked = !p.unlocked;
      const prev = i > 0 ? STAGE_NAME[STAGES[i - 1]] : '';
      b.classList.toggle('locked', locked);
      b.classList.toggle('cleared', p.cleared);
      b.classList.toggle('fresh', this.justUnlocked === s);
      b.setAttribute('aria-label', locked ? `${STAGE_NAME[s]} - locked. Finish ${prev} to open!` : STAGE_NAME[s]);
      const meta = locked
        ? `<span class="lock-note">${glyph.lock}<span>Finish ${prev} to open!</span></span>`
        : `${starRow(p.stars)}<span class="best">${p.bestDistance ? `<span class="best-endless best-adv">${glyph.mapPin}${fmtDist(p.bestDistance)}</span>` : '<span class="new-tag">New!</span>'}${p.bestEndless ? `<span class="best-endless">${glyph.infinity}${fmtDist(p.bestEndless)}</span>` : ''}</span>`;
      b.innerHTML = `
        <span class="stage-art">${STAGE_ART[s]}${locked ? `<span class="padlock">${glyph.lock}</span>` : ''}<span class="stage-num">${i + 1}</span>${p.cleared ? `<span class="cleared-badge">${glyph.check}</span>` : ''}</span>
        <span class="stage-info"><span class="stage-name">${STAGE_NAME[s]}</span><span class="stage-meta">${meta}</span></span>`;
    });
    this.sync();
  }

  select(s: StageId, user: boolean): void {
    const save = this.app.save;
    if (!save.isUnlocked(s)) {
      if (user) {
        this.app.sound('back');
        const c = this.cards.get(s)!;
        c.classList.remove('nudge');
        void c.offsetWidth;
        c.classList.add('nudge');
      }
      return;
    }
    if (save.state.stage !== s) {
      save.state.stage = s;
      save.write();
      this.app.previewStage(s);
      if (user) this.app.sound('select');
    }
    this.sync();
  }

  private sync(): void {
    const cur = this.app.save.state.stage;
    for (const [s, b] of this.cards) {
      b.classList.toggle('selected', s === cur);
      b.setAttribute('aria-pressed', String(s === cur));
    }
    const p = this.app.save.stage(cur);
    this.endlessBtn.classList.toggle('hidden', !p.cleared);
    this.selLabel.innerHTML = `<span class="sel-dot" style="--accent:${STAGE_COLOR[cur]}"></span><span>${STAGE_NAME[cur]}</span>`;
  }

  private start(mode: 'adventure' | 'endless'): void {
    const s = this.app.save.state.stage;
    if (!this.app.save.isUnlocked(s)) return;
    this.app.sound('select');
    this.app.startStage(s, mode);
  }

  /** Highlight a newly opened stage the next time the list shows. */
  markUnlocked(s: StageId | null): void {
    this.justUnlocked = s;
  }

  protected override onShow(): void {
    this.render();
    const cur = this.cards.get(this.app.save.state.stage);
    cur?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    this.goBtn.focus({ preventScroll: true });
    if (this.justUnlocked) {
      const s = this.justUnlocked;
      window.setTimeout(() => this.cards.get(s)?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' }), 300);
      window.setTimeout(() => {
        this.cards.get(s)?.classList.remove('fresh');
        this.justUnlocked = null;
      }, 2600);
    }
  }

  override back(): boolean {
    this.app.sound('back');
    this.app.goRide();
    return true;
  }
}

export const HEALTHY_IDS = HEALTHY.map((f) => f.id);
