// Picture icons for the "food friends" book and the results screen.
// Each food's benefit (or gentle junk effect) is shown as a picture a child under five can
// read without words. Flat, rounded, ink-outlined shapes on a soft circular badge.
//
// Design notes
//   * viewBox 0 0 64 64, width/height 100% so the container sizes the icon.
//   * No <defs>, gradients, filters or ids at all: many icons are inlined on one page (and
//     the same icon may appear twice), so everything is plain shapes and never collides.
//   * Compound silhouettes use the "stroke-under" trick (fat ink stroke behind, flat fill on
//     top) so overlapping parts read as one clean outline.
//   * Colours are the game's PAL hexes (src/kit/kit.ts) plus a few soft tints of them.
//   * Healthy badges: warm cream with a mint ring. Junk badges: soft lilac-grey with a dotted
//     lilac ring. Both stay kind; junk pictures are funny, never gross, never about body size.

import type { BenefitId, JunkEffectId } from '../contracts';

// ---------------------------------------------------------------- palette (PAL hexes)
const INK = '#2b3440';
const CREAM = '#fff4e0';
const WHITE = '#ffffff';
const SKY = '#9fd6f0';
const SKY_WARM = '#ffe2b8';
const GRASS = '#7cc46a';
const LEAF = '#4fae5a';
const WOOD = '#c98f5a';
const CORAL = '#ff7a6b';
const PEACH = '#ffb38a';
const SUN = '#ffc94a';
const LEMON = '#ffe066';
const MINT = '#7fdcc0';
const TEAL = '#2fb5a8';
const SEA = '#3f9fd8';
const BLUE = '#5a8dee';
const LILAC = '#b59cf0';
const BERRY = '#e85d8a';
const PINK = '#ff9fc0';
const ORANGE = '#ff9a3c';
const SLATE = '#66727f';

// soft tints derived from PAL (for badges, highlights and gentle junk tones)
const BONE = '#fffaf0';
const SKIN = '#f6b98e';
const SKIN_SHADE = '#e9a073';
const ICE = '#dcf1fb';
const SODA = '#ffd0df';
const QUEASY = '#c7e3a2';
const TOFFEE = '#b9783f';

const SW = 2.5; // ink stroke weight in viewBox units

// ---------------------------------------------------------------- tiny helpers
const n = (v: number): string => String(Math.round(v * 100) / 100);

/** Maps every absolute x,y pair of a path drawn in a unit box into a target box. */
function boxPath(d: string, x: number, y: number, w: number, h: number): string {
  const parts = d.trim().split(/\s+/);
  const out: string[] = [];
  let axis = 0;
  for (const p of parts) {
    if (/^[A-Za-z]$/.test(p)) {
      out.push(p);
      axis = 0;
      continue;
    }
    const v = Number(p);
    out.push(n(axis === 0 ? x + v * w : y + v * h));
    axis = 1 - axis;
  }
  return out.join(' ');
}

/** Four-point twinkle star. */
function sparkle(cx: number, cy: number, r: number, fill: string = SUN, sw = 1.8): string {
  const k = r * 0.2;
  const d =
    `M${n(cx)} ${n(cy - r)} Q${n(cx + k)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} ` +
    `Q${n(cx + k)} ${n(cy + k)} ${n(cx)} ${n(cy + r)} Q${n(cx - k)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} ` +
    `Q${n(cx - k)} ${n(cy - k)} ${n(cx)} ${n(cy - r)}Z`;
  return `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

/** Five-point star path (rounded by the round line-join of its outline). */
function star5D(cx: number, cy: number, R: number, r: number, rot = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = ((rot + i * 36) * Math.PI) / 180;
    const rr = i % 2 === 0 ? R : r;
    pts.push(`${n(cx + Math.cos(a) * rr)} ${n(cy + Math.sin(a) * rr)}`);
  }
  return `M${pts.join(' L')}Z`;
}

/** Union of shapes: fat ink stroke behind, flat fill on top (one clean outline). */
function union(shapes: string, fill: string, sw: number = SW): string {
  return (
    `<g fill="${INK}" stroke="${INK}" stroke-width="${sw * 2}" stroke-linejoin="round">${shapes}</g>` +
    `<g fill="${fill}" stroke="none">${shapes}</g>`
  );
}

/** Molar silhouette in a unit box (two roots, soft crown). */
const TOOTH_UNIT =
  'M 0 .24 C 0 .05 .2 -.03 .5 .1 C .8 -.03 1 .05 1 .24 C 1 .46 .96 .62 .9 .86 C .86 1.03 .71 1.03 .68 .86 ' +
  'L .63 .68 C .59 .58 .41 .58 .37 .68 L .32 .86 C .29 1.03 .14 1.03 .1 .86 C .04 .62 0 .46 0 .24 Z';

/** Same molar with a taller crown (room for a face). */
const TOOTH_TALL_UNIT =
  'M 0 .22 C 0 .04 .2 -.03 .5 .09 C .8 -.03 1 .04 1 .22 C 1 .5 .97 .66 .92 .88 C .88 1.03 .72 1.03 .69 .88 ' +
  'L .64 .8 C .6 .72 .4 .72 .36 .8 L .31 .88 C .28 1.03 .12 1.03 .08 .88 C .03 .66 0 .5 0 .22 Z';

const shadow = (cx: number, cy: number, rx: number): string =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(rx * 0.22)}" fill="${INK}" opacity="0.1"/>`;

const blush = (cx: number, cy: number, r = 2.2): string =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(r)}" ry="${n(r * 0.62)}" fill="${CORAL}" opacity="0.45"/>`;

/** Happy closed "^" eye. */
const happyEye = (cx: number, cy: number, w = 2.6): string =>
  `<path d="M${n(cx - w)} ${n(cy + 1)} Q${n(cx)} ${n(cy - w * 0.9)} ${n(cx + w)} ${n(cy + 1)}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;

const dotEye = (cx: number, cy: number, r = 1.6): string =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${INK}"/>` +
  `<circle cx="${n(cx + r * 0.35)}" cy="${n(cy - r * 0.4)}" r="${n(r * 0.38)}" fill="${WHITE}"/>`;

// ---------------------------------------------------------------- badges
type Kind = 'healthy' | 'junk';

function badge(kind: Kind): string {
  if (kind === 'healthy') {
    return (
      `<circle cx="32" cy="32" r="30" fill="${MINT}"/>` +
      `<circle cx="32" cy="32" r="27" fill="${CREAM}"/>` +
      `<path d="M12 22 A22 22 0 0 1 26 10.6" fill="none" stroke="${WHITE}" stroke-width="2.4" stroke-linecap="round" opacity="0.9"/>`
    );
  }
  return (
    `<circle cx="32" cy="32" r="30" fill="#d9cff3"/>` +
    `<circle cx="32" cy="32" r="27" fill="#f1edf8"/>` +
    `<circle cx="32" cy="32" r="28.5" fill="none" stroke="${LILAC}" stroke-width="1.6" stroke-dasharray="0.1 4.2" stroke-linecap="round"/>` +
    `<path d="M12 22 A22 22 0 0 1 26 10.6" fill="none" stroke="${WHITE}" stroke-width="2.4" stroke-linecap="round" opacity="0.9"/>`
  );
}

function wrap(kind: Kind, label: string, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%" role="img" aria-label="${label}">` +
    badge(kind) +
    `<g stroke-linecap="round" stroke-linejoin="round">${body}</g>` +
    `</svg>`
  );
}

// ---------------------------------------------------------------- healthy pictures

/** Carrot: a bright eye with star sparkles. */
function vision(): string {
  const eye = 'M9 34 Q32 10 55 34 Q32 58 9 34 Z';
  return wrap(
    'healthy',
    'sparkly eyes',
    shadow(32, 53, 13) +
      // lashes
      `<path d="M20 25.5 L17 20.5 M32 22 L32 16 M44 25.5 L47 20.5" stroke="${INK}" stroke-width="${SW}" fill="none"/>` +
      `<path d="${eye}" fill="${WHITE}"/>` +
      `<circle cx="32" cy="34" r="9.6" fill="${SEA}"/>` +
      `<circle cx="32" cy="34" r="6.6" fill="${TEAL}" opacity="0.55"/>` +
      `<circle cx="32" cy="34" r="4.4" fill="${INK}"/>` +
      // star-shaped catchlight in the iris
      `<path d="${star5D(35.4, 30.6, 3, 1.3)}" fill="${WHITE}" stroke="none"/>` +
      `<circle cx="28.6" cy="37.6" r="1.2" fill="${WHITE}"/>` +
      `<path d="${eye}" fill="none" stroke="${INK}" stroke-width="${SW}"/>` +
      // lower lid shine
      `<path d="M23 43 Q32 47.5 41 43" fill="none" stroke="${SKY}" stroke-width="1.6" opacity="0.8"/>` +
      sparkle(52.5, 14.5, 6.2, SUN) +
      sparkle(12.5, 15.5, 4.2, LEMON) +
      sparkle(54, 49, 3.4, LEMON, 1.6),
  );
}

/** Broccoli / spinach / peas: a child's arm flexing a big round bicep bump. */
function muscles(): string {
  const arm =
    'M19 35 C18.5 19.5 37.5 16.5 41.2 31.2 L39.6 22.5 L50.2 21 L53.2 40.6 C54 47 49.6 50.5 43.5 50.5 L19 50.5 Z';
  const fist =
    'M36.6 20.6 C35.4 13.6 39.4 9.2 45.6 9.2 C51.6 9.2 54.6 13.2 53.8 18.8 C53.2 22.8 50.4 24.4 45.4 24.4 C40.6 24.4 37.2 23.8 36.6 20.6 Z';
  return wrap(
    'healthy',
    'strong muscles',
    shadow(33, 55, 17) +
      `<path d="${arm}" fill="${SKIN}" stroke="${INK}" stroke-width="${SW}"/>` +
      // soft shade under the arm
      `<path d="M22 47.5 L43.5 47.5 C47.4 47.5 50.2 45.6 50.6 42" fill="none" stroke="${SKIN_SHADE}" stroke-width="2.4"/>` +
      // bicep shine + bump crease
      `<path d="M23.2 29.6 Q25.4 23.6 31 22.8" fill="none" stroke="${WHITE}" stroke-width="2.4" opacity="0.9"/>` +
      `<path d="M41.2 31.2 Q43 35.6 42.2 40" fill="none" stroke="${INK}" stroke-width="1.9"/>` +
      // fist, curled fingers facing the bicep
      `<path d="${fist}" fill="${SKIN}" stroke="${INK}" stroke-width="${SW}"/>` +
      `<path d="M37.4 14.6 L41.6 14.6 M37 19.2 L41.4 19.2" fill="none" stroke="${INK}" stroke-width="1.8"/>` +
      `<path d="M44.2 12.6 Q48.6 12 50.6 15" fill="none" stroke="${WHITE}" stroke-width="1.8" opacity="0.7"/>` +
      // t-shirt sleeve
      `<path d="M10 32.5 C10 30.5 11.5 29.5 13.5 29.5 L21.5 29.5 L21.5 52 L13.5 52 C11.5 52 10 51 10 49 Z" fill="${CORAL}" stroke="${INK}" stroke-width="${SW}"/>` +
      `<path d="M17.2 31.6 L17.2 50" stroke="${WHITE}" stroke-width="2" opacity="0.75" fill="none"/>` +
      // power ticks over the bump
      `<path d="M20.4 15.6 L22.8 18.8 M28 11.4 L28.6 15.6 M35.4 12.6 L34.2 16.4" stroke="${SUN}" stroke-width="2.6" fill="none"/>` +
      sparkle(57, 31, 3.4, LEMON, 1.6),
  );
}

/** Milk / yoghurt / cheese: a strong bone and a shining, happy tooth. */
function bones(): string {
  const boneParts =
    `<rect x="-9" y="-3.6" width="18" height="7.2" rx="2"/>` +
    `<circle cx="-10.5" cy="-3.7" r="4.6"/><circle cx="-10.5" cy="3.7" r="4.6"/>` +
    `<circle cx="10.5" cy="-3.7" r="4.6"/><circle cx="10.5" cy="3.7" r="4.6"/>`;
  const tooth = boxPath(TOOTH_UNIT, 33.5, 9.5, 18, 26);
  return wrap(
    'healthy',
    'strong bones and bright teeth',
    shadow(30, 54, 16) +
      // tooth glow
      `<circle cx="42.5" cy="22" r="13.5" fill="${LEMON}" opacity="0.35"/>` +
      `<path d="${tooth}" fill="${WHITE}" stroke="${INK}" stroke-width="${SW}"/>` +
      `<path d="M37 15 Q38.5 12.4 41.5 13" fill="none" stroke="${SKY}" stroke-width="2"/>` +
      happyEye(39.2, 20.4, 1.9) +
      happyEye(45.8, 20.4, 1.9) +
      `<path d="M40.2 24.6 Q42.5 27 44.8 24.6" fill="none" stroke="${INK}" stroke-width="1.9"/>` +
      // bone
      `<g transform="translate(24.5 43) rotate(-24)">` +
      union(boneParts, BONE) +
      `<path d="M-8 -1.4 L7 -1.4" stroke="${SKY_WARM}" stroke-width="2.2" fill="none"/>` +
      `<circle cx="-11.6" cy="-4.6" r="1.4" fill="${WHITE}"/>` +
      `</g>` +
      sparkle(55, 11.5, 5.2, SUN) +
      sparkle(29.5, 13, 3.4, LEMON, 1.6) +
      sparkle(56, 34, 3, LEMON, 1.5),
  );
}

/** Orange / kiwifruit: a glowing shield, a cute germ bouncing off it. */
function shield(): string {
  // shield art is drawn at 1:1 and scaled into place by boxPath (stroke stays constant)
  const k = 0.84;
  const fit = (d: string): string => boxPath(d, 26 - 27 * k, 33 - 33 * k, k, k);
  const sh = fit(
    'M 27 11.5 C 32.5 15.5 38.5 16.6 43.5 15.5 L 43.5 32 C 43.5 43 36.5 50 27 54 C 17.5 50 10.5 43 10.5 32 L 10.5 15.5 C 15.5 16.6 21.5 15.5 27 11.5 Z',
  );
  const inner = fit(
    'M 27 17 C 31 19.6 35 20.6 38.4 20.2 L 38.4 32 C 38.4 40.5 33.6 45.6 27 48.6 C 20.4 45.6 15.6 40.5 15.6 32 L 15.6 20.2 C 19 20.6 23 19.6 27 17 Z',
  );
  const heart = fit(
    'M 27 41 C 20.5 36.2 19 32.6 20.1 29.8 C 21.3 26.8 25.2 26.4 27 29.2 C 28.8 26.4 32.7 26.8 33.9 29.8 C 35 32.6 33.5 36.2 27 41 Z',
  );
  let bumps = '';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    bumps += `<circle cx="${n(Math.cos(a) * 6)}" cy="${n(Math.sin(a) * 6)}" r="1.95"/>`;
  }
  return wrap(
    'healthy',
    'germ shield',
    shadow(26, 54.5, 12) +
      // glow
      `<path d="${sh}" fill="${LEMON}" stroke="${LEMON}" stroke-width="7" opacity="0.5"/>` +
      `<path d="${sh}" fill="${ORANGE}" stroke="${INK}" stroke-width="${SW}"/>` +
      `<path d="${inner}" fill="${SUN}"/>` +
      `<path d="${heart}" fill="${CORAL}" stroke="${INK}" stroke-width="2.1"/>` +
      `<path d="M16.4 22.6 L16.4 30.4" stroke="${WHITE}" stroke-width="2.2" opacity="0.85" fill="none"/>` +
      // boing! impact ticks on the shield edge, motion arcs behind the germ
      `<path d="M43.2 31.6 L46.8 32.4 M42.4 36.4 L45.4 38.4" stroke="${INK}" stroke-width="1.9" fill="none"/>` +
      `<path d="M41.6 27.8 Q43.6 29.6 46.4 28.4" fill="none" stroke="${SLATE}" stroke-width="1.7" stroke-dasharray="0.1 3"/>` +
      // germ friend (cute, googly-eyed, surprised-happy)
      `<g transform="translate(50.6 21) rotate(14)">` +
      union(`<circle cx="0" cy="0" r="6"/>${bumps}`, GRASS, 2.1) +
      `<circle cx="-2.3" cy="-1.1" r="2.5" fill="${WHITE}" stroke="${INK}" stroke-width="1.3"/>` +
      `<circle cx="2.4" cy="-1.3" r="2.5" fill="${WHITE}" stroke="${INK}" stroke-width="1.3"/>` +
      `<circle cx="-1.5" cy="-0.4" r="1.1" fill="${INK}"/>` +
      `<circle cx="3.2" cy="-0.6" r="1.1" fill="${INK}"/>` +
      `<path d="M-1.5 2.6 Q0.3 4.2 2.1 2.6" fill="none" stroke="${INK}" stroke-width="1.4"/>` +
      `</g>` +
      sparkle(13, 13.5, 3, LEMON, 1.5),
  );
}

/** Banana / corn / kūmara / bread: a zippy lightning burst. */
function energy(): string {
  const burst: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = 23;
    burst.push(`${n(33 + Math.cos(a) * r)} ${n(32 + Math.sin(a) * r)}`);
  }
  const bolt = 'M38 7.5 L18.5 35 L30 35 L25 56.5 L47.5 26.5 L36 26.5 L42 7.5 Z';
  return wrap(
    'healthy',
    'zippy energy',
    `<circle cx="33" cy="32" r="19" fill="${SKY_WARM}"/>` +
      `<path d="M${burst.join(' L')}Z" fill="none" stroke="${SUN}" stroke-width="1.6" stroke-dasharray="0.1 5" opacity="0.9"/>` +
      // speed lines
      `<path d="M7 24 L14 24 M5.5 32.5 L15 32.5 M8 41 L14.5 41" stroke="${CORAL}" stroke-width="${SW + 0.4}" fill="none"/>` +
      `<path d="${bolt}" fill="${SUN}" stroke="${INK}" stroke-width="${SW}"/>` +
      `<path d="M37.4 11.5 L23.5 31.5" stroke="${LEMON}" stroke-width="2.6" fill="none"/>` +
      `<path d="M38.5 11 L39.6 9.5" stroke="${WHITE}" stroke-width="2.2" fill="none"/>` +
      `<path d="M33.5 30.5 L42 30.5" stroke="${ORANGE}" stroke-width="2" opacity="0.7" fill="none"/>` +
      sparkle(52.5, 14, 4.8, LEMON) +
      sparkle(53.5, 45, 3.6, SUN, 1.6) +
      sparkle(16, 50, 3, LEMON, 1.5),
  );
}

/** Water: a happy splashing drop. */
function refresh(): string {
  const drop = 'M32 9 C37.5 18 46.5 26 46.5 36 C46.5 44.5 40 50.5 32 50.5 C24 50.5 17.5 44.5 17.5 36 C17.5 26 26.5 18 32 9 Z';
  const mini = (cx: number, cy: number, s: number, rot: number): string =>
    `<path transform="translate(${cx} ${cy}) rotate(${rot})" d="M0 ${n(-s * 1.5)} C${n(s * 0.6)} ${n(-s * 0.6)} ${n(s)} ${n(-s * 0.1)} ${n(s)} ${n(s * 0.4)} C${n(s)} ${n(s)} ${n(s * 0.55)} ${n(s * 1.3)} 0 ${n(s * 1.3)} C${n(-s * 0.55)} ${n(s * 1.3)} ${n(-s)} ${n(s)} ${n(-s)} ${n(s * 0.4)} C${n(-s)} ${n(-s * 0.1)} ${n(-s * 0.6)} ${n(-s * 0.6)} 0 ${n(-s * 1.5)} Z" fill="${SKY}" stroke="${INK}" stroke-width="2"/>`;
  return wrap(
    'healthy',
    'refreshing water splash',
    // splash puddle + crown
    `<ellipse cx="32" cy="51.5" rx="19" ry="4.6" fill="${SKY}" stroke="${INK}" stroke-width="${SW}"/>` +
      `<ellipse cx="32" cy="51" rx="12" ry="2.2" fill="${WHITE}" opacity="0.55"/>` +
      `<path d="${drop}" fill="${SEA}" stroke="${INK}" stroke-width="${SW}"/>` +
      `<path d="M32 13.5 C36 20 42.5 26 42.5 35 C42.5 42 37.5 46.5 32 46.5" fill="none" stroke="${BLUE}" stroke-width="3" opacity="0.35"/>` +
      `<path d="M23.5 31.5 Q25 24.5 29.5 19.5" fill="none" stroke="${WHITE}" stroke-width="2.6" opacity="0.9"/>` +
      `<circle cx="22.4" cy="36.2" r="1.3" fill="${WHITE}" opacity="0.9"/>` +
      happyEye(27.6, 37.2, 2.3) +
      happyEye(36.4, 37.2, 2.3) +
      `<path d="M28.6 41.6 Q32 45 35.4 41.6" fill="${INK}" stroke="${INK}" stroke-width="1.9"/>` +
      blush(24.6, 41.8, 1.9) +
      blush(39.4, 41.8, 1.9) +
      mini(12, 36, 3, -38) +
      mini(52.5, 34, 3.2, 38) +
      mini(16, 22, 2, -24) +
      `<circle cx="50" cy="21" r="2" fill="${SKY}" stroke="${INK}" stroke-width="1.8"/>` +
      sparkle(54, 46, 2.8, WHITE, 1.5),
  );
}

/** Eggs / chicken / fish: growing strong — a height chart, a star rising, a little sprout. */
function grow(): string {
  let ticks = '';
  const tickY = [17, 23, 29, 35, 41, 47];
  tickY.forEach((y, i) => {
    const len = i % 2 === 0 ? 6 : 3.8;
    ticks += `M16 ${y} L${n(16 + len)} ${y} `;
  });
  return wrap(
    'healthy',
    'growing strong',
    shadow(34, 54.5, 19) +
      // ruler with soft colour bands
      `<rect x="12.5" y="9.5" width="13" height="45" rx="4" fill="${SKY_WARM}" stroke="none"/>` +
      `<rect x="12.5" y="9.5" width="13" height="11" rx="4" fill="${PINK}" opacity="0.6"/>` +
      `<rect x="12.5" y="20" width="13" height="11.5" fill="${LEMON}" opacity="0.55"/>` +
      `<rect x="12.5" y="31.5" width="13" height="11.5" fill="${MINT}" opacity="0.55"/>` +
      `<rect x="12.5" y="43" width="13" height="11.5" rx="4" fill="${SKY}" opacity="0.6"/>` +
      `<rect x="12.5" y="9.5" width="13" height="45" rx="4" fill="none" stroke="${INK}" stroke-width="${SW}"/>` +
      `<path d="${ticks}" stroke="${INK}" stroke-width="1.8" fill="none"/>` +
      // marker from ruler to the star
      `<path d="M26 17 L35 17" stroke="${INK}" stroke-width="2" stroke-dasharray="0.1 3.4" fill="none"/>` +
      // rising chevrons
      `<path d="M38.6 36 L42 32.6 L45.4 36 M38.6 29 L42 25.6 L45.4 29" stroke="${TEAL}" stroke-width="2.4" fill="none"/>` +
      // star
      `<path d="${star5D(42, 16, 9, 4.3)}" fill="${SUN}" stroke="${INK}" stroke-width="${SW}"/>` +
      `<path d="M38.6 14.2 L40.6 12.4" stroke="${WHITE}" stroke-width="1.8" fill="none"/>` +
      dotEye(39.9, 16.6, 1.05) +
      dotEye(44.1, 16.6, 1.05) +
      `<path d="M40.6 19 Q42 20.3 43.4 19" fill="none" stroke="${INK}" stroke-width="1.5"/>` +
      // sprout from a soil mound
      `<path d="M42 51 C42 47.5 42 45 42.4 41.5" fill="none" stroke="${LEAF}" stroke-width="5.6"/>` +
      `<path d="M42 51 C42 47.5 42 45 42.4 41.5" fill="none" stroke="${GRASS}" stroke-width="1"/>` +
      `<path d="M42.4 44 C38 45 34.4 42.6 34.2 38.4 C38.6 38.4 41.8 40.4 42.4 44 Z" fill="${GRASS}" stroke="${INK}" stroke-width="2.2"/>` +
      `<path d="M42.4 42.2 C46 43 50.4 41 51 36.4 C46.4 36 42.8 38.4 42.4 42.2 Z" fill="${GRASS}" stroke="${INK}" stroke-width="2.2"/>` +
      `<path d="M33.5 53 C34.5 49 38.5 47.6 42 47.6 C45.5 47.6 49.5 49 50.5 53 Z" fill="${WOOD}" stroke="${INK}" stroke-width="2.2"/>` +
      sparkle(53.5, 22.5, 3.2, LEMON, 1.5) +
      sparkle(31.5, 9.5, 2.6, LEMON, 1.4),
  );
}

/** The happy-tummy bean shape (top tube + rounded J body), shared by both tummies. */
const TUMMY =
  'M35.5 8.5 C35.5 13.5 35.5 16.5 32.5 18.8 C21 19.5 11.5 28 12.5 39.5 C13.5 50 23.5 55.5 33.5 52.5 C40.5 50.5 44.5 46 47.5 42.6 C49.5 42.6 51.5 43.2 54.2 43.2 L54.2 34.4 C51.5 34.4 50 35 48.5 35 C45 35 43 32 43.6 26.5 C44 21 44 14 44 8.5 Z';

/** Fruit salad / apple slices / meals: a smiling tummy with a heart. */
function tummy(): string {
  return wrap(
    'healthy',
    'happy tummy',
    shadow(33, 55.5, 15) +
      `<path d="${TUMMY}" fill="${PINK}" stroke="${INK}" stroke-width="${SW}"/>` +
      `<path d="M16.6 37 Q17 28.6 23.6 24.6" fill="none" stroke="${WHITE}" stroke-width="2.4" opacity="0.75"/>` +
      `<path d="M19 47.6 C25 53 36 52.6 42 47.6" fill="none" stroke="${BERRY}" stroke-width="2.2" opacity="0.3"/>` +
      happyEye(23.6, 36.4, 2.5) +
      happyEye(34.4, 36.4, 2.5) +
      `<path d="M24.6 41 Q29 46.6 33.4 41 Z" fill="${INK}" stroke="${INK}" stroke-width="1.8"/>` +
      `<path d="M27 44 Q29 45 31 44" fill="none" stroke="${CORAL}" stroke-width="1.6"/>` +
      blush(19.8, 41.8, 2.3) +
      blush(38.2, 41.8, 2.3) +
      // heart
      `<path d="M20 25.4 C13.6 21 11.8 17.2 13.1 14.2 C14.4 11.2 18.4 10.8 20 13.8 C21.6 10.8 25.6 11.2 26.9 14.2 C28.2 17.2 26.4 21 20 25.4 Z" fill="${CORAL}" stroke="${INK}" stroke-width="${SW}"/>` +
      `<path d="M15.4 15 Q16.2 13.4 17.8 13.6" fill="none" stroke="${WHITE}" stroke-width="1.7"/>` +
      sparkle(52.5, 20, 3.4, LEMON, 1.5) +
      sparkle(51, 50, 2.8, LEMON, 1.4),
  );
}

// ---------------------------------------------------------------- junk pictures

/** Z drawn as an outlined stroke shape. */
function zed(x: number, y: number, s: number, fill: string): string {
  const d = `M${n(x)} ${n(y)} L${n(x + s)} ${n(y)} L${n(x)} ${n(y + s)} L${n(x + s)} ${n(y + s)}`;
  const w = Math.max(2.2, s * 0.32);
  return (
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${n(w + 2.6)}" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="${fill}" stroke-width="${n(w)}" stroke-linejoin="round" stroke-linecap="round"/>`
  );
}

const bubble = (cx: number, cy: number, r: number, fill = SODA): string =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}" stroke="${INK}" stroke-width="${r > 4 ? SW : 2}"/>` +
  `<path d="M${n(cx - r * 0.55)} ${n(cy - r * 0.1)} Q${n(cx - r * 0.5)} ${n(cy - r * 0.55)} ${n(cx - r * 0.1)} ${n(cy - r * 0.6)}" fill="none" stroke="${WHITE}" stroke-width="${r > 4 ? 2 : 1.5}"/>`;

/** Soft drinks / lollies: fizzy bubbles that drift off into sleepy zzz. */
function sugar(): string {
  return wrap(
    'junk',
    'fizzy sugar rush then sleepy',
    shadow(22, 55.5, 11) +
      // fizz dots
      `<circle cx="9.5" cy="39" r="1.4" fill="${PINK}"/><circle cx="31.5" cy="49" r="1.4" fill="${PINK}"/><circle cx="13" cy="29" r="1.1" fill="${BERRY}" opacity="0.6"/>` +
      bubble(20.5, 45, 9.2) +
      // drowsy face on the big bubble
      `<path d="M14.6 43.2 Q16.6 44.8 18.6 43.2 M22.4 43.2 Q24.4 44.8 26.4 43.2" fill="none" stroke="${INK}" stroke-width="1.9"/>` +
      `<path d="M14.4 41.4 L18.8 41.4 M22.2 41.4 L26.6 41.4" fill="none" stroke="${INK}" stroke-width="1.6" opacity="0.6"/>` +
      `<ellipse cx="20.5" cy="49" rx="1.6" ry="1.9" fill="${INK}"/>` +
      blush(14.4, 47.4, 1.7) +
      blush(26.6, 47.4, 1.7) +
      bubble(31.5, 31.5, 5.4) +
      bubble(22, 24.5, 3.4, '#ffe9f0') +
      bubble(36, 20.5, 2.4, '#ffe9f0') +
      zed(40.5, 32, 6.2, LILAC) +
      zed(45, 18.5, 8, BLUE) +
      zed(41.5, 9.5, 4.6, LILAC),
  );
}

/** Lollies / chocolate: a sticky tooth with a little speck. */
function teeth(): string {
  const tooth = boxPath(TOOTH_TALL_UNIT, 16, 13, 32, 41);
  const goo =
    'M18.4 19.5 C21 14.5 27 12.6 32 15.4 C37 12.6 43 14.5 45.6 19.5 C45.8 22 45 23.2 43.6 23.2 C42.4 23.2 42.2 24.8 42.2 27.6 C42.2 29.4 39.4 29.4 39.4 27.6 C39.4 25 38.6 23.6 36.8 23.8 C34.8 24 34.4 25.4 33 25.4 C31.6 25.4 31.2 23.6 29 23.6 C26.6 23.6 26.8 25.6 26.8 27.8 C26.8 30 23.6 30 23.6 27.8 C23.6 25.6 23.4 23.4 21.2 23.4 C19.4 23.4 18 22 18.4 19.5 Z';
  return wrap(
    'junk',
    'sticky teeth',
    shadow(32, 56, 14) +
      `<path d="${tooth}" fill="#fff8e8" stroke="${INK}" stroke-width="${SW}"/>` +
      `<path d="M21.6 34 Q21.4 42 23.2 49" fill="none" stroke="${SKY_WARM}" stroke-width="2.4"/>` +
      `<path d="${goo}" fill="${TOFFEE}" stroke="${INK}" stroke-width="2.2"/>` +
      `<path d="M23 17.6 Q26 15.4 29 16.4 M36.4 16.2 Q39 15.6 41 16.8" fill="none" stroke="${PEACH}" stroke-width="1.8"/>` +
            // little speck
      `<circle cx="41.8" cy="46.6" r="1.9" fill="${SLATE}"/>` +
      `<circle cx="42.3" cy="46" r="0.55" fill="${WHITE}" opacity="0.7"/>` +
      // uh-oh face
      dotEye(28.2, 35.6, 1.5) +
      dotEye(35.4, 35.6, 1.5) +
      `<ellipse cx="31.8" cy="41.4" rx="1.9" ry="1.6" fill="${INK}"/>` +
      `<path d="M26.4 32.6 L29.4 31.6 M37.2 32.6 L34.2 31.6" stroke="${INK}" stroke-width="1.6" fill="none"/>` +
      blush(25.4, 39.4, 1.8) +
      blush(38.2, 39.4, 1.8) +
      // sticky strands to a little lolly
      `<path d="M45.4 21 Q50 24 51.6 27.6" fill="none" stroke="${TOFFEE}" stroke-width="1.6"/>` +
      `<path d="M52.6 30 L56.4 37.5" stroke="${INK}" stroke-width="3.8" fill="none"/>` +
      `<path d="M52.6 30 L56.4 37.5" stroke="${WHITE}" stroke-width="1.6" fill="none"/>` +
      `<circle cx="51.4" cy="26.4" r="5.4" fill="${PINK}" stroke="${INK}" stroke-width="2.2"/>` +
      `<path d="M51.4 26.4 m-2.6 0 a2.6 2.6 0 1 1 2.6 2.6 a1.4 1.4 0 0 1 -1.3 -1.6" fill="none" stroke="${BERRY}" stroke-width="1.5"/>`,
  );
}

/** Ice cream: a shivering ice cube, "brrr". */
function freeze(): string {
  return wrap(
    'junk',
    'brain freeze brrr',
    shadow(32, 55.5, 15) +
      `<g transform="rotate(-7 32 35)">` +
      `<rect x="16" y="19" width="32" height="32" rx="7.5" fill="${ICE}" stroke="${INK}" stroke-width="${SW}"/>` +
      `<path d="M20 25 C20 23 21.5 22 23.5 22 L40.5 22 C42.5 22 44 23 44 25" fill="none" stroke="${WHITE}" stroke-width="2.6"/>` +
      `<path d="M44.6 30 L44.6 44 C44.6 46 43.4 47.4 41.4 47.6" fill="none" stroke="${SKY}" stroke-width="2.6"/>` +
      `<path d="M20.5 30.5 L20.5 34" stroke="${WHITE}" stroke-width="2.4" fill="none"/>` +
      // worried brows + eyes
      `<path d="M23.6 30.2 L27.6 28.8 M40.4 30.2 L36.4 28.8" stroke="${INK}" stroke-width="1.8" fill="none"/>` +
      dotEye(26.4, 34, 1.6) +
      dotEye(37.6, 34, 1.6) +
      // chattering teeth mouth
      `<rect x="24.6" y="38.6" width="14.8" height="6" rx="3" fill="${WHITE}" stroke="${INK}" stroke-width="1.9"/>` +
      `<path d="M25.4 41.6 L27.6 39.8 L29.8 43.2 L32 39.8 L34.2 43.2 L36.4 39.8 L38.6 41.6" fill="none" stroke="${INK}" stroke-width="1.4"/>` +
      `<ellipse cx="22.4" cy="40" rx="2" ry="1.2" fill="${BLUE}" opacity="0.35"/>` +
      `<ellipse cx="41.6" cy="40" rx="2" ry="1.2" fill="${BLUE}" opacity="0.35"/>` +
      `</g>` +
      // shiver lines
      `<path d="M10.5 28 Q8.6 32 10.5 36 M7 30.5 Q5.8 32.6 7 35 M53.5 29 Q55.4 33 53.5 37 M57 31.6 Q58.2 33.8 57 36.2" fill="none" stroke="${SEA}" stroke-width="2.3"/>` +
      // snowflake
      `<g transform="translate(51 13.5)" stroke="${INK}" stroke-width="3.6" fill="none">` +
      `<path d="M0 -5 L0 5 M-4.3 -2.5 L4.3 2.5 M-4.3 2.5 L4.3 -2.5"/></g>` +
      `<g transform="translate(51 13.5)" stroke="${WHITE}" stroke-width="1.5" fill="none">` +
      `<path d="M0 -5 L0 5 M-4.3 -2.5 L4.3 2.5 M-4.3 2.5 L4.3 -2.5"/></g>` +
      `<circle cx="14" cy="14" r="1.6" fill="${WHITE}" stroke="${INK}" stroke-width="1.4"/>` +
      `<circle cx="20" cy="9.6" r="1.1" fill="${WHITE}" stroke="${INK}" stroke-width="1.2"/>`,
  );
}

/** Chips / fried food: a slow, sleepy, cute snail. */
function slow(): string {
  const body =
    'M10.5 48.5 C10.5 45.5 14 44.5 19 44.5 L39.5 44.5 C41 38 43.5 31 49.5 31 C55.5 31 57.5 37 56.4 43.5 C55.6 48.8 52 51 46 51 L13.5 51 C11.5 51 10.5 50 10.5 48.5 Z';
  return wrap(
    'junk',
    'slow and tired snail',
    shadow(33, 55, 21) +
      // soft "slow" trail dots
      `<circle cx="8.4" cy="53.4" r="1.1" fill="${LILAC}"/><circle cx="4.8" cy="53.6" r="0.8" fill="${LILAC}" opacity="0.7"/>` +
      // eye stalks
      `<path d="M47.4 32.6 L45.2 21.5 M52.4 32.4 L55.2 22" stroke="${INK}" stroke-width="${SW}" fill="none"/>` +
      `<path d="${body}" fill="${SKY_WARM}" stroke="${INK}" stroke-width="${SW}"/>` +
      `<path d="M14 48 L38 48" stroke="${PEACH}" stroke-width="2.2" fill="none" opacity="0.8"/>` +
      // eyes on stalks, sleepy lids
      `<circle cx="44.8" cy="19.6" r="3.6" fill="${WHITE}" stroke="${INK}" stroke-width="2"/>` +
      `<circle cx="55.6" cy="20.2" r="3.6" fill="${WHITE}" stroke="${INK}" stroke-width="2"/>` +
      `<circle cx="45.4" cy="20.8" r="1.4" fill="${INK}"/><circle cx="56.2" cy="21.4" r="1.4" fill="${INK}"/>` +
      `<path d="M41.2 19.8 A3.6 3.6 0 0 1 48.4 19.8 Z M52 20.4 A3.6 3.6 0 0 1 59.2 20.4 Z" fill="${SKY_WARM}" stroke="${INK}" stroke-width="1.8"/>` +
      // face
      `<path d="M48.4 41.4 Q50.8 43.4 53.2 41.4" fill="none" stroke="${INK}" stroke-width="1.9"/>` +
      blush(46.2, 39.4, 1.8) +
      blush(55, 39.2, 1.5) +
      // shell
      `<circle cx="27" cy="33.5" r="13.5" fill="${LILAC}" stroke="${INK}" stroke-width="${SW}"/>` +
      `<path d="M28 34.6 C30.2 33 29 29.6 26.4 30.2 C23 31 23.2 36.6 27.6 37.4 C32.6 38.2 35.6 32.6 33.2 28.4 C30.6 23.8 23 23.6 19.6 28.4 C16.4 33 18.4 40.4 24.4 42.6" fill="none" stroke="${INK}" stroke-width="2.2"/>` +
      `<path d="M17.4 27.4 Q20 22.4 25.4 21.2" fill="none" stroke="${WHITE}" stroke-width="2.2" opacity="0.8"/>` +
      `<path d="M37.6 38 Q36 43 31.6 45.6" fill="none" stroke="${BLUE}" stroke-width="2" opacity="0.3"/>` +
      // tiny sweat drop = tired
      `<path d="M38.8 21.2 C40 23 40.8 24 40.8 25 C40.8 26.1 40 26.8 38.8 26.8 C37.6 26.8 36.8 26.1 36.8 25 C36.8 24 37.6 23 38.8 21.2 Z" fill="${SKY}" stroke="${INK}" stroke-width="1.5"/>`,
  );
}

/** Off food: a rumbly, swirly tummy — wobbly mouth, still friendly. */
function tummyAche(): string {
  return wrap(
    'junk',
    'rumbly tummy',
    shadow(33, 55.5, 15) +
      `<path d="${TUMMY}" fill="${QUEASY}" stroke="${INK}" stroke-width="${SW}"/>` +
      `<path d="M16.6 37 Q17 28.6 23.6 24.6" fill="none" stroke="${WHITE}" stroke-width="2.4" opacity="0.7"/>` +
      // worried (inner ends up) brows + eyes
      `<path d="M20 30.8 L24 29.4 M38 30.8 L34 29.4" stroke="${INK}" stroke-width="1.8" fill="none"/>` +
      dotEye(22.4, 34.6, 1.6) +
      dotEye(35.6, 34.6, 1.6) +
      // wobbly mouth
      `<path d="M22.8 40.4 Q24.4 38.8 26 40.4 Q27.6 42 29.2 40.4 Q30.8 38.8 32.4 40.4 Q34 42 35.4 40.6" fill="none" stroke="${INK}" stroke-width="1.9"/>` +
      // rumbly swirl
      `<path d="M29.6 47 C31 46.2 30.4 44.2 28.8 44.6 C26.8 45 27 48.2 29.4 48.8 C32.4 49.4 34.4 46.2 33.2 43.6" fill="none" stroke="${TEAL}" stroke-width="2.1"/>` +
      // rumble wiggles
      `<path d="M7.6 32 Q5.8 35.6 7.6 39.2 M9.4 44.2 Q7.6 47 9.2 50 M57.6 25 Q59.4 28.6 57.6 32.2 M57.4 46 Q59 48.8 57.2 51.4" fill="none" stroke="${LILAC}" stroke-width="2.4"/>` +
      `<circle cx="20" cy="15" r="1.8" fill="${QUEASY}" stroke="${INK}" stroke-width="1.4"/>` +
      `<circle cx="25" cy="10.4" r="1.2" fill="${QUEASY}" stroke="${INK}" stroke-width="1.2"/>`,
  );
}

// ---------------------------------------------------------------- public API

const BENEFIT_ICONS: Record<BenefitId, () => string> = {
  vision,
  muscles,
  bones,
  shield,
  energy,
  refresh,
  grow,
  tummy,
};

const JUNK_ICONS: Record<JunkEffectId, () => string> = {
  sugar,
  teeth,
  freeze,
  slow,
  tummy: tummyAche,
};

const benefitCache = new Map<BenefitId, string>();
const junkCache = new Map<JunkEffectId, string>();

/** Inline SVG markup (viewBox 0 0 64 64, sized 100% by its container) for a healthy benefit. */
export function benefitIconSVG(b: BenefitId): string {
  let s = benefitCache.get(b);
  if (s === undefined) {
    s = BENEFIT_ICONS[b]();
    benefitCache.set(b, s);
  }
  return s;
}

/** Inline SVG markup (viewBox 0 0 64 64, sized 100% by its container) for a junk effect. */
export function junkIconSVG(j: JunkEffectId): string {
  let s = junkCache.get(j);
  if (s === undefined) {
    s = JUNK_ICONS[j]();
    junkCache.set(j, s);
  }
  return s;
}
