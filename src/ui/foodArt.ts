// Food pictures for the UI. Uses the food module's rendered thumbnails + benefit/junk icons
// (src/food/thumbnails.ts, src/food/icons.ts) when present, and friendly built-in stand-ins
// otherwise, so the UI never shows a broken image.
import type { BenefitId, JunkEffectId } from '../contracts';
import { FOODS, FOOD_BY_ID } from '../content/foods';
import { EXTRA_ICON } from './icons';

interface ThumbModule {
  renderFoodThumbnails(size?: number): Promise<Record<string, string>>;
  foodThumbnail(id: string): string | null;
}
interface IconModule {
  benefitIconSVG(b: BenefitId): string;
  junkIconSVG(j: JunkEffectId): string;
}

// Optional modules: the glob resolves to {} when the files do not exist yet.
const thumbMods = import.meta.glob<ThumbModule>('../food/thumbnails.ts');
const iconMods = import.meta.glob<IconModule>('../food/icons.ts');

let thumbs: Record<string, string> = {};
let icons: IconModule | null = null;
let ready: Promise<void> | null = null;

const EMOJI: Record<string, string> = {
  carrot_sticks: '🥕', carrot: '🥕', broccoli: '🥦', spinach: '🥬', peas: '🫛', milk: '🥛', yoghurt: '🥣', cheese: '🧀',
  orange: '🍊', kiwifruit: '🥝', feijoa: '🍐', strawberry: '🍓', banana: '🍌', corn: '🌽', kumara: '🍠', bread: '🍞',
  water: '💧', watermelon: '🍉', egg: '🥚', chicken: '🍗', fish: '🐟', nuts: '🥜', apple_slices: '🍎', fruit_salad: '🥗',
  veggie_bowl: '🍚', veggie_soup: '🍲', fizzy_can: '🥤', fizzy_bottle: '🍾', doughnut: '🍩', lollies: '🍬', chocolate: '🍫',
  ice_cream: '🍦', chips: '🥔', hot_chips: '🍟', mouldy_bread: '🍞', smelly_fish: '🐟',
};

/** Starts (once) loading the optional food art modules and rendering thumbnails. Never rejects. */
export function loadFoodArt(size = 160, timeoutMs = 6000): Promise<void> {
  if (ready) return ready;
  const work = (async () => {
    try {
      const im = Object.values(iconMods)[0];
      if (im) icons = await im();
    } catch (e) {
      console.warn('[ui] food icons unavailable', e);
    }
    try {
      const tm = Object.values(thumbMods)[0];
      if (tm) {
        const m = await tm();
        thumbs = (await m.renderFoodThumbnails(size)) || {};
      }
    } catch (e) {
      console.warn('[ui] food thumbnails unavailable', e);
    }
  })();
  ready = Promise.race([work, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
  return ready;
}

export function hasRealThumbnails(): boolean {
  return Object.keys(thumbs).length > 0;
}

/** <img> or emoji stand-in markup for a food. */
export function foodPic(id: string, cls = 'food-pic'): string {
  const url = thumbs[id];
  const name = FOOD_BY_ID[id]?.name ?? id;
  if (url) return `<img class="${cls}" src="${url}" alt="${name}" draggable="false">`;
  return `<span class="${cls} emoji" role="img" aria-label="${name}">${EMOJI[id] ?? '🍽️'}</span>`;
}

const FALLBACK_BENEFIT: Record<BenefitId, [string, string]> = {
  vision: ['#ff9a3c', '<path d="M10 32c6-9 14-14 22-14s16 5 22 14c-6 9-14 14-22 14s-16-5-22-14z" fill="#fff"/><circle cx="32" cy="32" r="8" fill="#2b3440"/><path d="M34 26l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="#ffe066"/>'],
  muscles: ['#4fae5a', '<path d="M14 44c0-10 4-20 12-24l4 6-4 4c6-2 14 0 18 6 2 4 0 10-6 10H18c-2 0-4-1-4-2z" fill="#ffd2a8"/><path d="M30 34c4-3 9-3 12 0" stroke="#c98f5a" stroke-width="2.4" fill="none"/>'],
  bones: ['#5a8dee', '<path d="M20 18c6-4 10 2 12 2s6-6 12-2 2 12 0 18c-1 5-2 12-5 12-3 0-3-8-7-8s-4 8-7 8-4-7-5-12c-2-6-6-14 0-18z" fill="#fff"/>'],
  shield: ['#ff9a3c', '<path d="M32 12l18 6v12c0 12-8 20-18 24-10-4-18-12-18-24V18z" fill="#fff"/><path d="M24 32l6 6 10-12" stroke="#ff9a3c" stroke-width="4" fill="none" stroke-linecap="round"/>'],
  energy: ['#ffc94a', '<path d="M36 10L18 36h12l-4 18 20-28H34z" fill="#fff"/>'],
  refresh: ['#3f9fd8', '<path d="M32 12c8 12 14 18 14 26a14 14 0 0 1-28 0c0-8 6-14 14-26z" fill="#fff"/>'],
  grow: ['#e85d8a', '<rect x="16" y="36" width="8" height="14" rx="2" fill="#fff"/><rect x="28" y="28" width="8" height="22" rx="2" fill="#fff"/><rect x="40" y="18" width="8" height="32" rx="2" fill="#fff"/>'],
  tummy: ['#7cc46a', '<circle cx="32" cy="34" r="16" fill="#fff"/><path d="M24 36c4 5 12 5 16 0" stroke="#7cc46a" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M32 18c-4-4-10-2-10 3 0 4 10 9 10 9s10-5 10-9c0-5-6-7-10-3z" fill="#ff7a6b"/>'],
};
const FALLBACK_JUNK: Record<JunkEffectId, [string, string]> = {
  sugar: ['#b59cf0', '<circle cx="24" cy="38" r="6" fill="#fff"/><circle cx="38" cy="28" r="5" fill="#fff"/><circle cx="34" cy="44" r="3.6" fill="#fff"/><circle cx="44" cy="40" r="2.6" fill="#fff"/>'],
  teeth: ['#ff9fc0', '<path d="M20 18c6-4 10 2 12 2s6-6 12-2 2 12 0 18c-1 5-2 12-5 12-3 0-3-8-7-8s-4 8-7 8-4-7-5-12c-2-6-6-14 0-18z" fill="#fff"/><circle cx="38" cy="28" r="2.6" fill="#8a6a50"/>'],
  freeze: ['#5a8dee', '<path d="M32 14v36M16 23l32 18M16 41l32-18" stroke="#fff" stroke-width="4" stroke-linecap="round"/>'],
  slow: ['#c98f5a', '<path d="M12 40c0-8 8-14 16-14s14 6 14 12H12z" fill="#fff"/><circle cx="46" cy="36" r="5" fill="#fff"/>'],
  tummy: ['#7fdcc0', '<circle cx="32" cy="34" r="16" fill="#fff"/><path d="M22 38c3-3 5 3 8 0s5 3 8 0 4 2 4 2" stroke="#2fb5a8" stroke-width="3" fill="none" stroke-linecap="round"/>'],
};
const disc = (c: string, body: string) => `<svg class="ico" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="${c}"/>${body}</svg>`;

export function benefitIcon(b: BenefitId | 'magnet'): string {
  if (b === 'magnet') return EXTRA_ICON.magnet;
  try {
    if (icons) return icons.benefitIconSVG(b);
  } catch {
    /* fall through */
  }
  const f = FALLBACK_BENEFIT[b];
  return f ? disc(f[0], f[1]) : EXTRA_ICON.glow;
}

export function junkIcon(j: JunkEffectId | 'slump'): string {
  if (j === 'slump') return EXTRA_ICON.slump;
  try {
    if (icons) return icons.junkIconSVG(j);
  } catch {
    /* fall through */
  }
  const f = FALLBACK_JUNK[j];
  return f ? disc(f[0], f[1]) : EXTRA_ICON.treat;
}

export const ALL_FOOD_IDS = FOODS.map((f) => f.id);
