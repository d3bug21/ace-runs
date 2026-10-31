// Every picture the UI draws itself: chunky UI glyphs (24x24, currentColor) and flat illustrated
// icons (64x64) for rides, sports, seasons, stages and the two kids. Pictures carry the meaning;
// words are a light extra.
import type { CharacterId, RideId, Season, StageId } from '../contracts';

// ------------------------------------------------------------------ UI glyphs
const G = (body: string, fill = false) =>
  `<svg class="g" viewBox="0 0 24 24" aria-hidden="true" ${fill ? 'fill="currentColor" stroke="none"' : 'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"'}>${body}</svg>`;

export const glyph = {
  play: G('<path d="M8 5.2c0-1.1 1.2-1.8 2.1-1.2l9.2 6.2c.9.6.9 1.9 0 2.5l-9.2 6.2c-.9.6-2.1-.1-2.1-1.2z"/>', true),
  pause: G('<rect x="6" y="4.5" width="4.2" height="15" rx="1.6"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.6"/>', true),
  gear: G('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5"/><circle cx="12" cy="12" r="6.6"/>'),
  book: G('<path d="M12 6.5C10 5 7.2 4.6 4 5v13c3.2-.4 6 0 8 1.5 2-1.5 4.8-1.9 8-1.5V5c-3.2-.4-6 0-8 1.5z"/><path d="M12 6.5v13"/>'),
  back: G('<path d="M14.5 5.5 8 12l6.5 6.5"/>'),
  next: G('<path d="M9.5 5.5 16 12l-6.5 6.5"/>'),
  home: G('<path d="M4 11 12 4.5l8 6.5"/><path d="M6.5 9.5V19h11V9.5"/><path d="M10.2 19v-4.6h3.6V19"/>'),
  stages: G('<rect x="3.6" y="3.6" width="7.2" height="7.2" rx="2"/><rect x="13.2" y="3.6" width="7.2" height="7.2" rx="2"/><rect x="3.6" y="13.2" width="7.2" height="7.2" rx="2"/><rect x="13.2" y="13.2" width="7.2" height="7.2" rx="2"/>'),
  retry: G('<path d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7"/><path d="M19.6 4.2v4.4h-4.4"/>'),
  lock: G('<rect x="5" y="10.5" width="14" height="10" rx="3" fill="currentColor"/><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5"/>'),
  star: G('<path d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" stroke-linejoin="round"/>', true),
  heart: G('<path d="M12 20.3s-8-4.8-8-10.6A4.6 4.6 0 0 1 12 6.9a4.6 4.6 0 0 1 8 2.8c0 5.8-8 10.6-8 10.6z"/>', true),
  infinity: G('<path d="M12 12c-1.9-2.6-3.4-3.9-5.2-3.9a3.9 3.9 0 0 0 0 7.8c1.8 0 3.3-1.3 5.2-3.9zm0 0c1.9 2.6 3.4 3.9 5.2 3.9a3.9 3.9 0 0 0 0-7.8c-1.8 0-3.3 1.3-5.2 3.9z"/>'),
  check: G('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  close: G('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>'),
  quit: G('<path d="M10 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H10"/><path d="M14.5 8 18.5 12l-4 4M18.3 12H9.5"/>'),
  fullscreen: G('<path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15"/>'),
  music: G('<path d="M9 17.5V6l10-2v11"/><circle cx="6.6" cy="17.6" r="2.6" fill="currentColor"/><circle cx="16.6" cy="15.2" r="2.6" fill="currentColor"/>'),
  voice: G('<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H11l-4.2 3.6V16H6.5a2 2 0 0 1-2-2z"/><path d="M8.5 9.4h7M8.5 12.2h4.2"/>'),
  sfx: G('<path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  help: G('<circle cx="12" cy="12" r="8.6"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/>'),
  sparkle: G('<path d="M12 3c.6 4.6 2.4 6.4 7 7-4.6.6-6.4 2.4-7 7-.6-4.6-2.4-6.4-7-7 4.6-.6 6.4-2.4 7-7z"/>', true),
  motion: G('<path d="M4 8h9M3 12h7M5 16h8"/><circle cx="17.5" cy="12" r="3.2"/>'),
  hint: G('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>'),
  trash: G('<path d="M5 7h14M9.5 7V5h5v2M7 7l1 12h8l1-12"/>'),
  mapPin: G('<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
};

// ------------------------------------------------------------------ illustrated icons (64x64)
const I = (body: string, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
const INK = '#2b3440';

export const RIDE_ICON: Record<RideId, string> = {
  shoes: I(`
    <path d="M7 41c0-8 4-14 10-16.5l8.5-4c2.4 4.4 7 6.4 12.5 6l5.5.4c8.5 1.3 13.5 6.6 14 14.6z" fill="#2fb5a8"/>
    <path d="M25.5 20.5c2.4 4.4 7 6.4 12.5 6l-1.4 6.6c-6 .5-11-2.4-13.8-7.6z" fill="#7fdcc0"/>
    <path d="M13 37c8-4.5 18-5 27-1.5" stroke="#ff7a6b" stroke-width="4.4" fill="none" stroke-linecap="round"/>
    <path d="M27.5 24.5l4-2.4M30.5 27.5l4-2.6M34 29.8l3.6-2.4" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
    <rect x="5" y="40" width="54" height="10" rx="5" fill="#fff"/>
    <path d="M9 45.4h46" stroke="#e8decb" stroke-width="2.2" stroke-linecap="round"/>
    <rect x="5" y="40" width="54" height="10" rx="5" fill="none" stroke="${INK}" stroke-opacity=".12" stroke-width="1.4"/>`),
  bike: I(`
    <circle cx="16" cy="42" r="10.5" fill="none" stroke="${INK}" stroke-width="4"/>
    <circle cx="48" cy="42" r="10.5" fill="none" stroke="${INK}" stroke-width="4"/>
    <circle cx="16" cy="42" r="2.4" fill="#b8c2cc"/><circle cx="48" cy="42" r="2.4" fill="#b8c2cc"/>
    <path d="M16 42l10-16h17l5 16M26 26l7 16h-7.5M33 42l10-16" fill="none" stroke="#ff7a6b" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M24 21.5h7" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
    <path d="M42 26l-2-7h6.5" fill="none" stroke="${INK}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="33" cy="42" r="3.4" fill="#ffc94a"/>`),
  scooter: I(`
    <path d="M46 12l-4 32" stroke="#3f9fd8" stroke-width="4.4" stroke-linecap="round"/>
    <path d="M38.5 11.5h12" stroke="${INK}" stroke-width="4.4" stroke-linecap="round"/>
    <rect x="10" y="41" width="36" height="6.5" rx="3.25" fill="#3f9fd8"/>
    <rect x="12" y="41" width="28" height="2.6" rx="1.3" fill="#9fd6f0"/>
    <circle cx="14" cy="52" r="6" fill="${INK}"/><circle cx="14" cy="52" r="2.2" fill="#ffc94a"/>
    <circle cx="44" cy="52" r="6" fill="${INK}"/><circle cx="44" cy="52" r="2.2" fill="#ffc94a"/>`),
  skate: I(`
    <g transform="rotate(-8 32 36)">
    <path d="M6 33c0-2.6 2-4 4.4-4h43.2c2.4 0 4.4 1.4 4.4 4 0 2.8-2.4 3.4-4 3.4H10c-1.6 0-4-.6-4-3.4z" fill="#ffc94a"/>
    <path d="M8 31.5c1.4-1 2.3-1.2 3.6-1.2h40.8c1.3 0 2.2.2 3.6 1.2" fill="none" stroke="${INK}" stroke-opacity=".5" stroke-width="2"/>
    <path d="M13 36.4h11M40 36.4h11" stroke="#b8c2cc" stroke-width="3.2" stroke-linecap="round"/>
    <circle cx="15.5" cy="42" r="4.6" fill="#ff7a6b"/><circle cx="22" cy="42" r="4.6" fill="#ff7a6b"/>
    <circle cx="42" cy="42" r="4.6" fill="#ff7a6b"/><circle cx="48.5" cy="42" r="4.6" fill="#ff7a6b"/>
    </g>
    <path d="M12 52h40" stroke="${INK}" stroke-opacity=".12" stroke-width="3" stroke-linecap="round"/>`),
};

export const RIDE_NAME: Record<RideId, string> = { shoes: 'Running shoes', bike: 'Bike', scooter: 'Scooter', skate: 'Skateboard' };

export const SPORT_ICON: Record<string, string> = {
  rugby: I(`<g transform="rotate(-30 32 32)"><ellipse cx="32" cy="32" rx="22" ry="13.5" fill="#c98f5a"/><ellipse cx="32" cy="32" rx="22" ry="13.5" fill="none" stroke="#9a6a40" stroke-width="2"/><path d="M14 32h36" stroke="#fff" stroke-width="2.4" stroke-opacity=".7"/><path d="M24 28v8M28 28v8M32 28v8M36 28v8M40 28v8" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></g>`),
  football: I(`<circle cx="32" cy="32" r="21" fill="#fff" stroke="${INK}" stroke-width="2.4"/><path d="M32 22l8 5.8-3 9.4H27l-3-9.4z" fill="${INK}"/><path d="M32 22v-10M40 27.8l9.4-3.6M37 37.2l5.6 8.4M27 37.2l-5.6 8.4M24 27.8l-9.4-3.6" stroke="${INK}" stroke-width="2"/>`),
  netball: I(`<path d="M32 60V28" stroke="#b8c2cc" stroke-width="4" stroke-linecap="round"/><ellipse cx="32" cy="20" rx="13" ry="4" fill="none" stroke="#ff7a6b" stroke-width="3.4"/><path d="M20 21l4 15h16l4-15M26 22l2 14M38 22l-2 14M32 24v12M22 28h20" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="48" cy="44" r="8" fill="#ffe066" stroke="#e0b53a" stroke-width="2"/>`),
  basketball: I(`<circle cx="32" cy="32" r="21" fill="#ff9a3c"/><path d="M11 32h42M32 11v42M17 17c6 5 6 25 0 30M47 17c-6 5-6 25 0 30" fill="none" stroke="#8a4a1a" stroke-width="2.4"/>`),
  cricket: I(`<g transform="rotate(35 28 30)"><rect x="23" y="6" width="10" height="34" rx="4" fill="#f1d79a" stroke="#c98f5a" stroke-width="2"/><rect x="25.5" y="38" width="5" height="16" rx="2.5" fill="#2b3440"/></g><circle cx="47" cy="45" r="8" fill="#f0564a"/><path d="M41 42c4 2 8 2 12 0" stroke="#fff" stroke-width="1.6" fill="none" stroke-dasharray="2 2"/>`),
  tennis: I(`<g transform="rotate(-35 28 26)"><ellipse cx="28" cy="20" rx="13" ry="16" fill="#e8f4f8" stroke="#3f9fd8" stroke-width="4"/><path d="M20 12h16M18 20h20M20 28h16M24 6v28M28 4v32M32 6v28" stroke="#9fd6f0" stroke-width="1.4"/><rect x="25.5" y="36" width="5" height="20" rx="2.5" fill="#2b3440"/></g><circle cx="49" cy="46" r="8" fill="#d6f05a"/><path d="M42 43c3 3 11 3 14 0M42 49c3-3 11-3 14 0" stroke="#fff" stroke-width="1.6" fill="none"/>`),
  hockey: I(`<path d="M38 6L24 46c-1.5 4.5 1 8 6 8h10" fill="none" stroke="#5a8dee" stroke-width="5.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M31 26l-3 8" stroke="#fff" stroke-width="5.6"/><circle cx="50" cy="50" r="6" fill="#ffc94a"/>`),
  athletics: I(`<rect x="10" y="22" width="44" height="7" rx="3" fill="#fff" stroke="#f0564a" stroke-width="2.4"/><path d="M14 22h8M30 22h8M46 22h6" stroke="#f0564a" stroke-width="7"/><path d="M15 29v25M49 29v25" stroke="#b8c2cc" stroke-width="4" stroke-linecap="round"/><path d="M10 55h44" stroke="#ff9a3c" stroke-width="3" stroke-linecap="round"/>`),
  swimming: I(`<path d="M6 36c4-4 8-4 13 0s9 4 13 0 9-4 13 0 9 4 13 0" fill="none" stroke="#3f9fd8" stroke-width="4" stroke-linecap="round"/><path d="M6 47c4-4 8-4 13 0s9 4 13 0 9-4 13 0 9 4 13 0" fill="none" stroke="#9fd6f0" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="21" r="5" fill="none" stroke="#ff7a6b" stroke-width="3.4"/><circle cx="38" cy="21" r="5" fill="none" stroke="#ff7a6b" stroke-width="3.4"/><path d="M29 21h4M16 20l3 1M48 20l-3 1" stroke="#ff7a6b" stroke-width="3" stroke-linecap="round"/>`),
  cycling: I(`<path d="M10 40c0-12 10-22 23-22s22 9 22 20c0 2-1.5 3-3 3H13c-1.6 0-3-.8-3-1z" fill="#ffc94a"/><path d="M20 24l6 15M31 19v20M42 22l-3 17" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M8 44h48" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M48 44v8" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`),
  golf: I(`<path d="M24 56V10" stroke="#b8c2cc" stroke-width="3.4" stroke-linecap="round"/><path d="M24 10l18 7-18 7z" fill="#f0564a"/><ellipse cx="34" cy="56" rx="20" ry="4" fill="#7cc46a"/><circle cx="42" cy="50" r="4.4" fill="#fff" stroke="#b8c2cc" stroke-width="1.4"/>`),
  volleyball: I(`<circle cx="32" cy="32" r="21" fill="#fff" stroke="${INK}" stroke-width="2.4"/><path d="M32 11c-4 10-4 18 0 21s14 4 20 12M32 32c-8 2-15 8-19 15M13 22c8-2 16 2 19 10" fill="none" stroke="#3f9fd8" stroke-width="2.6"/>`),
};

export const SEASON_ICON: Record<Season, string> = {
  winter: I(`<g stroke="#5a8dee" stroke-width="4" stroke-linecap="round" fill="none"><path d="M32 8v48M11.2 20l41.6 24M11.2 44l41.6-24"/><path d="M25 12l7 6 7-6M25 52l7-6 7 6M10.6 28.4l9-2.4-2.6-8.8M53.4 35.6l-9 2.4 2.6 8.8M17 46.8l2.6-8.8-9-2.4M47 17.2l-2.6 8.8 9 2.4"/></g><circle cx="32" cy="32" r="4" fill="#9fd6f0"/>`),
  spring: I(`<g fill="#ff9fc0">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="32" cy="17" rx="9" ry="12" transform="rotate(${a} 32 32)"/>`).join('')}</g><circle cx="32" cy="32" r="7" fill="#ffe066"/><g fill="#e85d8a">${[36, 108, 180, 252, 324].map((a) => `<circle cx="32" cy="22" r="1.6" transform="rotate(${a} 32 32)"/>`).join('')}</g>`),
  summer: I(`<g stroke="#ffb020" stroke-width="4.4" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M32 6v7" transform="rotate(${a} 32 32)"/>`).join('')}</g><circle cx="32" cy="32" r="14" fill="#ffc94a"/><path d="M26 34c3 3.5 9 3.5 12 0" stroke="#c46a10" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="27" cy="29" r="1.8" fill="#c46a10"/><circle cx="37" cy="29" r="1.8" fill="#c46a10"/>`),
  autumn: I(`<path d="M32 6l4 10 8-5-1 11 11-2-6 10 7 5-11 4 2 9-10-5-4 11-4-11-10 5 2-9-11-4 7-5-6-10 11 2-1-11 8 5z" fill="#ff9a3c" stroke="#d96a1a" stroke-width="2" stroke-linejoin="round"/><path d="M32 22v36" stroke="#9a5a20" stroke-width="2.6" stroke-linecap="round"/>`),
};

export const SEASON_NAME: Record<Season, string> = { winter: 'Winter', spring: 'Spring', summer: 'Summer', autumn: 'Autumn' };

// Extra power/effect pictures the food icon set does not cover.
export const EXTRA_ICON = {
  magnet: I(`<path d="M16 12v20a16 16 0 0 0 32 0V12h-10v20a6 6 0 0 1-12 0V12z" fill="#f0564a"/><path d="M16 12h10v8H16zM38 12h10v8H38z" fill="#e8ecf0"/><path d="M8 40l-4 2M10 48l-4 4M56 40l4 2M54 48l4 4" stroke="#ffc94a" stroke-width="3" stroke-linecap="round"/>`),
  slump: I(`<circle cx="30" cy="36" r="18" fill="#b59cf0"/><path d="M20 36c2.4 2 5 2 7 0M34 36c2.4 2 5 2 7 0" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M27 44.5h6" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><text x="44" y="20" font-family="Fredoka, sans-serif" font-weight="700" font-size="14" fill="#5a8dee">z</text><text x="52" y="11" font-family="Fredoka, sans-serif" font-weight="700" font-size="10" fill="#5a8dee">z</text>`),
  glow: I(`<circle cx="32" cy="32" r="22" fill="#ffe066" opacity=".45"/><circle cx="32" cy="32" r="15" fill="#ffc94a"/><path d="M25 31c1.5-2 4-2 5.5 0M33.5 31c1.5-2 4-2 5.5 0M25 37c3.6 4.4 10.4 4.4 14 0" stroke="#a5600f" stroke-width="2.6" fill="none" stroke-linecap="round"/>`),
  treat: I(`<path d="M22 30h20l-3 26H25z" fill="#f1d79a"/><path d="M24 36l16 8M24 46l14-6" stroke="#c98f5a" stroke-width="1.6"/><circle cx="32" cy="22" r="11" fill="#ff9fc0"/><circle cx="25" cy="27" r="7" fill="#fff4e0"/><circle cx="39" cy="27" r="7" fill="#b07a50"/><circle cx="33" cy="12" r="3.4" fill="#f0564a"/>`),
  finish: I(`<path d="M14 58V8" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M14 8h36v24H14z" fill="#fff"/><path d="M14 8h9v8h-9zM32 8h9v8h-9zM23 16h9v8h-9zM41 16h9v8h-9zM14 24h9v8h-9zM32 24h9v8h-9z" fill="${INK}"/>`),
  runner: I(`<circle cx="38" cy="12" r="6" fill="#ff7a6b"/><path d="M34 22l-6 14 8 6-4 14M28 36l-10 4M34 22l10 6 6-4M34 22l-12 2-4 8" fill="none" stroke="#ff7a6b" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`),
};

// ------------------------------------------------------------------ stage scenes (card art, 120x80)
const S = (body: string, bg: string) =>
  `<svg class="scene" viewBox="0 0 120 80" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="120" height="80" fill="${bg}"/>${body}</svg>`;

export const STAGE_ART: Record<StageId, string> = {
  indoor: S(`
    <rect y="56" width="120" height="24" fill="#ffd0a8"/>
    <path d="M0 56h120" stroke="#f3b98a" stroke-width="2"/>
    <rect x="6" y="18" width="34" height="38" rx="5" fill="#9fd6f0"/><rect x="6" y="18" width="34" height="8" rx="4" fill="#5a8dee"/>
    <path d="M40 24c18 0 22 14 34 32" stroke="#ffc94a" stroke-width="9" fill="none" stroke-linecap="round"/>
    <rect x="72" y="40" width="44" height="18" rx="8" fill="#2fb5a8"/>
    ${[[78, 40, '#ff7a6b'], [86, 37, '#ffc94a'], [94, 40, '#5a8dee'], [102, 37, '#e85d8a'], [110, 40, '#7fdcc0'], [82, 34, '#b59cf0'], [98, 33, '#ff9a3c']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="4.6" fill="${c}"/>`).join('')}
    <rect x="12" y="60" width="16" height="12" rx="3" fill="#ff7a6b"/><rect x="30" y="62" width="14" height="10" rx="3" fill="#ffe066"/>
    <circle cx="16" cy="34" r="8" fill="#fff4e0" opacity=".9"/><path d="M12 34h8" stroke="#5a8dee" stroke-width="2"/>`, '#fff0dc'),
  arcade: S(`
    <rect y="60" width="120" height="20" fill="#3a3466"/>
    <path d="M0 66h120M0 73h120" stroke="#4a4380" stroke-width="2"/>
    <rect x="8" y="16" width="28" height="46" rx="5" fill="#5a8dee"/><rect x="12" y="22" width="20" height="15" rx="3" fill="#7fdcc0"/>
    <circle cx="17" cy="46" r="3" fill="#ff7a6b"/><circle cx="26" cy="46" r="3" fill="#ffc94a"/>
    <rect x="44" y="10" width="32" height="52" rx="6" fill="#e85d8a"/><rect x="48" y="16" width="24" height="26" rx="4" fill="#bfe9ff" opacity=".85"/>
    <path d="M60 16v9" stroke="#2b3440" stroke-width="2"/><path d="M55 25h10l-2 5h-6z" fill="#b8c2cc"/>
    <circle cx="54" cy="38" r="3.4" fill="#ffc94a"/><circle cx="62" cy="39" r="3.4" fill="#7fdcc0"/><circle cx="67" cy="37" r="3" fill="#ff9a3c"/>
    <rect x="84" y="40" width="30" height="20" rx="4" fill="#2fb5a8"/><ellipse cx="99" cy="40" rx="15" ry="4" fill="#9fe8dc"/>
    <circle cx="94" cy="39" r="2.4" fill="#ff7a6b"/><circle cx="105" cy="40" r="3" fill="#fff"/>
    <circle cx="100" cy="16" r="2" fill="#ffe066"/><circle cx="110" cy="24" r="1.6" fill="#7fdcc0"/><circle cx="86" cy="22" r="1.4" fill="#ff9fc0"/>`, '#2d2a55'),
  outdoor: S(`
    <circle cx="100" cy="16" r="9" fill="#ffe066"/>
    <ellipse cx="22" cy="18" rx="14" ry="5" fill="#fff" opacity=".9"/>
    <rect y="54" width="120" height="26" fill="#7cc46a"/><ellipse cx="88" cy="66" rx="22" ry="7" fill="#f1d79a"/>
    <path d="M12 56L24 20l12 36M24 20h28M52 20l-10 36M52 20l10 36" stroke="#ff7a6b" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M31 20v20M45 20v20" stroke="#2b3440" stroke-width="1.4"/><rect x="28" y="40" width="7" height="3" rx="1.4" fill="#3f9fd8"/><rect x="42" y="40" width="7" height="3" rx="1.4" fill="#ffc94a"/>
    <path d="M74 66l30-10" stroke="#c98f5a" stroke-width="4" stroke-linecap="round"/><path d="M89 61l0 6" stroke="#9a6a40" stroke-width="4"/>
    <circle cx="112" cy="46" r="10" fill="#4fae5a"/><rect x="110" y="50" width="4" height="8" fill="#9a6a40"/>`, '#a9dcf3'),
  sports: S(`
    <rect y="44" width="120" height="36" fill="#6bbd5a"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${i * 20}" y="44" width="10" height="36" fill="#7cc46a"/>`).join('')}
    <path d="M0 56h120" stroke="#fff" stroke-width="1.6" opacity=".8"/>
    <path d="M44 14v38M76 14v38M44 30h32" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>
    <rect y="26" width="120" height="18" fill="#3f9fd8" opacity=".35"/>
    ${[6, 18, 30, 88, 100, 112].map((x, i) => `<circle cx="${x}" cy="${36 - (i % 2) * 3}" r="3.4" fill="${['#ff7a6b', '#ffc94a', '#fff4e0', '#e85d8a', '#7fdcc0', '#ffc94a'][i]}"/>`).join('')}
    <g transform="rotate(-25 60 64)"><ellipse cx="60" cy="64" rx="9" ry="6" fill="#c98f5a"/><path d="M56 64h8" stroke="#fff" stroke-width="1.6"/></g>
    <circle cx="96" cy="66" r="5" fill="#fff" stroke="#2b3440" stroke-width="1.2"/><circle cx="22" cy="68" r="4" fill="#ff9a3c"/>`, '#bfe6f7'),
  jungle: S(`
    <rect y="58" width="120" height="22" fill="#5aa557"/>
    <path d="M0 0h120v12c-10 6-20 6-30 0s-20-6-30 0-20 6-30 0-20-6-30 0z" fill="#2f8a4a"/>
    <path d="M20 8v34M98 6v26" stroke="#3a7a3a" stroke-width="2"/>
    <circle cx="98" cy="34" r="6" fill="#9a6a40"/><circle cx="96" cy="33" r="1.2" fill="#2b3440"/><circle cx="100" cy="33" r="1.2" fill="#2b3440"/><ellipse cx="98" cy="36" rx="3" ry="2" fill="#e8c09a"/>
    <path d="M8 58c4-14 10-20 18-22M8 58c2-10-2-18-8-22M26 58c6-12 14-16 22-14" stroke="#4fae5a" stroke-width="7" fill="none" stroke-linecap="round"/>
    <ellipse cx="72" cy="50" rx="16" ry="11" fill="#9aa8b4"/><circle cx="58" cy="46" r="8" fill="#9aa8b4"/><path d="M52 48c-4 4-4 10 0 12" stroke="#9aa8b4" stroke-width="4" fill="none" stroke-linecap="round"/>
    <rect x="62" y="56" width="5" height="8" rx="2" fill="#8a97a3"/><rect x="78" y="56" width="5" height="8" rx="2" fill="#8a97a3"/><circle cx="57" cy="44" r="1.4" fill="#2b3440"/>
    <path d="M30 22c4-4 10-4 12 0-2 4-8 6-12 0z" fill="#f0564a"/><path d="M38 22l6 6" stroke="#3f9fd8" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="21" r="1" fill="#2b3440"/>
    <circle cx="104" cy="66" r="4" fill="#7fdc6a"/><circle cx="102" cy="64" r="1" fill="#2b3440"/>`, '#bfe8c4'),
  parks: S(`
    <rect width="30" height="80" fill="#dfeefa"/><rect x="30" width="30" height="80" fill="#ffe7ef"/><rect x="60" width="30" height="80" fill="#c9ecff"/><rect x="90" width="30" height="80" fill="#ffe8c8"/>
    <rect y="58" width="30" height="22" fill="#f6fbff"/><rect x="30" y="58" width="30" height="22" fill="#9ad57a"/><rect x="60" y="58" width="30" height="22" fill="#7cc46a"/><rect x="90" y="58" width="30" height="22" fill="#c9b060"/>
    <path d="M15 58V34M15 42l-7-7M15 38l6-6" stroke="#9a6a40" stroke-width="3" stroke-linecap="round"/><circle cx="8" cy="24" r="1.4" fill="#fff"/><circle cx="22" cy="18" r="1.4" fill="#fff"/><circle cx="12" cy="12" r="1.2" fill="#fff"/>
    <path d="M45 58V40" stroke="#9a6a40" stroke-width="3"/><circle cx="45" cy="32" r="12" fill="#ffc0d4"/><circle cx="40" cy="30" r="2" fill="#fff"/><circle cx="49" cy="35" r="2" fill="#fff"/>
    <path d="M75 58V40" stroke="#9a6a40" stroke-width="3"/><circle cx="75" cy="32" r="13" fill="#4fae5a"/><circle cx="80" cy="10" r="5" fill="#ffe066"/>
    <path d="M105 58V40" stroke="#9a6a40" stroke-width="3"/><circle cx="105" cy="33" r="12" fill="#ff9a3c"/><circle cx="98" cy="50" r="2" fill="#ffb84a"/><circle cx="112" cy="54" r="2" fill="#e0782a"/><ellipse cx="100" cy="66" rx="7" ry="2" fill="#8fc4e8"/>`, '#fff'),
};

export const STAGE_NAME: Record<StageId, string> = {
  indoor: 'Indoor playground',
  arcade: 'Indoor arcade',
  outdoor: 'Outdoor playground',
  sports: 'Sports place',
  jungle: 'Jungle',
  parks: 'Parks & gardens',
};

export const STAGE_COLOR: Record<StageId, string> = {
  indoor: '#ff9a3c',
  arcade: '#8b6fe0',
  outdoor: '#3f9fd8',
  sports: '#4fae5a',
  jungle: '#2f9a6a',
  parks: '#e85d8a',
};

// ------------------------------------------------------------------ kid portraits (character cards)
export const KID_ART: Record<CharacterId, string> = {
  // Ace: matches his 3D look - teal cap (tilted back), brown tufts, mustard hoodie with drawstrings.
  ace: I(`
    <path d="M11 64c2-8.5 9.5-11.5 21-11.5S51 55.5 53 64z" fill="#eebb58"/>
    <path d="M20.5 55.2c3-2.2 7-3.2 11.5-3.2s8.5 1 11.5 3.2c-2.6 3.4-6.8 5.2-11.5 5.2s-8.9-1.8-11.5-5.2z" fill="#d3a24a"/>
    <path d="M28.4 58.6l-.8 4.6M35.6 58.6l.8 4.6" stroke="#f6efe2" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="27.5" cy="63.6" r="1.3" fill="#f6efe2"/><circle cx="36.5" cy="63.6" r="1.3" fill="#f6efe2"/>
    <ellipse cx="14.2" cy="39" rx="3" ry="3.9" fill="#e9b494"/><ellipse cx="49.8" cy="39" rx="3" ry="3.9" fill="#e9b494"/>
    <circle cx="32" cy="37.5" r="17.6" fill="#f3caa6"/>
    <path d="M15.2 33.5c.4 3 1.4 4.6 3 5.6.2-2.4.9-4 2.2-5.2zM48.8 33.5c-.4 3-1.4 4.6-3 5.6-.2-2.4-.9-4-2.2-5.2z" fill="#7a4f34"/>
    <path d="M13.8 31.5C13.8 18.6 22 11 32 11s18.2 7.6 18.2 20.5z" fill="#5f9f99"/>
    <path d="M32 11.2v20.3M22.5 14.6c-2.6 4.6-3.4 10.6-3.2 16.9M41.5 14.6c2.6 4.6 3.4 10.6 3.2 16.9" stroke="#4d8a84" stroke-width="1.3" fill="none"/>
    <circle cx="32" cy="11.4" r="2.2" fill="#4d8a84"/>
    <path d="M13.2 30.6c5.6-2.8 12-3.9 18.8-3.9s13.2 1.1 18.8 3.9c.9.5.6 2.6-.6 2.6-5.8-1.6-11.8-2.3-18.2-2.3s-12.4.7-18.2 2.3c-1.2 0-1.5-2.1-.6-2.6z" fill="#4d8a84"/>
    <path d="M21.6 35.6q3.4-1.8 6.4-.3M42.4 35.6q-3.4-1.8-6.4-.3" stroke="#6b4530" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    <circle cx="25" cy="39.6" r="3.2" fill="${INK}"/><circle cx="39" cy="39.6" r="3.2" fill="${INK}"/><circle cx="26.1" cy="38.5" r="1.15" fill="#fff"/><circle cx="40.1" cy="38.5" r="1.15" fill="#fff"/>
    <ellipse cx="19.6" cy="45.4" rx="3.5" ry="2.1" fill="#f0a296" opacity=".7"/><ellipse cx="44.4" cy="45.4" rx="3.5" ry="2.1" fill="#f0a296" opacity=".7"/>
    <path d="M24.6 45.4c3.8 5 11 5 14.8 0z" fill="#b3473f"/><path d="M26.8 45.8h10.4" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`, 'ico kid'),
  // Ciela: black straight bob with a full straight fringe (above the eyes), warm smile,
  // lilac sporty tee with puff sleeves, white collar trim and a little bow.
  ciela: I(`
    <path d="M9.6 47.5V30.5C9.6 16.6 19.4 9.6 32 9.6s22.4 7 22.4 20.9v17c0 1.6-1.1 2.5-2.6 2.5H12.2c-1.5 0-2.6-.9-2.6-2.5z" fill="#221a1e"/>
    <path d="M12 64c1.6-7.6 9-10.6 20-10.6S50.4 56.4 52 64z" fill="#b59cf0"/>
    <circle cx="15.6" cy="59.2" r="5.4" fill="#c7b4f6"/><circle cx="48.4" cy="59.2" r="5.4" fill="#c7b4f6"/>
    <path d="M11.4 62.4c2.6 1.4 5.8 1.4 8.4 0M44.2 62.4c2.6 1.4 5.8 1.4 8.4 0" stroke="#fff" stroke-width="1.8" stroke-linecap="round" fill="none"/>
    <path d="M23.6 54.6c2.2 3.6 5.2 5.4 8.4 5.4s6.2-1.8 8.4-5.4" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M32 59.2l-4.6-2.6v5.2zM32 59.2l4.6-2.6v5.2z" fill="#ff7ab6"/><circle cx="32" cy="59.2" r="1.7" fill="#e85d8a"/>
    <circle cx="32" cy="36.6" r="17" fill="#b07552"/>
    <path d="M14.6 30.4C14.6 19 22.4 13.6 32 13.6S49.4 19 49.4 30.4c0 .5-.4.9-.9.9h-33c-.5 0-.9-.4-.9-.9z" fill="#221a1e"/>
    <path d="M21 18.4c-1.8 3.4-2.4 7.6-2.2 12.2M27 15.4c-1 4.4-1.2 9.4-.8 15.2M37 15.4c1 4.4 1.2 9.4.8 15.2M43 18.4c1.8 3.4 2.4 7.6 2.2 12.2" stroke="#3a3036" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    <path d="M18 17.6c3.8-3.6 8.6-5 14-5" stroke="#4a3f47" stroke-width="2.2" stroke-linecap="round" fill="none"/>
    <path d="M10.4 34v13.6M53.6 34v13.6" stroke="#3a3036" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M21.8 34.6q3.2-1.4 6 .1M42.2 34.6q-3.2-1.4-6 .1" stroke="#221612" stroke-width="1.4" stroke-linecap="round" fill="none"/>
    <circle cx="25" cy="38.6" r="3.2" fill="${INK}"/><circle cx="39" cy="38.6" r="3.2" fill="${INK}"/><circle cx="26.1" cy="37.5" r="1.15" fill="#fff"/><circle cx="40.1" cy="37.5" r="1.15" fill="#fff"/>
    <path d="M21.6 37.2l-1.4-1M42.4 37.2l1.4-1" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/>
    <ellipse cx="19.8" cy="44.4" rx="3.5" ry="2.1" fill="#e98a7c" opacity=".7"/><ellipse cx="44.2" cy="44.4" rx="3.5" ry="2.1" fill="#e98a7c" opacity=".7"/>
    <path d="M24.4 44.2c3.9 5.2 11.3 5.2 15.2 0z" fill="#9c3a35"/><path d="M26.6 44.6h10.8" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
    <path d="M28.4 48.1q3.6 1.3 7.2 0" stroke="#e8746a" stroke-width="1.4" stroke-linecap="round" fill="none"/>`, 'ico kid'),
};

const sneaker = (upper: string, toe: string, sole: string, stripe: string, extra: string) =>
  I(`
    <path d="M7 41c0-8 4-14 10-16.5l8.5-4c2.4 4.4 7 6.4 12.5 6l5.5.4c8.5 1.3 13.5 6.6 14 14.6z" fill="${upper}"/>
    <path d="M25.5 20.5c2.4 4.4 7 6.4 12.5 6l-1.4 6.6c-6 .5-11-2.4-13.8-7.6z" fill="${toe}"/>
    <path d="M13 37c8-4.5 18-5 27-1.5" stroke="${stripe}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M27.5 24.5l4-2.4M30.5 27.5l4-2.6M34 29.8l3.6-2.4" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
    ${extra}
    <rect x="5" y="40" width="54" height="10" rx="5" fill="${sole}"/>
    <path d="M9 45.4h46" stroke="#000" stroke-opacity=".08" stroke-width="2.2" stroke-linecap="round"/>`, 'ico shoe');
const flower = (x: number, y: number) =>
  `<g fill="#fff">${[0, 72, 144, 216, 288].map((a) => `<circle cx="${(x + Math.cos((a * Math.PI) / 180) * 1.7).toFixed(2)}" cy="${(y + Math.sin((a * Math.PI) / 180) * 1.7).toFixed(2)}" r="1.25"/>`).join('')}</g><circle cx="${x}" cy="${y}" r="0.9" fill="#ffe066"/>`;

/** Each kid's own sneakers (shown on the character cards). Ciela's: bright pink with little flowers
 *  and a tiny original explorer patch (a round badge with a sun + compass star - no characters). */
export const KID_SHOE: Record<CharacterId, string> = {
  ace: sneaker('#f7f3ec', '#ffffff', '#4fa39c', '#e2a94e', ''),
  ciela: sneaker('#ff4f9a', '#ff8cc0', '#fff4e0', '#ffd1e6',
    `${flower(15, 33)}${flower(44, 34.5)}${flower(52, 39)}<circle cx="31" cy="35.6" r="4.6" fill="#fff4e0" stroke="#7fdcc0" stroke-width="1.4"/><path d="M31 32.2l.9 2.5 2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9z" fill="#3f9fd8"/>`),
};

export const KID_NAME: Record<CharacterId, string> = { ace: 'Ace', ciela: 'Ciela' };
export const KID_COLOR: Record<CharacterId, string> = { ace: '#2fb5a8', ciela: '#9b7fe0' };

/** Section picture for a stage section id (sport or season), or null. */
export function sectionIcon(id: string, season?: Season): string | null {
  if (season) return SEASON_ICON[season];
  if (id in SEASON_ICON) return SEASON_ICON[id as Season];
  return SPORT_ICON[id] ?? null;
}
