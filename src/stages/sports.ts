// Sports Park: a long run through ten sports stretches (rugby, football, netball, basketball, cricket,
// tennis, hockey, athletics, swimming, cycling), each with its own surface, side scenery, themed obstacles,
// moving play, a welcome arch, a friendly crowd doing the wave, flags and scoreboards.
import * as THREE from 'three';
import type { StageModule, StageSection, ObstacleRequest, ObstacleVisual, StagePattern, PatternItem } from '../contracts';
import { PLATFORM_TOP } from '../contracts';
import { PAL, geo, clamp, lerp, canvasTexture, rng as mkRng } from '../kit/kit';
import {
  GeoBuilder,
  StageEnv,
  type EnvLook,
  FallingField,
  Wobble,
  vcMat,
  swayMat,
  glowVcMat,
  ownedMat,
  texMat,
  tileTexture,
  cachedTex,
  floorStrip,
  wedgeGeo,
  lo,
  css,
  jitter,
  mixHex,
  addRoundTree,
  addBush,
  addFlag,
  addShadow,
  sectionAt,
  splitBySection,
  setStageTime,
  SKIN,
  HAIR,
  TAU,
} from './helpersB';

// ------------------------------------------------------------------ sports
type SportId = 'rugby' | 'football' | 'netball' | 'basketball' | 'cricket' | 'tennis' | 'hockey' | 'athletics' | 'swimming' | 'cycling';
const ORDER: SportId[] = ['rugby', 'football', 'netball', 'basketball', 'cricket', 'tennis', 'hockey', 'athletics', 'swimming', 'cycling'];
const SPORT_LEN = 200;

interface Sport {
  id: SportId;
  label: string;
  /** banner / livery colour */
  main: number;
  /** contrasting accent */
  accent: number;
  /** crowd team colours */
  home: number;
  away: number;
  sfx: string[];
}
const SPORTS: Record<SportId, Sport> = {
  rugby: { id: 'rugby', label: 'Rugby', main: 0x2f6f9f, accent: 0xffffff, home: 0x2f6f9f, away: 0xf0564a, sfx: ['sports_whistle', 'crowd_cheer', 'rugby_thud'] },
  football: { id: 'football', label: 'Football', main: 0x2fa36b, accent: 0xffe066, home: 0xff9a3c, away: 0x5a8dee, sfx: ['sports_whistle', 'crowd_cheer', 'ball_kick'] },
  netball: { id: 'netball', label: 'Netball', main: 0x8a6fd6, accent: 0xffffff, home: 0xb59cf0, away: 0x2fb5a8, sfx: ['sports_whistle', 'basketball_bounce', 'crowd_cheer'] },
  basketball: { id: 'basketball', label: 'Basketball', main: 0xe9772f, accent: 0x24304a, home: 0xff9a3c, away: 0x3f5ea8, sfx: ['basketball_bounce', 'crowd_cheer', 'sports_whistle'] },
  cricket: { id: 'cricket', label: 'Cricket', main: 0x3d8f5a, accent: 0xfff4e0, home: 0xfff4e0, away: 0x3d8f5a, sfx: ['cricket_tok', 'crowd_cheer'] },
  tennis: { id: 'tennis', label: 'Tennis', main: 0x3f74c0, accent: 0xd8f05a, home: 0xffffff, away: 0x7fdcc0, sfx: ['tennis_pok', 'crowd_cheer'] },
  hockey: { id: 'hockey', label: 'Hockey', main: 0x2f63b5, accent: 0xffd23f, home: 0xffd23f, away: 0xe85d8a, sfx: ['sports_whistle', 'crowd_cheer', 'ball_kick'] },
  athletics: { id: 'athletics', label: 'Athletics', main: 0xd8644e, accent: 0xffffff, home: 0xffc94a, away: 0x2fb5a8, sfx: ['sports_whistle', 'crowd_cheer'] },
  swimming: { id: 'swimming', label: 'Swimming', main: 0x2b9fd0, accent: 0xffffff, home: 0x3f9fd8, away: 0xffb38a, sfx: ['swim_splash', 'sports_whistle', 'crowd_cheer'] },
  cycling: { id: 'cycling', label: 'Cycling', main: 0xe0484f, accent: 0x5ab8e8, home: 0xe0484f, away: 0xffc94a, sfx: ['bike_whirr', 'crowd_cheer'] },
};
const PLACE: Record<SportId, string> = {
  rugby: 'Rugby Field',
  football: 'Football Pitch',
  netball: 'Netball Courts',
  basketball: 'Basketball Court',
  cricket: 'Cricket Oval',
  tennis: 'Tennis Courts',
  hockey: 'Hockey Turf',
  athletics: 'Athletics Track',
  swimming: 'Swimming Pool',
  cycling: 'Cycling Velodrome',
};
const sportOf = (id: string): Sport => SPORTS[(id as SportId) in SPORTS ? (id as SportId) : 'rugby'];

const SECTIONS: StageSection[] = [];
for (let d = 0, i = 0; d < 20000; d += SPORT_LEN, i++) {
  const s = SPORTS[ORDER[i % ORDER.length]];
  SECTIONS.push({ id: s.id, label: PLACE[s.id], start: d });
}

// ------------------------------------------------------------------ local geometry cache
const lgeo = new Map<string, THREE.BufferGeometry>();
function lg<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = lgeo.get(key) as T | undefined;
  if (!g) {
    g = make();
    lgeo.set(key, g);
  }
  return g;
}
/** Low-poly sphere for crowds (very few vertices). */
const tinySphere = (r: number) => geo.sphere(r, 6, 4);
/** Sphere wedge (beach-ball gore). */
const gore = (r: number, i: number, n: number) => lg(`gore${r},${i},${n}`, () => new THREE.SphereGeometry(r, 4, 10, (i / n) * TAU, TAU / n));
/** Triangle pennant hanging down from its top edge, in the XY plane. */
const pennant = (w: number, h: number) =>
  lg(`pen${w},${h}`, () => {
    const g = new THREE.BufferGeometry();
    const P = [-w / 2, 0, 0, 0, -h, 0, w / 2, 0, 0, -w / 2, 0, 0, w / 2, 0, 0, 0, -h, 0];
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.computeVertexNormals();
    return g;
  });
/** Rugby-ball (prolate) along X. */
const rugbyBall = (len: number) => lg(`rb${len}`, () => new THREE.SphereGeometry(len / 2, 14, 10).scale(1, 0.62, 0.62));

// ------------------------------------------------------------------ textures
const PXM = 256 / 7.2; // px per metre across the track texture
const X2P = (x: number) => ((x + 3.6) / 7.2) * 256;
function noise(g: CanvasRenderingContext2D, w: number, h: number, n: number, col: string, size = 2, seed = 7): void {
  const r = mkRng(seed);
  g.fillStyle = col;
  for (let i = 0; i < n; i++) g.fillRect(r() * w, r() * h, size * (0.5 + r()), size * (0.5 + r()));
}
function vline(g: CanvasRenderingContext2D, x: number, h: number, wM: number, col: string, dash?: [number, number]): void {
  g.fillStyle = col;
  const w = Math.max(2, wM * PXM);
  if (!dash) {
    g.fillRect(X2P(x) - w / 2, 0, w, h);
    return;
  }
  const [on, off] = dash.map((m) => m * PXM);
  for (let y = 0; y < h; y += on + off) g.fillRect(X2P(x) - w / 2, y, w, on);
}

interface TrackTex {
  tex: THREE.Texture;
  len: number;
}
function trackTexture(id: SportId): TrackTex {
  const lens: Record<SportId, number> = { rugby: 10, football: 8, netball: 12, basketball: 6, cricket: 10, tennis: 12, hockey: 10, athletics: 20, swimming: 4, cycling: 6 };
  const len = lens[id];
  const H = Math.round(len * PXM);
  const tex = cachedTex(`sports-track-${id}`, () =>
    tileTexture(256, H, (g, w, h) => {
      const white = 'rgba(255,255,255,0.92)';
      const soft = 'rgba(255,255,255,0.55)';
      switch (id) {
        case 'rugby':
        case 'football': {
          const a = id === 'rugby' ? '#73bf5f' : '#6dbb5c';
          const b = id === 'rugby' ? '#83cc6e' : '#7cc86a';
          g.fillStyle = a;
          g.fillRect(0, 0, w, h);
          g.fillStyle = b;
          g.fillRect(0, 0, w, h / 2);
          noise(g, w, h, 900, 'rgba(40,110,40,0.18)', 2);
          noise(g, w, h, 500, 'rgba(255,255,255,0.08)', 2, 11);
          vline(g, -1.1, h, 0.07, soft, [1.4, 1.1]);
          vline(g, 1.1, h, 0.07, soft, [1.4, 1.1]);
          vline(g, -3.45, h, 0.1, white);
          vline(g, 3.45, h, 0.1, white);
          if (id === 'rugby') {
            // 5 m dashes across (rugby field markings)
            g.fillStyle = soft;
            for (const x of [-2.2, 0, 2.2]) g.fillRect(X2P(x) - 10, h * 0.02, 20, 4);
          }
          break;
        }
        case 'netball': {
          g.fillStyle = '#4b9fb4';
          g.fillRect(0, 0, w, h);
          noise(g, w, h, 1400, 'rgba(255,255,255,0.06)', 2);
          g.fillStyle = '#5aaec2';
          g.fillRect(X2P(-1.1), 0, X2P(1.1) - X2P(-1.1), h);
          vline(g, -1.1, h, 0.06, white);
          vline(g, 1.1, h, 0.06, white);
          vline(g, -3.45, h, 0.08, white);
          vline(g, 3.45, h, 0.08, white);
          g.fillStyle = white;
          g.fillRect(X2P(-3.45), 0, X2P(3.45) - X2P(-3.45), 3);
          g.strokeStyle = white;
          g.lineWidth = 3;
          g.beginPath();
          g.arc(w / 2, 0, 1.6 * PXM, 0, Math.PI);
          g.stroke();
          break;
        }
        case 'basketball': {
          g.fillStyle = '#e2b47c';
          g.fillRect(0, 0, w, h);
          const r = mkRng(5);
          const pw = 0.24 * PXM;
          for (let x = 0; x < w; x += pw) {
            g.fillStyle = `rgba(${150 + r() * 40},${95 + r() * 30},${45 + r() * 20},${0.18 + r() * 0.16})`;
            g.fillRect(x, 0, pw - 1, h);
            g.fillStyle = 'rgba(120,70,30,0.25)';
            g.fillRect(x + pw - 1, 0, 1, h);
            const e = r() * h;
            g.fillRect(x, e, pw, 1.5);
          }
          g.fillStyle = 'rgba(233,119,47,0.55)';
          g.fillRect(X2P(-3.6), 0, X2P(-3.3) - X2P(-3.6), h);
          g.fillRect(X2P(3.3), 0, X2P(3.6) - X2P(3.3), h);
          vline(g, -1.1, h, 0.07, 'rgba(36,48,74,0.75)');
          vline(g, 1.1, h, 0.07, 'rgba(36,48,74,0.75)');
          vline(g, -3.3, h, 0.07, 'rgba(255,255,255,0.9)');
          vline(g, 3.3, h, 0.07, 'rgba(255,255,255,0.9)');
          break;
        }
        case 'cricket': {
          g.fillStyle = '#8acb6c';
          g.fillRect(0, 0, w, h);
          g.fillStyle = '#7dc163';
          for (let i = 0; i < 4; i++) if (i % 2) g.fillRect(0, (i * h) / 4, w, h / 4);
          noise(g, w, h, 800, 'rgba(50,110,40,0.16)', 2);
          // the pitch strip on the middle lane
          g.fillStyle = '#e8d6a2';
          g.fillRect(X2P(-1.0), 0, X2P(1.0) - X2P(-1.0), h);
          noise(g, X2P(1.0), h, 300, 'rgba(170,140,90,0.25)', 2, 3);
          g.fillStyle = '#e8d6a2';
          g.fillStyle = white;
          g.fillRect(X2P(-1.0), h * 0.5, X2P(1.0) - X2P(-1.0), 3);
          g.fillRect(X2P(-1.0), h * 0.5 + 1.2 * PXM, X2P(1.0) - X2P(-1.0), 3);
          vline(g, -0.85, h, 0.05, 'rgba(255,255,255,0.6)', [1.2, 0.2]);
          vline(g, 0.85, h, 0.05, 'rgba(255,255,255,0.6)', [1.2, 0.2]);
          vline(g, -3.45, h, 0.06, soft, [1.0, 1.0]);
          vline(g, 3.45, h, 0.06, soft, [1.0, 1.0]);
          break;
        }
        case 'tennis': {
          g.fillStyle = '#5aa36a';
          g.fillRect(0, 0, w, h);
          g.fillStyle = '#4f86c6';
          g.fillRect(X2P(-3.3), 0, X2P(3.3) - X2P(-3.3), h);
          noise(g, w, h, 1200, 'rgba(255,255,255,0.05)', 2);
          vline(g, -1.1, h, 0.06, white);
          vline(g, 1.1, h, 0.06, white);
          vline(g, -3.3, h, 0.08, white);
          vline(g, 3.3, h, 0.08, white);
          g.fillStyle = white;
          g.fillRect(X2P(-3.3), h - 4, X2P(3.3) - X2P(-3.3), 4);
          g.fillRect(w / 2 - 1.5, h - 0.35 * PXM, 3, 0.35 * PXM);
          break;
        }
        case 'hockey': {
          g.fillStyle = '#3b79c4';
          g.fillRect(0, 0, w, h);
          noise(g, w, h, 1800, 'rgba(20,50,120,0.16)', 2);
          noise(g, w, h, 900, 'rgba(255,255,255,0.05)', 2, 9);
          g.fillStyle = '#4a86cf';
          g.fillRect(X2P(-1.1), 0, X2P(1.1) - X2P(-1.1), h);
          vline(g, -1.1, h, 0.06, white);
          vline(g, 1.1, h, 0.06, white);
          vline(g, -3.45, h, 0.08, white);
          vline(g, 3.45, h, 0.08, white);
          g.fillStyle = 'rgba(255,210,63,0.9)';
          for (let x = X2P(-3.4); x < X2P(3.4); x += 0.9 * PXM) g.fillRect(x, h * 0.5, 0.45 * PXM, 3);
          break;
        }
        case 'athletics': {
          g.fillStyle = '#d4654f';
          g.fillRect(0, 0, w, h);
          noise(g, w, h, 2500, 'rgba(120,40,30,0.18)', 2);
          noise(g, w, h, 900, 'rgba(255,220,200,0.10)', 2, 4);
          for (const x of [-3.3, -1.1, 1.1, 3.3]) vline(g, x, h, 0.06, white);
          g.fillStyle = 'rgba(255,255,255,0.9)';
          g.font = '700 46px Fredoka, "Trebuchet MS", sans-serif';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          ['1', '2', '3'].forEach((t, i) => {
            g.save();
            g.translate(X2P((i - 1) * 2.2), h * 0.3);
            g.scale(1, 1.6);
            g.fillText(t, 0, 0);
            g.restore();
          });
          g.fillRect(X2P(-3.3), h * 0.3 + 1.1 * PXM, X2P(3.3) - X2P(-3.3), 4);
          break;
        }
        case 'swimming': {
          g.fillStyle = '#f3f1ea';
          g.fillRect(0, 0, w, h);
          const t = 0.4 * PXM;
          g.fillStyle = 'rgba(120,150,170,0.28)';
          for (let x = 0; x < w; x += t) g.fillRect(x, 0, 1.2, h);
          for (let y = 0; y < h; y += t) g.fillRect(0, y, w, 1.2);
          g.fillStyle = '#6cc4e0';
          for (const x of [-1.1, 1.1]) g.fillRect(X2P(x) - 0.08 * PXM, 0, 0.16 * PXM, h);
          g.fillStyle = '#2b8fc4';
          g.fillRect(0, 0, X2P(-3.3), h);
          g.fillRect(X2P(3.3), 0, w - X2P(3.3), h);
          break;
        }
        case 'cycling': {
          g.fillStyle = '#e6c28e';
          g.fillRect(0, 0, w, h);
          const r = mkRng(2);
          const pw = 0.11 * PXM;
          for (let x = 0; x < w; x += pw) {
            g.fillStyle = `rgba(${170 + r() * 40},${120 + r() * 30},${70 + r() * 20},${0.14 + r() * 0.14})`;
            g.fillRect(x, 0, pw - 0.6, h);
            g.fillStyle = 'rgba(140,90,40,0.22)';
            g.fillRect(x, r() * h, pw, 1);
          }
          g.fillStyle = '#7cc8ee';
          g.fillRect(0, 0, X2P(-3.25), h);
          g.fillRect(X2P(3.25), 0, w - X2P(3.25), h);
          vline(g, -1.1, h, 0.07, '#2b3440');
          vline(g, 1.1, h, 0.07, '#e0484f');
          break;
        }
      }
    }),
  );
  return { tex, len };
}

/** Wooden velodrome banking texture (u across the slope, v along the track). */
function bankTexture(): THREE.Texture {
  return cachedTex('sports-bank', () =>
    tileTexture(256, 128, (g, w, h) => {
      g.fillStyle = '#e3bd86';
      g.fillRect(0, 0, w, h);
      const r = mkRng(8);
      for (let x = 0; x < w; x += 4) {
        g.fillStyle = `rgba(${160 + r() * 40},${110 + r() * 30},${60 + r() * 20},${0.12 + r() * 0.15})`;
        g.fillRect(x, 0, 3.4, h);
      }
      g.fillStyle = '#7cc8ee';
      g.fillRect(0, 0, 26, h);
      g.fillStyle = '#2b3440';
      g.fillRect(40, 0, 4, h);
      g.fillStyle = '#e0484f';
      g.fillRect(96, 0, 4, h);
      g.fillStyle = '#3f74c0';
      g.fillRect(200, 0, 4, h);
    }),
  );
}

/** Pool water texture: lane ropes + black lane stripes on the bottom. */
function poolTexture(): THREE.Texture {
  return cachedTex('sports-pool', () =>
    tileTexture(256, 256, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, w, 0);
      grd.addColorStop(0, '#38b6dc');
      grd.addColorStop(0.5, '#4cc6e6');
      grd.addColorStop(1, '#38b6dc');
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(30,80,140,0.35)';
      g.fillRect(w / 2 - 6, 0, 12, h);
      g.strokeStyle = 'rgba(255,255,255,0.22)';
      g.lineWidth = 2;
      const r = mkRng(4);
      for (let i = 0; i < 26; i++) {
        const x = r() * w, y = r() * h;
        g.beginPath();
        g.ellipse(x, y, 10 + r() * 14, 4 + r() * 5, r() * 0.6, 0, TAU);
        g.stroke();
      }
    }),
  );
}

/** Advertising board texture with cheerful, healthy slogans. */
function boardTexture(): THREE.Texture {
  return cachedTex('sports-boards', () =>
    tileTexture(2048, 64, (g, w, h) => {
      const items: [string, string, string][] = [
        ['KA PAI!', '#2fb5a8', '#ffffff'],
        ['DRINK WATER', '#5a8dee', '#ffffff'],
        ['GO TEAM!', '#ff9a3c', '#ffffff'],
        ['EAT YOUR VEGGIES', '#4fae5a', '#ffffff'],
        ['CHUR!', '#e85d8a', '#ffffff'],
        ['KIA ORA', '#ffc94a', '#2b3440'],
      ];
      const seg = w / items.length;
      items.forEach(([t, bg, fg], i) => {
        g.fillStyle = bg;
        g.fillRect(i * seg, 0, seg, h);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(i * seg, 0, seg, 5);
        g.fillStyle = fg;
        g.font = '700 38px Fredoka, "Trebuchet MS", sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(t, i * seg + seg / 2, h / 2 + 2);
      });
    }),
  );
}

// ------------------------------------------------------------------ sport icons (canvas)
function drawIcon(id: SportId, g: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  g.save();
  g.translate(cx, cy);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const W = '#ffffff';
  const ball = (fill: string, stroke = 'rgba(0,0,0,0.25)') => {
    g.fillStyle = fill;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.fill();
    g.strokeStyle = stroke;
    g.lineWidth = r * 0.12;
  };
  switch (id) {
    case 'rugby':
      g.rotate(-0.5);
      g.fillStyle = W;
      g.beginPath();
      g.ellipse(0, 0, r * 1.15, r * 0.7, 0, 0, TAU);
      g.fill();
      g.strokeStyle = '#2f6f9f';
      g.lineWidth = r * 0.12;
      g.beginPath();
      g.moveTo(-r * 0.4, 0);
      g.lineTo(r * 0.4, 0);
      for (let i = -2; i <= 2; i++) {
        g.moveTo(i * r * 0.16, -r * 0.14);
        g.lineTo(i * r * 0.16, r * 0.14);
      }
      g.stroke();
      break;
    case 'football':
      ball(W);
      g.fillStyle = '#2b3440';
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i / 5) * TAU;
        g.lineTo(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38);
      }
      g.fill();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i / 5) * TAU;
        g.beginPath();
        g.arc(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.26, 0, TAU);
        g.fill();
      }
      break;
    case 'netball':
      ball(W);
      g.strokeStyle = '#8a6fd6';
      g.lineWidth = r * 0.12;
      g.beginPath();
      g.arc(-r * 1.2, 0, r * 1.0, -0.8, 0.8);
      g.moveTo(r * 0.2 + r, 0);
      g.arc(r * 1.2, 0, r * 1.0, Math.PI - 0.8, Math.PI + 0.8);
      g.moveTo(0, -r);
      g.lineTo(0, r);
      g.stroke();
      break;
    case 'basketball':
      ball('#ff9a3c');
      g.strokeStyle = '#24304a';
      g.lineWidth = r * 0.1;
      g.beginPath();
      g.moveTo(-r, 0);
      g.lineTo(r, 0);
      g.moveTo(0, -r);
      g.lineTo(0, r);
      g.moveTo(-r * 0.7, -r * 0.7);
      g.quadraticCurveTo(-r * 0.2, 0, -r * 0.7, r * 0.7);
      g.moveTo(r * 0.7, -r * 0.7);
      g.quadraticCurveTo(r * 0.2, 0, r * 0.7, r * 0.7);
      g.stroke();
      break;
    case 'cricket':
      g.fillStyle = '#f4dfae';
      g.save();
      g.rotate(0.6);
      g.beginPath();
      g.roundRect(-r * 0.28, -r * 1.1, r * 0.56, r * 1.5, r * 0.2);
      g.fill();
      g.fillStyle = W;
      g.fillRect(-r * 0.09, r * 0.4, r * 0.18, r * 0.6);
      g.restore();
      g.fillStyle = '#e0484f';
      g.beginPath();
      g.arc(r * 0.6, r * 0.55, r * 0.34, 0, TAU);
      g.fill();
      break;
    case 'tennis':
      ball('#d8f05a');
      g.strokeStyle = W;
      g.lineWidth = r * 0.12;
      g.beginPath();
      g.arc(-r * 1.25, 0, r, -0.9, 0.9);
      g.stroke();
      g.beginPath();
      g.arc(r * 1.25, 0, r, Math.PI - 0.9, Math.PI + 0.9);
      g.stroke();
      break;
    case 'hockey':
      g.strokeStyle = W;
      g.lineWidth = r * 0.24;
      g.beginPath();
      g.moveTo(-r * 0.2, -r * 1.05);
      g.lineTo(-r * 0.2, r * 0.6);
      g.quadraticCurveTo(-r * 0.2, r * 0.95, -r * 0.65, r * 0.85);
      g.stroke();
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.arc(r * 0.5, r * 0.7, r * 0.3, 0, TAU);
      g.fill();
      break;
    case 'athletics':
      g.fillStyle = W;
      g.beginPath();
      g.arc(r * 0.25, -r * 0.8, r * 0.26, 0, TAU);
      g.fill();
      g.strokeStyle = W;
      g.lineWidth = r * 0.22;
      g.beginPath();
      g.moveTo(r * 0.1, -r * 0.45);
      g.lineTo(-r * 0.15, r * 0.25);
      g.lineTo(r * 0.4, r * 0.55);
      g.lineTo(r * 0.3, r * 1.0);
      g.moveTo(-r * 0.15, r * 0.25);
      g.lineTo(-r * 0.75, r * 0.85);
      g.moveTo(-r * 0.6, -r * 0.3);
      g.lineTo(r * 0.0, -r * 0.3);
      g.lineTo(r * 0.55, r * 0.05);
      g.stroke();
      break;
    case 'swimming':
      g.strokeStyle = W;
      g.lineWidth = r * 0.18;
      for (let k = 0; k < 2; k++) {
        g.beginPath();
        for (let x = -r; x <= r; x += 2) g.lineTo(x, r * 0.25 + k * r * 0.5 + Math.sin(x / (r * 0.28)) * r * 0.14);
        g.stroke();
      }
      g.fillStyle = W;
      g.beginPath();
      g.arc(-r * 0.1, -r * 0.45, r * 0.27, 0, TAU);
      g.fill();
      break;
    case 'cycling':
      g.strokeStyle = W;
      g.lineWidth = r * 0.13;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.arc(s * r * 0.6, r * 0.3, r * 0.42, 0, TAU);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(-r * 0.6, r * 0.3);
      g.lineTo(-r * 0.15, -r * 0.35);
      g.lineTo(r * 0.45, -r * 0.35);
      g.lineTo(r * 0.6, r * 0.3);
      g.moveTo(-r * 0.15, -r * 0.35);
      g.lineTo(r * 0.05, r * 0.3);
      g.lineTo(r * 0.45, -r * 0.35);
      g.stroke();
      break;
  }
  g.restore();
}

/** Welcome-arch banner: icon + sport name. */
function archTexture(s: Sport): THREE.Texture {
  return cachedTex(`sports-arch-${s.id}`, () =>
    canvasTexture(1024, 176, (g, w, h) => {
      g.fillStyle = css(s.main);
      g.beginPath();
      g.roundRect(0, 0, w, h, 36);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.beginPath();
      g.roundRect(0, 0, w, h * 0.45, [36, 36, 0, 0]);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.lineWidth = 7;
      g.beginPath();
      g.roundRect(14, 14, w - 28, h - 28, 26);
      g.stroke();
      drawIcon(s.id, g, 120, h / 2, 50);
      drawIcon(s.id, g, w - 120, h / 2, 50);
      g.fillStyle = '#ffffff';
      g.font = '700 104px Fredoka, "Trebuchet MS", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(s.label.toUpperCase(), w / 2, h / 2 + 6);
    }),
  );
}

/** Slide-under banner: sport colour, icon and friendly down chevrons (reads "duck!" without words). */
function duckTexture(s: Sport, variant: 'plain' | 'checker' = 'plain'): THREE.Texture {
  return cachedTex(`sports-duck-${s.id}-${variant}`, () =>
    canvasTexture(512, 192, (g, w, h) => {
      if (variant === 'checker') {
        const c = 32;
        for (let y = 0; y < h; y += c) for (let x = 0; x < w; x += c) {
          g.fillStyle = ((x + y) / c) % 2 ? '#2b3440' : '#ffffff';
          g.fillRect(x, y, c, c);
        }
        g.fillStyle = css(s.main);
        g.beginPath();
        g.roundRect(w / 2 - 150, 22, 300, h - 44, 30);
        g.fill();
      } else {
        g.fillStyle = css(s.main);
        g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        for (let x = -h; x < w; x += 56) {
          g.beginPath();
          g.moveTo(x, h);
          g.lineTo(x + 28, h);
          g.lineTo(x + 28 + h, 0);
          g.lineTo(x + h, 0);
          g.fill();
        }
      }
      drawIcon(s.id, g, variant === 'checker' ? w / 2 - 80 : 92, h / 2, 46);
      // chevrons pointing down
      g.strokeStyle = '#ffffff';
      g.lineWidth = 16;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      const cx = variant === 'checker' ? w / 2 + 50 : w / 2 + 40;
      for (const dy of [-28, 22]) {
        g.beginPath();
        g.moveTo(cx - 46, h / 2 + dy - 18);
        g.lineTo(cx, h / 2 + dy + 18);
        g.lineTo(cx + 46, h / 2 + dy - 18);
        g.stroke();
      }
      if (variant === 'plain') drawIcon(s.id, g, w - 92, h / 2, 46);
    }),
  );
}

function scoreTexture(s: Sport, home: number, away: number): THREE.Texture {
  return cachedTex(`sports-score-${s.id}`, () =>
    canvasTexture(512, 256, (g, w, h) => {
      g.fillStyle = '#1f2a3d';
      g.fillRect(0, 0, w, h);
      g.fillStyle = css(s.main);
      g.fillRect(0, 0, w, 62);
      g.fillStyle = '#ffffff';
      g.font = '700 40px Fredoka, "Trebuchet MS", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(s.label.toUpperCase(), w / 2, 33);
      drawIcon(s.id, g, 48, 32, 20);
      drawIcon(s.id, g, w - 48, 32, 20);
      g.font = '700 30px Fredoka, "Trebuchet MS", sans-serif';
      g.fillStyle = '#ffe9a8';
      g.fillText('KIWIS', w * 0.25, 92);
      g.fillText('TŪĪ', w * 0.75, 92);
      g.font = '700 104px Fredoka, "Trebuchet MS", sans-serif';
      g.fillStyle = '#ffffff';
      g.fillText(String(home), w * 0.25, 170);
      g.fillText(String(away), w * 0.75, 170);
      g.fillStyle = '#ffc94a';
      g.beginPath();
      g.arc(w / 2, 150, 9, 0, TAU);
      g.arc(w / 2, 186, 9, 0, TAU);
      g.fill();
      g.font = '600 24px Fredoka, "Trebuchet MS", sans-serif';
      g.fillStyle = '#9fd6f0';
      g.fillText('GOOD AS GOLD!', w / 2, 232);
    }),
  );
}

function signMaterial(key: string, tex: THREE.Texture, glow = 0.32): THREE.MeshStandardMaterial {
  return ownedMat(`sports-sign:${key}`, (m) => {
    m.map = tex;
    m.emissive.set(0xffffff);
    m.emissiveMap = tex;
    m.emissiveIntensity = glow;
  }, 0.7);
}
/** A textured quad facing +z (towards the runner) in an object's local space. */
function signQuad(key: string, tex: THREE.Texture, w: number, h: number, x: number, y: number, z: number, glow = 0.32, ry = 0): THREE.Mesh {
  const me = new THREE.Mesh(geo.plane(w, h), signMaterial(key, tex, glow));
  me.position.set(x, y, z);
  me.rotation.y = ry;
  return me;
}

// ------------------------------------------------------------------ crowd + people builders
/** Very cheap seated/standing fan for stands. */
function addFan(b: GeoBuilder, x: number, y: number, z: number, ry: number, shirt: number, r: () => number, wave: number): void {
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  const hair = HAIR[Math.floor(r() * HAIR.length)];
  const s = 0.9 + r() * 0.2;
  b.put(geo.box(0.4 * s, 0.5 * s, 0.28 * s), shirt, x, y + 0.27 * s, z, { ry, wave });
  b.put(tinySphere(0.16 * s), skin, x, y + 0.66 * s, z, { wave });
  const hx = -Math.sin(ry) * 0.03, hz = -Math.cos(ry) * 0.03;
  if (r() < 0.25) b.put(tinySphere(0.17 * s), r() < 0.5 ? 0xffffff : shirt, x + hx, y + 0.73 * s, z + hz, { sy: 0.5, wave });
  else b.put(geo.sphere(0.165 * s, 5, 3), hair, x + hx, y + 0.7 * s, z + hz, { sy: 0.8, wave });
  if (r() < 0.35) {
    // cheering arms
    const ax = Math.cos(ry), az = -Math.sin(ry);
    for (const sd of [-1, 1]) b.put(geo.box(0.09, 0.4, 0.09), shirt, x + ax * sd * 0.24 * s, y + 0.75 * s, z + az * sd * 0.24 * s, { ry, rz: sd * -0.3, wave });
  }
}

/** Animated person (5 meshes): body+head baked, arms and legs pivoting. Faces +z by default. */
interface Person {
  root: THREE.Group;
  body: THREE.Group;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  /** walk/jog cycle; phase in radians, amt 0..1 */
  pose(phase: number, amt: number): void;
}
interface PersonStyle {
  shirt: number;
  shorts: number;
  skin?: number;
  hair?: number;
  scale?: number;
  stripes?: number; // referee stripes colour
  hat?: number;
  coat?: boolean; // long umpire coat
  number?: boolean;
}
function makePerson(st: PersonStyle, r: () => number): Person {
  const s = st.scale ?? 1;
  const skin = st.skin ?? SKIN[Math.floor(r() * SKIN.length)];
  const hair = st.hair ?? HAIR[Math.floor(r() * HAIR.length)];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const b = new GeoBuilder();
  const hipY = 0.82 * s;
  // torso
  b.put(geo.rbox(0.5 * s, 0.62 * s, 0.32 * s, 0.12 * s, 2), st.shirt, 0, hipY + 0.34 * s, 0);
  if (st.stripes !== undefined) for (let i = 0; i < 3; i++) b.put(geo.box(0.52 * s, 0.07 * s, 0.34 * s), st.stripes, 0, hipY + (0.14 + i * 0.17) * s, 0);
  if (st.coat) b.put(geo.rbox(0.54 * s, 0.5 * s, 0.36 * s, 0.12 * s, 2), st.shirt, 0, hipY + 0.02 * s, 0);
  if (st.number) b.put(geo.box(0.18 * s, 0.22 * s, 0.02), 0xffffff, 0, hipY + 0.38 * s, -0.165 * s);
  b.put(geo.rbox(0.46 * s, 0.22 * s, 0.3 * s, 0.08 * s, 2), st.shorts, 0, hipY + 0.02 * s, 0);
  b.put(lo.cyl(0.07 * s, 0.08 * s, 0.12 * s), skin, 0, hipY + 0.7 * s, 0);
  // head
  const hy = hipY + 0.95 * s;
  b.put(geo.sphere(0.24 * s, 14, 10), skin, 0, hy, 0);
  b.put(geo.sphere(0.25 * s, 14, 10), hair, 0, hy + 0.06 * s, -0.04 * s, { sy: 0.82 });
  if (st.hat !== undefined) {
    b.put(lo.cyl(0.25 * s, 0.25 * s, 0.12 * s), st.hat, 0, hy + 0.2 * s, 0);
    b.put(lo.cyl(0.38 * s, 0.38 * s, 0.02 * s), st.hat, 0, hy + 0.14 * s, 0);
  }
  // friendly face (towards +z)
  for (const sd of [-1, 1]) b.put(geo.sphere(0.035 * s, 8, 6), PAL.ink, sd * 0.085 * s, hy + 0.02 * s, 0.215 * s);
  b.put(geo.torus(0.07 * s, 0.016 * s, 4, 10, Math.PI), PAL.ink, 0, hy - 0.06 * s, 0.215 * s, { rz: Math.PI });
  for (const sd of [-1, 1]) b.put(geo.sphere(0.04 * s, 8, 6), 0xff9f9f, sd * 0.14 * s, hy - 0.04 * s, 0.19 * s);
  b.into(body);
  const limb = (len: number, rad: number, col: number, end: number, endR: number) => {
    const piv = new THREE.Group();
    const lb = new GeoBuilder();
    lb.put(lo.capsule(rad, len), col, 0, -len / 2 - rad * 0.5, 0);
    lb.put(geo.sphere(endR, 10, 7), end, 0, -len - rad, 0.03 * s, { sz: 1.4 });
    lb.into(piv);
    return piv;
  };
  const armL = limb(0.46 * s, 0.075 * s, st.shirt, skin, 0.085 * s);
  const armR = limb(0.46 * s, 0.075 * s, st.shirt, skin, 0.085 * s);
  armL.position.set(-0.31 * s, hipY + 0.58 * s, 0);
  armR.position.set(0.31 * s, hipY + 0.58 * s, 0);
  const legL = limb(0.6 * s, 0.095 * s, skin, 0xffffff, 0.11 * s);
  const legR = limb(0.6 * s, 0.095 * s, skin, 0xffffff, 0.11 * s);
  legL.position.set(-0.13 * s, hipY - 0.04 * s, 0);
  legR.position.set(0.13 * s, hipY - 0.04 * s, 0);
  body.add(armL, armR, legL, legR);
  const p: Person = {
    root,
    body,
    armL,
    armR,
    legL,
    legR,
    pose(ph: number, amt: number) {
      const sw = Math.sin(ph) * 0.75 * amt;
      legL.rotation.x = sw;
      legR.rotation.x = -sw;
      armL.rotation.x = -sw * 0.9;
      armR.rotation.x = sw * 0.9;
      armL.rotation.z = -0.12;
      armR.rotation.z = 0.12;
      body.position.y = Math.abs(Math.cos(ph)) * 0.06 * amt * s;
    },
  };
  return p;
}

// ------------------------------------------------------------------ decor building blocks
const UNIT = () => geo.box(1, 1, 1);
/** Axis-aligned slab from x0..x1 (mirrored by side), y0..y1, distance a..d1. */
function slab(b: GeoBuilder, side: number, x0: number, x1: number, y0: number, y1: number, a: number, d1: number, col: number, o?: { sway?: number; wave?: number }): void {
  const xa = Math.min(x0, x1), xb = Math.max(x0, x1);
  b.put(UNIT(), col, side * ((xa + xb) / 2), (y0 + y1) / 2, -(a + d1) / 2, { sx: xb - xa, sy: Math.max(0.001, y1 - y0), sz: Math.max(0.001, d1 - a), sway: o?.sway, wave: o?.wave });
}

/** Quad strip running along the track between two cross-section points (x0,y0)-(x1,y1). */
function bandStrip(a: number, d1: number, x0: number, y0: number, x1: number, y1: number, m: THREE.Material, tileLen: number, uRepeat = 1, swap = false, uSign = 1): THREE.Mesh {
  const za = -a, zb = -d1;
  const P = [x0, y0, za, x1, y1, za, x1, y1, zb, x0, y0, zb];
  const va = a / tileLen, vb = d1 / tileLen;
  const UV = swap
    ? [uSign * va, 0, uSign * va, uRepeat, uSign * vb, uRepeat, uSign * vb, 0]
    : [0, va, uRepeat, va, uRepeat, vb, 0, vb];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const me = new THREE.Mesh(g, m);
  me.matrixAutoUpdate = false;
  return me;
}
function dsTexMat(slot: string, tex: THREE.Texture, rough = 0.8, glow = 0): THREE.MeshStandardMaterial {
  return ownedMat(`sports-ds:${slot}`, (m) => {
    m.map = tex;
    m.side = THREE.DoubleSide;
    if (glow > 0) {
      m.emissive.set(0xffffff);
      m.emissiveMap = tex;
      m.emissiveIntensity = glow;
    }
  }, rough);
}

/** Alternating mowing stripes along the track (grass / turf), from x0 to x1 on one side. */
function stripes(b: GeoBuilder, side: number, x0: number, x1: number, a: number, d1: number, c1: number, c2: number, every = 5): void {
  for (let d = Math.floor(a / every) * every; d < d1; d += every) {
    const s0 = Math.max(a, d), s1 = Math.min(d1, d + every);
    if (s1 > s0) slab(b, side, x0, x1, -0.12, -0.01, s0, s1, Math.floor(d / every) % 2 ? c1 : c2);
  }
}
/** Thin painted line along the track. */
function paintLine(b: GeoBuilder, side: number, x: number, a: number, d1: number, w = 0.08, col = 0xffffff): void {
  slab(b, side, x - w / 2, x + w / 2, -0.01, 0.004, a, d1, col);
}
/** Thin painted line across the track direction at distance d. */
function paintCross(b: GeoBuilder, side: number, x0: number, x1: number, d: number, w = 0.08, col = 0xffffff): void {
  slab(b, side, x0, x1, -0.01, 0.004, d - w / 2, d + w / 2, col);
}

const CONCRETE = [0xe3e8ee, 0xd6dde6];
/** Grandstand with a friendly crowd (wave), seats, back wall, optional roof and flags. */
function stands(st: GeoBuilder, sw: GeoBuilder, side: number, x0: number, a: number, d1: number, sp: Sport, r: () => number, tiers = 5, baseY = 0, roof = true): number {
  const TD = 1.05, TR = 0.52;
  const ry = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  const shirtA = side > 0 ? sp.home : sp.away;
  const shirtB = side > 0 ? sp.away : sp.home;
  const extra = [0xffffff, PAL.sun, PAL.coral, PAL.mint, PAL.lilac];
  slab(st, side, x0 - 0.25, x0, baseY - 0.2, baseY + 1.0, a, d1, 0xffffff);
  let top = baseY;
  for (let i = 0; i < tiers; i++) {
    const xi = x0 + i * TD;
    top = baseY + 0.85 + i * TR;
    slab(st, side, xi, xi + TD, baseY - 0.2, top, a, d1, CONCRETE[i % 2]);
    slab(st, side, xi + 0.45, xi + 0.9, top, top + 0.2, a, d1, i % 2 ? sp.main : mixHex(sp.main, 0xffffff, 0.35));
    for (let d = a + 0.4 + r() * 0.3; d < d1 - 0.3; d += 0.74 + r() * 0.12) {
      if (r() < (lowQuality ? 0.6 : 0.24 + i * 0.03)) continue;
      const roll = r();
      const shirt = roll < 0.45 ? shirtA : roll < 0.62 ? shirtB : extra[Math.floor(r() * extra.length)];
      addFan(sw, side * (xi + 0.62), top + 0.02, -d, ry, shirt, r, 0.38);
    }
  }
  const xb = x0 + tiers * TD;
  slab(st, side, xb, xb + 0.35, baseY - 0.2, top + 1.9, a, d1, sp.main);
  slab(st, side, xb - 0.05, xb + 0.4, top + 1.9, top + 2.1, a, d1, 0xffffff);
  if (roof) {
    const ry0 = top + 3.4;
    slab(st, side, x0 + 1.2, xb + 0.4, ry0, ry0 + 0.18, a, d1, 0xf4f6f8);
    slab(st, side, x0 + 1.2, x0 + 1.5, ry0 - 0.25, ry0, a, d1, sp.main);
    for (let d = Math.ceil(a / 10) * 10; d < d1; d += 10) st.put(lo.cyl(0.1, 0.12, ry0 - top), 0xffffff, side * (xb + 0.15), top + (ry0 - top) / 2, -d);
    for (let d = Math.ceil(a / 8) * 8 + 4; d < d1; d += 8) addFlag(sw, side * (xb + 0.2), -d, ry0 + 2.2 - baseY + baseY, Math.floor(d / 8) % 2 ? sp.main : sp.accent === 0xffffff ? PAL.sun : sp.accent, 1);
  } else {
    for (let d = Math.ceil(a / 8) * 8 + 4; d < d1; d += 8) addFlag(sw, side * (xb + 0.2), -d, top + 3.6, Math.floor(d / 8) % 2 ? sp.main : PAL.sun, 1);
  }
  return xb + 0.4;
}

/** Floodlight tower (glowing lamp panel). */
function floodlight(st: GeoBuilder, gl: GeoBuilder, x: number, z: number, h = 15): void {
  st.put(lo.cyl(0.16, 0.28, h), 0xe9edf2, x, h / 2, z);
  const sx = -Math.sign(x);
  st.put(geo.rbox(0.35, 1.9, 2.8, 0.08, 1), 0x66727f, x + sx * 0.15, h + 0.6, z, { rz: sx * 0.35 });
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) gl.put(geo.box(0.06, 0.42, 0.5), 0xfff3c4, x + sx * 0.36, h + 0.05 + i * 0.55, z - 1.0 + j * 0.66, { rz: sx * 0.35 });
}

/** Pōhutukawa: a spreading dark-green Kiwi tree dotted with crimson blossom. */
function addPohutukawa(b: GeoBuilder, x: number, z: number, s: number, r: () => number): void {
  b.put(lo.cyl(0.18 * s, 0.32 * s, 1.8 * s), 0x8a6a4e, x, 0.9 * s, z);
  for (const sd of [-1, 1]) b.put(lo.cyl(0.1 * s, 0.16 * s, 1.4 * s), 0x8a6a4e, x + sd * 0.45 * s, 1.9 * s, z, { rz: -sd * 0.7 });
  const blobs: [number, number, number, number][] = [
    [0, 2.7, 0, 1.25],
    [-1.1, 2.35, 0.2, 1.0],
    [1.1, 2.4, -0.2, 1.05],
    [0.2, 2.5, 0.9, 0.9],
    [-0.3, 2.45, -0.9, 0.9],
  ];
  for (const [bx, by, bz, br] of blobs) {
    b.put(lo.sphere(1), jitter(0x2f7a4a, r, 0.08), x + bx * s, by * s, z + bz * s, { s: br * s, sy: br * s * 0.72, sway: 0.03 });
    for (let k = 0; k < 7; k++) {
      const a = r() * TAU, e = r() * 0.9;
      const rr = br * s * 0.98;
      b.put(tinySphere(0.13 * s), r() < 0.5 ? 0xe0484f : 0xf06a5a, x + bx * s + Math.cos(a) * Math.cos(e) * rr, by * s + Math.sin(e) * rr * 0.72, z + bz * s + Math.sin(a) * Math.cos(e) * rr, { sy: 0.7, sway: 0.03 });
    }
  }
}

/** Big welcome arch over the track at distance d (posts outside the lanes, banner above 7 m). */
function welcomeArch(st: GeoBuilder, root: THREE.Object3D, sp: Sport, d: number): void {
  const z = -d;
  for (const sd of [-1, 1]) {
    st.put(geo.rbox(0.5, 8.9, 0.5, 0.12, 2), sp.main, sd * 4.45, 4.45, z);
    for (let i = 0; i < 4; i++) st.put(geo.box(0.53, 0.18, 0.53), 0xffffff, sd * 4.45, 1.2 + i * 1.6, z);
    st.put(geo.rbox(0.9, 0.3, 0.9, 0.1, 2), 0xffffff, sd * 4.45, 0.15, z);
    st.put(geo.sphere(0.42, 14, 10), PAL.sun, sd * 4.45, 9.25, z);
  }
  st.put(geo.rbox(9.6, 1.9, 0.35, 0.14, 2), 0xffffff, 0, 7.95, z - 0.05);
  root.add(signQuad(`arch-${sp.id}`, archTexture(sp), 9.3, 1.6, 0, 7.95, z + 0.14, 0.38));
}

/** Scoreboard on legs at the side of the track. */
function scoreboard(st: GeoBuilder, gl: GeoBuilder, root: THREE.Object3D, sp: Sport, x: number, d: number, y = 0, scale = 1): void {
  const z = -d;
  const ry = Math.sign(x) > 0 ? -0.45 : 0.45;
  const s = scale;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  const b = new GeoBuilder();
  for (const sd of [-1, 1]) b.put(geo.rbox(0.35, 4.2 * s, 0.35, 0.08, 1), 0x66727f, sd * 2.2 * s, 2.1 * s, 0);
  b.put(geo.rbox(5.6 * s, 3.1 * s, 0.45, 0.14, 2), 0x2b3440, 0, 5.2 * s, -0.05);
  b.put(geo.box(5.7 * s, 0.25 * s, 0.5), sp.main, 0, 6.8 * s, -0.05);
  b.into(g);
  const lamps = new GeoBuilder();
  for (let i = 0; i < 9; i++) lamps.put(geo.sphere(0.08 * s, 8, 6), i % 2 ? PAL.sun : 0xffffff, (-2.4 + i * 0.6) * s, 6.8 * s, 0.25);
  lamps.into(g, glowVcMat(1.1));
  const home = 12 + Math.floor(mkRng(sp.id.length * 13)() * 20);
  g.add(signQuad(`score-${sp.id}`, scoreTexture(sp, home, home - 3), 5.2 * s, 2.6 * s, 0, 5.2 * s, 0.19, 0.55));
  root.add(g);
  void st;
  void gl;
}

/** Hedge / tree line far behind for a soft park horizon. */
function treeLine(b: GeoBuilder, side: number, x: number, a: number, d1: number, r: () => number, pohutukawa = 0.35): void {
  for (let d = a + r() * 6; d < d1; d += 6 + r() * 6) {
    const xx = side * (x + r() * 6);
    if (r() < pohutukawa) addPohutukawa(b, xx, -d, 1.4 + r() * 0.6, r);
    else addRoundTree(b, xx, -d, 1.5 + r() * 0.7, 0x8a6a4e, [0x4fae5a, 0x5fbb62, 0x3f9a50], r, 0.04);
  }
}

/** A side court surface with white lines and a net across (axis along the track). */
function sideCourt(st: GeoBuilder, side: number, x0: number, x1: number, a: number, d1: number, col: number, line = 0xffffff): void {
  slab(st, side, x0, x1, -0.12, -0.005, a, d1, col);
  paintLine(st, side, x0 + 0.3, a, d1, 0.07, line);
  paintLine(st, side, x1 - 0.3, a, d1, 0.07, line);
  paintLine(st, side, (x0 + x1) / 2, a, d1, 0.06, line);
}

function netballPost(st: GeoBuilder, x: number, z: number, faceSide: number): void {
  st.put(lo.cyl(0.06, 0.07, 3.05), 0xd6dde6, x, 1.52, z);
  st.put(lo.cyl(0.18, 0.18, 0.8), 0x8a6fd6, x, 0.4, z);
  st.put(geo.box(0.04, 0.04, 0.2), 0xd6dde6, x + faceSide * 0.12, 3.0, z);
  st.put(geo.torus(0.19, 0.025, 6, 16), 0xf0564a, x + faceSide * 0.4, 3.0, z, { rx: Math.PI / 2 });
}
function basketHoop(st: GeoBuilder, x: number, z: number, faceSide: number, s = 1): void {
  st.put(geo.rbox(0.22, 2.8 * s, 0.22, 0.06, 1), 0x24304a, x, 1.4 * s, z);
  st.put(geo.box(0.9 * s, 0.12, 0.12), 0x24304a, x + faceSide * 0.4 * s, 2.75 * s, z);
  st.put(geo.box(0.06, 1.05 * s, 1.8 * s), 0xffffff, x + faceSide * 0.85 * s, 3.0 * s, z);
  st.put(geo.box(0.07, 0.45 * s, 0.6 * s), 0xe9772f, x + faceSide * 0.85 * s, 2.85 * s, z, { sx: 1 });
  st.put(geo.torus(0.23 * s, 0.025, 6, 16), 0xe9772f, x + faceSide * 1.15 * s, 2.65 * s, z, { rx: Math.PI / 2 });
  st.put(lo.cyl(0.22 * s, 0.14 * s, 0.4 * s), 0xffffff, x + faceSide * 1.15 * s, 2.45 * s, z);
}
function rugbyPosts(st: GeoBuilder, x: number, z: number): void {
  for (const sd of [-1, 1]) {
    st.put(lo.cyl(0.09, 0.11, 10), 0xffffff, x, 5, z + sd * 2.8);
    st.put(geo.rbox(0.5, 1.8, 0.5, 0.15, 2), 0x2f6f9f, x, 0.9, z + sd * 2.8);
  }
  st.put(lo.cyl(0.08, 0.08, 5.6), 0xffffff, x, 3.0, z, { rx: Math.PI / 2 });
}
function footballGoal(st: GeoBuilder, x: number, z: number, faceSide: number): void {
  for (const sd of [-1, 1]) st.put(lo.cyl(0.07, 0.07, 2.44), 0xffffff, x, 1.22, z + sd * 3.66);
  st.put(lo.cyl(0.07, 0.07, 7.32), 0xffffff, x, 2.44, z, { rx: Math.PI / 2 });
  // net: a see-through grid
  const nx = x - faceSide * 1.6;
  for (let k = -7; k <= 7; k++) st.put(geo.box(0.025, 2.4, 0.025), 0xe9edf2, nx, 1.2, z + k * 0.5);
  for (let y = 0.3; y < 2.4; y += 0.45) st.put(geo.box(0.025, 0.025, 7.3), 0xe9edf2, nx, y, z);
  for (let k = -7; k <= 7; k++) st.put(geo.box(1.6, 0.025, 0.025), 0xe9edf2, x - faceSide * 0.8, 2.42, z + k * 0.5);
  for (const sd of [-1, 1]) st.put(lo.cyl(0.04, 0.04, 1.6), 0xffffff, x - faceSide * 0.8, 2.42, z + sd * 3.66, { rz: Math.PI / 2 });
}
function cornerFlag(sw: GeoBuilder, x: number, z: number, col: number): void {
  sw.put(lo.cyl(0.025, 0.025, 1.5), 0xffffff, x, 0.75, z);
  sw.put(geo.box(0.02, 0.32, 0.45), col, x, 1.32, z + 0.23, { sway: 0.06 });
}
function hockeyGoal(st: GeoBuilder, x: number, z: number, faceSide: number): void {
  for (const sd of [-1, 1]) st.put(lo.cyl(0.05, 0.05, 2.14), 0xffffff, x, 1.07, z + sd * 1.83);
  st.put(lo.cyl(0.05, 0.05, 3.66), 0xffffff, x, 2.14, z, { rx: Math.PI / 2 });
  st.put(geo.box(1.2, 0.46, 0.05), 0x24304a, x - faceSide * 0.6, 0.23, z - 1.83);
  st.put(geo.box(1.2, 0.46, 0.05), 0x24304a, x - faceSide * 0.6, 0.23, z + 1.83);
  st.put(geo.box(0.05, 0.46, 3.66), 0x24304a, x - faceSide * 1.2, 0.23, z);
  st.put(geo.box(0.03, 2.1, 3.6), 0xe9edf2, x - faceSide * 1.2, 1.3, z);
}

/** Pavilion: white clubhouse with green roof and clock. */
function pavilion(st: GeoBuilder, gl: GeoBuilder, side: number, x: number, d: number): void {
  const z = -d;
  const X = side * x;
  st.put(geo.rbox(6, 4, 14, 0.15, 2), 0xfbf7ef, X + side * 3, 2, z);
  st.put(geo.box(7, 0.3, 15), 0x3d8f5a, X + side * 3, 4.15, z);
  st.put(lo.cone(1, 1), 0x3d8f5a, X + side * 3, 5.3, z, { sx: 5.4, sy: 2.2, sz: 10.5, ry: Math.PI / 4 });
  for (let i = 0; i < 5; i++) {
    st.put(geo.box(0.1, 1.4, 1.6), 0x9fd6f0, X - side * 0.02, 2.4, z - 5 + i * 2.5);
    st.put(lo.cyl(0.1, 0.1, 2.6), 0xffffff, X - side * 0.9, 1.3, z - 6 + i * 3);
  }
  st.put(geo.box(1.0, 0.18, 15), 0x3d8f5a, X - side * 0.4, 2.7, z);
  st.put(lo.cyl(0.6, 0.6, 0.12), 0xffffff, X + side * 0.04, 3.4, z, { rz: Math.PI / 2 });
  gl.put(lo.cyl(0.5, 0.5, 0.13), 0xfff4e0, X + side * 0.02, 3.4, z, { rz: Math.PI / 2 });
  st.put(geo.box(0.16, 0.36, 0.05), PAL.ink, X - side * 0.05, 3.5, z);
  st.put(lo.cyl(0.05, 0.05, 3), 0xffffff, X + side * 3, 7.5, z);
  st.put(geo.box(0.04, 0.6, 1.0), 0x3d8f5a, X + side * 3, 8.6, z + 0.5, { sway: 0.1 });
}

/** Picnic rug with a family sitting on a grassy bank. */
function picnicRug(st: GeoBuilder, sw: GeoBuilder, x: number, y: number, z: number, r: () => number, tilt = 0): void {
  const col = [PAL.coral, PAL.sun, PAL.mint, PAL.lilac, PAL.sea][Math.floor(r() * 5)];
  st.put(geo.box(1.6, 0.04, 1.4), col, x, y + 0.03, z, { rz: tilt });
  st.put(geo.box(1.62, 0.045, 0.12), 0xffffff, x, y + 0.035, z - 0.3, { rz: tilt });
  st.put(geo.box(1.62, 0.045, 0.12), 0xffffff, x, y + 0.035, z + 0.3, { rz: tilt });
  const n = 1 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const shirt = [PAL.coral, PAL.sea, PAL.sun, 0xffffff, PAL.berry][Math.floor(r() * 5)];
    addFan(sw, x + (r() - 0.5) * 1.0, y + 0.02 + (tilt ? 0.1 : 0), z + (r() - 0.5) * 0.9, Math.sign(x) > 0 ? -Math.PI / 2 : Math.PI / 2, shirt, r, 0);
  }
  if (r() < 0.6) st.put(geo.rbox(0.45, 0.3, 0.32, 0.06, 1), 0xc98f5a, x + 0.5, y + 0.2, z + 0.4);
}

// ------------------------------------------------------------------ per-sport stretch decor
function adBoards(root: THREE.Object3D, st: GeoBuilder, side: number, x: number, a: number, d1: number): void {
  const m = dsTexMat('boards', boardTexture(), 0.7, 0.22);
  root.add(bandStrip(a, d1, side * x, 0.05, side * x, 0.95, m, 36, 1, true, side > 0 ? -1 : 1));
  slab(st, side, x + 0.02, x + 0.25, -0.1, 0.98, a, d1, 0x3a4658);
}
function floods(st: GeoBuilder, gl: GeoBuilder, x: number, a: number, d1: number, h = 15): void {
  for (let d = Math.ceil((a - 40) / 80) * 80 + 40; d < d1; d += 80) if (d >= a) for (const sd of [-1, 1]) floodlight(st, gl, sd * x, -d, h);
}

let poolTexRef: THREE.Texture | null = null;
let lowQuality = false;

function buildPiece(root: THREE.Object3D, a: number, d1: number, sec: StageSection, r: () => number): void {
  const sp = sportOf(sec.id);
  const st = new GeoBuilder();
  const sw = new GeoBuilder();
  const gl = new GeoBuilder();
  const tt = trackTexture(sp.id);
  root.add(floorStrip(a, d1, -3.6, 3.6, texMat(`sports-${sp.id}`, tt.tex), tt.len));
  const local = (off: number): number => {
    const d = sec.start + off;
    return d >= a && d < d1 ? d : -1;
  };
  // kerbs framing the three lanes
  for (const sd of [-1, 1]) {
    slab(st, sd, 3.6, 3.85, -0.12, 0.05, a, d1, sp.main);
    slab(st, sd, 3.6, 3.68, 0.05, 0.06, a, d1, 0xffffff);
  }
  const ad = local(5);
  if (ad >= 0) welcomeArch(st, root, sp, ad);

  switch (sp.id) {
    case 'rugby':
    case 'football': {
      const rugby = sp.id === 'rugby';
      for (const sd of [-1, 1]) {
        stripes(st, sd, 3.85, 12.2, a, d1, rugby ? 0x73bf5f : 0x6dbb5c, rugby ? 0x83cc6e : 0x7cc86a, rugby ? 5 : 4);
        paintLine(st, sd, 11.6, a, d1, 0.1);
        adBoards(root, st, sd, 12.2, a, d1);
        const xb = stands(st, sw, sd, 12.7, a, d1, sp, r, 6, 0, true);
        if (sd < 0) treeLine(st, sd, xb + 3, a, d1, r, 0.5);
      }
      floods(st, gl, 22, a, d1);
      if (rugby) {
        for (const off of [30, 130]) {
          const d = local(off);
          if (d >= 0) for (const sd of [-1, 1]) rugbyPosts(st, sd * 8.5, -d);
        }
        for (let d = a + 6; d < d1; d += 13) {
          if (r() < 0.5) continue;
          const sd = r() < 0.5 ? -1 : 1;
          st.put(lo.cyl(0.32, 0.32, 1.2), r() < 0.5 ? sp.main : 0xf0564a, sd * (6 + r() * 4), 0.6, -d);
          st.put(lo.cyl(0.33, 0.33, 0.12), 0xffffff, sd * (6 + r() * 4), 0.9, -d);
        }
        for (let d = Math.ceil(a / 22) * 22; d < d1; d += 22) for (const sd of [-1, 1]) paintCross(st, sd, 3.85, 11.6, d, 0.1);
      } else {
        for (const off of [40, 150]) {
          const d = local(off);
          if (d >= 0) for (const sd of [-1, 1]) footballGoal(st, sd * 9.6, -d, -sd);
        }
        const cf = local(14);
        if (cf >= 0) for (const sd of [-1, 1]) cornerFlag(sw, sd * 11.4, -cf, PAL.orange);
        for (let d = a + 8; d < d1; d += 17) {
          const sd = r() < 0.5 ? -1 : 1;
          st.put(geo.sphere(0.22, 12, 8), 0xffffff, sd * (5 + r() * 5), 0.22, -d);
          st.put(lo.cone(0.18, 0.42), PAL.orange, sd * (5 + r() * 5), 0.21, -d - 3);
        }
        const cc = local(95);
        if (cc >= 0) for (const sd of [-1, 1]) st.put(geo.torus(4, 0.05, 3, 40), 0xffffff, sd * 8, -0.005, -cc, { rx: Math.PI / 2 });
      }
      const sb = local(rugby ? 85 : 110);
      if (sb >= 0) scoreboard(st, gl, root, sp, -10.2, sb);
      break;
    }
    case 'netball': {
      for (const sd of [-1, 1]) {
        slab(st, sd, 3.85, 4.2, -0.12, -0.01, a, d1, 0x7cc46a);
        sideCourt(st, sd, 4.2, 12.4, a, d1, 0x4b9fb4);
        slab(st, sd, 12.4, 13.6, -0.12, -0.01, a, d1, 0x7cc46a);
        // chain-link fence
        for (let d = Math.ceil(a / 3) * 3; d < d1; d += 3) st.put(lo.cyl(0.04, 0.04, 2.2), 0x9aa5b1, sd * 13, 1.1, -d);
        for (const y of [0.4, 1.2, 2.15]) slab(st, sd, 12.98, 13.02, y - 0.03, y + 0.03, a, d1, 0x9aa5b1);
        const xb = stands(st, sw, sd, 13.8, a, d1, sp, r, 3, 0, false);
        treeLine(st, sd, xb + 2, a, d1, r, 0.4);
      }
      for (let d = Math.ceil(a / 30) * 30 + 15; d < d1; d += 30) for (const sd of [-1, 1]) paintCross(st, sd, 4.2, 12.4, d, 0.07);
      for (const off of [25, 115]) {
        const d = local(off);
        if (d >= 0) for (const sd of [-1, 1]) netballPost(st, sd * 8.3, -d, -sd);
      }
      const sb = local(70);
      if (sb >= 0) scoreboard(st, gl, root, sp, -9.8, sb, 0, 0.85);
      break;
    }
    case 'basketball': {
      for (const sd of [-1, 1]) {
        slab(st, sd, 3.85, 11.2, -0.12, -0.01, a, d1, 0xd77a45);
        slab(st, sd, 5.2, 9.8, -0.1, 0.0, a, d1, 0x3f5ea8);
        paintLine(st, sd, 4.1, a, d1, 0.08);
        paintLine(st, sd, 5.2, a, d1, 0.06);
        paintLine(st, sd, 9.8, a, d1, 0.06);
        paintLine(st, sd, 10.9, a, d1, 0.08);
        adBoards(root, st, sd, 11.4, a, d1);
        stands(st, sw, sd, 11.9, a, d1, sp, r, 6, 0, true);
      }
      for (let d = Math.ceil(a / 16) * 16; d < d1; d += 16) for (const sd of [-1, 1]) paintCross(st, sd, 5.2, 9.8, d, 0.07);
      for (const off of [20, 100, 170]) {
        const d = local(off);
        if (d >= 0) for (const sd of [-1, 1]) basketHoop(st, sd * 10.6, -d, -sd);
      }
      floods(st, gl, 21, a, d1, 16);
      const sb = local(60);
      if (sb >= 0) scoreboard(st, gl, root, sp, -9.5, sb, 0.5, 1);
      break;
    }
    case 'cricket': {
      for (const sd of [-1, 1]) {
        stripes(st, sd, 3.85, 13.6, a, d1, 0x8acb6c, 0x7dc163, 6);
        st.put(lo.cyl(0.05, 0.05, d1 - a), 0xffffff, sd * 12.6, 0.05, -(a + d1) / 2, { rx: Math.PI / 2 });
        adBoards(root, st, sd, 13.6, a, d1);
        // grassy terraces (the bank)
        for (let i = 0; i < 4; i++) slab(st, sd, 14 + i * 2.2, 16.2 + i * 2.2, -0.12, 0.35 + i * 0.6, a, d1, i % 2 ? 0x7cc46a : 0x86cc72);
        for (let d = a + 1 + r() * 3; d < d1 - 1; d += 3.5 + r() * 3) {
          const i = Math.floor(r() * 4);
          picnicRug(st, sw, sd * (14.9 + i * 2.2 + r() * 0.4), 0.35 + i * 0.6, -d, r);
        }
        for (let d = a + r() * 5; d < d1; d += 7 + r() * 5) addPohutukawa(sw, sd * (24.5 + r() * 4), -d, 1.3 + r() * 0.5, r);
      }
      const pv = local(80);
      if (pv >= 0) pavilion(st, gl, 1, 14.5, pv + 2);
      const sb = local(140);
      if (sb >= 0) scoreboard(st, gl, root, sp, -11, sb, 2.2, 0.9);
      for (const off of [12, 180]) {
        const d = local(off);
        if (d >= 0)
          for (const sd of [-1, 1]) {
            st.put(geo.rbox(0.3, 3, 5, 0.06, 1), 0xffffff, sd * 10.5, 2.2, -d);
            for (const zz of [-2, 2]) st.put(lo.cyl(0.08, 0.08, 0.7), 0x66727f, sd * 10.5, 0.35, -d + zz);
          }
      }
      break;
    }
    case 'tennis': {
      for (const sd of [-1, 1]) {
        slab(st, sd, 3.85, 15, -0.12, -0.012, a, d1, 0x5aa36a);
        slab(st, sd, 5.0, 13.8, -0.1, -0.004, a, d1, 0x4f86c6);
        for (const x of [5.15, 6.5, 12.3, 13.65]) paintLine(st, sd, x, a, d1, 0.06);
        paintLine(st, sd, 9.4, a, d1, 0.05);
        // tall windbreak fence
        for (let d = Math.ceil(a / 3) * 3; d < d1; d += 3) st.put(lo.cyl(0.05, 0.05, 3.4), 0x66727f, sd * 15.2, 1.7, -d);
        slab(st, sd, 15.15, 15.25, 0.0, 2.4, a, d1, 0x3f7f5a);
        if (sd > 0) stands(st, sw, sd, 16, a, d1, sp, r, 4, 0, true);
        else treeLine(st, sd, 17.5, a, d1, r, 0.35);
      }
      for (let d = Math.ceil(a / 26) * 26; d < d1; d += 26)
        for (const sd of [-1, 1]) {
          paintCross(st, sd, 5.15, 13.65, d - 11.8, 0.07);
          // side-court nets across
          for (const x of [4.6, 14.2]) st.put(lo.cyl(0.05, 0.05, 1.07), 0x2b3440, sd * x, 0.53, -d);
          st.put(geo.box(9.6, 0.82, 0.03), 0x34404f, sd * 9.4, 0.5, -d);
          st.put(geo.box(9.6, 0.07, 0.05), 0xffffff, sd * 9.4, 0.94, -d);
          // umpire chair
          const ux = sd * 14.5;
          for (const zz of [-0.4, 0.4]) for (const xx of [-0.35, 0.35]) st.put(lo.cyl(0.04, 0.04, 2), 0x2f6a4a, ux + xx, 1, -d + zz);
          st.put(geo.rbox(0.8, 0.12, 0.8, 0.04, 1), 0x2f6a4a, ux, 2, -d);
          st.put(geo.rbox(0.1, 0.8, 0.8, 0.04, 1), 0x2f6a4a, ux + sd * 0.35, 2.4, -d);
        }
      const sb = local(90);
      if (sb >= 0) scoreboard(st, gl, root, sp, -12.5, sb, 0, 0.8);
      break;
    }
    case 'hockey': {
      for (const sd of [-1, 1]) {
        slab(st, sd, 3.85, 12, -0.12, -0.01, a, d1, 0x3b79c4);
        slab(st, sd, 12, 13.4, -0.12, -0.01, a, d1, 0x4fa65c);
        paintLine(st, sd, 11.5, a, d1, 0.08);
        stands(st, sw, sd, 13.6, a, d1, sp, r, 4, 0, true);
      }
      for (let d = Math.ceil(a / 23) * 23; d < d1; d += 23) for (const sd of [-1, 1]) paintCross(st, sd, 3.85, 11.5, d, 0.08);
      for (const off of [35, 140]) {
        const d = local(off);
        if (d >= 0) for (const sd of [-1, 1]) {
          hockeyGoal(st, sd * 10.2, -d, -sd);
          st.put(geo.torus(4.6, 0.05, 3, 30, Math.PI), 0xffffff, sd * 10.2, -0.005, -d, { rx: Math.PI / 2, rz: sd > 0 ? Math.PI / 2 : -Math.PI / 2 });
        }
      }
      const dg = local(95);
      if (dg >= 0)
        for (const sd of [-1, 1]) {
          st.put(geo.rbox(0.6, 0.45, 6, 0.08, 1), 0x2b3440, sd * 12.7, 0.25, -dg);
          st.put(geo.box(1.4, 0.06, 6.4), 0xbfe6f5, sd * 12.8, 2.1, -dg, { rz: sd * 0.12 });
          for (const zz of [-3, 3]) st.put(lo.cyl(0.05, 0.05, 2.1), 0x9aa5b1, sd * 13.3, 1.05, -dg + zz);
          for (let i = 0; i < 4; i++) addFan(sw, sd * 12.7, 0.45, -dg - 2 + i * 1.3, sd > 0 ? -Math.PI / 2 : Math.PI / 2, sd > 0 ? sp.home : sp.away, r, 0);
        }
      floods(st, gl, 20, a, d1);
      const sb = local(60);
      if (sb >= 0) scoreboard(st, gl, root, sp, -10.5, sb);
      break;
    }
    case 'athletics': {
      for (const sd of [-1, 1]) {
        slab(st, sd, 3.85, 9.2, -0.12, -0.01, a, d1, 0xd4654f);
        for (let i = 1; i <= 4; i++) paintLine(st, sd, 3.85 + i * 1.22, a, d1, 0.06);
      }
      stands(st, sw, 1, 9.6, a, d1, sp, r, 6, 0, true);
      // infield (left)
      slab(st, -1, 9.2, 34, -0.12, -0.012, a, d1, 0x7cc46a);
      stripes(st, -1, 9.4, 30, a, d1, 0x7cc46a, 0x86cc72, 8);
      const hj = local(55);
      if (hj >= 0) {
        st.put(geo.rbox(4, 0.7, 3, 0.2, 2), 0x3f74c0, -15, 0.35, -hj);
        st.put(geo.box(4.02, 0.08, 3.02), 0xffd23f, -15, 0.72, -hj);
        for (const zz of [-2, 2]) st.put(lo.cyl(0.05, 0.05, 2.4), 0xffffff, -12.6, 1.2, -hj + zz);
        st.put(lo.cyl(0.025, 0.025, 4), 0xf0564a, -12.6, 1.6, -hj, { rx: Math.PI / 2 });
      }
      const lj = local(125);
      if (lj >= 0) {
        slab(st, -1, 11, 14, -0.1, 0.0, lj - 4, lj + 4, 0xf1d79a);
        slab(st, -1, 12.2, 12.8, -0.1, 0.005, lj + 4, lj + 22, 0xd4654f);
        slab(st, -1, 12.1, 12.9, -0.1, 0.01, lj + 4.1, lj + 4.4, 0xffffff);
      }
      for (let d = Math.ceil(a / 20) * 20 + 10; d < d1; d += 20) {
        addFlag(sw, -9.9, -d, 3.2, d % 40 ? PAL.sun : PAL.teal, 1);
      }
      treeLine(st, -1, 26, a, d1, r, 0.5);
      floods(st, gl, 20.5, a, d1, 16);
      const sb = local(90);
      if (sb >= 0) scoreboard(st, gl, root, sp, -11, sb, 0, 1.1);
      break;
    }
    case 'swimming': {
      if (!poolTexRef) poolTexRef = poolTexture();
      const waterMat = dsTexMat('pool', poolTexRef, 0.15, 0.18);
      for (const sd of [-1, 1]) {
        slab(st, sd, 3.85, 4.6, -0.12, -0.01, a, d1, 0xf3f1ea);
        slab(st, sd, 4.6, 4.75, -1.2, -0.01, a, d1, 0x2b8fc4);
        root.add(bandStrip(a, d1, sd * 4.75, -0.28, sd * 16, -0.28, waterMat, 6, 4.5));
        slab(st, sd, 4.6, 16.2, -1.3, -1.2, a, d1, 0x2b8fc4);
        slab(st, sd, 16, 16.15, -1.2, -0.01, a, d1, 0x2b8fc4);
        slab(st, sd, 16.15, 18, -0.12, -0.01, a, d1, 0xf3f1ea);
        // lane ropes with coloured floats
        for (let k = 1; k <= 4; k++) {
          const x = sd * (4.75 + k * 2.25);
          for (let d = Math.ceil(a); d < d1; d += 1) {
            const c = (d % 10) < 2 ? 0xf0564a : k % 2 ? 0x3f74c0 : 0xffd23f;
            st.put(lo.cyl(0.07, 0.07, 0.9), c, x, -0.26, -d - 0.5, { rx: Math.PI / 2 });
          }
        }
        stands(st, sw, sd, 18.2, a, d1, sp, r, 5, 0, true);
      }
      const bf = local(60);
      if (bf >= 0)
        for (const sd of [-1, 1]) {
          for (const x of [4.9, 15.9]) st.put(lo.cyl(0.05, 0.05, 2.3), 0xd6dde6, sd * x, 1.0, -bf);
          st.put(lo.cyl(0.015, 0.015, 11.2), 0xffffff, sd * 10.4, 2.0, -bf, { rz: Math.PI / 2 });
          for (let x = 5.2; x < 15.8; x += 0.45) sw.put(pennant(0.4, 0.42), Math.round(x / 0.45) % 2 ? 0xf0564a : 0xffffff, sd * x, 2.0, -bf, { sway: 0.03 });
        }
      const tw = local(120);
      if (tw >= 0) {
        // diving tower beyond the left pool
        st.put(geo.rbox(1.6, 6, 1.6, 0.12, 2), 0xe9edf2, -17, 3, -tw);
        for (const [h, len] of [[3, 3.2], [5, 3.8], [6.6, 4.2]] as [number, number][]) st.put(geo.rbox(len, 0.16, 1.2, 0.06, 1), 0x2b9fd0, -17 + len / 2, h, -tw);
      }
      const sb = local(100);
      if (sb >= 0) scoreboard(st, gl, root, sp, 17.5, sb, 4.5, 1);
      break;
    }
    case 'cycling': {
      const bankMat = dsTexMat('bank', bankTexture(), 0.75);
      for (const sd of [-1, 1]) {
        root.add(bandStrip(a, d1, sd * 3.85, -0.01, sd * 13, 6.2, bankMat, 5, 1));
        slab(st, sd, 13, 13.2, 6.0, 7.1, a, d1, 0xe0484f);
        slab(st, sd, 13.2, 13.7, 5.8, 6.25, a, d1, 0xd6dde6);
        const xb = stands(st, sw, sd, 13.7, a, d1, sp, r, 5, 6.2, true);
        void xb;
      }
      for (let d = Math.ceil(a / 50) * 50 + 25; d < d1; d += 50) for (const sd of [-1, 1]) {
        // big sprint-line markings on the banking (vertical white stripe)
        const bm = new GeoBuilder();
        void bm;
        st.put(geo.box(0.06, 0.12, 0.25), 0xffffff, sd * 4.2, 0.08, -d);
      }
      const sb = local(70);
      if (sb >= 0) scoreboard(st, gl, root, sp, -21, sb, 7.6, 1.0);
      floods(st, gl, 24, a, d1, 18);
      break;
    }
  }
  st.into(root, vcMat(0.8));
  sw.into(root, swayMat());
  gl.into(root, glowVcMat(1.0));
}

// ------------------------------------------------------------------ obstacles
interface ObCtx {
  sp: Sport;
  w: number;
  hw: number;
  len: number;
  hl: number;
  req: ObstacleRequest;
  r: () => number;
}
type Anim = (t: number, dt: number, dist: number) => void;

/** For multi-lane footprints build one model per lane. */
function perLane(c: ObCtx, f: (cx: number, i: number) => void): void {
  const n = Math.max(1, Math.round(c.req.laneSpan));
  for (let i = 0; i < n; i++) f(-c.hw + 1.1 + i * 2.2, i);
}

// ---------- LOW (top <= req.height <= 0.9)
function lowSport(c: ObCtx, b: GeoBuilder, root: THREE.Group): void {
  const { sp, w, hw, hl, r } = c;
  const h = Math.min(0.9, c.req.height);
  switch (sp.id) {
    case 'rugby': {
      // padded tackle bags lying across the lane(s)
      const rr = Math.min(0.36, h / 2);
      const rows = Math.max(1, Math.round(c.len / 1.1));
      for (let k = 0; k < rows; k++) {
        const z = rows === 1 ? 0 : -hl + 0.5 + (k * (c.len - 1)) / Math.max(1, rows - 1);
        perLane(c, (cx, i) => {
          const col = (i + k) % 2 ? 0xf0564a : sp.main;
          b.put(lo.cyl(rr, rr, 1.95), col, cx, rr, z, { rz: Math.PI / 2 });
          for (const s of [-0.55, 0.55]) b.put(lo.cyl(rr + 0.01, rr + 0.01, 0.16), 0xffffff, cx + s, rr, z, { rz: Math.PI / 2 });
          for (const s of [-1, 1]) b.put(geo.sphere(rr * 0.98, 12, 8), col, cx + s * 0.975, rr, z, { sx: 0.25 });
          b.put(geo.box(0.06, 0.03, rr * 1.6), 0x2b3440, cx, rr * 2 - 0.02, z);
        });
      }
      break;
    }
    case 'football': {
      perLane(c, (cx) => {
        for (const s of [-0.82, 0, 0.82]) {
          b.put(lo.cone(0.2, h - 0.12), PAL.orange, cx + s, (h - 0.12) / 2, 0);
          b.put(geo.box(0.42, 0.04, 0.42), PAL.orange, cx + s, 0.02, 0);
          b.put(lo.cyl(0.115, 0.13, 0.08), 0xffffff, cx + s, (h - 0.12) * 0.45, 0);
        }
        b.put(geo.rbox(2.0, 0.16, 0.16, 0.07, 2), PAL.lemon, cx, h - 0.1, 0);
      });
      b.put(geo.sphere(0.2, 14, 10), 0xffffff, hw - 0.4, 0.2, -0.35);
      break;
    }
    case 'netball':
    case 'basketball': {
      const ballCol = sp.id === 'basketball' ? 0xff9a3c : 0xffffff;
      perLane(c, (cx) => {
        const bw = 1.9, bd = Math.min(0.9, c.len - 0.1), top = h - 0.02;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          b.put(geo.box(0.05, top - 0.12, 0.05), 0x9aa5b1, cx + sx * bw / 2, 0.12 + (top - 0.12) / 2, sz * bd / 2);
          b.put(lo.cyl(0.07, 0.07, 0.05), 0x2b3440, cx + sx * (bw / 2 - 0.05), 0.07, sz * (bd / 2 - 0.05), { rz: Math.PI / 2 });
        }
        b.put(geo.box(bw, 0.04, bd), 0x9aa5b1, cx, 0.16, 0);
        for (const sz of [-1, 1]) b.put(geo.box(bw, 0.04, 0.04), sp.main, cx, top - 0.02, sz * bd / 2);
        for (const sx of [-1, 1]) b.put(geo.box(0.04, 0.04, bd), sp.main, cx + sx * bw / 2, top - 0.02, 0);
        const br = 0.16;
        for (let ix = 0; ix < 5; ix++) for (let iz = 0; iz < 2; iz++) {
          const bc = sp.id === 'netball' ? ((ix + iz) % 2 ? 0xffffff : 0xb59cf0) : ballCol;
          b.put(geo.sphere(br, 12, 8), bc, cx - 0.72 + ix * 0.36, 0.18 + br, -0.2 + iz * 0.4);
          if ((ix + iz) % 2 === 0) b.put(geo.sphere(br, 12, 8), bc, cx - 0.54 + ix * 0.36, Math.min(top - br, 0.18 + br * 2.7), -0.05 + iz * 0.12);
        }
      });
      break;
    }
    case 'cricket': {
      perLane(c, (cx) => {
        b.put(geo.rbox(1.75, Math.min(0.46, h), 0.62, 0.16, 2), 0x2f4a7a, cx, Math.min(0.46, h) / 2, 0.15);
        b.put(geo.box(1.76, 0.06, 0.1), PAL.sun, cx, Math.min(0.46, h) * 0.6, 0.47);
        b.put(geo.rbox(0.95, 0.07, 0.17, 0.03, 1), 0xf4dfae, cx - 0.25, Math.min(0.46, h) + 0.035, 0.15, { ry: 0.15 });
        b.put(lo.cyl(0.025, 0.025, 0.4), 0x2b3440, cx + 0.42, Math.min(0.46, h) + 0.035, 0.12, { rz: Math.PI / 2, ry: 0.15 });
        const sh = Math.min(h, 0.78) - 0.04;
        for (const s of [-0.12, 0, 0.12]) b.put(lo.cyl(0.03, 0.03, sh), 0xf4e2b8, cx + s, sh / 2, -0.32);
        for (const s of [-0.06, 0.06]) b.put(lo.cyl(0.018, 0.018, 0.12), 0xc98f5a, cx + s, sh + 0.015, -0.32, { rz: Math.PI / 2 });
      });
      break;
    }
    case 'tennis': {
      const top = h - 0.02;
      for (const s of [-1, 1]) {
        b.put(lo.cyl(0.05, 0.05, top - 0.06), 0x2f6a4a, s * (hw - 0.08), (top - 0.06) / 2, 0);
        b.put(geo.sphere(0.06, 8, 6), 0x2f6a4a, s * (hw - 0.08), top - 0.07, 0);
      }
      b.put(geo.box(w - 0.2, top - 0.1, 0.025), 0x34404f, 0, (top - 0.1) / 2 + 0.03, 0);
      for (let y = 0.12; y < top - 0.08; y += 0.12) b.put(geo.box(w - 0.2, 0.012, 0.03), 0x6b7a8c, 0, y, 0);
      for (let x = -hw + 0.2; x < hw - 0.15; x += 0.15) b.put(geo.box(0.012, top - 0.12, 0.03), 0x6b7a8c, x, (top - 0.1) / 2 + 0.03, 0);
      b.put(geo.box(w - 0.18, 0.08, 0.05), 0xffffff, 0, top - 0.06, 0);
      b.put(geo.box(0.06, top - 0.1, 0.04), 0xffffff, 0, (top - 0.1) / 2 + 0.03, 0);
      b.put(geo.sphere(0.07, 10, 8), 0xd8f05a, hw - 0.5, 0.07, 0.4);
      b.put(geo.sphere(0.07, 10, 8), 0xd8f05a, -hw + 0.7, 0.07, -0.3);
      break;
    }
    case 'hockey': {
      const bh = Math.min(0.55, h - 0.04);
      perLane(c, (cx) => {
        b.put(geo.rbox(2.0, bh, 0.14, 0.04, 1), 0x24304a, cx, bh / 2, 0);
        b.put(geo.box(2.02, 0.08, 0.16), PAL.sun, cx, bh - 0.08, 0);
        for (const s of [-0.85, 0.85]) b.put(geo.box(0.1, 0.06, 0.5), 0x24304a, cx + s, 0.03, -0.1);
        for (const s of [-0.4, 0.45]) {
          b.put(geo.box(0.05, 0.05, 0.85), 0xc98f5a, cx + s, 0.5 * bh + 0.05, 0.2, { rx: -1.0 });
          b.put(geo.torus(0.07, 0.025, 6, 10, Math.PI), 0xc98f5a, cx + s, 0.05, 0.47, { ry: Math.PI / 2 });
        }
      });
      b.put(geo.sphere(0.075, 10, 8), 0xfff4e0, 0.3, 0.075, 0.35);
      break;
    }
    case 'athletics': {
      perLane(c, (cx) => {
        const top = h - 0.02;
        for (const s of [-0.9, 0.9]) {
          b.put(geo.box(0.06, top - 0.05, 0.06), 0xd6dde6, cx + s, (top - 0.05) / 2, -0.15);
          b.put(geo.box(0.08, 0.05, 0.7), 0x66727f, cx + s, 0.025, -0.05);
        }
        for (let i = 0; i < 6; i++) b.put(geo.box(1.86 / 6, 0.14, 0.04), i % 2 ? 0x2b3440 : 0xffffff, cx - 0.93 + (i + 0.5) * (1.86 / 6), top - 0.07, -0.15);
        b.put(geo.box(1.8, 0.04, 0.04), 0xd6dde6, cx, top * 0.45, -0.15);
      });
      break;
    }
    case 'swimming': {
      perLane(c, (cx) => {
        b.put(geo.rbox(2.0, 0.16, 0.7, 0.06, 1), 0x2b9fd0, cx, 0.08, 0);
        const cols = [0xff7aa8, 0xb4e05a, 0xffb347];
        const R = Math.min(0.36, h - 0.08 - 0.06);
        cols.forEach((col, i) => {
          b.put(geo.torus(R, 0.065, 8, 16, Math.PI), col, cx - 0.62 + i * 0.62, 0.14, (i - 1) * 0.12);
        });
        b.put(geo.rbox(0.42, 0.05, 0.6, 0.02, 1), 0xffd23f, cx + 0.7, 0.19, 0.15, { rx: -0.1 });
      });
      break;
    }
    case 'cycling':
    default: {
      perLane(c, (cx) => {
        for (const s of [-0.85, 0.85]) {
          b.put(lo.cone(0.2, h - 0.04), PAL.orange, cx + s, (h - 0.04) / 2, 0.1);
          b.put(lo.cyl(0.11, 0.13, 0.08), 0xffffff, cx + s, (h - 0.04) * 0.5, 0.1);
          b.put(geo.box(0.44, 0.04, 0.44), 0x2b3440, cx + s, 0.02, 0.1);
        }
        for (let i = 0; i < 5; i++) b.put(geo.box(0.29, 0.2, 0.06), i % 2 ? 0xffffff : 0xe0484f, cx - 0.58 + i * 0.29, h - 0.3, 0.1);
        b.put(geo.box(1.5, 0.04, 0.04), 0x66727f, cx, h * 0.3, 0.1);
      });
      break;
    }
  }
  void r;
  void root;
}

// ---------- HIGH (nothing below 1.05 inside the span; body up to >= 2.2)
function highSport(c: ObCtx, b: GeoBuilder, root: THREE.Group): void {
  const { sp, w, hw } = c;
  const top = Math.max(2.3, Math.min(2.9, c.req.height));
  const postX = (rad: number) => hw + rad + 0.02;
  const barSpan = w + 0.5;
  const banner = (y0: number, y1: number, variant: 'plain' | 'checker' = 'plain') => {
    b.put(geo.box(w + 0.1, y1 - y0, 0.06), sp.main, 0, (y0 + y1) / 2, -0.02);
    root.add(signQuad(`duck-${sp.id}-${variant}`, duckTexture(sp, variant), w + 0.08, y1 - y0, 0, (y0 + y1) / 2, 0.015, 0.3));
  };
  switch (sp.id) {
    case 'football': {
      const px = postX(0.08);
      for (const s of [-1, 1]) b.put(lo.cyl(0.08, 0.08, top + 0.1), 0xffffff, s * px, (top + 0.1) / 2, 0);
      b.put(lo.cyl(0.08, 0.08, 2 * px + 0.16), 0xffffff, 0, top + 0.06, 0, { rz: Math.PI / 2 });
      // free-kick target sheet hanging from the crossbar
      b.put(geo.box(w, top - 1.12, 0.04), PAL.lemon, 0, (top + 1.12) / 2, -0.05);
      b.put(geo.box(w + 0.02, 0.07, 0.05), 0x2b3440, 0, 1.15, -0.05);
      for (const [x, y] of [[-0.55, 0.7], [0.55, 0.7], [-0.55, 0.3], [0.55, 0.3]] as [number, number][]) {
        const yy = 1.12 + y * (top - 1.12);
        for (let k = 0; k < c.req.laneSpan; k++) {
          const ox = -hw + 1.1 + k * 2.2;
          b.put(lo.disc(0.26, 18), 0x2fa36b, ox + x, yy, -0.02, { rx: Math.PI / 2 });
          b.put(geo.torus(0.27, 0.035, 6, 18), 0xffffff, ox + x, yy, -0.015);
        }
      }
      // net roof behind (stays high)
      b.put(geo.box(2 * px, 0.03, 1.2), 0xe9edf2, 0, top, -0.65);
      for (const s of [-1, 1]) b.put(lo.cyl(0.04, 0.04, top), 0xffffff, s * px, top / 2, -1.25);
      break;
    }
    case 'basketball': {
      const px = postX(0.14);
      for (const s of [-1, 1]) {
        b.put(geo.rbox(0.28, top + 0.4, 0.28, 0.08, 2), 0x24304a, s * px, (top + 0.4) / 2, -0.3);
        b.put(geo.rbox(0.5, 1.3, 0.5, 0.15, 2), sp.main, s * (px + 0.12), 0.65, -0.3);
        b.put(geo.box(0.4, 0.14, 0.14), 0x24304a, s * (px - 0.2), top - 0.2, -0.15);
      }
      b.put(geo.rbox(w, 0.16, 0.18, 0.06, 1), 0x24304a, 0, top + 0.12, -0.3);
      // backboard
      const by0 = 1.38;
      b.put(geo.rbox(w - 0.1, top - by0 + 0.05, 0.1, 0.05, 2), 0xffffff, 0, (top + by0) / 2, -0.18);
      b.put(geo.box(w - 0.24, 0.06, 0.11), sp.main, 0, top - 0.06, -0.17);
      b.put(geo.box(w - 0.24, 0.06, 0.11), sp.main, 0, by0 + 0.06, -0.17);
      perLane(c, (cx) => {
        b.put(geo.box(0.7, 0.05, 0.11), sp.main, cx, by0 + 0.55, -0.16);
        b.put(geo.box(0.05, 0.45, 0.11), sp.main, cx - 0.33, by0 + 0.35, -0.16);
        b.put(geo.box(0.05, 0.45, 0.11), sp.main, cx + 0.33, by0 + 0.35, -0.16);
        b.put(geo.torus(0.3, 0.03, 6, 20), sp.main, cx, by0 + 0.12, 0.2, { rx: Math.PI / 2 });
        b.put(geo.box(0.1, 0.06, 0.12), sp.main, cx, by0 + 0.12, -0.08);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU;
          b.put(geo.box(0.02, 0.26, 0.02), 0xffffff, cx + Math.cos(a) * 0.24, by0 - 0.02, 0.2 + Math.sin(a) * 0.24, { rz: Math.cos(a) * 0.25, rx: -Math.sin(a) * 0.25 });
        }
        b.put(geo.torus(0.19, 0.015, 4, 16), 0xffffff, cx, by0 - 0.14, 0.2, { rx: Math.PI / 2 });
      });
      break;
    }
    case 'tennis': {
      const px = postX(0.07);
      for (const s of [-1, 1]) {
        b.put(lo.cyl(0.07, 0.08, top + 0.1), 0x2f6a4a, s * px, (top + 0.1) / 2, 0);
        b.put(geo.sphere(0.09, 10, 8), PAL.lemon, s * px, top + 0.15, 0);
      }
      const y0 = 1.14;
      b.put(geo.box(w, top - y0 - 0.1, 0.025), 0x34404f, 0, (top + y0) / 2 - 0.05, 0);
      for (let y = y0 + 0.13; y < top - 0.1; y += 0.13) b.put(geo.box(w, 0.014, 0.03), 0x6e7d90, 0, y, 0);
      for (let x = -hw + 0.12; x < hw; x += 0.14) b.put(geo.box(0.014, top - y0 - 0.12, 0.03), 0x6e7d90, x, (top + y0) / 2 - 0.05, 0);
      b.put(geo.rbox(w + 0.06, 0.1, 0.06, 0.03, 1), 0xffffff, 0, top - 0.05, 0);
      b.put(geo.rbox(w + 0.06, 0.08, 0.06, 0.03, 1), 0xffffff, 0, y0 + 0.02, 0);
      // a couple of balls stuck in the net (cute)
      b.put(geo.sphere(0.07, 10, 8), 0xd8f05a, -hw + 0.9, y0 + 0.5, 0.05);
      b.put(geo.sphere(0.07, 10, 8), 0xd8f05a, hw - 0.6, y0 + 0.8, 0.05);
      break;
    }
    case 'swimming': {
      const px = postX(0.06);
      for (const s of [-1, 1]) {
        b.put(lo.cyl(0.06, 0.06, top + 0.2), 0xd6dde6, s * px, (top + 0.2) / 2, 0);
        b.put(geo.sphere(0.09, 10, 8), 0x2b9fd0, s * px, top + 0.22, 0);
      }
      const rows: [number, number][] = [
        [top, top - 0.62],
        [top - 0.58, 1.14],
      ];
      const cols = [0xf0564a, 0xffffff, 0x3f74c0, 0xffffff];
      rows.forEach(([yTop, yBot], ri) => {
        b.put(lo.cyl(0.02, 0.02, 2 * px), 0x66727f, 0, yTop, 0, { rz: Math.PI / 2 });
        const pw = 0.4;
        let k = 0;
        for (let x = -hw + pw / 2; x <= hw - pw / 2 + 0.001; x += pw * 0.92, k++) b.put(pennant(pw, yTop - yBot), cols[(k + ri) % cols.length], x, yTop, ri * 0.02);
      });
      break;
    }
    case 'athletics': {
      const px = postX(0.07);
      for (const s of [-1, 1]) {
        b.put(lo.cyl(0.07, 0.07, top + 0.25), 0xffffff, s * px, (top + 0.25) / 2, 0);
        for (let i = 0; i < 6; i++) b.put(lo.cyl(0.072, 0.072, 0.12), 0x2b3440, s * px, 0.4 + i * 0.4, 0);
        b.put(geo.box(0.14, 0.06, 0.7), 0x66727f, s * (px + 0.02), 0.03, 0);
      }
      // the high-jump bar
      const segs = 10;
      for (let i = 0; i < segs; i++) b.put(lo.cyl(0.055, 0.055, (2 * px) / segs), i % 2 ? 0xffffff : 0xf0564a, -px + (i + 0.5) * ((2 * px) / segs), 1.16, 0, { rz: Math.PI / 2 });
      banner(1.32, top - 0.02);
      b.put(lo.cyl(0.04, 0.04, 2 * px), 0xffffff, 0, top, 0, { rz: Math.PI / 2 });
      break;
    }
    case 'cricket': {
      const px = postX(0.13);
      for (const s of [-1, 1]) {
        b.put(lo.cyl(0.13, 0.13, top + 0.2), 0xf4e2b8, s * px, (top + 0.2) / 2, 0);
        b.put(geo.sphere(0.13, 10, 8), 0xf4e2b8, s * px, top + 0.2, 0);
      }
      // a giant cricket bat laid across
      b.put(geo.rbox(w + 0.1, 0.32, 0.13, 0.06, 2), 0xf4dfae, -0.25, 1.28, 0);
      b.put(geo.box(w * 0.5, 0.06, 0.14), 0xd9bf8a, -0.25, 1.4, 0);
      b.put(lo.cyl(0.07, 0.07, 0.7), 0x2b3440, hw + 0.45, 1.28, 0.0, { rz: Math.PI / 2 });
      banner(1.46, top - 0.04);
      b.put(lo.cyl(0.05, 0.05, 2 * px), 0xf4e2b8, 0, top, 0, { rz: Math.PI / 2 });
      break;
    }
    case 'netball': {
      const px = postX(0.08);
      for (const s of [-1, 1]) {
        b.put(lo.cyl(0.08, 0.08, 3.1), 0xd6dde6, s * px, 1.55, 0);
        b.put(geo.rbox(0.44, 1.2, 0.44, 0.14, 2), sp.main, s * (px + 0.13), 0.6, 0);
        b.put(geo.torus(0.22, 0.03, 6, 16), 0xf0564a, s * (px - 0.3), 3.05, 0, { rx: Math.PI / 2 });
      }
      b.put(geo.rbox(barSpan, 0.26, 0.26, 0.1, 2), 0xffffff, 0, 1.24, 0);
      banner(1.37, top - 0.08);
      b.put(geo.rbox(barSpan, 0.16, 0.18, 0.06, 1), 0xffffff, 0, top, 0);
      // streamers
      for (let x = -hw + 0.2; x < hw; x += 0.32) b.put(geo.box(0.06, 0.12, 0.01), Math.round(x / 0.32) % 2 ? PAL.sun : sp.main, x, 1.15, 0.14);
      break;
    }
    case 'rugby':
    case 'hockey':
    case 'cycling':
    default: {
      const isRugby = sp.id === 'rugby';
      const rad = isRugby ? 0.1 : 0.12;
      const px = postX(isRugby ? 0.26 : rad);
      const postH = isRugby ? 4.6 : top + 0.3;
      const postCol = sp.id === 'cycling' ? 0xe0484f : 0xffffff;
      for (const s of [-1, 1]) {
        b.put(lo.cyl(rad, rad, postH), postCol, s * px, postH / 2, 0);
        if (isRugby) b.put(geo.rbox(0.5, 1.9, 0.5, 0.16, 2), sp.main, s * px, 0.95, 0);
        else b.put(geo.rbox(0.24, 0.2, 0.5, 0.06, 1), 0x66727f, s * (px + 0.02), 0.1, 0);
        if (isRugby) b.put(geo.box(0.52, 0.18, 0.52), 0xffffff, s * px, 1.6, 0);
      }
      b.put(geo.rbox(2 * px + 0.2, 0.32, 0.34, 0.12, 2), isRugby ? 0xffffff : sp.main, 0, 1.25, 0);
      banner(1.41, top - 0.1, sp.id === 'cycling' ? 'checker' : 'plain');
      b.put(geo.rbox(2 * px + 0.2, 0.2, 0.22, 0.08, 1), isRugby ? 0xffffff : sp.accent, 0, top, 0);
      for (let x = -hw + 0.15; x < hw; x += 0.3) b.put(geo.box(0.07, 0.12, 0.01), Math.round(x / 0.3) % 2 ? 0xffffff : sp.accent === 0xffffff ? PAL.sun : sp.accent, x, 1.15, 0.18);
      break;
    }
  }
}

// ---------- BLOCK (solid, 2.4..3.2 tall)
function blockSport(c: ObCtx, b: GeoBuilder, root: THREE.Group): void {
  const { sp, r } = c;
  const H = clamp(c.req.height, 2.4, 3.15);
  const dz = Math.min(c.len, 1.6);
  switch (sp.id) {
    case 'rugby':
      perLane(c, (cx) => {
        for (const s of [-0.85, 0.85]) b.put(geo.rbox(0.18, 0.18, dz + 0.4, 0.06, 1), 0x66727f, cx + s, 0.09, 0);
        b.put(geo.rbox(1.95, 0.2, 0.3, 0.06, 1), 0x66727f, cx, 0.28, -dz / 2 + 0.2);
        for (const s of [-0.85, 0.85]) b.put(geo.rbox(0.16, H - 0.4, 0.16, 0.05, 1), 0x66727f, cx + s, (H - 0.4) / 2 + 0.1, -0.35);
        b.put(geo.rbox(1.95, 0.18, 0.18, 0.06, 1), 0x66727f, cx, H - 0.45, -0.35);
        for (const s of [-0.67, 0, 0.67]) {
          b.put(geo.rbox(0.6, 1.15, 0.55, 0.2, 3), sp.main, cx + s, 1.32, 0.12);
          b.put(geo.rbox(0.62, 0.14, 0.57, 0.06, 2), 0xffffff, cx + s, 1.75, 0.12);
        }
        b.put(geo.rbox(2.1, 0.55, 1.0, 0.2, 3), sp.main, cx, H - 0.28, -0.2);
        b.put(geo.box(2.12, 0.1, 1.02), 0xffffff, cx, H - 0.42, -0.2);
        b.put(geo.rbox(1.6, 0.5, 0.8, 0.1, 2), 0x8a96a6, cx, 0.45, -0.25);
      });
      break;
    case 'football':
      perLane(c, (cx, i) => {
        b.put(geo.rbox(2.1, 0.12, 0.6, 0.05, 1), 0x66727f, cx, 0.06, 0);
        for (let k = 0; k < 3; k++) {
          const x = cx - 0.68 + k * 0.68;
          const col = (k + i) % 2 ? PAL.sea : PAL.lemon;
          b.put(lo.cyl(0.07, 0.07, 0.3), 0x9aa5b1, x, 0.27, 0);
          b.put(geo.rbox(0.6, 1.5, 0.26, 0.2, 3), col, x, 1.17, 0);
          b.put(geo.sphere(0.24, 14, 10), col, x, 2.12, 0);
          for (const s of [-1, 1]) b.put(geo.sphere(0.04, 8, 6), PAL.ink, x + s * 0.08, 2.16, 0.22);
          b.put(geo.torus(0.07, 0.016, 4, 10, Math.PI), PAL.ink, x, 2.07, 0.22, { rz: Math.PI });
          for (const s of [-1, 1]) b.put(lo.capsule(0.08, 0.5), col, x + s * 0.24, H - 0.38, 0, { rz: s * -0.25 });
        }
      });
      break;
    case 'netball':
    case 'basketball':
      perLane(c, (cx) => {
        const bw = 2.0, bd = Math.min(1.4, c.len), top = H;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          b.put(geo.rbox(0.09, top - 0.2, 0.09, 0.03, 1), 0x8a96a6, cx + sx * bw / 2, 0.2 + (top - 0.2) / 2, sz * bd / 2);
          b.put(lo.cyl(0.1, 0.1, 0.07), 0x2b3440, cx + sx * (bw / 2 - 0.08), 0.1, sz * (bd / 2 - 0.1), { rz: Math.PI / 2 });
        }
        b.put(geo.box(bw, 0.06, bd), 0x8a96a6, cx, 0.22, 0);
        b.put(geo.box(bw, top - 0.3, 0.04), 0x5d6b7c, cx, 0.25 + (top - 0.3) / 2, -bd / 2 + 0.03);
        b.put(geo.rbox(bw + 0.1, 0.14, bd + 0.1, 0.05, 1), sp.main, cx, top - 0.07, 0);
        for (let x = -bw / 2 + 0.2; x < bw / 2; x += 0.25) b.put(geo.box(0.03, top - 0.35, 0.03), 0xb8c2cc, cx + x, 0.25 + (top - 0.35) / 2, bd / 2);
        for (const y of [0.9, 1.7]) b.put(geo.box(bw, 0.04, 0.04), 0xb8c2cc, cx, y, bd / 2);
        const br = 0.25;
        for (let iy = 0; iy < 4; iy++) for (let ix = 0; ix < 4; ix++) {
          const col = sp.id === 'basketball' ? jitter(0xff9a3c, r, 0.06) : (ix + iy) % 2 ? 0xffffff : 0xb59cf0;
          b.put(geo.sphere(br, 12, 8), col, cx - 0.72 + ix * 0.48 + (iy % 2) * 0.12, 0.25 + br + iy * 0.48, 0.1);
        }
      });
      break;
    case 'cricket':
      perLane(c, (cx) => {
        for (const s of [-0.8, 0.8]) {
          b.put(geo.rbox(0.14, 0.14, 1.3, 0.05, 1), 0x66727f, cx + s, 0.32, 0);
          for (const zz of [-0.55, 0.55]) b.put(lo.cyl(0.14, 0.14, 0.08), 0x2b3440, cx + s, 0.14, zz, { rz: Math.PI / 2 });
          b.put(geo.rbox(0.12, 0.8, 0.12, 0.04, 1), 0x66727f, cx + s, 0.75, -0.1);
        }
        b.put(geo.rbox(2.1, H - 0.95, 0.2, 0.06, 2), 0xffffff, cx, 0.95 + (H - 0.95) / 2, -0.1);
        b.put(geo.box(2.14, 0.08, 0.22), 0xd6dde6, cx, H - 0.04, -0.1);
        b.put(geo.box(2.14, 0.08, 0.22), 0xd6dde6, cx, 0.95, -0.1);
      });
      break;
    case 'tennis':
      perLane(c, (cx) => {
        b.put(geo.rbox(1.9, 1.25, 1.2, 0.1, 2), 0x2f6a4a, cx, 0.625, 0);
        b.put(geo.box(1.92, 0.1, 1.22), 0xffffff, cx, 1.0, 0);
        for (const sx of [-0.6, 0.6]) for (const sz of [-0.35, 0.35]) b.put(geo.box(0.08, 0.85, 0.08), 0x2f6a4a, cx + sx, 1.65, sz);
        b.put(geo.rbox(1.4, 0.14, 0.9, 0.05, 1), 0x2f6a4a, cx, 2.1, 0);
        b.put(geo.rbox(1.4, 0.55, 0.1, 0.05, 1), 0x2f6a4a, cx, 2.45, -0.4);
        // umpire
        b.put(geo.rbox(0.5, 0.55, 0.32, 0.12, 2), 0x24304a, cx, 2.45, -0.1);
        b.put(geo.sphere(0.2, 12, 8), 0xe0a983, cx, 2.9, -0.1);
        b.put(lo.cyl(0.21, 0.21, 0.08), 0xffffff, cx, 3.02, -0.1);
        b.put(geo.box(0.3, 0.02, 0.18), 0xffffff, cx, 3.0, 0.1);
        for (const s of [-1, 1]) b.put(geo.sphere(0.03, 8, 6), PAL.ink, cx + s * 0.07, 2.92, 0.08);
        // ladder rungs on front
        for (let y = 0.2; y < 1.2; y += 0.25) b.put(geo.box(0.7, 0.05, 0.05), 0xffffff, cx, y, 0.62);
      });
      break;
    case 'hockey':
      perLane(c, (cx, i) => {
        const pad = i % 2 ? 0xffd23f : 0xe85d8a;
        for (const s of [-0.32, 0.32]) {
          b.put(geo.rbox(0.55, 1.05, 0.5, 0.18, 3), pad, cx + s, 0.65, 0);
          b.put(geo.rbox(0.62, 0.26, 0.8, 0.1, 2), pad, cx + s, 0.13, 0.12);
          for (const y of [0.4, 0.75, 1.05]) b.put(geo.box(0.57, 0.04, 0.52), 0xffffff, cx + s, y, 0);
        }
        b.put(geo.rbox(1.3, 1.0, 0.72, 0.3, 3), 0x2f63b5, cx, 1.62, 0);
        b.put(geo.box(1.32, 0.12, 0.74), pad, cx, 1.62, 0);
        for (const s of [-1, 1]) {
          b.put(lo.capsule(0.16, 0.45), 0x2f63b5, cx + s * 0.75, 1.75, 0, { rz: s * 1.1 });
          b.put(geo.rbox(0.38, 0.5, 0.25, 0.1, 2), pad, cx + s * 1.02, 1.95, 0.05);
        }
        b.put(geo.sphere(0.34, 14, 10), 0xe0a983, cx, 2.38, 0.02);
        b.put(geo.sphere(0.37, 14, 10), 0x2f63b5, cx, 2.45, -0.05, { sy: 0.92 });
        for (const s of [-1, 1]) b.put(geo.sphere(0.045, 8, 6), PAL.ink, cx + s * 0.11, 2.42, 0.33);
        b.put(geo.torus(0.09, 0.02, 4, 10, Math.PI), PAL.ink, cx, 2.3, 0.33, { rz: Math.PI });
        for (let k = -2; k <= 2; k++) b.put(geo.box(0.025, 0.5, 0.025), 0xd6dde6, cx + k * 0.1, 2.36, 0.4);
        b.put(geo.box(0.5, 0.025, 0.025), 0xd6dde6, cx, 2.25, 0.4);
        b.put(geo.box(0.07, 1.4, 0.07), 0xc98f5a, cx + 0.85, 0.9, 0.3, { rz: 0.35 });
      });
      break;
    case 'athletics':
      perLane(c, (cx) => {
        const n = 4;
        const mh = H / n;
        for (let k = 0; k < n; k++) {
          const off = (k % 2 ? 0.05 : -0.05) * (k === n - 1 ? 0 : 1);
          b.put(geo.rbox(2.1, mh - 0.03, 1.6, 0.16, 3), k % 2 ? 0x5a8dee : 0x3f74c0, cx + off, k * mh + mh / 2, 0);
          b.put(geo.box(2.0, 0.07, 1.62), k === n - 1 ? 0xffd23f : 0xffffff, cx + off, k * mh + mh * 0.5, 0);
        }
        b.put(geo.rbox(0.5, 0.12, 0.05, 0.03, 1), 0x24304a, cx - 0.5, H * 0.55, 0.81);
        b.put(geo.rbox(0.5, 0.12, 0.05, 0.03, 1), 0x24304a, cx + 0.5, H * 0.55, 0.81);
      });
      break;
    case 'swimming':
      perLane(c, (cx, i) => {
        b.put(geo.rbox(2.08, 0.4, 1.4, 0.1, 2), 0xf3f1ea, cx, 0.2, 0);
        b.put(geo.rbox(1.3, H - 0.7, 1.05, 0.12, 2), 0xffffff, cx, 0.4 + (H - 0.7) / 2, -0.05);
        b.put(geo.box(1.32, 0.18, 1.07), 0x2b9fd0, cx, 1.1, -0.05);
        b.put(geo.rbox(1.6, 0.3, 1.35, 0.1, 2), 0x2b9fd0, cx, H - 0.15, -0.05, { rx: -0.06 });
        for (const s of [-1, 1]) b.put(geo.torus(0.18, 0.03, 6, 12, Math.PI), 0xd6dde6, cx + s * 0.62, H - 0.3, 0.6, { ry: Math.PI / 2 });
        const num = String(((i + Math.floor(c.r() * 6)) % 8) + 1);
        root.add(signQuad(`num-${num}`, numberTexture(num), 0.7, 0.7, cx, 1.75, 0.48, 0.25));
      });
      break;
    case 'cycling':
    default:
      perLane(c, (cx) => {
        const bh = H / 3;
        const rows: number[][] = [[-0.52, 0.52], [-0.52, 0.52], [0]];
        rows.forEach((row, iy) => {
          for (const x of row) {
            b.put(geo.rbox(1.04, bh - 0.02, 1.3, 0.2, 2), jitter(0xe8c36a, r, 0.06), cx + x, bh * iy + bh / 2, 0);
            for (const zz of [-0.35, 0.35]) b.put(geo.box(1.06, bh - 0.04, 0.04), 0xc98f5a, cx + x, bh * iy + bh / 2, zz);
          }
        });
        b.put(geo.box(2.1, 0.4, 0.04), sp.main, cx, bh * 1.5, 0.67);
        b.put(geo.box(2.1, 0.08, 0.05), 0xffffff, cx, bh * 1.5 + 0.18, 0.67);
      });
      break;
  }
}

function numberTexture(n: string): THREE.Texture {
  return cachedTex(`sports-num-${n}`, () =>
    canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#2b9fd0';
      g.beginPath();
      g.arc(w / 2, h / 2, 54, 0, TAU);
      g.fill();
      g.fillStyle = '#ffffff';
      g.font = '700 84px Fredoka, "Trebuchet MS", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(n, w / 2, h / 2 + 4);
    }),
  );
}

// ---------- PLATFORM (top exactly 2.0) and RAMP
type PlatformStyle = 'bus' | 'podium' | 'bleacher';
function platformStyle(id: SportId): PlatformStyle {
  if (id === 'athletics' || id === 'cycling') return 'podium';
  if (id === 'netball' || id === 'basketball' || id === 'tennis' || id === 'swimming') return 'bleacher';
  return 'bus';
}
function platformSport(c: ObCtx, b: GeoBuilder, gl: GeoBuilder): void {
  const { sp, w, hl, len } = c;
  const T = PLATFORM_TOP;
  const style = platformStyle(sp.id);
  if (style === 'bus') {
    const bw = w - 0.12;
    b.put(geo.rbox(bw, T - 0.3, len, 0.2, 3), 0xfbf7ef, 0, 0.3 + (T - 0.3) / 2, 0);
    b.put(geo.box(bw * 0.98, 0.04, len - 0.4), 0xf0f2f5, 0, T - 0.02, 0);
    for (const s of [-1, 1]) {
      // windows band and livery
      b.put(geo.box(0.02, 0.55, len - 1.2), 0x35506e, s * (bw / 2 + 0.005), 1.45, -0.2);
      for (let z = -hl + 1.4; z < hl - 1; z += 1.6) b.put(geo.box(0.03, 0.55, 0.08), 0xfbf7ef, s * (bw / 2 + 0.01), 1.45, z);
      b.put(geo.box(0.03, 0.28, len - 0.3), sp.main, s * (bw / 2 + 0.006), 0.95, 0);
      b.put(geo.box(0.03, 0.08, len - 0.3), sp.accent === 0xffffff ? PAL.sun : sp.accent, s * (bw / 2 + 0.008), 0.76, 0);
      for (const z of [hl - 1.4, -hl + 1.6, ...(len > 14 ? [-hl + 3.4] : [])]) {
        b.put(lo.cyl(0.42, 0.42, 0.3), 0x2b3440, s * (bw / 2 - 0.12), 0.42, z, { rz: Math.PI / 2 });
        b.put(lo.cyl(0.2, 0.2, 0.32), 0xd6dde6, s * (bw / 2 - 0.1), 0.42, z, { rz: Math.PI / 2 });
      }
    }
    // front face: big windscreen, sign, lights, bumper (+z end faces the runner)
    const zf = hl + 0.005;
    b.put(geo.box(bw - 0.3, 0.75, 0.03), 0x35506e, 0, 1.4, zf);
    b.put(geo.box(bw - 0.3, 0.22, 0.04), 0x2b3440, 0, 1.88, zf);
    gl.put(geo.box(bw - 0.6, 0.12, 0.05), 0xffc94a, 0, 1.88, zf + 0.01);
    b.put(geo.box(bw * 0.5, 0.2, 0.04), sp.main, 0, 0.95, zf);
    for (const s of [-1, 1]) gl.put(geo.sphere(0.12, 10, 8), 0xfff4c0, s * (bw / 2 - 0.3), 0.75, zf, { sz: 0.4 });
    b.put(geo.rbox(bw + 0.04, 0.22, 0.25, 0.08, 1), 0x66727f, 0, 0.42, hl - 0.05);
    // happy team faces in the windscreen
    for (const s of [-0.5, 0.5]) {
      b.put(geo.sphere(0.17, 10, 8), SKIN[Math.floor(c.r() * SKIN.length)], s, 1.38, zf - 0.25);
      b.put(geo.rbox(0.4, 0.3, 0.2, 0.08, 1), sp.main, s, 1.12, zf - 0.25);
    }
    b.put(geo.box(bw, 0.06, len), 0x66727f, 0, 0.27, 0);
  } else if (style === 'podium') {
    b.put(geo.rbox(w - 0.08, T, len, 0.1, 2), 0xffffff, 0, T / 2, 0);
    b.put(geo.box(w - 0.02, 0.1, len + 0.02), PAL.sun, 0, T - 0.05, 0);
    b.put(geo.box(w - 0.02, 0.12, len + 0.02), sp.main, 0, 0.06, 0);
    for (const s of [-1, 1]) for (let z = -c.hl + 2; z < c.hl - 1; z += 4) b.put(geo.box(0.03, 0.5, 2.2), sp.main, s * (w / 2 - 0.035), 1.1, z);
    // front: big gold "1" made of blocks + stars
    const zf = c.hl + 0.01;
    b.put(geo.box(0.26, 1.0, 0.04), PAL.sun, 0.05, 1.05, zf);
    b.put(geo.box(0.26, 0.12, 0.04), PAL.sun, -0.06, 1.5, zf, { rz: 0.6 });
    b.put(geo.box(0.6, 0.12, 0.04), PAL.sun, 0.05, 0.6, zf);
    for (const s of [-1, 1]) b.put(geo.sphere(0.12, 8, 6), PAL.sun, s * 0.65, 1.2, zf, { sz: 0.3 });
  } else {
    // aluminium bleacher block with a flat deck on top
    b.put(geo.rbox(w - 0.1, T - 0.15, len, 0.06, 1), 0xb8c2cc, 0, (T - 0.15) / 2, 0);
    for (let z = -c.hl + 0.25; z < c.hl; z += 0.5) b.put(geo.box(w - 0.06, 0.12, 0.44), 0xe3e8ee, 0, T - 0.06, z);
    for (const s of [-1, 1]) {
      for (const y of [0.45, 0.95, 1.45]) b.put(geo.box(0.03, 0.18, len - 0.1), sp.main, s * (w / 2 - 0.035), y, 0);
      for (let z = -c.hl + 0.6; z < c.hl; z += 2.4) b.put(geo.box(0.05, T - 0.2, 0.1), 0x8a96a6, s * (w / 2 - 0.03), (T - 0.2) / 2, z);
    }
    const zf = c.hl + 0.01;
    for (const y of [0.45, 0.95, 1.45]) b.put(geo.box(w - 0.12, 0.18, 0.03), sp.main, 0, y, zf);
    b.put(geo.box(w - 0.12, 0.08, 0.03), 0xffffff, 0, 1.75, zf);
  }
}
function rampSport(c: ObCtx, b: GeoBuilder): void {
  const { sp, w, len, hl } = c;
  const style = platformStyle(sp.id);
  const body = style === 'bus' ? 0xc98f5a : style === 'podium' ? 0xe0484f : 0x8a96a6;
  const trim = style === 'bus' ? 0x9a6a40 : style === 'podium' ? PAL.sun : sp.main;
  b.add(wedgeGeo(w - 0.1, len, PLATFORM_TOP), body, new THREE.Matrix4());
  const ang = Math.atan2(PLATFORM_TOP, len);
  const slopeLen = Math.hypot(len, PLATFORM_TOP);
  // grip stripes across the slope
  const n = Math.floor(slopeLen / 0.9);
  for (let i = 1; i < n; i++) {
    const f = i / n;
    const z = hl - f * len;
    const y = f * PLATFORM_TOP;
    b.put(geo.box(w - 0.3, 0.025, 0.16), style === 'bus' ? 0xe2b47c : 0xffffff, 0, y + 0.005, z, { rx: ang });
  }
  // side trims (stay below the slope surface)
  for (const s of [-1, 1]) b.add(wedgeGeo(0.06, len, PLATFORM_TOP - 0.02), trim, new THREE.Matrix4().makeTranslation(s * (w / 2 - 0.08), 0, 0));
  b.put(geo.box(w - 0.1, 0.06, 0.12), trim, 0, 0.03, hl - 0.06);
}

// ---------- movers
function moverLowSport(c: ObCtx, spin: GeoBuilder): { radius: number; bounce: boolean; tumble: boolean } {
  const { sp } = c;
  switch (sp.id) {
    case 'rugby': {
      const L = Math.min(0.78, c.req.height);
      spin.put(rugbyBall(L), 0xffffff, 0, 0, 0);
      for (const s of [-0.22, 0.22]) spin.put(geo.torus(L * 0.26, 0.022, 6, 16), sp.main, s * L, 0, 0, { ry: Math.PI / 2, s: 0.92 });
      spin.put(geo.box(L * 0.4, 0.02, 0.05), sp.main, 0, L * 0.31, 0);
      return { radius: L / 2, bounce: false, tumble: true };
    }
    case 'football': {
      const R = 0.38;
      spin.put(geo.sphere(R, 18, 12), 0xffffff, 0, 0, 0);
      const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0.6, 0.6, 0.5], [-0.6, -0.6, -0.5], [0.6, -0.5, -0.6], [-0.5, 0.6, 0.6]];
      for (const d of dirs) {
        const v = new THREE.Vector3(...(d as [number, number, number])).normalize().multiplyScalar(R * 0.9);
        spin.put(geo.sphere(R * 0.32, 8, 6), 0x2b3440, v.x, v.y, v.z, { s: 1 });
      }
      return { radius: R, bounce: false, tumble: false };
    }
    case 'netball':
    case 'basketball': {
      const R = 0.25;
      if (sp.id === 'basketball') {
        spin.put(geo.sphere(R, 16, 12), 0xff9a3c, 0, 0, 0);
        spin.put(geo.torus(R * 1.0, 0.012, 4, 20), 0x2b3440, 0, 0, 0);
        spin.put(geo.torus(R * 1.0, 0.012, 4, 20), 0x2b3440, 0, 0, 0, { ry: Math.PI / 2 });
        spin.put(geo.torus(R * 1.0, 0.012, 4, 20), 0x2b3440, 0, 0, 0, { rx: Math.PI / 2 });
      } else {
        spin.put(geo.sphere(R, 16, 12), 0xffffff, 0, 0, 0);
        spin.put(geo.torus(R * 1.0, 0.014, 4, 20), 0x8a6fd6, 0, 0, 0);
        spin.put(geo.torus(R * 0.75, 0.014, 4, 20), 0x8a6fd6, 0, 0, R * 0.65, { s: 1 });
      }
      return { radius: R, bounce: true, tumble: false };
    }
    case 'cricket': {
      const R = 0.33;
      spin.put(geo.sphere(R, 16, 12), 0xd9423f, 0, 0, 0);
      spin.put(geo.torus(R * 1.0, 0.02, 4, 24), 0xfff4e0, 0, 0, 0, { rx: Math.PI / 2 });
      return { radius: R, bounce: false, tumble: false };
    }
    case 'tennis': {
      const R = 0.33;
      spin.put(geo.sphere(R, 16, 12), 0xd8f05a, 0, 0, 0);
      spin.put(geo.torus(R * 0.98, 0.022, 4, 24), 0xffffff, 0, 0, 0, { rx: 0.7, ry: 0.3 });
      return { radius: R, bounce: true, tumble: false };
    }
    case 'hockey': {
      const R = 0.3;
      spin.put(geo.sphere(R, 16, 12), 0xfff4e0, 0, 0, 0);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        spin.put(geo.sphere(0.05, 6, 4), 0xe3d8bf, Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95, 0);
        spin.put(geo.sphere(0.05, 6, 4), 0xe3d8bf, 0, Math.sin(a) * R * 0.95, Math.cos(a) * R * 0.95);
      }
      return { radius: R, bounce: false, tumble: false };
    }
    case 'athletics': {
      const R = 0.28;
      spin.put(lo.cyl(R, R, 1.5), PAL.sun, 0, 0, 0, { rx: Math.PI / 2 });
      for (const z of [-0.5, 0, 0.5]) spin.put(lo.cyl(R + 0.01, R + 0.01, 0.16), sp.main, 0, 0, z, { rx: Math.PI / 2 });
      for (const z of [-0.76, 0.76]) spin.put(lo.cyl(R * 0.7, R * 0.7, 0.03), 0xffffff, 0, 0, z, { rx: Math.PI / 2 });
      return { radius: R, bounce: false, tumble: false };
    }
    case 'swimming': {
      const R = 0.38;
      const cols = [0xf0564a, 0xffffff, 0x3f9fd8, 0xffffff, 0xffd23f, 0xffffff];
      for (let i = 0; i < 6; i++) spin.put(gore(R, i, 6), cols[i], 0, 0, 0);
      spin.put(geo.sphere(R * 0.18, 8, 6), 0xffffff, 0, R * 0.95, 0);
      spin.put(geo.sphere(R * 0.18, 8, 6), 0xffffff, 0, -R * 0.95, 0);
      return { radius: R, bounce: true, tumble: false };
    }
    case 'cycling':
    default: {
      const R = 0.355;
      spin.put(geo.torus(R, 0.04, 8, 28), 0x2b3440, 0, 0, 0);
      spin.put(geo.torus(R - 0.05, 0.015, 4, 24), 0xd6dde6, 0, 0, 0);
      spin.put(lo.cyl(0.05, 0.05, 0.12), 0x66727f, 0, 0, 0, { rx: Math.PI / 2 });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI;
        spin.put(geo.box(0.012, 2 * (R - 0.05), 0.012), 0xe9edf2, 0, 0, 0, { rz: a });
      }
      spin.put(geo.box(0.05, 0.08, 0.03), sp.main, 0, R - 0.08, 0.02);
      return { radius: R + 0.04, bounce: false, tumble: false };
    }
  }
}

/** Kiwi-bird mascot costume (round, fluffy, long beak) facing +z. */
function makeKiwiMascot(sp: Sport): { root: THREE.Group; body: THREE.Object3D; legs: THREE.Object3D[] } {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const b = new GeoBuilder();
  b.put(geo.sphere(0.78, 18, 14), 0x8a6a4e, 0, 1.18, 0, { sy: 0.82, sz: 0.95 });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU, e = (i % 3) * 0.35 - 0.3;
    b.put(geo.sphere(0.2, 8, 6), 0x7a5c42, Math.cos(a) * 0.72 * Math.cos(e), 1.18 + Math.sin(e) * 0.6, Math.sin(a) * 0.68 * Math.cos(e), { sy: 0.6 });
  }
  b.put(geo.sphere(0.4, 14, 10), 0x8a6a4e, 0, 1.6, 0.5);
  for (const s of [-1, 1]) {
    b.put(geo.sphere(0.1, 10, 8), 0xffffff, s * 0.17, 1.72, 0.8);
    b.put(geo.sphere(0.055, 8, 6), PAL.ink, s * 0.17, 1.73, 0.88);
    b.put(geo.sphere(0.02, 6, 4), 0xffffff, s * 0.15, 1.76, 0.92);
  }
  b.put(lo.cone(0.07, 0.6), 0xf3c9a5, 0, 1.47, 0.98, { rx: Math.PI / 2 + 0.55 });
  // team scarf
  b.put(geo.torus(0.46, 0.09, 8, 20), sp.main, 0, 1.4, 0.32, { rx: Math.PI / 2 - 0.3 });
  b.put(geo.rbox(0.18, 0.5, 0.08, 0.04, 1), sp.main, 0.25, 1.15, 0.72, { rz: 0.2 });
  b.put(geo.box(0.19, 0.08, 0.09), 0xffffff, 0.25, 1.0, 0.72, { rz: 0.2 });
  b.into(body);
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(s * 0.3, 0.62, 0.05);
    const lb = new GeoBuilder();
    lb.put(lo.cyl(0.06, 0.07, 0.5), 0xe9b87a, 0, -0.27, 0);
    for (const a of [-0.5, 0, 0.5]) lb.put(geo.rbox(0.07, 0.06, 0.32, 0.03, 1), 0xe9b87a, Math.sin(a) * 0.12, -0.55, 0.12 + Math.cos(a) * 0.02, { ry: a });
    lb.into(piv);
    body.add(piv);
    legs.push(piv);
  }
  return { root, body, legs };
}

/** Friendly cyclist riding a bike, facing +z. */
function makeCyclist(sp: Sport, r: () => number): { root: THREE.Group; wheels: THREE.Object3D[]; legs: THREE.Object3D[]; crank: THREE.Object3D } {
  const root = new THREE.Group();
  const b = new GeoBuilder();
  const R = 0.36;
  const frame = sp.main;
  // frame (side view along z)
  const tube = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col = frame, rad = 0.035) => {
    const v = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0);
    const L = v.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    const m = new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), q, new THREE.Vector3(1, L, 1));
    b.add(lo.cyl(rad, rad, 1), col, m);
  };
  const zr = -0.55, zf = 0.55, yA = R;
  tube(0, yA, zr, 0, 0.42, 0); // chainstay
  tube(0, yA, zr, 0, 0.95, -0.18); // seat stay
  tube(0, 0.42, 0, 0, 0.95, -0.18); // seat tube
  tube(0, 0.95, -0.18, 0, 0.98, 0.42); // top tube
  tube(0, 0.42, 0, 0, 0.98, 0.42); // down tube
  tube(0, 0.98, 0.42, 0, yA, zf); // fork
  tube(0, 0.98, 0.42, 0, 1.1, 0.4, 0x2b3440);
  b.put(geo.rbox(0.5, 0.05, 0.06, 0.02, 1), 0x2b3440, 0, 1.12, 0.38);
  b.put(geo.rbox(0.16, 0.05, 0.28, 0.03, 1), 0x2b3440, 0, 1.0, -0.22);
  // rider: torso leaning forward, helmet
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  b.put(geo.rbox(0.42, 0.62, 0.3, 0.12, 2), sp.main, 0, 1.38, -0.02, { rx: 0.7 });
  b.put(geo.box(0.44, 0.1, 0.32), 0xffffff, 0, 1.4, -0.02, { rx: 0.7 });
  b.put(geo.sphere(0.2, 12, 10), skin, 0, 1.68, 0.28);
  b.put(geo.sphere(0.23, 12, 10), PAL.sun, 0, 1.76, 0.24, { sy: 0.7, sz: 1.2 });
  for (const s of [-1, 1]) {
    b.put(geo.sphere(0.03, 6, 4), PAL.ink, s * 0.07, 1.68, 0.47);
    b.put(lo.capsule(0.06, 0.4), sp.main, s * 0.2, 1.33, 0.28, { rx: 1.0 });
  }
  b.into(root);
  const wheels: THREE.Object3D[] = [];
  for (const z of [zr, zf]) {
    const w = new THREE.Group();
    w.position.set(0, R, z);
    const wb = new GeoBuilder();
    wb.put(geo.torus(R, 0.035, 6, 24), 0x2b3440, 0, 0, 0, { ry: Math.PI / 2 });
    for (let i = 0; i < 6; i++) wb.put(geo.box(0.01, 2 * R - 0.05, 0.01), 0xd6dde6, 0, 0, 0, { rx: (i / 6) * Math.PI });
    wb.into(w);
    root.add(w);
    wheels.push(w);
  }
  const crank = new THREE.Group();
  crank.position.set(0, 0.42, 0);
  root.add(crank);
  const legs: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(s * 0.13, 1.0, -0.18);
    const lb = new GeoBuilder();
    lb.put(lo.capsule(0.08, 0.5), 0x24304a, 0, -0.3, 0.12, { rx: 0.4 });
    lb.put(geo.rbox(0.12, 0.08, 0.24, 0.03, 1), 0xffffff, 0, -0.6, 0.3);
    lb.into(piv);
    root.add(piv);
    legs.push(piv);
  }
  return { root, wheels, legs, crank };
}

function personStyleFor(sp: Sport): PersonStyle {
  switch (sp.id) {
    case 'basketball':
      return { shirt: 0xffffff, shorts: 0x2b3440, stripes: 0x2b3440, scale: 0.95 };
    case 'netball':
      return { shirt: 0xffffff, shorts: 0x24304a, scale: 0.95 };
    case 'cricket':
      return { shirt: 0xffffff, shorts: 0x3d4a66, coat: true, hat: 0xfff4e0, scale: 0.95 };
    case 'tennis':
      return { shirt: 0x24304a, shorts: 0xd8f05a, scale: 0.92 };
    case 'hockey':
      return { shirt: 0xe85d8a, shorts: 0x2b3440, scale: 0.95 };
    case 'athletics':
      return { shirt: PAL.sun, shorts: 0x2fb5a8, number: true, scale: 0.95 };
    case 'swimming':
      return { shirt: 0xf0564a, shorts: PAL.sun, scale: 0.95 };
    default:
      return { shirt: 0x2b3440, shorts: 0x2b3440, scale: 0.95 };
  }
}

function makeSportObstacle(req: ObstacleRequest): ObstacleVisual {
  const sp = sportOf(req.section);
  const w = req.laneSpan * 2.2;
  const c: ObCtx = { sp, w, hw: w / 2, len: req.length, hl: req.length / 2, req, r: req.rng };
  const object = new THREE.Group();
  object.name = `sports-${sp.id}-${req.kind}`;
  const wob = new THREE.Group();
  object.add(wob);
  const wobble = new Wobble();
  let anim: Anim | undefined;
  const b = new GeoBuilder();
  const gl = new GeoBuilder();
  let useWobble = true;
  switch (req.kind) {
    case 'low':
      lowSport(c, b, wob);
      addShadow(object, w * 0.95, Math.max(0.9, req.length) * 1.1);
      break;
    case 'high':
      highSport(c, b, wob);
      addShadow(object, w + 0.8, 0.9);
      break;
    case 'block':
      blockSport(c, b, wob);
      addShadow(object, w * 1.05, Math.min(req.length, 1.6) * 1.4);
      break;
    case 'platform':
      platformSport(c, b, gl);
      addShadow(object, w * 1.1, req.length + 0.8);
      useWobble = false;
      break;
    case 'ramp':
      rampSport(c, b);
      useWobble = false;
      break;
    case 'moverLow': {
      const spin = new GeoBuilder();
      const info = moverLowSport(c, spin);
      const holder = new THREE.Group();
      const spinMesh = spin.build(vcMat(0.6)) ?? new THREE.Mesh();
      spinMesh.matrixAutoUpdate = true;
      holder.add(spinMesh);
      const capH = Math.min(0.8, req.height) - 0.01;
      let ext = 0;
      const pa = spinMesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pa.count; i++) ext = Math.max(ext, Math.hypot(pa.getX(i), pa.getY(i), pa.getZ(i)));
      const fit = Math.min(1, capH / (2 * ext));
      const lift = ext * fit;
      spinMesh.scale.setScalar(fit);
      info.radius *= fit;
      holder.position.y = lift;
      wob.add(holder);
      const sh = addShadow(object, 0.9, 0.9);
      let lastX = Number.NaN;
      let roll = 0;
      anim = (t) => {
        const x = object.position.x;
        if (!Number.isNaN(lastX)) roll -= (x - lastX) / info.radius;
        lastX = x;
        if (info.bounce) {
          const ph = Math.abs(Math.sin(t * 4.2));
          const maxUp = capH - 2 * lift * 1.07;
          holder.position.y = lift + ph * Math.max(0, maxUp - 0.005);
          const sq = 1 - (1 - ph) * 0.12 * (ph < 0.15 ? 1 : 0);
          holder.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
          sh.scale.set(0.6 + (1 - ph) * 0.3, 1, 0.6 + (1 - ph) * 0.3);
        }
        spinMesh.rotation.z = roll;
      };
      break;
    }
    case 'moverBlock': {
      const dir = req.dir ?? 1;
      const face = new THREE.Group();
      face.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      wob.add(face);
      addShadow(object, 1.6, 1.3);
      if (sp.id === 'rugby') {
        const k = makeKiwiMascot(sp);
        face.add(k.root);
        anim = (t) => {
          const ph = t * 7;
          k.legs[0].rotation.x = Math.sin(ph) * 0.6;
          k.legs[1].rotation.x = -Math.sin(ph) * 0.6;
          k.body.position.y = Math.abs(Math.sin(ph)) * 0.08;
          k.body.rotation.z = Math.sin(ph) * 0.08;
        };
      } else if (sp.id === 'football') {
        const R = 0.95;
        const spin = new GeoBuilder();
        spin.put(geo.sphere(R, 22, 16), 0xffffff, 0, 0, 0);
        const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [0.6, 0.6, 0.5], [-0.6, -0.6, -0.5], [0.6, -0.5, -0.6], [-0.5, 0.6, 0.6], [0.5, 0.5, -0.7], [-0.5, -0.5, 0.7]];
        for (const d of dirs) {
          const v = new THREE.Vector3(...(d as [number, number, number])).normalize().multiplyScalar(R * 0.92);
          spin.put(geo.sphere(R * 0.3, 10, 8), sp.main, v.x, v.y, v.z);
        }
        const m = spin.build(vcMat(0.55)) ?? new THREE.Mesh();
        m.matrixAutoUpdate = true;
        m.position.y = R;
        wob.add(m);
        let lastX = Number.NaN;
        let roll = 0;
        anim = (t) => {
          const x = object.position.x;
          if (!Number.isNaN(lastX)) roll -= (x - lastX) / R;
          lastX = x;
          m.rotation.z = roll;
          m.position.y = R + Math.abs(Math.sin(t * 3)) * 0.04;
        };
      } else if (sp.id === 'cycling') {
        const cy = makeCyclist(sp, c.r);
        face.add(cy.root);
        anim = (t) => {
          const ph = t * 8;
          for (const wh of cy.wheels) wh.rotation.x = -ph * 1.4;
          cy.legs[0].rotation.x = Math.sin(ph) * 0.55 - 0.1;
          cy.legs[1].rotation.x = -Math.sin(ph) * 0.55 - 0.1;
          cy.root.position.y = Math.sin(ph * 2) * 0.01;
        };
      } else {
        const p = makePerson(personStyleFor(sp), c.r);
        face.add(p.root);
        if (sp.id === 'swimming') {
          const tb = new GeoBuilder();
          tb.put(geo.rbox(0.18, 0.7, 0.14, 0.07, 2), 0xf0564a, 0, -0.35, 0.12);
          tb.into(p.armR);
        }
        if (sp.id === 'tennis') {
          const tb = new GeoBuilder();
          tb.put(geo.sphere(0.07, 10, 8), 0xd8f05a, 0, -0.56, 0.06);
          tb.into(p.armR);
        }
        const rate = sp.id === 'cricket' ? 5 : 8;
        anim = (t) => p.pose(t * rate, sp.id === 'cricket' ? 0.6 : 1);
      }
      break;
    }
  }
  const body = b.build(vcMat(0.7));
  if (body) {
    body.name = `${object.name}-body`;
    wob.add(body);
  }
  const glow = gl.build(glowVcMat(0.9));
  if (glow) wob.add(glow);
  return {
    object,
    update(t, dt, dist) {
      anim?.(t, dt, dist);
      if (useWobble) {
        wobble.update(dt);
        wob.rotation.z = clamp(wobble.tilt * 0.1, -0.25, 0.25);
      }
    },
    react(kind) {
      if (useWobble) wobble.react(kind);
    },
  };
}

// ------------------------------------------------------------------ ambient play (off the lanes, near the runner)
interface Actor {
  sport: SportId;
  obj: THREE.Object3D;
  anchor: number;
  /** offset from the placement distance */
  lead: number;
  update(t: number, dt: number, playerD: number): void;
  /** metres the actor has travelled ahead of its anchor (moving actors) */
  travel?(): number;
  reset?(): void;
}

function makeBall(col: number, R: number, seam?: number): THREE.Mesh {
  const b = new GeoBuilder();
  if (col === -1) b.put(rugbyBall(R * 2), 0xffffff, 0, 0, 0);
  else b.put(geo.sphere(R, 12, 9), col, 0, 0, 0);
  if (seam !== undefined) b.put(geo.torus(R * 1.0, R * 0.08, 4, 16), seam, 0, 0, 0, { rx: Math.PI / 2 });
  const m = b.build(vcMat(0.6))!;
  m.matrixAutoUpdate = true;
  return m;
}

function sideOf(r: () => number): number {
  return r() < 0.5 ? -1 : 1;
}

/** Two players passing a ball in a high arc, standing at (x0,z0) and (x1,z1) relative to the anchor. */
function passActor(sport: SportId, style: PersonStyle, ball: THREE.Mesh, side: number, x0: number, z0: number, x1: number, z1: number, arc: number, period: number, r: () => number, bounce = false): Actor {
  const g = new THREE.Group();
  const pA = makePerson(style, r);
  const pB = makePerson({ ...style, shirt: style.shorts === style.shirt ? PAL.coral : style.shirt }, r);
  pA.root.position.set(side * x0, 0, z0);
  pB.root.position.set(side * x1, 0, z1);
  const ang = Math.atan2(side * x1 - side * x0, z1 - z0);
  pA.root.rotation.y = ang;
  pB.root.rotation.y = ang + Math.PI;
  g.add(pA.root, pB.root, ball);
  const A = new THREE.Vector3(side * x0, 1.3, z0);
  const B = new THREE.Vector3(side * x1, 1.3, z1);
  const off = r() * period;
  return {
    sport,
    obj: g,
    anchor: -1,
    lead: 0,
    update(t) {
      const u = ((t + off) / period) % 2;
      const leg = u < 1 ? u : u - 1;
      const from = u < 1 ? A : B;
      const to = u < 1 ? B : A;
      ball.position.lerpVectors(from, to, leg);
      if (bounce) {
        // bounce pass: down to the ground at the middle
        const k = leg < 0.5 ? leg * 2 : (leg - 0.5) * 2;
        ball.position.y = leg < 0.5 ? lerp(1.2, 0.15, k * k) : lerp(0.15, 1.2, 1 - (1 - k) * (1 - k));
      } else ball.position.y += Math.sin(leg * Math.PI) * arc;
      ball.rotation.z = t * 6;
      ball.rotation.x = t * 3;
      const thrower = u < 1 ? pA : pB;
      const catcher = u < 1 ? pB : pA;
      thrower.armR.rotation.x = leg < 0.25 ? -2.4 + leg * 6 : -0.9;
      thrower.armL.rotation.x = thrower.armR.rotation.x;
      catcher.armR.rotation.x = leg > 0.7 ? -1.6 - (leg - 0.7) * 2 : -0.6;
      catcher.armL.rotation.x = catcher.armR.rotation.x;
      thrower.body.position.y = 0;
      catcher.body.position.y = leg > 0.85 ? (leg - 0.85) * 0.4 : 0;
      for (const p of [pA, pB]) {
        p.legL.rotation.x = 0.1 * Math.sin(t * 3);
        p.legR.rotation.x = -0.1 * Math.sin(t * 3);
      }
    },
  };
}

/** Referee / official standing beside the lanes who toots the whistle as the runner goes by. */
function refActor(sport: SportId, style: PersonStyle, side: number, r: () => number): Actor {
  const g = new THREE.Group();
  const p = makePerson(style, r);
  p.root.position.set(side * 5.3, 0, 0);
  p.root.rotation.y = side > 0 ? -0.9 : 0.9;
  g.add(p.root);
  const puffB = new GeoBuilder();
  for (let i = 0; i < 3; i++) puffB.put(geo.sphere(0.07 + i * 0.03, 8, 6), 0xffffff, 0, i * 0.12, i * 0.1);
  const puff = puffB.build(glowVcMat(0.6))!;
  puff.matrixAutoUpdate = true;
  p.body.add(puff);
  puff.position.set(0, 1.85 * (style.scale ?? 1), 0.32);
  let whistleT = 99;
  let lastNear = false;
  const a: Actor = {
    sport,
    obj: g,
    anchor: -1,
    lead: 0,
    update(t, dt, playerD) {
      const near = a.anchor - playerD < 14 && a.anchor - playerD > -4;
      if (near && !lastNear) whistleT = 0;
      lastNear = near;
      whistleT += dt;
      const on = whistleT < 1.4;
      p.armR.rotation.x = on ? -2.7 : -0.1 + Math.sin(t * 2) * 0.05;
      p.armR.rotation.z = on ? 0.25 : 0.12;
      p.armL.rotation.x = on ? -1.2 : 0;
      puff.visible = on && Math.sin(whistleT * 18) > -0.2;
      puff.scale.setScalar(on ? 0.8 + (whistleT % 0.35) * 1.4 : 1);
      p.body.position.y = on ? Math.abs(Math.sin(whistleT * 10)) * 0.05 : 0;
      p.legL.rotation.x = 0;
      p.legR.rotation.x = 0;
    },
  };
  return a;
}

/** Athletes jogging along the outer track lanes (the runner overtakes them). */
function joggerActor(side: number, laneX: number, speed: number, shirt: number, r: () => number): Actor {
  const g = new THREE.Group();
  const p = makePerson({ shirt, shorts: 0x24304a, number: true, scale: 0.95 }, r);
  p.root.rotation.y = Math.PI;
  p.root.position.x = side * laneX;
  g.add(p.root);
  let z = 0;
  const a: Actor = {
    sport: 'athletics',
    obj: g,
    travel: () => -z,
    reset: () => {
      z = 0;
    },
    anchor: -1,
    lead: 0,
    update(t, dt) {
      z -= speed * dt;
      p.root.position.z = z;
      p.pose(t * 11 + laneX, 1);
    },
  };
  return a;
}

/** Swimmer doing freestyle in the side pool, with splashes. */
function swimmerActor(side: number, laneX: number, speed: number, cap: number, r: () => number): Actor {
  const g = new THREE.Group();
  const body = new GeoBuilder();
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  body.put(lo.capsule(0.2, 1.0), skin, 0, -0.3, 0, { rx: Math.PI / 2, sx: 1.3 });
  body.put(geo.sphere(0.2, 12, 9), skin, 0, -0.18, -0.75);
  body.put(geo.sphere(0.21, 12, 9), cap, 0, -0.14, -0.77, { sy: 0.85 });
  body.put(geo.box(0.3, 0.05, 0.12), 0x24304a, 0, -0.1, -0.78);
  const bm = body.build(vcMat(0.5))!;
  bm.matrixAutoUpdate = true;
  g.add(bm);
  const arms: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(s * 0.3, -0.25, -0.5);
    const ab = new GeoBuilder();
    ab.put(lo.capsule(0.07, 0.55), skin, 0, 0.35, 0);
    ab.into(piv);
    g.add(piv);
    arms.push(piv);
  }
  const splash = new GeoBuilder();
  for (let i = 0; i < 6; i++) splash.put(geo.sphere(0.08 + (i % 3) * 0.03, 8, 6), 0xffffff, (i - 2.5) * 0.12, 0.05 + (i % 2) * 0.06, 0.4 + (i % 3) * 0.15);
  const sm = splash.build(glowVcMat(0.35))!;
  sm.matrixAutoUpdate = true;
  g.add(sm);
  g.position.x = side * laneX;
  const outer = new THREE.Group();
  outer.add(g);
  let z = 0;
  const ph0 = r() * TAU;
  const a: Actor = {
    sport: 'swimming',
    obj: outer,
    travel: () => -z,
    reset: () => {
      z = 0;
    },
    anchor: -1,
    lead: 0,
    update(t, dt) {
      z -= speed * dt;
      g.position.z = z;
      const ph = t * 4.5 + ph0;
      arms[0].rotation.x = -ph;
      arms[1].rotation.x = -ph - Math.PI;
      bm.rotation.z = Math.sin(ph) * 0.18;
      sm.scale.setScalar(0.7 + Math.abs(Math.sin(ph * 2)) * 0.6);
      sm.position.y = Math.abs(Math.sin(ph * 2)) * 0.08;
    },
  };
  return a;
}

/** Cyclist zooming along the banked velodrome wall. */
function riderActor(side: number, xOnBank: number, speed: number, r: () => number): Actor {
  const sp = { ...SPORTS.cycling, main: [0xe0484f, 0x3f74c0, 0x2fb5a8, PAL.sun][Math.floor(r() * 4)] };
  const cy = makeCyclist(sp, r);
  const g = new THREE.Group();
  const y = ((xOnBank - 3.85) / (13 - 3.85)) * 6.2;
  const ang = Math.atan2(6.2, 13 - 3.85);
  cy.root.rotation.y = Math.PI;
  const tilt = new THREE.Group();
  tilt.add(cy.root);
  tilt.rotation.z = side * ang;
  tilt.position.set(side * xOnBank, y, 0);
  g.add(tilt);
  let z = 0;
  const a: Actor = {
    sport: 'cycling',
    obj: g,
    travel: () => -z,
    reset: () => {
      z = 0;
    },
    anchor: -1,
    lead: 0,
    update(t, dt) {
      z -= speed * dt;
      tilt.position.z = z;
      const ph = t * 10;
      for (const wh of cy.wheels) wh.rotation.x = -ph * 1.6;
      cy.legs[0].rotation.x = Math.sin(ph) * 0.55 - 0.1;
      cy.legs[1].rotation.x = -Math.sin(ph) * 0.55 - 0.1;
    },
  };
  return a;
}

/** Player dribbling a bouncing ball beside the court. */
function dribbleActor(sport: SportId, col: number, side: number, r: () => number): Actor {
  const g = new THREE.Group();
  const p = makePerson({ shirt: SPORTS[sport].home, shorts: 0x24304a, number: true, scale: 0.95 }, r);
  p.root.position.set(side * 7, 0, 0);
  p.root.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  const ball = makeBall(col, 0.14);
  g.add(p.root, ball);
  const a: Actor = {
    sport,
    obj: g,
    anchor: -1,
    lead: 0,
    update(t) {
      const ph = Math.abs(Math.sin(t * 4));
      ball.position.set(side * 7 - side * 0.55, 0.14 + ph * 0.75, 0.15);
      p.armR.rotation.x = -0.9 + ph * 0.5;
      p.armL.rotation.x = -0.2;
      p.body.position.y = 0;
      p.legL.rotation.x = Math.sin(t * 2) * 0.2;
      p.legR.rotation.x = -Math.sin(t * 2) * 0.2;
      g.position.x = 0;
      p.root.position.z = Math.sin(t * 0.6) * 1.5;
      ball.position.z += p.root.position.z;
    },
  };
  return a;
}

/** Celebration confetti that drifts down beside the lanes when a new sport begins. */
class Confetti {
  readonly mesh: THREE.InstancedMesh;
  private n = 160;
  private p = new Float32Array(this.n * 3);
  private v = new Float32Array(this.n * 3);
  private ph = new Float32Array(this.n);
  private life = 99;
  private o = new THREE.Object3D();
  constructor() {
    const m = ownedMat('sports-confetti', (mm) => {
      mm.side = THREE.DoubleSide;
      mm.emissive.set(0x333333);
    }, 0.6);
    this.mesh = new THREE.InstancedMesh(lo.flat(0.16, 0.24), m, this.n);
    this.mesh.frustumCulled = false;
    const cols = [PAL.coral, PAL.sun, PAL.mint, PAL.lilac, PAL.sea, 0xffffff, PAL.pink];
    const c = new THREE.Color();
    for (let i = 0; i < this.n; i++) this.mesh.setColorAt(i, c.setHex(cols[i % cols.length]));
    this.mesh.visible = false;
  }
  burst(z: number, r: () => number): void {
    for (let i = 0; i < this.n; i++) {
      const side = i % 2 ? 1 : -1;
      this.p[i * 3] = side * (4 + r() * 8);
      this.p[i * 3 + 1] = 6 + r() * 5;
      this.p[i * 3 + 2] = z - r() * 30;
      this.v[i * 3] = (r() - 0.5) * 1.5;
      this.v[i * 3 + 1] = -(1.2 + r() * 1.2);
      this.v[i * 3 + 2] = (r() - 0.5) * 1.5;
      this.ph[i] = r() * TAU;
    }
    this.life = 0;
    this.mesh.visible = true;
  }
  update(t: number, dt: number): void {
    if (this.life > 6) {
      this.mesh.visible = false;
      return;
    }
    this.life += dt;
    const sc = this.life > 5 ? Math.max(0.01, 6 - this.life) : 1;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      this.p[k] += (this.v[k] + Math.sin(t * 3 + this.ph[i]) * 0.8) * dt;
      this.p[k + 1] = Math.max(0.05, this.p[k + 1] + this.v[k + 1] * dt);
      this.p[k + 2] += this.v[k + 2] * dt;
      // keep the lanes clear below head height
      if (Math.abs(this.p[k]) < 3.8 && this.p[k + 1] < 3.4) this.p[k] = Math.sign(this.p[k] || 1) * 3.8;
      this.o.position.set(this.p[k], this.p[k + 1], this.p[k + 2]);
      this.o.rotation.set(t * 4 + this.ph[i], this.ph[i], t * 3);
      this.o.scale.setScalar(sc);
      this.o.updateMatrix();
      this.mesh.setMatrixAt(i, this.o.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function makeActors(r: () => number): Actor[] {
  const out: Actor[] = [];
  const ref = (sport: SportId, style: PersonStyle) => out.push(refActor(sport, style, sideOf(r), r));
  ref('rugby', { shirt: PAL.lemon, shorts: 0x2b3440, scale: 0.95 });
  ref('football', { shirt: 0x2b3440, shorts: 0x2b3440, scale: 0.95 });
  ref('netball', { shirt: 0xffffff, shorts: 0x24304a, scale: 0.95 });
  ref('basketball', { shirt: 0xffffff, shorts: 0x2b3440, stripes: 0x2b3440, scale: 0.95 });
  ref('cricket', { shirt: 0xffffff, shorts: 0x3d4a66, coat: true, hat: 0xfff4e0, scale: 0.95 });
  ref('hockey', { shirt: 0xe85d8a, shorts: 0x2b3440, scale: 0.95 });
  ref('athletics', { shirt: 0xf0564a, shorts: 0x2b3440, scale: 0.95 });
  ref('swimming', { shirt: 0xf0564a, shorts: PAL.sun, scale: 0.95 });
  const team = (sport: SportId): PersonStyle => ({ shirt: SPORTS[sport].home, shorts: 0x24304a, number: true, scale: 0.9 });
  out.push(passActor('rugby', team('rugby'), makeBall(-1, 0.2), -1, 7, 0, 10.5, -6, 1.6, 1.3, r));
  out.push(passActor('rugby', { ...team('rugby'), shirt: SPORTS.rugby.away }, makeBall(-1, 0.2), 1, 6.5, -4, 10, 4, 1.4, 1.2, r));
  out.push(passActor('football', team('football'), makeBall(0xffffff, 0.16, 0x2b3440), -1, 6.5, 0, 10.5, -7, 0.4, 1.1, r));
  out.push(passActor('football', { ...team('football'), shirt: SPORTS.football.away }, makeBall(0xffffff, 0.16, 0x2b3440), 1, 7, 3, 10, -5, 2.2, 1.6, r));
  out.push(passActor('netball', team('netball'), makeBall(0xffffff, 0.14, 0x8a6fd6), 1, 6, 0, 10, -5, 1.8, 1.2, r));
  out.push(passActor('netball', { ...team('netball'), shirt: SPORTS.netball.away }, makeBall(0xffffff, 0.14, 0x8a6fd6), -1, 6.5, 2, 10.5, -3, 0, 1.0, r, true));
  out.push(dribbleActor('basketball', 0xff9a3c, -1, r));
  out.push(passActor('basketball', team('basketball'), makeBall(0xff9a3c, 0.15, 0x2b3440), 1, 6, 0, 9.5, -4, 0, 0.9, r, true));
  out.push(passActor('cricket', { shirt: 0xffffff, shorts: 0xfff4e0, scale: 0.9 }, makeBall(0xd9423f, 0.1, 0xffffff), -1, 7, 0, 11, -12, 4.5, 1.8, r));
  out.push(passActor('cricket', { shirt: 0xffffff, shorts: 0xfff4e0, scale: 0.9 }, makeBall(0xd9423f, 0.1, 0xffffff), 1, 6.5, 0, 11.5, 8, 3.5, 1.6, r));
  out.push(passActor('tennis', { shirt: 0xffffff, shorts: 0x2fb5a8, scale: 0.9 }, makeBall(0xd8f05a, 0.09), 1, 9.4, -1, 9.4, -23, 1.6, 1.3, r));
  out.push(passActor('tennis', { shirt: 0xff9fc0, shorts: 0xffffff, scale: 0.9 }, makeBall(0xd8f05a, 0.09), -1, 9.4, -1, 9.4, -23, 1.6, 1.4, r));
  out.push(passActor('hockey', team('hockey'), makeBall(0xfff4e0, 0.08), -1, 6.5, 0, 10, -6, 0.05, 1.0, r));
  for (let i = 0; i < 4; i++) out.push(joggerActor(i % 2 ? 1 : -1, 4.5 + (i >> 1) * 1.22 * 2, 6.5 + i * 0.7, [PAL.sun, PAL.coral, PAL.teal, PAL.lilac][i], r));
  for (let i = 0; i < 6; i++) out.push(swimmerActor(i % 2 ? 1 : -1, 5.9 + (i >> 1) * 2.25 * 1.5, 1.6 + r() * 1.2, [PAL.coral, PAL.sun, PAL.lilac, PAL.mint, 0xffffff, PAL.sea][i], r));
  for (let i = 0; i < 4; i++) out.push(riderActor(i % 2 ? 1 : -1, 5.5 + (i >> 1) * 2.2, 18 + i * 1.5, r));
  return out;
}

// ------------------------------------------------------------------ patterns
const P = (dz: number, lane: -1 | 0 | 1, kind: PatternItem['kind'], o: Partial<PatternItem> = {}): PatternItem => ({ dz, lane, kind, ...o });
const RAMP_PLAT = (dz0: number, lane: -1 | 0 | 1, plat = 16): PatternItem[] => [P(dz0 + 4.5, lane, 'ramp', { length: 9 }), P(dz0 + 9 + plat / 2, lane, 'platform', { length: plat })];
const PATTERNS: StagePattern[] = [
  // any sport
  { id: 'sp_slalom', difficulty: 1, length: 32, items: [P(0, -1, 'block'), P(14, 1, 'block'), P(28, 0, 'block')] },
  { id: 'sp_hop_hop', difficulty: 1, length: 14, items: [P(0, 0, 'low', { laneSpan: 3 }), P(12, 0, 'low', { laneSpan: 3 })] },
  { id: 'sp_duck_hop_duck', difficulty: 2, length: 26, items: [P(0, 0, 'high', { laneSpan: 3 }), P(12, 0, 'low', { laneSpan: 3 }), P(24, 0, 'high', { laneSpan: 3 })] },
  { id: 'sp_team_bus', difficulty: 2, length: 28, items: [...RAMP_PLAT(0, 0, 16), P(12, -1, 'block'), P(22, 1, 'block')] },
  { id: 'sp_crossing', difficulty: 2, length: 20, items: [P(0, 0, 'moverLow', { dir: 1 }), P(16, 0, 'moverBlock', { dir: -1 })] },
  { id: 'sp_choose', difficulty: 3, length: 28, items: [P(0, 0, 'block'), P(0, -1, 'low'), P(0, 1, 'high'), P(13, -1, 'block'), P(13, 1, 'block'), P(26, 0, 'low', { laneSpan: 3 })] },
  { id: 'sp_zigzag', difficulty: 3, length: 26, items: [P(0, -1, 'block', { laneSpan: 2 }), P(12, 0, 'block', { laneSpan: 2 }), P(24, 0, 'high', { laneSpan: 3 })] },
  // per sport
  { id: 'rugby_tackle', section: 'rugby', difficulty: 1, length: 28, items: [P(0, -1, 'low'), P(0, 1, 'low'), P(12, 0, 'high', { laneSpan: 3 }), P(26, 0, 'moverLow', { dir: -1 })] },
  { id: 'rugby_scrum', section: 'rugby', difficulty: 2, length: 30, items: [P(0, 0, 'block'), P(0, -1, 'low'), P(14, 1, 'moverBlock', { dir: -1 }), P(28, 0, 'high', { laneSpan: 3 })] },
  { id: 'football_goal', section: 'football', difficulty: 1, length: 26, items: [P(0, 0, 'high', { laneSpan: 3 }), P(12, -1, 'low'), P(12, 1, 'low'), P(24, 0, 'moverLow', { dir: 1 })] },
  { id: 'football_wall', section: 'football', difficulty: 2, length: 30, items: [P(0, -1, 'block'), P(0, 0, 'block'), P(14, 1, 'block'), P(14, 0, 'block'), P(28, 0, 'moverBlock', { dir: 1 })] },
  { id: 'netball_bounce', section: 'netball', difficulty: 1, length: 26, items: [P(0, 0, 'moverLow', { dir: 1 }), P(12, 0, 'moverLow', { dir: -1 }), P(24, 0, 'high', { laneSpan: 3 })] },
  { id: 'netball_court', section: 'netball', difficulty: 2, length: 36, items: [P(0, 1, 'block'), P(0, 0, 'low'), P(0, -1, 'high'), ...RAMP_PLAT(12, -1, 14)] },
  { id: 'basketball_hoops', section: 'basketball', difficulty: 1, length: 26, items: [P(0, 0, 'high', { laneSpan: 3 }), P(12, 0, 'low'), P(24, 0, 'high', { laneSpan: 3 })] },
  { id: 'basketball_cage', section: 'basketball', difficulty: 2, length: 30, items: [P(0, -1, 'block'), P(0, 1, 'block'), P(14, 0, 'moverLow', { dir: 1 }), P(28, -1, 'block', { laneSpan: 2 })] },
  { id: 'cricket_wickets', section: 'cricket', difficulty: 1, length: 32, items: [P(0, -1, 'low'), P(10, 0, 'low'), P(20, 1, 'low'), P(32, 0, 'moverLow', { dir: -1 })] },
  { id: 'cricket_screen', section: 'cricket', difficulty: 2, length: 30, items: [P(0, 0, 'block'), P(12, 1, 'block'), P(26, -1, 'moverBlock', { dir: 1 })] },
  { id: 'tennis_nets', section: 'tennis', difficulty: 1, length: 28, items: [P(0, 0, 'low', { laneSpan: 3, length: 0.6 }), P(14, 0, 'low', { laneSpan: 3, length: 0.6 }), P(26, 0, 'moverLow', { dir: 1 })] },
  { id: 'tennis_rally', section: 'tennis', difficulty: 2, length: 38, items: [P(0, 0, 'low', { laneSpan: 3, length: 0.6 }), P(12, 0, 'high', { laneSpan: 3 }), P(24, 0, 'low', { laneSpan: 3, length: 0.6 }), P(36, 0, 'block'), P(36, 1, 'block')] },
  { id: 'hockey_dribble', section: 'hockey', difficulty: 2, length: 30, items: [P(0, 0, 'moverLow', { dir: -1 }), P(14, 0, 'block'), P(14, -1, 'low'), P(14, 1, 'low'), P(28, 0, 'high', { laneSpan: 3 })] },
  { id: 'athletics_hurdles', section: 'athletics', difficulty: 1, length: 32, items: [P(0, 0, 'low', { laneSpan: 3 }), P(10, 0, 'low', { laneSpan: 3 }), P(20, 0, 'low', { laneSpan: 3 }), P(30, 0, 'low', { laneSpan: 3 })] },
  { id: 'athletics_highjump', section: 'athletics', difficulty: 2, length: 38, items: [P(0, 0, 'high', { laneSpan: 3 }), P(12, 0, 'low', { laneSpan: 3 }), P(24, 0, 'high', { laneSpan: 3 }), P(36, 0, 'moverBlock', { dir: -1 })] },
  { id: 'swimming_deck', section: 'swimming', difficulty: 1, length: 26, items: [P(0, 0, 'low'), P(12, 0, 'high', { laneSpan: 3 }), P(24, -1, 'low'), P(24, 1, 'low')] },
  { id: 'swimming_blocks', section: 'swimming', difficulty: 2, length: 46, items: [P(0, -1, 'block'), P(0, 1, 'block'), P(12, 0, 'moverLow', { dir: 1 }), ...RAMP_PLAT(22, 1, 14)] },
  { id: 'cycling_sprint', section: 'cycling', difficulty: 1, length: 28, items: [P(0, 0, 'high', { laneSpan: 3 }), P(12, -1, 'low'), P(12, 0, 'low'), P(26, 0, 'moverBlock', { dir: 1 })] },
  { id: 'cycling_bales', section: 'cycling', difficulty: 3, length: 40, items: [P(0, 0, 'block'), P(0, 1, 'block'), P(12, -1, 'block'), P(12, 0, 'moverLow', { dir: 1 }), P(26, 1, 'high'), P(26, 0, 'high'), P(26, -1, 'block'), P(38, 0, 'low', { laneSpan: 3 })] },
];

// ------------------------------------------------------------------ stage
const LOOK: EnvLook = {
  skyTop: 0x4f9fe0,
  skyHorizon: 0xd2ecf7,
  skyBottom: 0xc4e4f2,
  fog: 0xd2ecf7,
  fogNear: 40,
  fogFar: 125,
  hemiSky: 0xeef7ff,
  hemiGround: 0x9cc48a,
  hemiIntensity: 1.15,
  sunColor: 0xfff0d8,
  sunIntensity: 1.75,
  sunDir: [0.45, 0.8, 0.45],
  sunGlow: 0,
  backdropTint: 0xffffff,
};

function makeBackdrop(mat: THREE.Material): THREE.Mesh {
  const b = new GeoBuilder();
  const r = mkRng(77);
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * TAU;
    const R = 170 + r() * 25;
    const s = 22 + r() * 26;
    const col = mixHex(i % 3 ? 0x8fc78a : 0x7bb98a, 0xd2ecf7, 0.5 + r() * 0.15);
    b.put(lo.sphere(1), col, Math.cos(a) * R, -s * 0.45, Math.sin(a) * R, { sx: s * 1.6, sy: s * 0.8, sz: s });
  }
  // a few far-off city towers and Rangitoto-ish volcano cone
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + (i - 4) * 0.09 + 0.6;
    const R = 160;
    const h = 14 + r() * 22;
    b.put(UNIT(), mixHex(0xa9c4dd, 0xd2ecf7, 0.45), Math.cos(a) * R, h / 2, Math.sin(a) * R, { sx: 6 + r() * 5, sy: h, sz: 6 });
  }
  b.put(lo.cone(1, 1), mixHex(0x7fa88a, 0xd2ecf7, 0.5), -60, 8, -175, { sx: 70, sy: 22, sz: 30 });
  const m = b.build(mat)!;
  m.matrixAutoUpdate = true;
  m.frustumCulled = false;
  m.renderOrder = -5;
  return m;
}

export function createSportsStage(): StageModule {
  const root = new THREE.Group();
  root.name = 'stage-sports';
  let env: StageEnv | null = null;
  let backdrop: THREE.Mesh | null = null;
  let actors: Actor[] = [];
  let confetti: Confetti | null = null;
  let lastArch = -1;
  const ar = mkRng(4242);

  const stage: StageModule & { sprinkleAt(dist: number): string[] } = {
    id: 'sports',
    name: 'Sports Park',
    length: 2000,
    music: 'mus_sports',
    sections: SECTIONS,
    patterns: PATTERNS,
    sprinkleSfx: ['sports_whistle', 'crowd_cheer', 'ball_kick', 'tennis_pok', 'basketball_bounce', 'cricket_tok', 'rugby_thud', 'swim_splash', 'bike_whirr'],
    sprinkleAt(dist: number): string[] {
      return sportOf(sectionAt(SECTIONS, dist).id).sfx;
    },
    build(ctx) {
      ctx.scene.add(root);
      lowQuality = ctx.quality === 'low';
      env = new StageEnv(ctx, root, LOOK);
      backdrop = makeBackdrop(env.backdropMat);
      root.add(backdrop);
      actors = makeActors(ar);
      for (const a of actors) {
        a.obj.visible = false;
        root.add(a.obj);
      }
      confetti = new Confetti();
      root.add(confetti.mesh);
    },
    buildDecor(req) {
      const g = new THREE.Group();
      g.name = `sports-decor-${req.d0}`;
      for (const piece of splitBySection(SECTIONS, req.d0, req.d1)) buildPiece(g, piece.a, piece.b, piece.section, req.rng);
      return g;
    },
    makeObstacle(req) {
      return makeSportObstacle(req);
    },
    update(time, dt, dist, playerPos) {
      setStageTime(time);
      env?.follow(playerPos);
      if (backdrop) backdrop.position.set(playerPos.x, 0, playerPos.z);
      if (poolTexRef) poolTexRef.offset.set(Math.sin(time * 0.3) * 0.02, time * 0.015);
      // ambient play near the runner, only for the sport being run through
      const ahead = sectionAt(SECTIONS, dist + 50);
      const secEnd = ahead.start + SPORT_LEN;
      for (const a of actors) {
        const at = a.anchor + (a.travel?.() ?? 0);
        const passed = a.anchor >= 0 && at < dist - 25;
        const tooFar = a.anchor >= 0 && at > dist + 140;
        if (a.anchor < 0 || passed || tooFar) {
          if (a.sport === ahead.id) {
            const fast = a.sport === 'cycling';
            const d = fast ? (dist > ahead.start - 5 ? dist - 6 - ar() * 14 : ahead.start + 6 + ar() * 20) : Math.max(ahead.start + 12, dist + 45 + ar() * 40);
            if (d < secEnd - 8 && d > ahead.start - 30) {
              a.anchor = d;
              a.reset?.();
              a.obj.position.set(0, 0, -d);
              a.obj.visible = true;
            } else {
              a.anchor = -1;
              a.obj.visible = false;
            }
          } else if (passed || tooFar) {
            a.anchor = -1;
            a.obj.visible = false;
          }
        }
        if (a.obj.visible) a.update(time, dt, dist);
      }
      // confetti when arriving at a new sport
      const cur = sectionAt(SECTIONS, dist + 20);
      if (cur.start !== lastArch && cur.start > 0 && dist + 20 >= cur.start) {
        lastArch = cur.start;
        confetti?.burst(-(cur.start - 5), ar);
      }
      confetti?.update(time, dt);
    },
    ambienceAt() {
      return 'amb_sports';
    },
    dispose() {
      env?.dispose();
      env = null;
      root.removeFromParent();
      confetti?.mesh.dispose();
      root.clear();
    },
  };
  return stage;
}
