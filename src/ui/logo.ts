// "Ace Runs!" wordmark: chunky rounded letters with a cream outline, speed lines and a
// kiwifruit-slice dot on the "!". Pure SVG (uses the bundled Fredoka font).
const KIWI_SEEDS = Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2;
  return `<ellipse cx="${(341 + Math.cos(a) * 7.2).toFixed(1)}" cy="${(206 + Math.sin(a) * 7.2).toFixed(1)}" rx="1.3" ry="2.3" transform="rotate(${((a * 180) / Math.PI + 90).toFixed(0)} ${(341 + Math.cos(a) * 7.2).toFixed(1)} ${(206 + Math.sin(a) * 7.2).toFixed(1)})" fill="#2b3440"/>`;
}).join('');

export function logoSVG(cls = 'logo'): string {
  return `<svg class="${cls}" viewBox="0 0 400 236" role="img" aria-label="Ace Runs!">
  <g stroke-linecap="round" stroke-width="11" fill="none">
    <path d="M14 152h46" stroke="#ffc94a"/><path d="M2 176h52" stroke="#7fdcc0"/><path d="M18 200h34" stroke="#ff9fc0"/>
  </g>
  <g font-family="Fredoka, 'Trebuchet MS', system-ui, sans-serif" font-weight="700" text-anchor="middle" paint-order="stroke" stroke="#fff4e0" stroke-linejoin="round">
    <text x="196" y="104" font-size="112" fill="#2fb5a8" stroke-width="18" transform="rotate(-4 196 70)" letter-spacing="2">Ace</text>
    <text x="196" y="212" font-size="124" fill="#ff7a6b" stroke-width="18" letter-spacing="1">Runs</text>
  </g>
  <g paint-order="stroke" stroke="#fff4e0" stroke-width="16" stroke-linejoin="round">
    <path d="M331 116c0-7 4-11 10.5-11s10.5 4 10.5 11l-3.4 56c-.4 5-3 7.4-7.1 7.4s-6.7-2.4-7.1-7.4z" fill="#ff7a6b"/>
    <circle cx="341" cy="206" r="17" fill="#9a6a40"/>
  </g>
  <circle cx="341" cy="206" r="14" fill="#8cc152"/><circle cx="341" cy="206" r="10.5" fill="#a9d86a"/><circle cx="341" cy="206" r="4.2" fill="#f2f6d2"/>${KIWI_SEEDS}
  <g fill="#ffc94a"><path d="M362 40c1.2 7 3.4 9.2 10.4 10.4-7 1.2-9.2 3.4-10.4 10.4-1.2-7-3.4-9.2-10.4-10.4 7-1.2 9.2-3.4 10.4-10.4z"/><path d="M42 62c.8 4.4 2.2 5.8 6.6 6.6-4.4.8-5.8 2.2-6.6 6.6-.8-4.4-2.2-5.8-6.6-6.6 4.4-.8 5.8-2.2 6.6-6.6z"/></g>
</svg>`;
}
