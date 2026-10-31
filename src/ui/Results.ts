// Results: celebrates the healthy foods collected. Stars pop, food friends pop in one by one with
// their benefit pictures, NEW! friends glow, a new place banner, a gentle "sometimes foods" note.
import { STAGES, type StageId } from '../contracts';
import { FOOD_BY_ID } from '../content/foods';
import type { RunStats } from '../engine/api';
import type { RunOutcome } from '../app/Save';
import type { AppApi } from './ctx';
import { button, el, fmtDist, reducedMotion, Screen } from './dom';
import { benefitIcon, foodPic, junkIcon } from './foodArt';
import { EXTRA_ICON, glyph, STAGE_ART, STAGE_NAME } from './icons';

export interface ResultsActions {
  again(): void;
  next(stage: StageId): void;
  stages(): void;
  book(): void;
}

export class ResultsScreen extends Screen {
  private panel: HTMLElement;
  private dock: HTMLElement;
  private timers: number[] = [];

  constructor(private app: AppApi, private act: ResultsActions) {
    super('results');
    this.panel = el('div', 'res-panel');
    this.dock = el('div', 'dock res-dock');
    const card = el('div', 'res-card');
    card.append(this.panel, this.dock);
    this.el.append(card);
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, reducedMotion() ? Math.min(ms, 60) : ms));
  }

  present(stats: RunStats, out: RunOutcome): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    const finished = stats.finished && stats.mode === 'adventure';
    const great = finished && stats.stars >= 2;
    const title =
      stats.mode === 'endless' ? (out.bestEndless ? 'New best!' : 'What a run!') : finished ? (stats.stars >= 3 ? 'Amazing!' : 'You made it!') : 'Great try!';
    const healthy = Object.entries(stats.healthy ?? {})
      .filter(([id, n]) => FOOD_BY_ID[id] && n > 0)
      .sort((a, b) => b[1] - a[1]);
    const junk = Object.entries(stats.junk ?? {}).filter(([id, n]) => FOOD_BY_ID[id] && n > 0);
    const newSet = new Set(out.newFoods);
    const stars = stats.mode === 'endless' ? -1 : stats.stars;

    const starRow =
      stars >= 0
        ? `<div class="big-stars">${[0, 1, 2].map((i) => `<span class="bst" data-i="${i}">${glyph.star}</span>`).join('')}</div>`
        : `<div class="big-endless">${glyph.infinity}</div>`;
    const best = stats.mode === 'endless' ? out.bestEndless : out.bestDistance;
    this.panel.innerHTML = `
      <div class="res-head">
        ${starRow}
        <h2 class="res-title">${title}</h2>
        <div class="res-stats">
          <span class="stat">${glyph.mapPin}<b>${fmtDist(stats.distance)}</b>${best ? '<em class="best-tag">Best!</em>' : ''}</span>
          <span class="stat">${foodPic('carrot', 'food-pic tiny')}<b>${stats.healthyTotal}</b></span>
          ${stats.nearMisses ? `<span class="stat">${glyph.sparkle}<b>${stats.nearMisses}</b><small>close calls</small></span>` : ''}
          ${stats.happyAndHealthy ? `<span class="stat glow">${EXTRA_ICON.glow}<b>×${stats.happyAndHealthy}</b></span>` : ''}
        </div>
      </div>
      ${junk.length ? `<div class="res-junk"><span class="rj-pic">${EXTRA_ICON.treat}</span><span class="rj-text"><b>Treats are sometimes foods!</b><span class="rj-foods">${junk.map(([id]) => `<span class="rj-f">${foodPic(id, 'food-pic tiny')}<span class="rj-fx">${junkIcon(FOOD_BY_ID[id].junk ?? 'sugar')}</span></span>`).join('')}</span></span></div>` : ''}
      ${out.unlockedStage ? `<div class="res-unlock hidden"><span class="u-art">${STAGE_ART[out.unlockedStage]}</span><span class="u-text"><b>New place open!</b><span>${STAGE_NAME[out.unlockedStage]}</span></span><span class="u-ic">${glyph.sparkle}</span></div>` : ''}
      <div class="res-foods-wrap">
        ${healthy.length ? `<h3 class="res-sub">${glyph.heart}<span>Food friends you ate</span></h3>` : `<h3 class="res-sub">${glyph.heart}<span>Grab healthy food next time!</span></h3>`}
        <div class="res-foods">${healthy
          .map(
            ([id, n], i) => `<div class="rf ${newSet.has(id) ? 'is-new' : ''}" style="--i:${i}">
              <span class="rf-pic">${foodPic(id, 'food-pic')}</span>
              <span class="rf-fx">${benefitIcon(FOOD_BY_ID[id].benefit ?? 'tummy')}</span>
              <b class="rf-n">×${n}</b>
              ${newSet.has(id) ? '<span class="new-badge">NEW!</span>' : ''}
            </div>`,
          )
          .join('')}</div>
      </div>
    `;

    // ----- pinned actions (Run again is always the primary)
    this.dock.innerHTML = '';
    const again = button({ cls: 'primary big', html: `${glyph.retry}<span>Run again</span>`, label: 'Run again', onClick: () => { this.app.sound('select'); this.act.again(); } });
    again.dataset.autofocus = '';
    const i = STAGES.indexOf(stats.stage);
    const next = STAGES[i + 1];
    const row = el('div', 'row');
    row.append(again);
    if (stats.mode === 'adventure' && finished && next && this.app.save.isUnlocked(next))
      row.append(button({ cls: 'accent big', html: `<span>Next<span class="opt"> place</span></span>${glyph.next}`, label: `Next: ${STAGE_NAME[next]}`, onClick: () => { this.app.sound('select'); this.act.next(next); } }));
    const row2 = el('div', 'row small-row');
    row2.append(
      button({ cls: 'chip-btn', html: `${glyph.stages}<span>Places</span>`, label: 'Pick a place', onClick: () => { this.app.sound('click'); this.act.stages(); } }),
      button({ cls: 'chip-btn', html: `${glyph.book}<span>Book</span>`, label: 'Food Friends book', onClick: () => { this.app.sound('click'); this.act.book(); } }),
    );
    this.dock.append(row, row2);

    // ----- choreography
    const a = this.app;
    if (stars >= 0) {
      for (let s = 0; s < 3; s++) {
        this.later(380 + s * 380, () => {
          const e = this.panel.querySelector(`.bst[data-i="${s}"]`);
          if (!e) return;
          if (s < stars) {
            e.classList.add('on');
            a.sound('star');
          } else e.classList.add('dim');
        });
      }
    }
    const foodStart = 380 + 3 * 380;
    const tiles = Array.from(this.panel.querySelectorAll<HTMLElement>('.rf'));
    tiles.forEach((t, k) => {
      this.later(foodStart + k * 150, () => {
        t.classList.add('in');
        if (k < 10) a.audio.playSfx('ui_select', { volume: 0.35, rate: 1 + k * 0.04 });
      });
    });
    const after = foodStart + tiles.length * 150 + 200;
    if (out.unlockedStage) {
      this.later(after, () => {
        this.panel.querySelector('.res-unlock')?.classList.remove('hidden');
        a.sound('unlock');
      });
    }

    // ----- voices (narrator lines queue; character lines overlap gently)
    const kid = stats.character;
    const narr = stats.mode === 'endless' ? 'results' : !finished ? 'results_try' : stats.stars >= 3 ? 'results_great' : 'results';
    a.voice('narrator', narr, { interrupt: true, delay: 0.3 });
    a.voice(kid, great || (stats.mode === 'endless' && stats.healthyTotal > 10) ? 'results_great' : 'results_ok', { delay: 0.9, priority: true });
    if (out.newFoods.some((id) => FOOD_BY_ID[id]?.kind === 'healthy')) {
      this.later(2200, () => {
        a.voice(kid, 'new_food', { priority: true });
        a.voice('narrator', 'new_food');
      });
    }
    if (out.unlockedStage) this.later(after + 200, () => {
      a.voice(kid, 'unlock', { priority: true });
      a.voice('narrator', 'unlock');
    });
    if (stats.stage === 'parks' && finished && (stats.seasonsSeen?.length ?? 0) >= 4) a.voice('narrator', 'last_season');
    if (junk.length) this.later(after + 600, () => a.voice('narrator', 'sometimes'));
  }

  protected override onHide(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  override back(): boolean {
    this.app.sound('back');
    this.act.stages();
    return true;
  }
}
