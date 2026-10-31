// Menu screens: boot, title, character picker, ride picker, stage select.
import { CHARACTERS, RIDES, STAGES, type CharacterId, type RideId, type RunMode, type StageId } from '../contracts';
import type { WarmupView } from './Stretch';
import { HEALTHY } from '../content/foods';
import type { AppApi } from './ctx';
import { button, el, fmtDist, Screen } from './dom';
import { foodPic } from './foodArt';
import {
  glyph,
  KID_ART,
  KID_COLOR,
  KID_NAME,
  KID_SHOE,
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
        <div class="boot-kids" aria-hidden="true"><span class="kid-bubble ace">${KID_ART.ace}</span><span class="kid-bubble ciela">${KID_ART.ciela}</span></div>
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
  readonly warm: WarmupView;
  constructor(private app: AppApi) {
    super('picker character');
    this.el.append(topBar("Who's running?", () => this.back()));
    this.warm = app.newWarmView();
    const wrap = el('div', 'pick-cards kids');
    for (const c of CHARACTERS) {
      const b = button({
        cls: `pick-card kid-card ${c}`,
        html: `<span class="pick-art">${KID_ART[c]}<span class="kid-shoe">${KID_SHOE[c]}</span></span><span class="pick-name">${KID_NAME[c]}</span><span class="tick">${glyph.check}</span>`,
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
    this.el.append(wrap, dock, this.warm.el);
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
  private goBtn: HTMLButtonElement;
  private dest: HTMLElement;
  private entryRide: RideId = 'shoes';
  readonly warm: WarmupView;
  constructor(private app: AppApi) {
    super('picker ride');
    this.el.append(topBar('How will you go?', () => this.back()));
    this.warm = app.newWarmView();
    const wrap = el('div', 'pick-cards rides');
    for (const r of RIDES) {
      const b = button({
        cls: `pick-card ride-card ${r}`,
        html: `<span class="pick-art">${RIDE_ICON[r]}</span><span class="pick-name">${RIDE_NAME[r]}</span><span class="tick">${glyph.check}</span>`,
        label: RIDE_NAME[r],
        onClick: (e) => {
          // Enter / Space on the ride that is already picked = go (arrows/A/D pick, Enter goes).
          if (e.detail === 0 && this.app.save.state.ride === r) return this.go();
          this.choose(r, true);
        },
      });
      b.addEventListener('dblclick', () => this.app.save.state.ride === r && this.go());
      b.addEventListener('focus', () => {
        if (document.documentElement.classList.contains('kbd') && this.app.save.state.ride !== r) this.choose(r, true);
      });
      this.cards.set(r, b);
      wrap.append(b);
    }
    const dock = el('div', 'dock ride-dock');
    this.dest = el('div', 'dest hidden');
    this.goBtn = button({ cls: 'primary big ride-go', html: `<span>Let's go!</span>${glyph.next}`, label: "Let's go", onClick: () => this.go() });
    dock.append(this.dest, this.goBtn);
    this.el.append(wrap, dock, this.warm.el);
  }
  private go(): void {
    this.app.sound('select');
    this.app.afterRide();
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
    const pending = this.app.pendingRun();
    this.el.classList.toggle('repick', !!pending);
    const same = !!pending && cur === this.entryRide;
    this.goBtn.className = `btn primary ride-go ${pending ? 'huge' : 'big'} ${same ? 'same' : ''}`;
    this.goBtn.innerHTML = same ? `<span class="go-ride">${RIDE_ICON[cur]}</span><span>Same ride!</span>${glyph.play}` : `<span>Let's go!</span>${glyph.next}`;
    const label = same ? `Same ride: ${RIDE_NAME[cur]}` : "Let's go";
    this.goBtn.setAttribute('aria-label', label);
    this.goBtn.title = label;
  }
  protected override onShow(): void {
    this.entryRide = this.app.save.state.ride;
    const pending = this.app.pendingRun();
    this.dest.classList.toggle('hidden', !pending);
    if (pending) {
      this.dest.innerHTML = `<span class="dest-art">${STAGE_ART[pending.stage]}</span><span class="dest-name">${pending.mode === 'endless' ? glyph.infinity : ''}<span>${STAGE_NAME[pending.stage]}</span></span>`;
      this.dest.style.setProperty('--accent', STAGE_COLOR[pending.stage]);
    }
    this.sync();
    (pending ? this.goBtn : this.cards.get(this.app.save.state.ride))?.focus({ preventScroll: true });
  }
  override back(): boolean {
    this.app.sound('back');
    if (this.app.pendingRun()) this.app.goStages();
    else this.app.goCharacter();
    return true;
  }
}

// ------------------------------------------------------------------ place intro (brief, auto-advancing)
export class IntroScreen extends Screen {
  readonly warm: WarmupView;
  private art: HTMLElement;
  private name: HTMLElement;
  private chips: HTMLElement;
  private goBtn: HTMLButtonElement;
  private bar: HTMLElement;
  private timer = 0;
  private left = 0;
  static readonly AUTO_S = 5;

  constructor(private app: AppApi, private act: { go(): void; back(): void }) {
    super('intro');
    this.el.append(topBar('Get ready!', () => this.back()));
    this.warm = app.newWarmView();
    const card = el('div', 'intro-card');
    this.art = el('span', 'intro-art');
    this.name = el('h2', 'intro-name');
    this.chips = el('div', 'intro-chips');
    this.goBtn = button({ cls: 'primary huge intro-go', html: `${glyph.play}<span>Go!</span><i class="auto-bar"></i>`, label: 'Go', onClick: () => this.go() });
    this.goBtn.dataset.autofocus = '';
    this.bar = this.goBtn.querySelector('.auto-bar')!;
    const info = el('div', 'intro-info');
    info.append(this.name, this.chips);
    card.append(this.art, info, this.goBtn);
    this.el.append(card, this.warm.el);
  }

  present(stage: StageId, mode: RunMode, ride: RideId): void {
    this.art.innerHTML = STAGE_ART[stage];
    this.art.style.setProperty('--accent', STAGE_COLOR[stage]);
    this.name.textContent = STAGE_NAME[stage];
    this.chips.innerHTML = `<span class="chip">${mode === 'endless' ? `${glyph.infinity}<span>Endless</span>` : `${glyph.star}<span>Adventure</span>`}</span><span class="chip ride-chip"><span class="chip-ic">${RIDE_ICON[ride]}</span><span>${RIDE_NAME[ride]}</span></span>`;
  }

  private go(): void {
    clearInterval(this.timer);
    this.app.sound('select');
    this.act.go();
  }

  protected override onShow(): void {
    clearInterval(this.timer);
    this.left = IntroScreen.AUTO_S;
    this.bar.style.transform = 'scaleX(0)';
    this.timer = window.setInterval(() => {
      if (!this.shown) return clearInterval(this.timer);
      // A running "Stretch with me!" routine holds the auto-start until it's done.
      if (this.app.warmGuided()) return;
      this.left -= 0.1;
      this.bar.style.transform = `scaleX(${Math.min(1, 1 - this.left / IntroScreen.AUTO_S).toFixed(3)})`;
      if (this.left <= 0) this.go();
    }, 100);
  }

  protected override onHide(): void {
    clearInterval(this.timer);
  }

  override back(): boolean {
    clearInterval(this.timer);
    this.app.sound('back');
    this.act.back();
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
