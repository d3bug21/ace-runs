// Food Friends book: every food as a card; discovered ones show the picture + benefit picture,
// undiscovered ones are friendly "?" silhouettes. Two pages: everyday / sometimes foods.
import type { FoodDef } from '../contracts';
import { BENEFIT_LABEL, BENEFIT_POWER, HEALTHY, JUNK, JUNK_LABEL } from '../content/foods';
import type { AppApi } from './ctx';
import { button, el, Screen } from './dom';
import { benefitIcon, foodPic, junkIcon } from './foodArt';
import { EXTRA_ICON, glyph } from './icons';

type Tab = 'everyday' | 'sometimes';

export class BookScreen extends Screen {
  private tab: Tab = 'everyday';
  private grid: HTMLElement;
  private count: HTMLElement;
  private tabs = new Map<Tab, HTMLButtonElement>();
  private detail: HTMLElement;
  private detailOpen = false;
  private lastCard: HTMLElement | null = null;
  onClose: () => void = () => undefined;
  private bar!: HTMLElement;
  private page!: HTMLElement;

  constructor(private app: AppApi) {
    super('book');
    const bar = el('header', 'topbar');
    bar.append(button({ cls: 'round back', html: glyph.back, label: 'Back', onClick: () => this.back() }));
    bar.append(el('h2', 'screen-title', `<span class="pill-title">${glyph.book}<span>Food friends</span></span>`));
    this.count = el('div', 'book-count');
    const right = el('div', 'topbar-right');
    right.append(this.count);
    bar.append(right);
    const tabs = el('div', 'tabs');
    tabs.setAttribute('role', 'tablist');
    const mk = (t: Tab, html: string, label: string) => {
      const b = button({ cls: `tab tab-${t}`, html, label, onClick: () => this.setTab(t, true) });
      b.setAttribute('role', 'tab');
      this.tabs.set(t, b);
      tabs.append(b);
    };
    mk('everyday', `${foodPic('broccoli', 'food-pic tiny')}<span>Everyday foods</span>`, 'Everyday foods');
    mk('sometimes', `${EXTRA_ICON.treat}<span>Sometimes foods</span>`, 'Sometimes foods');
    this.grid = el('div', 'book-grid');
    const page = el('div', 'book-page');
    page.append(tabs, this.grid);
    this.detail = el('div', 'book-detail hidden');
    this.detail.addEventListener('click', (e) => {
      if (e.target === this.detail) this.closeDetail();
    });
    this.bar = bar;
    this.page = page;
    this.el.append(bar, page, this.detail);
  }

  private setTab(t: Tab, user: boolean): void {
    if (user && t !== this.tab) this.app.sound('page');
    this.tab = t;
    this.render();
  }

  private render(): void {
    const save = this.app.save;
    for (const [t, b] of this.tabs) {
      b.classList.toggle('on', t === this.tab);
      b.setAttribute('aria-selected', String(t === this.tab));
    }
    const all = [...HEALTHY, ...JUNK];
    this.count.innerHTML = `${glyph.star}<b>${save.discoveredCount(all.map((f) => f.id))}</b><span>/ ${all.length}</span><span class="lbl">found</span>`;
    const list = this.tab === 'everyday' ? HEALTHY : JUNK;
    this.grid.className = `book-grid ${this.tab}`;
    this.grid.innerHTML = '';
    for (const f of list) {
      const rec = save.state.foods[f.id];
      const found = !!rec && rec.count > 0;
      const fx = f.kind === 'healthy' ? benefitIcon(f.benefit ?? 'tummy') : junkIcon(f.junk ?? 'sugar');
      const card = button({
        cls: `food-card ${found ? 'found' : 'mystery'} ${f.kind}`,
        html: found
          ? `<span class="fcard-pic">${foodPic(f.id, 'food-pic')}</span><span class="fcard-fx">${fx}</span><span class="fcard-name">${f.name}</span><span class="fcard-n">×${rec.count}</span>`
          : `<span class="fcard-pic"><span class="mystery-blob">${foodPic(f.id, 'food-pic')}</span><span class="q">?</span></span><span class="fcard-name">???</span>`,
        label: found ? f.name : 'Not found yet',
        onClick: () => {
          this.lastCard = card;
          if (found) this.openDetail(f, rec.count);
          else {
            this.app.sound('back');
            card.classList.remove('nudge');
            void card.offsetWidth;
            card.classList.add('nudge');
          }
        },
      });
      this.grid.append(card);
    }
  }

  private openDetail(f: FoodDef, count: number): void {
    this.app.sound('click');
    const good = f.kind === 'healthy';
    const fx = good ? benefitIcon(f.benefit ?? 'tummy') : junkIcon(f.junk ?? 'sugar');
    const label = good ? BENEFIT_LABEL[f.benefit ?? 'tummy'] : JUNK_LABEL[f.junk ?? 'sugar'];
    const power = good ? BENEFIT_POWER[f.benefit ?? 'tummy'] : 'A sometimes treat';
    const card = el('div', `detail-card ${f.kind}`);
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', f.name);
    card.innerHTML = `
      <span class="d-pic">${foodPic(f.id, 'food-pic')}</span>
      <span class="d-eq">${good ? '=' : '→'}</span>
      <span class="d-fx">${fx}</span>
      <div class="d-text"><h3>${f.name}</h3><p class="d-label">${label}</p><p class="d-blurb">${f.blurb}</p><p class="d-meta">${good ? `${glyph.sparkle}<span>${power}</span>` : `${EXTRA_ICON.treat}<span>Sometimes food</span>`}<span class="d-count">×${count}</span></p></div>`;
    const close = button({ cls: 'round close', html: glyph.close, label: 'Close', onClick: () => this.closeDetail() });
    close.dataset.autofocus = '';
    card.append(close);
    this.detail.innerHTML = '';
    this.detail.append(card);
    this.detail.classList.remove('hidden');
    this.detailOpen = true;
    this.bar.setAttribute('inert', '');
    this.page.setAttribute('inert', '');
    close.focus({ preventScroll: true });
    if (good && f.benefit) this.app.voice('narrator', `benefit_${f.benefit}`, { interrupt: true });
    else if (f.junk) this.app.voice('narrator', `junk_${f.junk}`, { interrupt: true });
  }

  private closeDetail(): void {
    if (!this.detailOpen) return;
    this.app.sound('back');
    this.detailOpen = false;
    this.detail.classList.add('hidden');
    this.bar.removeAttribute('inert');
    this.page.removeAttribute('inert');
    this.lastCard?.focus({ preventScroll: true });
  }

  protected override onShow(): void {
    this.detailOpen = false;
    this.detail.classList.add('hidden');
    this.bar.removeAttribute('inert');
    this.page.removeAttribute('inert');
    this.render();
    this.tabs.get(this.tab)?.focus({ preventScroll: true });
    this.app.voice('narrator', 'book', { interrupt: true });
  }

  /** The active focus/nav root (detail popover when open). */
  navRoot(): HTMLElement {
    return this.detailOpen ? this.detail : this.el;
  }

  override back(): boolean {
    if (this.detailOpen) {
      this.closeDetail();
      return true;
    }
    this.app.sound('back');
    this.onClose();
    return true;
  }
}
