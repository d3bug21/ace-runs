// Parks & Botanical Gardens: a garden path through winter -> spring -> summer -> autumn (450 m each, repeating).
// Every season is built to be instantly recognisable for small children:
//   winter = snow, frost, bare branches, snowy pines, falling snowflakes, a waving snowman
//   spring = pink/white blossom, tulips + daffodils, new shoots, hopping lambs, drifting petals
//   summer = big bright sun, full green trees, picnics, kids playing frisbee, butterflies, flower beds
//   autumn = golden/orange canopies, falling leaves, leaf piles, puddles with splashing ducks
// Botanic touches throughout: glass-dome glasshouses, tree-fern (ponga) gardens, ponds with little bridges.
import * as THREE from 'three';
import type { StageModule, StageSection, Season, ObstacleRequest, ObstacleVisual, StagePattern, StageBuildContext } from '../contracts';
import { PLATFORM_TOP } from '../contracts';
import { PAL, geo, mat, clamp, lerp, smooth, rng as mkRng, range, canvasTexture } from '../kit/kit';
import {
  GeoBuilder,
  StageEnv,
  type EnvLook,
  FallingField,
  Wobble,
  wedgeGeo,
  lo,
  floorStrip,
  tileTexture,
  texMat,
  vcMat,
  swayMat,
  glowVcMat,
  clearMat,
  ownedMat,
  addShadow,
  addRoundTree,
  addBareTree,
  addPine,
  addBush,
  addPerson,
  addFence,
  splitBySection,
  cachedTex,
  css,
  jitter,
  mixHex,
  setStageTime,
  part,
  SKIN,
  TAU,
} from './helpersB';

// ------------------------------------------------------------------ seasons + sections
const SEASONS: Season[] = ['winter', 'spring', 'summer', 'autumn'];
const SEASON_LEN = 450;
const BLEND_BAND = 32; // metres either side of a boundary over which sky / light / particles cross-fade
const LABEL: Record<Season, string> = {
  winter: 'Winter Wonderland',
  spring: 'Spring Blossom',
  summer: 'Sunny Summer',
  autumn: 'Golden Autumn',
};
const seasonAt = (d: number): Season => SEASONS[((Math.floor(Math.max(0, d) / SEASON_LEN) % 4) + 4) % 4];

function makeSections(): StageSection[] {
  const out: StageSection[] = [];
  for (let k = 0; k * SEASON_LEN < 20000; k++) {
    const s = SEASONS[k % 4];
    out.push({ id: s, label: LABEL[s], start: k * SEASON_LEN, season: s });
  }
  return out;
}

const LOOKS: Record<Season, EnvLook> = {
  winter: {
    skyTop: 0x86aed6, skyHorizon: 0xe6eef6, skyBottom: 0xe9f0f6, fog: 0xe3ecf4, fogNear: 22, fogFar: 98,
    hemiSky: 0xeef5ff, hemiGround: 0xc4d2e0, hemiIntensity: 1.25, sunColor: 0xfff2e4, sunIntensity: 1.05,
    sunDir: [-0.35, 0.62, 0.5], sunGlow: 0, backdropTint: 0xdfe8f1,
  },
  spring: {
    skyTop: 0x6bb3ea, skyHorizon: 0xe2f1f2, skyBottom: 0xcde8c8, fog: 0xe4f0ec, fogNear: 28, fogFar: 108,
    hemiSky: 0xf4fbff, hemiGround: 0x9fcf88, hemiIntensity: 1.08, sunColor: 0xfff3de, sunIntensity: 1.45,
    sunDir: [0.4, 0.75, 0.42], sunGlow: 0, backdropTint: 0xc3dfb0,
  },
  summer: {
    skyTop: 0x3a98e0, skyHorizon: 0xc4e6f5, skyBottom: 0xa9d68e, fog: 0xc8e6f1, fogNear: 34, fogFar: 116,
    hemiSky: 0xe8f7ff, hemiGround: 0x8cc66e, hemiIntensity: 1.0, sunColor: 0xfff1cc, sunIntensity: 1.9,
    sunDir: [0.35, 0.8, -0.45], sunGlow: 0, backdropTint: 0xa9d29b,
  },
  autumn: {
    skyTop: 0x7da7d4, skyHorizon: 0xf4e3c8, skyBottom: 0xe2c995, fog: 0xf0dfc4, fogNear: 26, fogFar: 104,
    hemiSky: 0xfff1de, hemiGround: 0xc99f62, hemiIntensity: 1.05, sunColor: 0xffd9a6, sunIntensity: 1.45,
    sunDir: [-0.5, 0.55, 0.35], sunGlow: 0, backdropTint: 0xdcc596,
  },
};
const FILL: Record<Season, number> = { winter: 0.35, spring: 0.3, summer: 0.55, autumn: 0.35 };
const SUN_SPRITE: Record<Season, number> = { winter: 0.35, spring: 0.7, summer: 1, autumn: 0.6 };
const SUN_TINT: Record<Season, number> = { winter: 0xfff6ea, spring: 0xfff1c2, summer: 0xffe27a, autumn: 0xffc77a };
const FAR_GROUND: Record<Season, number> = { winter: 0xeef3f8, spring: 0x9fd17f, summer: 0x86c665, autumn: 0xc2ad62 };

// ------------------------------------------------------------------ season palettes
interface SeasonStyle {
  ground: number;
  patches: number[];
  kerb: number;
  hedge: number;
  hedgeTop: number;
  trunk: number;
  soil: number;
}
const STYLE: Record<Season, SeasonStyle> = {
  winter: { ground: 0xf2f6fa, patches: [0xe0e9f3, 0xe8eff7, 0xd8e3ef], kerb: 0xdfe6ee, hedge: 0x7fa597, hedgeTop: 0xf6f9fc, trunk: 0x6e584a, soil: 0xe6edf4 },
  spring: { ground: 0x9fd683, patches: [0x8fcd74, 0xaedd8f, 0x93d27b], kerb: 0xd9d2c4, hedge: 0x5fae5a, hedgeTop: 0x79c46a, trunk: 0x8a6246, soil: 0x9a7356 },
  summer: { ground: 0x84c866, patches: [0x78bd5a, 0x90d070, 0x7cc25e], kerb: 0xe2d6bd, hedge: 0x4b9e4f, hedgeTop: 0x5fb35a, trunk: 0x8a6246, soil: 0x8f6a4d },
  autumn: { ground: 0xaab45e, patches: [0xe3a23f, 0xd9822f, 0xc9a13a, 0xb98c3c], kerb: 0xd3c5a8, hedge: 0x6c9a4a, hedgeTop: 0x8aa74c, trunk: 0x7a5a42, soil: 0x8a6448 },
};
const BLOSSOM = [0xffc2d4, 0xffd6e2, 0xffb0c8, 0xfff0f4];
const BLOSSOM_WHITE = [0xfff6f8, 0xffeef2, 0xfffafb];
const SUMMER_GREEN = [0x4fae5a, 0x5fbd5c, 0x45a052, 0x67c063];
const AUTUMN_CANOPY = [0xf2b134, 0xe8892e, 0xd9622b, 0xe9a531, 0xc9a13a];
const SNOW = 0xf6f9fc;

// ------------------------------------------------------------------ small local helpers
let curR: () => number = Math.random;
/** decor density (0.6 on low quality) */
let densityK = 1;
/** range on the current builder rng (set at the start of each builder) */
const R = (a: number, b: number): number => a + (b - a) * curR();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();

/** Put with 'YXZ' Euler (yaw then pitch) — handy for fronds / leaves radiating around an axis. */
function putYX(b: GeoBuilder, g: THREE.BufferGeometry, col: number, x: number, y: number, z: number, ry: number, rx: number, sx = 1, sy = 1, sz = 1, sway = 0): void {
  _e.set(rx, ry, 0, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  _m.compose(_p, _q, _s);
  b.add(g, col, _m, sway, 0);
}
/** Put a +Y-aligned geometry pointing along dir. */
function putAlong(b: GeoBuilder, g: THREE.BufferGeometry, col: number, x: number, y: number, z: number, dx: number, dy: number, dz: number, s = 1): void {
  _dir.set(dx, dy, dz).normalize();
  _q.setFromUnitVectors(_up, _dir);
  _p.set(x, y, z);
  _s.set(s, s, s);
  _m.compose(_p, _q, _s);
  b.add(g, col, _m);
}

function flower(b: GeoBuilder, x: number, z: number, h: number, bloom: number, kind: 'tulip' | 'daffodil' | 'daisy' | 'round', sway = 0.03): void {
  b.put(geo.box(0.025, h, 0.025), 0x4f9e4a, x, h / 2, z, { sway });
  if (kind === 'tulip') {
    b.put(lo.cyl(0.075, 0.045, 0.15), bloom, x, h + 0.05, z, { sway: sway * 1.3 });
    b.put(lo.leaf(0.08, 0.28), 0x5aa557, x, 0.02, z, { rx: -1.2, ry: 0.4, sway });
  } else if (kind === 'daffodil') {
    b.put(lo.cyl(0.1, 0.1, 0.025), bloom, x, h, z + 0.02, { rx: 1.2, sway: sway * 1.3 });
    b.put(lo.cyl(0.035, 0.045, 0.09), 0xffa833, x, h + 0.01, z + 0.06, { rx: 1.2, sway: sway * 1.3 });
  } else if (kind === 'daisy') {
    b.put(lo.cyl(0.07, 0.07, 0.02), bloom, x, h, z, { sway: sway * 1.3 });
    b.put(lo.cyl(0.03, 0.03, 0.03), 0xffc94a, x, h + 0.015, z, { sway: sway * 1.3 });
  } else {
    b.put(lo.ico(0.085), bloom, x, h + 0.03, z, { sy: 0.75, sway: sway * 1.3 });
  }
}

/** Tree fern (ponga) — a proud Aotearoa botanic touch. */
function addTreeFern(b: GeoBuilder, x: number, z: number, s: number, r: () => number, frondCol = 0x4f9f4d, snow = false): void {
  const h = (2.2 + r() * 1.2) * s;
  b.put(lo.cyl(0.13 * s, 0.18 * s, h), 0x5c4433, x, h / 2, z);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.3;
    putYX(b, lo.leaf(0.55 * s, 2.0 * s), jitter(frondCol, r, 0.08), x, h, z, a, 0.35 + r() * 0.35, 1, 1, 1, 0.06);
    if (snow && i % 2 === 0) putYX(b, lo.leaf(0.3 * s, 1.0 * s), SNOW, x, h + 0.05, z, a, 0.3, 1, 1, 1, 0.06);
  }
  // curled koru in the centre
  b.put(geo.torus(0.12 * s, 0.035 * s, 6, 12, Math.PI * 1.5), 0x6dbb5e, x, h + 0.22 * s, z, { ry: r() * 3 });
}

/** Low fern clump. */
function addFern(b: GeoBuilder, x: number, z: number, s: number, r: () => number, col = 0x56a851): void {
  for (let i = 0; i < 7; i++) putYX(b, lo.leaf(0.28 * s, 0.9 * s), jitter(col, r, 0.08), x, 0.05, z, (i / 7) * TAU + r() * 0.4, -0.55 - r() * 0.3, 1, 1, 1, 0.03);
}


/** Lighter round tree (icosphere canopy blobs, 80 tris each). */
function roundTree(b: GeoBuilder, x: number, z: number, s: number, trunk: number, canopy: number[], r: () => number, sway = 0.05): void {
  const h = 2.2 * s;
  b.put(geo.cyl(0.14 * s, 0.22 * s, h, 6), trunk, x, h / 2, z);
  const blobs = 3 + Math.floor(r() * 2);
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * TAU + r();
    const rr = (0.9 + r() * 0.5) * s;
    const ox = i === 0 ? 0 : Math.cos(a) * 0.75 * s;
    const oz = i === 0 ? 0 : Math.sin(a) * 0.75 * s;
    const oy = i === 0 ? h + 0.9 * s : h + 0.4 * s + r() * 0.6 * s;
    b.put(lo.ico(1, 1), jitter(canopy[i % canopy.length], r, 0.06), x + ox, oy, z + oz, { s: rr, sy: rr * 0.9, sway, ry: r() * 3 });
  }
}
/** Lighter bare tree (5-sided branches, tiny tip blobs). */
function bareTree(b: GeoBuilder, x: number, z: number, s: number, col: number, r: () => number, tipCol?: number): void {
  const h = 2.4 * s;
  b.put(geo.cyl(0.12 * s, 0.22 * s, h, 6), col, x, h / 2, z);
  const n = 5 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.6;
    const tilt = 0.5 + r() * 0.5;
    const len = (1.1 + r() * 0.9) * s;
    const y0 = h * (0.62 + r() * 0.35);
    const dx = Math.cos(a) * Math.sin(tilt), dy = Math.cos(tilt), dz = Math.sin(a) * Math.sin(tilt);
    putAlong(b, geo.cyl(0.035 * s, 0.07 * s, len, 5), col, x + dx * len * 0.5, y0 + dy * len * 0.5, z + dz * len * 0.5, dx, dy, dz);
    const tx = x + dx * len, ty = y0 + dy * len, tz = z + dz * len;
    const a2 = a + 0.7;
    const ex = Math.cos(a2) * 0.5, ez = Math.sin(a2) * 0.5;
    putAlong(b, geo.cyl(0.018 * s, 0.035 * s, len * 0.5, 5), col, tx + ex * len * 0.2, ty + len * 0.18, tz + ez * len * 0.2, ex, 0.8, ez);
    if (tipCol !== undefined) b.put(lo.ico(0.17 * s), tipCol, tx, ty + 0.04, tz, { sy: 0.55, ry: a });
  }
}

// ------------------------------------------------------------------ path textures
const PX = 256 / 7.2;
function pathTexture(season: Season): THREE.Texture {
  return cachedTex(`parks-path-${season}`, () =>
    tileTexture(256, 256, (g, W, H) => {
      const r = mkRng(91 + SEASONS.indexOf(season) * 17);
      const slab = { winter: 0xb8c3cf, spring: 0xe4d6bd, summer: 0xebd5a6, autumn: 0xd9c19a }[season];
      const grout = { winter: 0x9aa8b6, spring: 0xb9a888, summer: 0xbfa576, autumn: 0xaa9470 }[season];
      const edge = { winter: 0x8e9cab, spring: 0xa99a80, summer: 0xb09670, autumn: 0x9c8466 }[season];
      g.fillStyle = css(grout);
      g.fillRect(0, 0, W, H);
      // border cobbles
      for (const x0 of [0, 6.9]) {
        for (let y = 0; y < H; y += 12) {
          g.fillStyle = css(jitter(edge, r, 0.07));
          g.beginPath();
          g.roundRect(x0 * PX + 1, y + 1, 0.3 * PX - 2, 10, 3);
          g.fill();
        }
      }
      // flagstones: three lane columns, two slabs across each, staggered
      const cols = [0.3, 2.5, 4.7];
      cols.forEach((c, ci) => {
        for (let half = 0; half < 2; half++) {
          const x = (c + half * 1.1) * PX;
          const off = ((ci * 3 + half) * 23) % 64;
          for (let y = -64; y < H + 64; y += 64) {
            const yy = y + off;
            g.fillStyle = css(jitter(slab, r, 0.06));
            g.beginPath();
            g.roundRect(x + 1.6, yy + 1.6, 1.1 * PX - 3.2, 64 - 3.2, 5);
            g.fill();
            // subtle speckle
            g.fillStyle = 'rgba(255,255,255,0.12)';
            for (let k = 0; k < 6; k++) g.fillRect(x + 4 + r() * 30, yy + 4 + r() * 54, 2, 2);
          }
        }
      });
      // lane separators: slightly darker grout channels
      g.fillStyle = css(mixHex(grout, 0x5a4a3a, 0.25), 0.9);
      for (const lx of [2.5, 4.7]) g.fillRect(lx * PX - 2, 0, 4, H);
      const wrapDraw = (fn: (ox: number, oy: number) => void, x: number, y: number) => {
        fn(x, y);
        if (y < 20) fn(x, y + H);
        if (y > H - 20) fn(x, y - H);
      };
      if (season === 'winter') {
        // the path is snowy: soft snow over the slabs, trodden lane tracks, ridges between lanes
        g.fillStyle = 'rgba(244,248,252,0.78)';
        g.fillRect(0, 0, W, H);
        for (const lc of [1.4, 3.6, 5.8]) {
          g.fillStyle = 'rgba(214,226,238,0.55)';
          g.fillRect((lc - 0.7) * PX, 0, 1.4 * PX, H);
          // footprints
          for (let y = 6; y < H; y += 22) {
            const side = (y / 22) % 2 < 1 ? -1 : 1;
            g.fillStyle = 'rgba(176,195,215,0.55)';
            g.beginPath();
            g.ellipse((lc + side * 0.22) * PX, y, 4, 7, 0, 0, TAU);
            g.fill();
          }
        }
        for (const lx of [2.5, 4.7]) {
          g.fillStyle = 'rgba(255,255,255,0.95)';
          g.fillRect(lx * PX - 6, 0, 9, H);
          g.fillStyle = 'rgba(150,176,206,0.6)';
          g.fillRect(lx * PX + 3, 0, 3, H);
        }
        for (const x0 of [0, 6.75]) {
          g.fillStyle = 'rgba(255,255,255,0.95)';
          g.fillRect(x0 * PX, 0, 0.45 * PX, H);
        }
        for (let k = 0; k < 70; k++) {
          g.fillStyle = 'rgba(255,255,255,0.9)';
          g.fillRect(r() * W, r() * H, 2, 2);
        }
      } else if (season === 'spring') {
        for (let k = 0; k < 110; k++) {
          const x = r() * W, y = r() * H, rot = r() * 3;
          const c = [0xffb3c9, 0xffc8d8, 0xfff0f4, 0xff9fbd][Math.floor(r() * 4)];
          wrapDraw((ox, oy) => {
            g.fillStyle = css(c, 0.95);
            g.beginPath();
            g.ellipse(ox, oy, 4, 2.6, rot, 0, TAU);
            g.fill();
          }, x, y);
        }
        g.fillStyle = 'rgba(110,170,90,0.6)';
        for (let k = 0; k < 40; k++) g.fillRect([0.3, 2.5, 4.7, 6.9][k % 4] * PX - 1, r() * H, 3, 5);
      } else if (season === 'summer') {
        g.fillStyle = 'rgba(255,250,230,0.18)';
        for (let k = 0; k < 18; k++) {
          g.beginPath();
          g.ellipse(r() * W, r() * H, 12 + r() * 16, 8 + r() * 10, r() * 3, 0, TAU);
          g.fill();
        }
        g.fillStyle = 'rgba(110,170,90,0.55)';
        for (let k = 0; k < 30; k++) g.fillRect([0.3, 6.9][k % 2] * PX - 1, r() * H, 3, 5);
      } else {
        // damp patches + scattered leaves
        g.fillStyle = 'rgba(120,95,70,0.14)';
        for (let k = 0; k < 10; k++) {
          g.beginPath();
          g.ellipse(r() * W, r() * H, 14 + r() * 20, 9 + r() * 12, r() * 3, 0, TAU);
          g.fill();
        }
        for (let k = 0; k < 85; k++) {
          const x = r() * W, y = r() * H, rot = r() * TAU;
          const c = AUTUMN_CANOPY[Math.floor(r() * AUTUMN_CANOPY.length)];
          wrapDraw((ox, oy) => {
            g.save();
            g.translate(ox, oy);
            g.rotate(rot);
            g.fillStyle = css(c);
            g.beginPath();
            g.moveTo(0, -7);
            g.quadraticCurveTo(5, -1, 0, 7);
            g.quadraticCurveTo(-5, -1, 0, -7);
            g.fill();
            g.strokeStyle = 'rgba(120,70,30,0.5)';
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(0, -6);
            g.lineTo(0, 8);
            g.stroke();
            g.restore();
          }, x, y);
        }
      }
    }),
  );
}

// ------------------------------------------------------------------ static decor pieces (bake into builders)
interface Bld {
  s: GeoBuilder; // static vertex-colour
  w: GeoBuilder; // sway (foliage, flowers)
  gl: GeoBuilder; // glow (lamps)
  gloss: GeoBuilder; // glossy water / ice
  glass: GeoBuilder; // glasshouse panes
}
interface Occ {
  x: number;
  z: number;
  r: number;
}
const free = (occ: Occ[], x: number, z: number, r: number): boolean => {
  for (const o of occ) if ((o.x - x) ** 2 + (o.z - z) ** 2 < (o.r + r) ** 2) return false;
  return true;
};

function lampPost(B: Bld, x: number, z: number, season: Season): void {
  const iron = 0x35574a;
  B.s.put(lo.cyl(0.07, 0.09, 3.1), iron, x, 1.55, z);
  B.s.put(lo.cyl(0.16, 0.2, 0.25), iron, x, 0.12, z);
  B.s.put(lo.cone(0.26, 0.22), iron, x, 3.55, z);
  B.s.put(lo.sphere(0.06), 0xffd166, x, 3.7, z);
  B.gl.put(lo.cyl(0.15, 0.11, 0.32), season === 'winter' ? 0xffe1a0 : 0xfff0c8, x, 3.3, z);
  if (season === 'winter') B.s.put(lo.cone(0.27, 0.1), SNOW, x, 3.68, z);
  if (season === 'summer' || season === 'spring') {
    // hanging flower basket
    B.s.put(lo.sphere(0.2), 0x8a6246, x, 2.45, z, { sy: 0.6 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      B.w.put(lo.sphere(0.09), season === 'spring' ? [0xff9fc0, 0xfff0f4][i % 2] : [0xe85d8a, 0xb59cf0, 0xfff4e0][i % 3], x + Math.cos(a) * 0.17, 2.55, z + Math.sin(a) * 0.17, { sway: 0.02 });
    }
  }
}

function parkBench(b: GeoBuilder, x: number, z: number, ry: number, season: Season, H = 0.85, w = 1.9): void {
  const iron = 0x35574a;
  const wood = season === 'winter' ? 0xb98a64 : PAL.wood;
  const c = Math.cos(ry), sn = Math.sin(ry);
  const P = (lx: number, lz: number): [number, number] => [x + lx * c + lz * sn, z - lx * sn + lz * c];
  const k = H / 0.85;
  for (const sx of [-w / 2 + 0.12, w / 2 - 0.12]) {
    let p = P(sx, 0.12);
    b.put(geo.box(0.07, 0.45 * k, 0.07), iron, p[0], 0.225 * k, p[1], { ry });
    p = P(sx, -0.18);
    b.put(geo.box(0.07, 0.85 * k, 0.07), iron, p[0], 0.425 * k, p[1], { ry });
    p = P(sx, -0.03);
    b.put(geo.box(0.07, 0.06, 0.42), iron, p[0], 0.44 * k, p[1], { ry });
  }
  for (let i = 0; i < 3; i++) {
    const p = P(0, 0.14 - i * 0.13);
    b.put(geo.rbox(w, 0.05, 0.11, 0.02, 1), wood, p[0], 0.47 * k, p[1], { ry });
  }
  for (let i = 0; i < 2; i++) {
    const p = P(0, -0.2);
    b.put(geo.rbox(w, 0.11, 0.05, 0.02, 1), wood, p[0], (0.62 + i * 0.16) * k, p[1], { ry });
  }
  if (season === 'winter') {
    const p = P(0, 0);
    b.put(geo.rbox(w * 0.96, 0.06, 0.36, 0.03, 1), SNOW, p[0], 0.52 * k, p[1], { ry });
    const q = P(0, -0.2);
    b.put(geo.rbox(w * 0.96, 0.05, 0.08, 0.02, 1), SNOW, q[0], 0.85 * k - 0.035, q[1], { ry });
  } else if (season === 'autumn') {
    for (let i = 0; i < 4; i++) {
      const p = P(-0.6 + i * 0.4, 0.02 - (i % 2) * 0.1);
      b.put(lo.leaf(0.12, 0.16), AUTUMN_CANOPY[i % 5], p[0], 0.5 * k, p[1], { ry: i * 1.3 });
    }
  }
}

function snowmanStatic(b: GeoBuilder, x: number, z: number, k: number, ry: number, r: () => number, scarf: number = PAL.coral, withArms = true): number {
  // returns head centre height
  const r0 = 0.92 * k, r1 = 0.66 * k, r2 = 0.47 * k;
  const y0 = 0.8 * k, y1 = y0 + r0 * 0.75 + r1 * 0.7, y2 = y1 + r1 * 0.75 + r2 * 0.65;
  const c = Math.cos(ry), s = Math.sin(ry);
  const F = (lx: number, ly: number, lz: number): [number, number, number] => [x + lx * c + lz * s, ly, z - lx * s + lz * c];
  b.put(lo.sphereHi(r0), 0xf7fafd, x, y0, z);
  b.put(lo.sphereHi(r1), 0xf4f8fc, x, y1, z);
  b.put(lo.sphereHi(r2), 0xf7fafd, x, y2, z);
  // scarf + tail
  b.put(geo.torus(r1 * 0.62, 0.09 * k, 8, 20), scarf, x, y1 + r1 * 0.72, z, { rx: Math.PI / 2 });
  let p = F(r1 * 0.35, y1 + r1 * 0.45, r1 * 0.55);
  b.put(geo.rbox(0.16 * k, 0.42 * k, 0.07 * k, 0.03, 1), scarf, p[0], p[1], p[2], { ry, rz: 0.2 });
  // hat
  p = F(0, y2 + r2 * 0.78, 0);
  b.put(lo.cyl(r2 * 0.95, r2 * 0.95, 0.06 * k), 0x2b3440, p[0], p[1], p[2]);
  b.put(lo.cyl(r2 * 0.6, r2 * 0.62, 0.42 * k), 0x2b3440, p[0], p[1] + 0.22 * k, p[2]);
  b.put(lo.cyl(r2 * 0.63, r2 * 0.63, 0.08 * k), PAL.red, p[0], p[1] + 0.08 * k, p[2]);
  // face (+z local)
  for (const ex of [-1, 1]) {
    p = F(ex * r2 * 0.36, y2 + r2 * 0.22, r2 * 0.88);
    b.put(lo.sphere(0.055 * k), 0x2b3440, p[0], p[1], p[2]);
  }
  p = F(0, y2, r2 * 0.95);
  putAlong(b, lo.cone(0.07 * k, 0.36 * k), PAL.orange, p[0], p[1], p[2] + 0.0, s, 0, c, 1);
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45;
    p = F(Math.sin(a) * r2 * 0.5, y2 - r2 * 0.42 + Math.cos(a) * 0.08 * k - 0.04 * k, r2 * 0.82);
    b.put(lo.sphere(0.035 * k), 0x2b3440, p[0], p[1], p[2]);
  }
  for (let i = 0; i < 3; i++) {
    p = F(0, y1 + r1 * 0.3 - i * r1 * 0.38, r1 * (0.95 - Math.abs(i - 1) * 0.04));
    b.put(lo.sphere(0.06 * k), [PAL.red, PAL.teal, PAL.sun][i], p[0], p[1], p[2]);
  }
  if (withArms) {
    for (const side of [-1, 1]) {
      p = F(side * (r1 + 0.35 * k), y1 + 0.2 * k, 0);
      b.put(lo.cyl(0.035 * k, 0.05 * k, 0.8 * k), 0x7a5a42, p[0], p[1], p[2], { ry, rz: side * 1.05 });
      const q2 = F(side * (r1 + 0.62 * k), y1 + 0.5 * k, 0);
      b.put(lo.cyl(0.025 * k, 0.03 * k, 0.3 * k), 0x7a5a42, q2[0], q2[1], q2[2], { ry, rz: side * 0.3 });
    }
  }
  void r;
  return y2;
}

function picnic(B: Bld, x: number, z: number, r: () => number, side: number): void {
  const cA = r() < 0.5 ? PAL.coral : PAL.teal;
  const cB = 0xfff4e0;
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) B.s.put(lo.flat(0.5, 0.5), (i + j) % 2 ? cA : cB, x - 0.75 + i * 0.5, 0.02, z - 0.75 + j * 0.5);
  // basket
  B.s.put(geo.rbox(0.55, 0.32, 0.38, 0.06, 2), 0xc98f5a, x + 0.35, 0.18, z - 0.3);
  B.s.put(geo.torus(0.2, 0.025, 6, 14, Math.PI), 0x9a6a40, x + 0.35, 0.34, z - 0.3);
  B.s.put(lo.flat(0.4, 0.3), PAL.red, x + 0.35, 0.345, z - 0.3);
  // cups and plates
  B.s.put(lo.cyl(0.14, 0.14, 0.02), 0xffffff, x - 0.3, 0.035, z + 0.2);
  B.s.put(lo.cyl(0.14, 0.14, 0.02), 0xffffff, x + 0.2, 0.035, z + 0.35);
  B.s.put(lo.cyl(0.05, 0.045, 0.12), PAL.lemon, x - 0.1, 0.08, z + 0.05);
  // family sitting
  addPerson(B.s, x - 0.9, 0.02, z + 0.2, r, { shirt: PAL.blue, ry: side > 0 ? -1.2 : 1.2, seated: true });
  addPerson(B.s, x + 0.9, 0.02, z + 0.5, r, { shirt: PAL.sun, ry: side > 0 ? -1.9 : 1.9, seated: true, scale: 0.75 });
  addPerson(B.s, x, 0.02, z - 1.0, r, { shirt: PAL.berry, ry: 0.2, seated: true });
  // sun umbrella
  B.s.put(lo.cyl(0.03, 0.03, 2.3), 0xeeeeee, x + 1.1, 1.15, z - 1.0, { rz: 0.12 });
  for (let i = 0; i < 8; i++) {
    B.w.put(lo.cone(1.25, 0.5), i % 2 ? 0xfff4e0 : cA, x + 1.25, 2.4, z - 1.0, { ry: (i / 8) * TAU, sx: 1, sz: 0.4, sway: 0.01 });
  }
}

function pond(B: Bld, x: number, z: number, rx: number, rz: number, season: Season, r: () => number): void {
  const water = season === 'winter' ? 0xd3ecf6 : season === 'autumn' ? 0x86b9c9 : 0x74c0dc;
  B.s.put(lo.disc(1, 28), season === 'winter' ? 0xdde6ee : 0xb7a98e, x, 0.012, z, { sx: rx + 0.45, sz: rz + 0.45 });
  B.gloss.put(lo.disc(1, 28), water, x, 0.03, z, { sx: rx, sz: rz });
  // rim stones
  const n = Math.floor((rx + rz) * 3.2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    B.s.put(lo.dodeca(0.22), jitter(season === 'winter' ? 0xe8eef4 : 0xb8b0a2, r, 0.08), x + Math.cos(a) * (rx + 0.2), 0.06, z + Math.sin(a) * (rz + 0.2), { sy: 0.55, ry: a });
  }
  if (season === 'summer' || season === 'spring') {
    for (let i = 0; i < 7; i++) {
      const a = r() * TAU, d = r() * 0.75;
      B.s.put(lo.cyl(0.32, 0.32, 0.02), 0x5fb35a, x + Math.cos(a) * rx * d, 0.045, z + Math.sin(a) * rz * d);
      if (i % 3 === 0) B.s.put(lo.sphere(0.1), 0xffb3c9, x + Math.cos(a) * rx * d, 0.1, z + Math.sin(a) * rz * d, { sy: 0.6 });
    }
  }
  if (season !== 'winter') {
    for (let i = 0; i < 6; i++) {
      const a = -0.5 + r() * 1.2 + (i % 2) * Math.PI;
      const px = x + Math.cos(a) * (rx + 0.1), pz = z + Math.sin(a) * (rz + 0.1);
      B.w.put(lo.cyl(0.02, 0.03, 1.1), season === 'autumn' ? 0xb59a52 : 0x6cab55, px, 0.55, pz, { sway: 0.05, rz: (r() - 0.5) * 0.3 });
      B.w.put(lo.capsule(0.05, 0.18), 0x8a6246, px, 1.12, pz, { sway: 0.06 });
    }
  }
  // little red footbridge crossing the pond (along z)
  const bw = 1.3;
  const L = rz * 2 + 1.6;
  const arcH = 0.55;
  const seg = 9;
  for (let i = 0; i < seg; i++) {
    const t = (i + 0.5) / seg;
    const zz = z - L / 2 + t * L;
    const yy = 0.12 + Math.sin(t * Math.PI) * arcH;
    const slope = Math.cos(t * Math.PI) * arcH * Math.PI / L;
    B.s.put(geo.box(bw, 0.08, L / seg + 0.03), 0xb98a64, x, yy, zz, { rx: slope });
    if (season === 'winter') B.s.put(geo.box(bw * 0.9, 0.05, L / seg + 0.03), SNOW, x, yy + 0.06, zz, { rx: slope });
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const zz = z - L / 2 + t * L;
      const yy = 0.12 + Math.sin(t * Math.PI) * arcH;
      B.s.put(lo.cyl(0.05, 0.05, 0.7), PAL.red, x + sx * bw * 0.48, yy + 0.35, zz);
      B.s.put(lo.sphere(0.07), PAL.sun, x + sx * bw * 0.48, yy + 0.72, zz);
    }
    for (let i = 0; i < seg; i++) {
      const t = (i + 0.5) / seg;
      const zz = z - L / 2 + t * L;
      const yy = 0.12 + Math.sin(t * Math.PI) * arcH;
      const slope = Math.cos(t * Math.PI) * arcH * Math.PI / L;
      B.s.put(geo.box(0.07, 0.07, L / seg + 0.04), PAL.red, x + sx * bw * 0.48, yy + 0.66, zz, { rx: slope });
    }
  }
}

function glasshouse(B: Bld, x: number, z: number, s: number, season: Season): void {
  const frame = 0xf6f8f6;
  // brick base
  B.s.put(lo.cyl(5.4 * s, 5.6 * s, 0.9 * s), 0xd9cdb8, x, 0.45 * s, z);
  B.s.put(lo.cyl(5.5 * s, 5.5 * s, 0.12 * s), frame, x, 0.95 * s, z);
  // glass drum + dome
  B.glass.put(geo.cyl(5.2 * s, 5.2 * s, 3.2 * s, 24), 0xd5f1f2, x, 2.6 * s, z);
  B.glass.put(geo.sphere(5.2 * s, 24, 12), 0xd5f1f2, x, 4.2 * s, z, { sy: 0.85 });
  // white ribs
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI;
    B.s.put(geo.torus(5.22 * s, 0.07 * s, 4, 20, Math.PI), frame, x, 4.2 * s, z, { ry: a, sy: 0.85 });
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU;
    B.s.put(lo.cyl(0.06 * s, 0.06 * s, 3.2 * s), frame, x + Math.cos(a) * 5.22 * s, 2.6 * s, z + Math.sin(a) * 5.22 * s);
  }
  B.s.put(geo.torus(5.22 * s, 0.08 * s, 4, 32), frame, x, 4.2 * s, z, { rx: Math.PI / 2 });
  B.s.put(geo.torus(3.7 * s, 0.07 * s, 4, 28), frame, x, 7.4 * s, z, { rx: Math.PI / 2 });
  // lantern top + finial
  B.glass.put(lo.cyl(1.0 * s, 1.0 * s, 1.0 * s), 0xd5f1f2, x, 8.9 * s, z);
  B.s.put(lo.cone(1.2 * s, 0.8 * s), frame, x, 9.8 * s, z);
  B.s.put(lo.sphere(0.2 * s), PAL.sun, x, 10.35 * s, z);
  // tropical plants inside, visible through the glass
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    B.s.put(lo.sphere(1.3 * s), [0x3f9a4f, 0x58b35a, 0x2f8a52][i % 3], x + Math.cos(a) * 2.6 * s, 2.2 * s, z + Math.sin(a) * 2.6 * s, { sy: 1.2 });
  }
  B.s.put(lo.cyl(0.25 * s, 0.3 * s, 5 * s), 0x7a5a42, x, 3.4 * s, z);
  B.s.put(lo.sphere(2 * s), 0x4fae5a, x, 6.2 * s, z, { sy: 0.7 });
  if (season === 'winter') {
    B.s.put(geo.torus(5.55 * s, 0.22 * s, 6, 32), SNOW, x, 0.98 * s, z, { rx: Math.PI / 2, sz: 0.6 });
    B.s.put(lo.cone(1.25 * s, 0.35 * s), SNOW, x, 10.05 * s, z);
  }
}

function lambStatic(b: GeoBuilder, x: number, z: number, ry: number, s: number, r: () => number, sheep = false): void {
  const c = Math.cos(ry), sn = Math.sin(ry);
  const F = (lx: number, lz: number): [number, number] => [x + lx * c + lz * sn, z - lx * sn + lz * c];
  const wool = sheep ? 0xf3efe6 : 0xfbf8f2;
  const k = s * (sheep ? 1.35 : 1);
  for (let i = 0; i < 6; i++) {
    const p = F((-0.2 + (i % 3) * 0.2) * k, (i < 3 ? -0.08 : 0.08) * k);
    b.put(lo.sphere(0.17 * k), jitter(wool, r, 0.03), p[0], (0.42 + (i % 2) * 0.05) * k, p[1]);
  }
  let p = F(0.36 * k, 0);
  b.put(lo.sphere(0.12 * k), 0x3b3330, p[0], 0.52 * k, p[1], { sx: 1.2 });
  p = F(0.3 * k, 0);
  b.put(lo.sphere(0.11 * k), wool, p[0], 0.62 * k, p[1]);
  for (const sd of [-1, 1]) {
    p = F(0.32 * k, sd * 0.13 * k);
    b.put(lo.capsule(0.03 * k, 0.1 * k), 0x3b3330, p[0], 0.55 * k, p[1], { rx: sd * 1.3 });
  }
  for (const [lx, lz] of [[-0.2, -0.1], [-0.2, 0.1], [0.2, -0.1], [0.2, 0.1]]) {
    p = F(lx * k, lz * k);
    b.put(lo.capsule(0.035 * k, 0.22 * k), 0x3b3330, p[0], 0.15 * k, p[1]);
  }
}

// ------------------------------------------------------------------ per-piece decor
function decorPiece(g: THREE.Group, a: number, bEnd: number, season: Season, r: () => number): void {
  curR = r;
  const st = STYLE[season];
  const len = bEnd - a;
  const zc = -(a + bEnd) / 2;
  const B: Bld = { s: new GeoBuilder(), w: new GeoBuilder(), gl: new GeoBuilder(), gloss: new GeoBuilder(), glass: new GeoBuilder() };
  const occ: Occ[] = [];
  const sameSeasonAround = (d: number, m: number) => seasonAt(d - m) === season && seasonAt(d + m) === season;

  // floor: garden path with three lanes
  g.add(floorStrip(a, bEnd, -3.6, 3.6, texMat(`parks-path-${season}`, pathTexture(season), 0.9), 7.2));
  // lawn / snow either side
  for (const side of [-1, 1]) {
    B.s.put(lo.flat(1, 1), st.ground, side * 18.3, -0.002, zc, { sx: 29.4, sz: len });
    // kerb
    if (season === 'winter') {
      B.s.put(geo.rbox(0.36, 0.14, 1, 0.06, 2), 0xe4ebf2, side * 3.8, 0.04, zc, { sz: len });
      for (let d = a + 0.5; d < bEnd; d += 1.2) B.s.put(lo.ico(1, 1), jitter(SNOW, r, 0.02), side * (3.86 + r() * 0.05), 0.02, -d, { sx: 0.26, sy: 0.15, sz: 0.7 });
    } else {
      B.s.put(geo.box(0.26, 0.1, 1), st.kerb, side * 3.73, 0.05, zc, { sz: len });
    }
  }
  // ground patches for texture variety
  const npatch = Math.floor(len / 3);
  for (let i = 0; i < npatch; i++) {
    const side = r() < 0.5 ? -1 : 1;
    const x = side * R(5, 30), d = R(a, bEnd);
    const rr = R(0.8, 2.6);
    if (Math.abs(x) - rr < 4.1) continue;
    B.s.put(lo.disc(1, 12), st.patches[i % st.patches.length], x, 0.004 + (i % 5) * 0.002, -d, { sx: rr, sz: rr * R(0.6, 1.2) });
  }
  if (season === 'summer') {
    // mown lawn stripes
    for (let d = Math.ceil(a / 6) * 6; d < bEnd; d += 12) for (const side of [-1, 1]) B.s.put(lo.flat(1, 1), 0x91d272, side * 10, 0.003, -(d + 3), { sx: 11.6, sz: Math.min(6, bEnd - d) });
  }

  // ---- near borders (x 4.0 .. 6.6): beds, low hedges, borders of flowers
  for (const side of [-1, 1]) {
    let d = a;
    while (d < bEnd) {
      const seg = Math.min(bEnd - d, 6 + Math.floor(r() * 5));
      const kind = Math.floor((d + side * 17) / 9) % 3;
      const zs = -(d + seg / 2);
      const x0 = side * 5.0;
      if (season === 'winter') {
        if (kind !== 2) {
          // frosted low box hedge with a snow cap and red holly berries
          B.s.put(geo.rbox(1.0, 0.7, seg - 0.4, 0.2, 2), 0x7ea596, x0, 0.35, zs);
          B.s.put(geo.rbox(1.08, 0.14, seg - 0.3, 0.07, 2), SNOW, x0, 0.74, zs);
          for (let i = 0; i < seg / 1.2; i++) B.s.put(lo.sphere(0.06), PAL.red, x0 - side * 0.52, 0.45 + r() * 0.2, -(d + 0.5 + i * 1.2));
        } else {
          for (let i = 0; i < 3; i++) B.s.put(lo.sphere(1), SNOW, x0 + (r() - 0.5), 0, -(d + r() * seg), { sx: 0.8, sy: 0.4, sz: 1.1 });
        }
      } else if (season === 'spring') {
        B.s.put(geo.rbox(1.5, 0.12, seg - 0.4, 0.05, 1), st.soil, x0, 0.04, zs);
        if (kind === 2) {
          // new shoots in neat rows
          for (let i = 0; i < seg * 2; i++)
            for (let j = -1; j <= 1; j++) {
              const zz = -(d + 0.4 + i * 0.5), xx = x0 + j * 0.45;
              B.w.put(lo.leaf(0.08, 0.2), 0x7fd36a, xx, 0.1, zz, { rx: -1.0, ry: 0, sway: 0.01 });
              B.w.put(lo.leaf(0.08, 0.2), 0x7fd36a, xx, 0.1, zz, { rx: -1.0, ry: Math.PI, sway: 0.01 });
            }
        } else {
          const col = kind === 0 ? [0xf0564a, 0xff9fc0, 0xfff4e0, 0xe85d8a] : [0xffe066, 0xfff4e0];
          for (let i = 0; i < seg * 2.6 * densityK; i++) {
            const fx = x0 + (r() - 0.5) * 1.2, fz = -(d + 0.3 + r() * (seg - 0.6));
            flower(B.w, fx, fz, R(0.28, 0.42), col[Math.floor(r() * col.length)], kind === 0 ? 'tulip' : 'daffodil');
          }
        }
      } else if (season === 'summer') {
        B.s.put(geo.rbox(1.5, 0.12, seg - 0.4, 0.05, 1), st.soil, x0, 0.04, zs);
        if (kind === 1) {
          // lavender row
          for (let i = 0; i < seg * 1.6; i++) {
            const fz = -(d + 0.4 + i * 0.6);
            B.w.put(lo.ico(0.28, 1), 0x6f9f66, x0, 0.22, fz, { sy: 0.8, sway: 0.01 });
            for (let k = 0; k < 4; k++) B.w.put(geo.cyl(0.022, 0.035, 0.26, 5), 0x9b85d8, x0 + (k - 1.5) * 0.12, 0.5, fz + (k % 2) * 0.08, { sway: 0.03 });
          }
        } else {
          const col = [0xe85d8a, 0xff9fc0, 0xb59cf0, 0xfff4e0, 0xff9a3c, 0xf0564a];
          for (let i = 0; i < seg * 2.4 * densityK; i++) {
            const fx = x0 + (r() - 0.5) * 1.2, fz = -(d + 0.3 + r() * (seg - 0.6));
            const k = r();
            flower(B.w, fx, fz, R(0.3, 0.55), col[Math.floor(r() * col.length)], k < 0.4 ? 'daisy' : 'round');
          }
          for (let i = 0; i < seg / 2; i++) B.w.put(lo.ico(0.2, 1), 0x5aa557, x0 + (r() - 0.5) * 1.1, 0.12, -(d + r() * seg), { sy: 0.6, sway: 0.01 });
        }
      } else {
        // autumn: chrysanthemum-like mounds, pumpkins, leaf drifts
        B.s.put(geo.rbox(1.5, 0.12, seg - 0.4, 0.05, 1), st.soil, x0, 0.04, zs);
        for (let i = 0; i < seg / 1.1; i++) {
          const fx = x0 + (r() - 0.5) * 1.0, fz = -(d + 0.5 + i * 1.1);
          const c = [0xe8892e, 0xd9622b, 0xf2b134, 0xb85a3a][Math.floor(r() * 4)];
          B.w.put(lo.ico(0.3, 1), 0x5f8a45, fx, 0.22, fz, { sy: 0.7, sway: 0.01 });
          for (let k = 0; k < 5; k++) B.w.put(lo.ico(0.1), c, fx + Math.cos(k * 1.3) * 0.18, 0.4, fz + Math.sin(k * 1.3) * 0.18, { sy: 0.7, sway: 0.015 });
        }
        if (kind === 2) {
          const pz = -(d + seg / 2);
          for (let k = 0; k < 2; k++) {
            const px = x0 + (k - 0.5) * 0.7;
            B.s.put(lo.sphere(0.28), PAL.orange, px, 0.22, pz + k * 0.4, { sy: 0.75 });
            for (let j = 0; j < 4; j++) B.s.put(lo.sphere(0.27), 0xf08a2e, px, 0.22, pz + k * 0.4, { sy: 0.78, sx: 0.55, ry: j * 0.8 });
            B.s.put(lo.cyl(0.03, 0.04, 0.12), 0x6b8a3a, px, 0.46, pz + k * 0.4);
          }
        }
      }
      d += seg;
    }
  }

  // lamps + benches
  for (let d = Math.ceil(a / 26) * 26; d < bEnd; d += 26) {
    const side = Math.floor(d / 26) % 2 ? 1 : -1;
    lampPost(B, side * 4.25, -d, season);
    lampPost(B, -side * 4.25, -(d + 13), season);
  }
  for (let d = Math.ceil((a - 9) / 38) * 38 + 9; d < bEnd; d += 38) {
    const side = Math.floor(d / 38) % 2 ? -1 : 1;
    parkBench(B.s, side * 6.5, -d, side > 0 ? -Math.PI / 2 : Math.PI / 2, season);
    occ.push({ x: side * 6.5, z: -d, r: 1.4 });
  }

  // ---- features (deterministic by distance so they never double up across stretches)
  const feat = (period: number, offset: number, fn: (d: number, k: number) => void) => {
    for (let k = Math.ceil((a - offset) / period); k * period + offset < bEnd; k++) {
      const d = k * period + offset;
      if (d >= a && d < bEnd) fn(d, k);
    }
  };
  // ponds with little bridges
  feat(170, 70, (d, k) => {
    if (!sameSeasonAround(d, 10)) return;
    const side = k % 2 ? -1 : 1;
    const x = side * 12.5;
    pond(B, x, -d, 4.2, 3.3, season, r);
    occ.push({ x, z: -d, r: 5.6 });
    // stone path from the main path to the bridge
    for (let i = 0; i < 6; i++) B.s.put(lo.cyl(0.4, 0.4, 0.04), 0xcfc4b0, side * (4.6 + i * 1.1), 0.02, -d - 3.6 - (i % 2) * 0.2);
  });
  // glasshouses (botanic garden)
  feat(240, 150, (d, k) => {
    if (!sameSeasonAround(d, 12)) return;
    const side = k % 2 ? 1 : -1;
    const x = side * 22;
    glasshouse(B, x, -d, 1, season);
    occ.push({ x, z: -d, r: 7 });
  });
  // fern gardens with ponga
  feat(96, 30, (d, k) => {
    const side = k % 2 ? -1 : 1;
    const x = side * 9.5;
    if (!free(occ, x, -d, 3)) return;
    for (let i = 0; i < 3; i++) addTreeFern(B.w, x + (r() - 0.5) * 3, -d + (r() - 0.5) * 4, 0.9 + r() * 0.3, r, season === 'autumn' ? 0x5a9a48 : 0x4f9f4d, season === 'winter');
    for (let i = 0; i < 5; i++) addFern(B.w, x + (r() - 0.5) * 4, -d + (r() - 0.5) * 5, 0.8 + r() * 0.4, r);
    for (let i = 0; i < 3; i++) B.s.put(lo.dodeca(0.5), 0xa8a29a, x + (r() - 0.5) * 3, 0.15, -d + (r() - 0.5) * 4, { sy: 0.6, ry: r() * 3 });
    occ.push({ x, z: -d, r: 3.4 });
  });
  // season set pieces
  if (season === 'summer') {
    feat(44, 18, (d, k) => {
      const side = k % 2 ? 1 : -1;
      const x = side * R(8.5, 11);
      if (!free(occ, x, -d, 2.2)) return;
      picnic(B, x, -d, r, side);
      occ.push({ x, z: -d, r: 2.4 });
    });
  } else if (season === 'spring') {
    feat(120, 55, (d, k) => {
      // lamb paddock with white rails and grazing ewes
      if (!sameSeasonAround(d, 14)) return;
      const side = k % 2 ? -1 : 1;
      const z0 = -d + 12, z1 = -d - 12;
      if (!free(occ, side * 13, -d, 6)) return;
      addFence(B.s, side * 8.2, z0, z1, 0xfbf7ef, 1.5, 0.95);
      addFence(B.s, side * 19, z0, z1, 0xfbf7ef, 1.5, 0.95);
      for (let i = 0; i < 4; i++) lambStatic(B.s, side * R(10, 17), -d + R(-9, 9), r() * TAU, 1, r, true);
      for (let i = 0; i < 3; i++) lambStatic(B.s, side * R(10, 17), -d + R(-9, 9), r() * TAU, 0.8, r);
      occ.push({ x: side * 13.5, z: -d, r: 7 });
    });
  } else if (season === 'winter') {
    feat(64, 40, (d, k) => {
      // little snowman families + snow mounds
      const side = k % 2 ? 1 : -1;
      const x = side * R(9, 12);
      if (!free(occ, x, -d, 2)) return;
      snowmanStatic(B.s, x, -d, 0.6, side > 0 ? -0.5 : 0.5, r, [PAL.teal, PAL.berry, PAL.sun][k % 3]);
      snowmanStatic(B.s, x + side * 1.4, -d - 1.2, 0.38, side > 0 ? -0.3 : 0.3, r, PAL.coral);
      occ.push({ x, z: -d, r: 2.4 });
    });
  } else {
    feat(30, 12, (d, k) => {
      // leaf piles + a wheelbarrow and rake
      const side = k % 2 ? -1 : 1;
      const x = side * R(7.5, 10);
      if (!free(occ, x, -d, 1.6)) return;
      for (let i = 0; i < 14; i++) {
        const a2 = r() * TAU, rr = r() * 0.8;
        B.s.put(lo.ico(0.35), AUTUMN_CANOPY[i % 5], x + Math.cos(a2) * rr, 0.15 + (0.8 - rr) * 0.35, -d + Math.sin(a2) * rr, { sy: 0.5, ry: r() * 3 });
      }
      if (k % 3 === 0) {
        B.s.put(lo.cyl(0.025, 0.025, 1.7), PAL.woodDark, x + side * 1.2, 0.8, -d + 0.4, { rz: side * 0.35 });
        B.s.put(geo.rbox(0.5, 0.05, 0.12, 0.02, 1), 0x66727f, x + side * 1.5, 0.05, -d + 0.4);
      }
      occ.push({ x, z: -d, r: 1.6 });
    });
  }

  // ---- trees: mid (x 7.5..15) and far (15..31)
  const nMid = Math.max(1, Math.round((len / 7) * densityK));
  const nFar = Math.max(1, Math.round((len / 6.5) * densityK));
  const plant = (n: number, xa: number, xb: number, sMin: number, sMax: number) => {
    for (let i = 0; i < n; i++) {
      for (const side of [-1, 1]) {
        const x = side * R(xa, xb), z = -R(a + 1, bEnd - 1), s = R(sMin, sMax);
        if (!free(occ, x, z, 1.6 * s)) continue;
        occ.push({ x, z, r: 1.4 * s });
        tree(B, x, z, s, season, r);
      }
    }
  };
  plant(nMid, 7.5, 15, 0.9, 1.25);
  plant(nFar, 15.5, 31, 1.1, 1.7);
  // bushes
  for (let i = 0; i < (len / 6) * densityK; i++) {
    const side = r() < 0.5 ? -1 : 1;
    const x = side * R(6.8, 16), z = -R(a, bEnd);
    if (!free(occ, x, z, 0.9)) continue;
    const col = season === 'winter' ? 0x8fb2a6 : season === 'autumn' ? (r() < 0.5 ? 0xb5763a : 0x7c9a48) : jitter(0x5aa557, r, 0.1);
    addBush(B.w, x, z, R(0.8, 1.3), col, r);
    if (season === 'winter') B.s.put(lo.sphere(0.5), SNOW, x, 0.75, z, { sy: 0.35, sx: 1.3, sz: 1.3 });
    if (season === 'spring' && r() < 0.6) for (let k = 0; k < 5; k++) B.w.put(lo.sphere(0.08), 0xfff0f4, x + (r() - 0.5) * 0.9, 0.5 + r() * 0.4, z + (r() - 0.5) * 0.9, { sway: 0.02 });
  }

  B.s.into(g, vcMat(0.85));
  B.w.into(g, swayMat(0.82));
  B.gl.into(g, glowVcMat(season === 'winter' ? 1.1 : 0.75));
  B.gloss.into(g, vcMat(0.12));
  B.glass.into(g, clearMat('parks-glass', 0xffffff, 0.42, 0.08, (m) => {
    m.vertexColors = true;
    m.side = THREE.DoubleSide;
  }));
}

function tree(B: Bld, x: number, z: number, s: number, season: Season, r: () => number): void {
  const st = STYLE[season];
  if (season === 'winter') {
    if (r() < 0.55) {
      bareTree(B.s, x, z, s * 1.1, 0x6e584a, r, SNOW);
      B.s.put(lo.disc(1.1 * s, 12), 0xdfe8f2, x, 0.006, z);
    } else addPine(B.s, x, z, s * 1.1, 0x3f7a5c, 0x6e584a, r, SNOW);
  } else if (season === 'spring') {
    const k = r();
    const canopy = k < 0.62 ? BLOSSOM : k < 0.85 ? BLOSSOM_WHITE : [0x8fd36e, 0x7cc95e, 0x9edc7c];
    roundTree(B.w, x, z, s, st.trunk, canopy, r, 0.05);
    if (k < 0.85) for (let i = 0; i < 6; i++) B.s.put(lo.disc(0.35, 8), canopy[i % canopy.length], x + (r() - 0.5) * 3 * s, 0.006 + i * 0.001, z + (r() - 0.5) * 3 * s);
  } else if (season === 'summer') {
    if (r() < 0.12) addPine(B.s, x, z, s * 1.2, 0x3f8a55, st.trunk, r);
    else roundTree(B.w, x, z, s * 1.12, st.trunk, SUMMER_GREEN, r, 0.05);
  } else {
    const k = r();
    if (k < 0.3) {
      // bare-ish: branches with a few golden tufts left
      bareTree(B.s, x, z, s, st.trunk, r, AUTUMN_CANOPY[Math.floor(r() * 5)]);
      for (let i = 0; i < 2; i++) B.w.put(lo.sphere(0.6 * s), AUTUMN_CANOPY[Math.floor(r() * 5)], x + (r() - 0.5) * s, 2.6 * s + r() * s, z + (r() - 0.5) * s, { sy: 0.8, sway: 0.05 });
    } else roundTree(B.w, x, z, s, st.trunk, k < 0.65 ? [0xf2b134, 0xe9a531, 0xe8892e] : [0xe8892e, 0xd9622b, 0xf2b134], r, 0.05);
    // fallen leaf carpet under each tree
    B.s.put(lo.disc(1.5 * s, 12), r() < 0.5 ? 0xe3a23f : 0xd9822f, x, 0.007, z, { sx: 1.1 });
  }
}

// ------------------------------------------------------------------ backdrop (distant hills, glasshouse, sun)
function buildBackdrop(env: StageEnv, D: number): { group: THREE.Group; sun: THREE.Sprite; ground: THREE.Mesh; groundMat: THREE.MeshStandardMaterial } {
  const group = new THREE.Group();
  const r = mkRng(4242);
  curR = r;
  const hills = new GeoBuilder();
  for (let layer = 0; layer < 2; layer++) {
    const rad = D * (layer ? 0.92 : 1.0);
    const shade = layer ? 0xe2e2e2 : 0xffffff;
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * TAU + r() * 0.1;
      const x = Math.sin(a) * rad, z = -Math.cos(a) * rad;
      const w = R(14, 30), h = R(6, 13) * (layer ? 0.75 : 1);
      hills.put(lo.sphere(1), shade, x, -h * 0.25, z, { sx: w, sy: h, sz: 8, ry: -a });
    }
    // distant tree line bumps on the near layer
    if (layer)
      for (let i = 0; i < 90; i++) {
        const a = (i / 90) * TAU + r() * 0.05;
        hills.put(lo.ico(1, 1), 0xd4d4d4, Math.sin(a) * rad * 0.97, R(1, 3), -Math.cos(a) * rad * 0.97, { s: R(2, 3.8) });
      }
  }
  hills.into(group, env.backdropMat);
  // distant glasshouse (always visible on the horizon, slightly left)
  const gh = new GeoBuilder();
  const gx = -D * 0.34, gz = -D * 0.8;
  gh.put(geo.cyl(9, 9.5, 2, 24), 0xe9e2d4, gx, 1, gz);
  gh.put(geo.sphere(9, 24, 12), 0xcfeaee, gx, 2, gz, { sy: 0.9 });
  gh.put(geo.sphere(5, 18, 10), 0xd9f1f3, gx + 13, 1.5, gz + 2, { sy: 0.8 });
  gh.put(geo.sphere(5, 18, 10), 0xd9f1f3, gx - 13, 1.5, gz + 2, { sy: 0.8 });
  for (let i = 0; i < 10; i++) gh.put(geo.torus(9.05, 0.16, 4, 20, Math.PI), 0xffffff, gx, 2, gz, { ry: (i / 10) * Math.PI, sy: 0.9 });
  gh.put(lo.cyl(1.3, 1.3, 2.2), 0xd9f1f3, gx, 11, gz);
  gh.put(lo.cone(1.6, 1.4), 0xffffff, gx, 12.8, gz);
  gh.put(lo.sphere(0.4), 0xffd166, gx, 13.7, gz);
  const ghMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  gh.into(group, ghMat);
  // cartoon sun
  const sunTex = canvasTexture(128, 128, (g2) => {
    const grd = g2.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,250,1)');
    grd.addColorStop(0.26, 'rgba(255,250,220,1)');
    grd.addColorStop(0.32, 'rgba(255,236,170,0.55)');
    grd.addColorStop(0.6, 'rgba(255,230,160,0.16)');
    grd.addColorStop(1, 'rgba(255,230,160,0)');
    g2.fillStyle = grd;
    g2.fillRect(0, 0, 128, 128);
  });
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, transparent: true }));
  sun.position.set(D * 0.3, D * 0.27, -D * 0.9);
  sun.scale.setScalar(D * 0.28);
  sun.renderOrder = -5;
  group.add(sun);
  // wide ground under everything (blended colour)
  const groundMat = new THREE.MeshStandardMaterial({ color: FAR_GROUND.winter, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(D * 1.2, 40), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  group.add(ground);
  return { group, sun, ground, groundMat };
}

// ------------------------------------------------------------------ obstacles
type Upd = (t: number, dt: number, dist: number) => void;
function visual(object: THREE.Group, inner: THREE.Object3D, anim?: Upd, tiltMax = 0.12): ObstacleVisual {
  const wob = new Wobble();
  return {
    object,
    update(t, dt, dist) {
      anim?.(t, dt, dist);
      wob.update(dt);
      inner.rotation.z = clamp(wob.tilt * 0.06, -tiltMax, tiltMax);
      const sq = 1 - clamp(Math.abs(wob.squash) * 0.02, 0, 0.08);
      inner.scale.y = sq;
    },
    react(kind) {
      wob.react(kind);
    },
  };
}
const laneOffsets = (span: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < span; i++) out.push((i - (span - 1) / 2) * 2.2);
  return out;
};

function seasonOf(req: ObstacleRequest): Season {
  if (req.season) return req.season;
  return (SEASONS as string[]).includes(req.section) ? (req.section as Season) : 'summer';
}

function makeLow(req: ObstacleRequest, season: Season): ObstacleVisual {
  const o = new THREE.Group();
  const inner = new THREE.Group();
  o.add(inner);
  const H = Math.min(req.height, 0.9);
  const w = req.laneSpan * 2.2;
  const r = req.rng;
  const b = new GeoBuilder();
  const sw = new GeoBuilder();
  const kindRoll = r();
  for (const lx of laneOffsets(req.laneSpan)) {
    if (season === 'winter') {
      if (kindRoll < 0.6) {
        // a red sledge parked on a soft snow drift
        for (let i = 0; i < 5; i++) b.put(lo.sphereHi(1), jitter(SNOW, r, 0.02), lx + (i - 2) * 0.38, 0, (r() - 0.5) * 0.2, { sx: 0.5, sy: H * 0.55, sz: Math.min(0.6, req.length / 2) });
        const y = H * 0.55;
        for (const sx of [-0.75, 0.75]) b.put(geo.rbox(0.08, 0.08, 0.95, 0.03, 1), 0x2b3440, lx + sx * 0.7, y + 0.04, 0);
        b.put(geo.rbox(1.6, 0.09, 0.82, 0.04, 2), PAL.red, lx, y + 0.12, 0);
        for (const sx of [-1, 1]) b.put(geo.rbox(0.07, H - y - 0.12, 0.07, 0.02, 1), PAL.red, lx + sx * 0.6, y + 0.12 + (H - y - 0.12) / 2, 0.3);
        b.put(geo.rbox(1.35, 0.08, 0.08, 0.03, 1), PAL.red, lx, H - 0.04, 0.3);
        b.put(geo.torus(0.35, 0.03, 4, 12, Math.PI), 0xf1d79a, lx, y + 0.13, 0.48, { rx: Math.PI / 2 });
      } else parkBench(b, lx, 0, 0, 'winter', H, 1.9);
    } else if (season === 'spring') {
      // wooden planter trough with tulips and daffodils
      const th = H * 0.5;
      b.put(geo.rbox(1.95, th, Math.min(0.9, req.length), 0.06, 2), 0xc98f5a, lx, th / 2, 0);
      for (let i = 0; i < 4; i++) b.put(geo.box(1.97, 0.03, Math.min(0.92, req.length) + 0.01), 0x9a6a40, lx, (i + 0.5) * (th / 4), 0);
      b.put(geo.box(1.8, 0.04, Math.min(0.78, req.length - 0.1)), 0x8a6246, lx, th + 0.005, 0);
      for (let i = 0; i < 12; i++) {
        const fx = lx - 0.8 + (i % 6) * 0.32, fz = (i < 6 ? -0.18 : 0.18);
        const fh = H - th - 0.12;
        sw.put(geo.box(0.025, fh, 0.025), 0x4f9e4a, fx, th + fh / 2, fz);
        if (i % 3 === 1) sw.put(lo.cyl(0.1, 0.1, 0.025), 0xffe066, fx, H - 0.1, fz, { rx: 1.0 });
        else sw.put(lo.cyl(0.075, 0.05, 0.13), [0xf0564a, 0xff9fc0, 0xe85d8a][i % 3], fx, H - 0.065, fz);
      }
    } else if (season === 'summer') {
      if (kindRoll < 0.6) {
        // picnic blanket with a basket and a cooler
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) b.put(lo.flat(0.5, Math.min(0.55, req.length / 2)), (i + j) % 2 ? PAL.coral : 0xfff4e0, lx - 0.75 + i * 0.5, 0.02, (j - 0.5) * Math.min(0.55, req.length / 2));
        const bh = H * 0.62;
        b.put(geo.rbox(0.85, bh, 0.6, 0.07, 2), 0xd9a066, lx - 0.35, bh / 2, 0);
        for (let i = 0; i < 3; i++) b.put(geo.box(0.87, 0.035, 0.62), 0xb57f4a, lx - 0.35, bh * (0.25 + i * 0.25), 0);
        b.put(geo.rbox(0.88, 0.06, 0.64, 0.03, 1), PAL.red, lx - 0.35, bh + 0.02, 0);
        b.put(geo.torus(0.28, 0.035, 6, 14, Math.PI), 0x9a6a40, lx - 0.35, bh + 0.02, 0, { sy: (H - bh - 0.04) / 0.3 });
        b.put(geo.rbox(0.6, H * 0.6, 0.48, 0.08, 2), PAL.teal, lx + 0.55, H * 0.3, 0.05);
        b.put(geo.rbox(0.62, 0.09, 0.5, 0.04, 1), 0xfbf7ef, lx + 0.55, H * 0.6, 0.05);
      } else parkBench(b, lx, 0, 0, 'summer', H, 1.9);
    } else {
      if (kindRoll < 0.65) {
        // a big crunchy leaf pile
        for (let i = 0; i < 26; i++) {
          const a = r() * TAU, rr = Math.sqrt(r());
          const px = lx + Math.cos(a) * rr * 0.85, pz = Math.sin(a) * rr * Math.min(0.55, req.length / 2);
          const top = H * (1 - rr * rr * 0.7);
          const sz = 0.24 + r() * 0.1;
          b.put(lo.ico(sz), AUTUMN_CANOPY[i % 5], px, Math.max(sz * 0.5, top - sz * 0.6), pz, { sy: 0.55, ry: r() * 3, rx: r() * 0.5 });
        }
        for (let i = 0; i < 8; i++) b.put(lo.leaf(0.2, 0.26), AUTUMN_CANOPY[i % 5], lx + (r() - 0.5) * 2, 0.02, (r() - 0.5) * req.length, { ry: r() * TAU });
      } else parkBench(b, lx, 0, 0, 'autumn', H, 1.9);
    }
  }
  b.into(inner, vcMat(0.8));
  sw.into(inner, swayMat(0.8));
  addShadow(o, w * 0.95, req.length + 0.4);
  return visual(o, inner);
}

function makeHigh(req: ObstacleRequest, season: Season): ObstacleVisual {
  const o = new THREE.Group();
  const inner = new THREE.Group();
  o.add(inner);
  const hw = (req.laneSpan * 2.2) / 2;
  const L = Math.max(0.6, req.length);
  const r = req.rng;
  const b = new GeoBuilder();
  const sw = new GeoBuilder();
  const wood = 0xfbf7ef;
  const px = hw + 0.13;
  const zf = L / 2 - 0.08;
  const yb1 = 1.3, yb2 = 1.86;
  const top = Math.max(2.4, req.height);
  // trellis side panels (outside the lane span)
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.put(geo.rbox(0.14, yb2 + 0.1, 0.14, 0.03, 1), wood, sx * px, (yb2 + 0.1) / 2, sz * zf);
    for (let y = 0.3; y < yb2; y += 0.34) b.put(geo.box(0.06, 0.05, L - 0.1), wood, sx * px, y, 0);
    b.put(geo.rbox(0.26, 0.12, L + 0.1, 0.04, 1), wood, sx * (px + 0.06), 0.06, 0);
  }
  // horizontal trellis band (the "duck under" bar) + arch on top
  for (const y of [yb1, yb2]) for (const sz of [-1, 1]) b.put(geo.rbox(hw * 2 + 0.42, 0.11, 0.11, 0.04, 1), wood, 0, y, sz * zf);
  const nSl = Math.max(4, Math.round(hw * 2 / 0.32));
  for (let i = 0; i <= nSl; i++) {
    const x = -hw + (i / nSl) * hw * 2;
    for (const sz of [-1, 1]) b.put(geo.box(0.05, yb2 - yb1, 0.05), wood, x, (yb1 + yb2) / 2, sz * zf);
  }
  const panel = season === 'winter' ? 0xdfe9f0 : 0xcfe3c0;
  for (const sz of [-1, 1]) b.put(geo.box(hw * 2 + 0.3, yb2 - yb1 - 0.04, 0.03), panel, 0, (yb1 + yb2) / 2, sz * (zf - 0.02));
  const rad = hw + 0.13;
  const sy = Math.min(0.5, (top - yb2 - 0.05) / rad);
  for (const sz of [-1, 1]) b.put(geo.torus(rad, 0.07, 6, 24, Math.PI), wood, 0, yb2, sz * zf, { sy });
  for (let i = 1; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    b.put(geo.box(0.06, 0.06, L - 0.05), wood, Math.cos(a) * rad, yb2 + Math.sin(a) * rad * sy, 0);
  }
  // plants on the arch (seasonal)
  const leafCol = season === 'autumn' ? 0xd9822f : season === 'winter' ? 0x3f7a5c : 0x4fae5a;
  const bloom = season === 'winter' ? [PAL.red] : season === 'spring' ? [0xb59cf0, 0xc9b3f5, 0xffc2d4] : season === 'summer' ? [0xf0564a, 0xff7a8a, 0xffb3c9] : [0xf2b134, 0xd9622b, 0xe9a531];
  const nB = Math.round(hw * 9);
  for (let i = 0; i < nB; i++) {
    const a = 0.08 + (i / nB) * (Math.PI - 0.16);
    const x = Math.cos(a) * rad, y = yb2 + Math.sin(a) * rad * sy;
    const z = (r() - 0.5) * (L - 0.2);
    sw.put(lo.ico(0.2, 1), jitter(leafCol, r, 0.1), x, y + 0.05, z, { sy: 0.8, sway: 0.02 });
    if (i % 2 === 0) {
      if (season === 'autumn') sw.put(lo.leaf(0.2, 0.26), bloom[i % bloom.length], x + 0.06, y + 0.2, z + 0.1, { rx: -0.9, ry: i * 1.7, sway: 0.02 });
      else sw.put(lo.sphere(0.1), bloom[i % bloom.length], x + 0.06, y + 0.17, z + 0.1, { sway: 0.02 });
    }
  }
  for (let i = 0; i < nSl * 3.2; i++) {
    const x = -hw + 0.1 + r() * (hw * 2 - 0.2);
    sw.put(lo.ico(0.15, 1), jitter(leafCol, r, 0.1), x, yb1 + 0.02 + r() * 0.55, (r() < 0.5 ? -1 : 1) * zf, { sway: 0.015 });
  }
  // climbing up the posts too
  for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) sw.put(lo.ico(0.14, 1), jitter(leafCol, r, 0.1), sx * (px + 0.06), 0.3 + i * 0.25, (r() - 0.5) * L, { sway: 0.01 });
  // hanging clusters under the band (never below y = 1.12)
  const nH = Math.round(hw * 3.2);
  for (let i = 0; i < nH; i++) {
    const x = -hw + 0.25 + (i / Math.max(1, nH - 1)) * (hw * 2 - 0.5);
    for (const sz of [-1, 1]) {
      if (season === 'winter') {
        // icicles + frosty garland
        putAlong(b, lo.cone(0.05, 0.16), 0xdff3ff, x, yb1 - 0.1, sz * zf, 0, -1, 0);
      } else if (season === 'spring') {
        putAlong(sw, lo.cone(0.1, 0.16), bloom[i % bloom.length], x, yb1 - 0.1, sz * zf, 0, -1, 0);
      } else if (season === 'autumn') {
        putAlong(sw, lo.leaf(0.16, 0.2), bloom[(i + 1) % bloom.length], x, yb1 - 0.02, sz * zf, 0.2, -1, 0.3);
      } else {
        sw.put(lo.sphere(0.09), bloom[(i + 1) % bloom.length], x, yb1 - 0.12, sz * zf, { sway: 0.02 });
      }
    }
  }
  if (season === 'winter') {
    for (const sz of [-1, 1]) b.put(geo.rbox(hw * 2 + 0.4, 0.07, 0.2, 0.03, 1), SNOW, 0, yb2 + 0.08, sz * zf);
    for (let i = 0; i < 10; i++) {
      const a = 0.15 + (i / 10) * (Math.PI - 0.3);
      b.put(lo.sphere(0.13), SNOW, Math.cos(a) * rad, yb2 + Math.sin(a) * rad * sy + 0.08, 0, { sz: L * 3.2, sy: 0.6 });
    }
  }
  b.into(inner, vcMat(0.75));
  sw.into(inner, swayMat(0.8));
  for (const sx of [-1, 1]) addShadow(o, 0.7, L + 0.5, sx * px, 0);
  return visual(o, inner, undefined, 0.04);
}

function hedgeBox(b: GeoBuilder, sw: GeoBuilder, x: number, w: number, h: number, L: number, season: Season, r: () => number): void {
  const st = STYLE[season];
  const col = season === 'winter' ? 0x7ea596 : st.hedge;
  b.put(geo.rbox(w, h, L, 0.18, 2), col, x, h / 2, 0);
  // leafy bumps on the sides and front (kept inside the height)
  const n = Math.round((w + L) * 2.5);
  for (let i = 0; i < n; i++) {
    const onFront = r() < 0.55;
    const by = 0.25 + r() * (h - 0.6);
    const bx = onFront ? x + (r() - 0.5) * (w - 0.3) : x + (r() < 0.5 ? -1 : 1) * (w / 2 - 0.02);
    const bz = onFront ? (r() < 0.5 ? 1 : -1) * (L / 2 - 0.02) : (r() - 0.5) * (L - 0.3);
    b.put(lo.ico(0.2, 1), jitter(col, r, 0.09), bx, by, bz, { sy: 0.8 });
  }
  if (season === 'winter') {
    b.put(geo.rbox(w + 0.08, 0.16, L + 0.08, 0.07, 2), SNOW, x, h - 0.08, 0);
    for (let i = 0; i < w * 2; i++) putAlong(b, lo.cone(0.045, 0.18), 0xdff3ff, x - w / 2 + 0.2 + i * 0.5, h - 0.2, L / 2 + 0.03, 0, -1, 0);
  } else if (season === 'spring') {
    for (let i = 0; i < n * 0.6; i++) sw.put(lo.sphere(0.06), r() < 0.5 ? 0xffc2d4 : 0xfff6f8, x + (r() - 0.5) * w, 0.3 + r() * (h - 0.5), L / 2 + 0.06, { sway: 0.01 });
  } else if (season === 'autumn') {
    for (let i = 0; i < n * 0.5; i++) b.put(lo.ico(0.17), AUTUMN_CANOPY[i % 5], x + (r() - 0.5) * w, 0.3 + r() * (h - 0.5), (r() < 0.5 ? 1 : -1) * (L / 2 + 0.01), { sy: 0.8 });
  } else {
    for (let i = 0; i < n * 0.3; i++) sw.put(lo.sphere(0.06), 0xfff4e0, x + (r() - 0.5) * w, 0.3 + r() * (h - 0.5), L / 2 + 0.06, { sway: 0.01 });
  }
}

function makeBlock(req: ObstacleRequest, season: Season): ObstacleVisual {
  const o = new THREE.Group();
  const inner = new THREE.Group();
  o.add(inner);
  const H = clamp(req.height, 2.4, 3.2);
  const w = req.laneSpan * 2.2;
  const L = req.length;
  const r = req.rng;
  const b = new GeoBuilder();
  const sw = new GeoBuilder();
  const roll = r();
  if (season === 'winter' && req.laneSpan === 1 && roll < 0.7) {
    snowmanStatic(b, 0, 0, H / 3.57, 0, r, [PAL.coral, PAL.teal, PAL.berry][Math.floor(r() * 3)]);
    for (let i = 0; i < 5; i++) b.put(lo.sphere(1), SNOW, (i - 2) * 0.4, 0, (r() - 0.5) * 0.5, { sx: 0.5, sy: 0.25, sz: 0.6 });
  } else if (season === 'summer' && req.laneSpan === 1 && roll < 0.7) {
    // flower cart with a striped awning
    const wood = 0xc98f5a;
    b.put(geo.rbox(1.8, 0.75, Math.min(1.2, L), 0.06, 2), wood, 0, 1.05, 0);
    for (let i = 0; i < 3; i++) b.put(geo.box(1.82, 0.04, Math.min(1.22, L)), 0x9a6a40, 0, 0.78 + i * 0.25, 0);
    for (const sx of [-1, 1]) {
      b.put(lo.cyl(0.46, 0.46, 0.08), 0x9a6a40, sx * 0.95, 0.46, 0, { rz: Math.PI / 2 });
      b.put(lo.cyl(0.38, 0.38, 0.1), 0xf1d79a, sx * 0.95, 0.46, 0, { rz: Math.PI / 2 });
      for (let k = 0; k < 4; k++) b.put(geo.box(0.11, 0.72, 0.05), 0x9a6a40, sx * 0.95, 0.46, 0, { rx: (k / 4) * Math.PI });
      b.put(lo.cyl(0.08, 0.08, 0.13), 0x2b3440, sx * 0.95, 0.46, 0, { rz: Math.PI / 2 });
    }
    // flower pots in two tiers
    const cols = [0xe85d8a, 0xffe066, 0xb59cf0, 0xff9a3c, 0xfff4e0, 0xf0564a];
    for (let i = 0; i < 10; i++) {
      const tier = i < 6 ? 0 : 1;
      const px2 = tier ? -0.6 + (i - 6) * 0.4 : -0.75 + i * 0.3;
      const pz = tier ? -0.1 : (i % 2 ? 0.25 : -0.25);
      const py = 1.42 + tier * 0.3;
      b.put(lo.cyl(0.13, 0.1, 0.2), 0xd9774a, px2, py + 0.1, pz);
      for (let k = 0; k < 4; k++) sw.put(lo.sphere(0.1), cols[(i + k) % cols.length], px2 + Math.cos(k * 1.6) * 0.08, py + 0.3 + (k % 2) * 0.06, pz + Math.sin(k * 1.6) * 0.08, { sway: 0.01 });
    }
    tierBox(b);
    // awning
    const aY = H - 0.18;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.put(lo.cyl(0.04, 0.04, aY - 1.4), 0xfbf7ef, sx * 0.85, 1.4 + (aY - 1.4) / 2, sz * Math.min(0.5, L / 2 - 0.05));
    for (let i = 0; i < 6; i++) b.put(geo.box(0.34, 0.14, Math.min(1.35, L + 0.15)), i % 2 ? 0xfff4e0 : PAL.teal, -0.85 + i * 0.34, aY + 0.08, 0, { rx: 0.08 });
    for (let i = 0; i < 6; i++) b.put(lo.sphere(0.17), i % 2 ? 0xfff4e0 : PAL.teal, -0.85 + i * 0.34, aY - 0.02, Math.min(0.68, L / 2 + 0.05), { sy: 0.6, sz: 0.4 });
  } else if (season === 'autumn' && roll < 0.6) {
    // hay bales stacked with pumpkins
    for (const lx of laneOffsets(req.laneSpan)) {
      const hb = (H - 0.36) / 3;
      const bale = (x: number, y: number) => {
        b.put(geo.rbox(0.98, hb, Math.min(1.15, L), 0.08, 2), jitter(0xe8c468, r, 0.05), x, y + hb / 2, 0);
        for (const tz of [-0.3, 0.3]) b.put(geo.box(1.0, hb + 0.01, 0.03), 0xb98a3a, x, y + hb / 2, tz);
      };
      bale(lx - 0.52, 0);
      bale(lx + 0.52, 0);
      bale(lx - 0.52, hb);
      bale(lx + 0.52, hb);
      bale(lx, hb * 2);
      const pr = 0.24;
      for (let j = 0; j < 5; j++) b.put(lo.sphere(pr), j % 2 ? 0xf08a2e : PAL.orange, lx, hb * 3 + pr * 0.75, 0.05, { sy: 0.75, sx: j === 0 ? 1 : 0.55, ry: j * 0.7 });
      b.put(lo.cyl(0.035, 0.05, 0.14), 0x6b8a3a, lx, hb * 3 + pr * 1.35 + 0.02, 0.05);
      for (const sx of [-0.6, 0.65]) {
        b.put(lo.sphere(0.3), PAL.orange, lx + sx, 0.24, L / 2 + 0.2, { sy: 0.75 });
        b.put(lo.cyl(0.03, 0.045, 0.12), 0x6b8a3a, lx + sx, 0.5, L / 2 + 0.2);
      }
    }
  } else {
    // clipped hedge, topiary ball on top of single-lane hedges
    if (req.laneSpan === 1) {
      const hh = H - 0.75;
      hedgeBox(b, sw, 0, 1.95, hh, Math.min(L, 1.9), season, r);
      const col = season === 'winter' ? 0x7ea596 : STYLE[season].hedge;
      b.put(lo.sphereHi(0.37), col, 0, H - 0.37, 0);
      b.put(lo.cyl(0.07, 0.07, 0.3), 0x7a5a42, 0, hh + 0.1, 0);
      if (season === 'winter') b.put(lo.sphereHi(0.3), SNOW, 0, H - 0.17, 0, { sy: 0.45 });
    } else hedgeBox(b, sw, 0, w - 0.1, H, L, season, r);
  }
  b.into(inner, vcMat(0.8));
  sw.into(inner, swayMat(0.8));
  addShadow(o, w * 1.05, L + 0.6);
  return visual(o, inner, undefined, 0.05);
}
function tierBox(b: GeoBuilder): void {
  b.put(geo.rbox(1.3, 0.3, 0.45, 0.04, 1), 0x9a6a40, 0, 1.57, -0.1);
}

function makePlatform(req: ObstacleRequest, season: Season): ObstacleVisual {
  const o = new THREE.Group();
  const inner = new THREE.Group();
  o.add(inner);
  const w = req.laneSpan * 2.2;
  const L = req.length;
  const r = req.rng;
  const b = new GeoBuilder();
  const sw = new GeoBuilder();
  const top = PLATFORM_TOP;
  const st = STYLE[season];
  const col = season === 'winter' ? 0x7ea596 : st.hedge;
  // long hedge-maze wall you can run along the top of
  b.put(geo.rbox(w, top, L, 0.14, 2), col, 0, top / 2, 0);
  const n = Math.round(L * 2.2);
  for (let i = 0; i < n; i++) {
    const side = r() < 0.5 ? -1 : 1;
    b.put(lo.sphere(0.22), jitter(col, r, 0.1), side * (w / 2 - 0.02), 0.3 + r() * 1.3, (r() - 0.5) * (L - 0.4), { sy: 0.8 });
  }
  for (let i = 0; i < w * 3; i++) b.put(lo.sphere(0.2), jitter(col, r, 0.09), -w / 2 + 0.2 + r() * (w - 0.4), 0.3 + r() * 1.3, L / 2 - 0.02, { sy: 0.8 });
  // top surface: a lighter trimmed top with stepping stones down the middle
  const topCol = season === 'winter' ? SNOW : st.hedgeTop;
  b.put(lo.flat(w - 0.06, L - 0.06), topCol, 0, top + 0.002, 0);
  for (let z = -L / 2 + 0.8; z < L / 2 - 0.5; z += 1.3) b.put(lo.cyl(0.32, 0.32, 0.01), season === 'winter' ? 0xdfe8f2 : 0xe9dcc2, 0, top + 0.006, z, { sx: 1.25 });
  // front face: a neat dark "door" inset outline so it reads as solid wall
  b.put(geo.rbox(w * 0.55, top * 0.62, 0.05, 0.05, 1), mixHex(col, 0x1e3a2a, 0.35), 0, top * 0.31, L / 2 + 0.01);
  if (season === 'winter') {
    for (let i = 0; i < w * 2.2; i++) putAlong(b, lo.cone(0.045, 0.2), 0xdff3ff, -w / 2 + 0.2 + i * 0.45, top - 0.12, L / 2 + 0.04, 0, -1, 0);
    b.put(geo.rbox(w + 0.06, 0.1, 0.12, 0.04, 1), SNOW, 0, top - 0.05, L / 2 + 0.02);
  } else if (season === 'spring') {
    for (let i = 0; i < n * 0.8; i++) sw.put(lo.sphere(0.07), BLOSSOM[i % 4], (r() < 0.5 ? -1 : 1) * (w / 2 + 0.05), 0.3 + r() * 1.5, (r() - 0.5) * (L - 0.4), { sway: 0.01 });
  } else if (season === 'autumn') {
    for (let i = 0; i < n * 0.7; i++) b.put(lo.ico(0.18), AUTUMN_CANOPY[i % 5], (r() < 0.5 ? -1 : 1) * (w / 2 + 0.01), 0.3 + r() * 1.4, (r() - 0.5) * (L - 0.4), { sy: 0.8 });
  } else {
    for (let i = 0; i < n * 0.6; i++) sw.put(lo.sphere(0.07), [0xfff4e0, 0xffb3c9][i % 2], (r() < 0.5 ? -1 : 1) * (w / 2 + 0.05), 0.3 + r() * 1.5, (r() - 0.5) * (L - 0.4), { sway: 0.01 });
  }
  // flowers / snow at the foot
  for (let i = 0; i < L * 1.2; i++)
    for (const side of [-1, 1]) {
      const z = (r() - 0.5) * L;
      if (season === 'winter') b.put(lo.sphere(0.3), SNOW, side * (w / 2 + 0.12), 0, z, { sy: 0.5, sz: 1.5 });
      else b.put(season === 'autumn' ? lo.ico(0.12) : lo.sphere(0.1), season === 'autumn' ? AUTUMN_CANOPY[i % 5] : [0xffe066, 0xff9fc0, 0xfff4e0][i % 3], side * (w / 2 + 0.15), 0.08, z, { sy: 0.6 });
    }
  b.into(inner, vcMat(0.82));
  sw.into(inner, swayMat(0.8));
  addShadow(o, w + 0.8, L + 0.8);
  return visual(o, inner, undefined, 0.02);
}

function makeRamp(req: ObstacleRequest, season: Season): ObstacleVisual {
  const o = new THREE.Group();
  const inner = new THREE.Group();
  o.add(inner);
  const w = req.laneSpan * 2.2;
  const L = req.length;
  const r = req.rng;
  const b = new GeoBuilder();
  const top = PLATFORM_TOP;
  const lawn = season === 'winter' ? SNOW : season === 'autumn' ? 0xa9b45c : season === 'spring' ? 0x9fd683 : 0x84c866;
  b.put(wedgeGeo(w - 0.02, L, top), lawn, 0, 0, 0);
  // edging boards just outside the lane span
  for (const sx of [-1, 1]) b.put(wedgeGeo(0.12, L, top + 0.12), 0xb98a64, sx * (w / 2 + 0.06), 0, 0);
  const ang = Math.atan2(top, L);
  const yAt = (z: number) => (top * (L / 2 - z)) / L;
  // mown stripes / tracks running up the slope
  for (let z = L / 2 - 0.6; z > -L / 2 + 0.4; z -= 0.9) {
    const y = yAt(z);
    if (season === 'winter') {
      for (const lx of laneOffsets(req.laneSpan)) for (const sx of [-0.35, 0.35]) b.put(geo.box(0.12, 0.012, 0.92), 0xc9d8e8, lx + sx, y + 0.012, z, { rx: ang });
    } else {
      for (const lx of laneOffsets(req.laneSpan)) b.put(geo.box(0.8, 0.012, 0.5), season === 'autumn' ? 0xc0b061 : 0xa7dc8a, lx, y + 0.012, z, { rx: ang });
    }
  }
  // seasonal sprinkles on the slope (flat, so the surface stays smooth to run on)
  for (let i = 0; i < L * w * 0.8; i++) {
    const z = (r() - 0.5) * (L - 0.6), x = (r() - 0.5) * (w - 0.3);
    const y = yAt(z);
    if (season === 'autumn') b.put(lo.leaf(0.18, 0.22), AUTUMN_CANOPY[i % 5], x, y + 0.02, z, { ry: r() * TAU, rx: ang });
    else if (season === 'spring') b.put(lo.cyl(0.05, 0.05, 0.01), i % 3 ? 0xfffafa : 0xffc2d4, x, y + 0.015, z, { rx: ang });
    else if (season === 'summer' && i % 2) b.put(lo.cyl(0.05, 0.05, 0.01), 0xfffafa, x, y + 0.015, z, { rx: ang });
  }
  // flowers / snow mounds along the outer edges
  for (let z = L / 2 - 0.3; z > -L / 2; z -= 0.7)
    for (const sx of [-1, 1]) {
      const y = yAt(z);
      if (season === 'winter') b.put(lo.sphere(0.2), SNOW, sx * (w / 2 + 0.25), y * 0.5, z, { sy: 1 + y * 0.8 });
      else b.put(season === 'autumn' ? lo.ico(0.13) : lo.sphere(0.12), season === 'autumn' ? AUTUMN_CANOPY[Math.floor(r() * 5)] : [0xffe066, 0xff9fc0, 0xfff4e0][Math.floor(r() * 3)], sx * (w / 2 + 0.22), y + 0.14, z);
    }
  b.into(inner, vcMat(0.85));
  addShadow(o, w + 0.6, L + 0.6);
  return visual(o, inner, undefined, 0.0);
}

// ---- movers (built facing +X; rotated to face dir)
function makeMoverBlock(req: ObstacleRequest, season: Season): ObstacleVisual {
  const o = new THREE.Group();
  const inner = new THREE.Group();
  const face = new THREE.Group();
  o.add(inner);
  inner.add(face);
  const dir = req.dir ?? 1;
  face.rotation.y = dir > 0 ? 0 : Math.PI;
  const r = req.rng;
  const legs: THREE.Object3D[] = [];
  let wheel: THREE.Object3D | null = null;
  let ball: THREE.Object3D | null = null;
  const body = new THREE.Group();
  face.add(body);
  const legPart = (shoe: number, pants: number, x: number, z: number, len: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, len + 0.05, z);
    pivot.add(
      part((b) => {
        b.put(lo.capsule(0.085, len - 0.1), pants, 0, -len / 2, 0);
        b.put(geo.rbox(0.24, 0.1, 0.13, 0.04, 1), shoe, 0.05, -len + 0.0, 0);
      }),
    );
    face.add(pivot);
    legs.push(pivot);
  };
  if (season === 'winter') {
    // a kid rolling a giant snowball (to make a snowman!)
    const R = 0.86;
    ball = part((b) => {
      b.put(lo.sphereHi(R), 0xf7fafd, 0, 0, 0);
      for (let i = 0; i < 9; i++) {
        const a = r() * TAU, e = (r() - 0.5) * 2.4;
        b.put(lo.sphere(0.2), 0xe6eef6, Math.cos(a) * Math.cos(e) * R * 0.92, Math.sin(e) * R * 0.92, Math.sin(a) * Math.cos(e) * R * 0.92, { sy: 0.6 });
      }
      b.put(lo.cyl(0.02, 0.02, 0.4), 0x7a5a42, 0, R * 0.95, 0.1, { rz: 0.4 });
      b.put(lo.leaf(0.16, 0.22), 0x8a6a40, R * 0.6, R * 0.7, 0.2, { rz: -0.8 });
    });
    ball.position.set(0.3, R, 0);
    face.add(ball);
    const coat = [PAL.coral, PAL.teal, PAL.lilac][Math.floor(r() * 3)];
    body.add(
      part((b) => {
        b.put(lo.capsule(0.21, 0.32), coat, -0.75, 0.82, 0, { sx: 1.05 });
        b.put(lo.sphere(0.2), SKIN[Math.floor(r() * SKIN.length)], -0.72, 1.3, 0);
        b.put(lo.sphere(0.215), PAL.sun, -0.74, 1.37, 0, { sy: 0.75 });
        b.put(lo.sphere(0.07), 0xfff4e0, -0.74, 1.56, 0);
        b.put(geo.torus(0.15, 0.05, 6, 14), PAL.red, -0.73, 1.1, 0, { rx: Math.PI / 2 });
        for (const sz of [-1, 1]) {
          b.put(lo.capsule(0.065, 0.32), coat, -0.52, 1.0, sz * 0.2, { rz: -1.25 });
          b.put(lo.sphere(0.08), PAL.red, -0.36, 1.03, sz * 0.2);
        }
        b.put(lo.sphere(0.03), 0x2b3440, -0.54, 1.33, 0.08);
        b.put(lo.sphere(0.03), 0x2b3440, -0.54, 1.33, -0.08);
      }),
    );
    legPart(0x2b3440, 0x3d4a66, -0.78, 0.09, 0.5);
    legPart(0x2b3440, 0x3d4a66, -0.78, -0.09, 0.5);
  } else {
    // friendly gardener pushing a wheelbarrow
    const shirt = [PAL.sea, PAL.coral, PAL.teal][Math.floor(r() * 3)];
    const skin = SKIN[Math.floor(r() * SKIN.length)];
    body.add(
      part((b) => {
        const gx = -0.62;
        b.put(lo.capsule(0.22, 0.42), 0x4f8a5a, gx, 1.12, 0, { sz: 0.85 }); // overalls
        b.put(lo.capsule(0.225, 0.2), shirt, gx, 1.28, 0, { sz: 0.86 });
        b.put(geo.rbox(0.05, 0.35, 0.3, 0.02, 1), 0x4f8a5a, gx + 0.2, 1.15, 0);
        b.put(lo.sphere(0.17), skin, gx + 0.03, 1.66, 0);
        b.put(lo.sphere(0.04), 0x2b3440, gx + 0.17, 1.69, 0.07);
        b.put(lo.sphere(0.04), 0x2b3440, gx + 0.17, 1.69, -0.07);
        b.put(geo.torus(0.06, 0.015, 4, 10, Math.PI), 0x9c4a3a, gx + 0.18, 1.6, 0, { rz: Math.PI, ry: Math.PI / 2 });
        b.put(lo.cyl(0.34, 0.34, 0.03), 0xf1d79a, gx + 0.02, 1.8, 0); // sun hat
        b.put(lo.cyl(0.17, 0.19, 0.14), 0xf1d79a, gx + 0.02, 1.87, 0);
        b.put(lo.cyl(0.195, 0.195, 0.04), PAL.coral, gx + 0.02, 1.83, 0);
        for (const sz of [-1, 1]) {
          b.put(lo.capsule(0.06, 0.42), shirt, gx + 0.3, 1.12, sz * 0.24, { rz: -1.05 });
          b.put(lo.sphere(0.075), 0x7fb36a, gx + 0.52, 0.97, sz * 0.24); // gloves
        }
        // wheelbarrow
        const tc = PAL.red;
        b.put(geo.rbox(0.95, 0.38, 0.72, 0.08, 2), tc, 0.42, 0.66, 0, { rz: -0.12 });
        for (const sz of [-1, 1]) {
          b.put(lo.cyl(0.03, 0.03, 0.9), 0x9a6a40, -0.02, 0.86, sz * 0.24, { rz: 1.32 });
          b.put(lo.cyl(0.025, 0.025, 0.42), 0x66727f, 0.12, 0.25, sz * 0.24, { rz: 0.1 });
        }
        // load
        if (season === 'spring') {
          b.put(geo.rbox(0.8, 0.1, 0.6, 0.03, 1), 0x6b4a32, 0.42, 0.86, 0);
          for (let i = 0; i < 12; i++) b.put(lo.leaf(0.1, 0.25), 0x7fd36a, 0.12 + (i % 4) * 0.2, 0.9, -0.2 + Math.floor(i / 4) * 0.2, { rx: -1, ry: i * 1.1 });
        } else if (season === 'summer') {
          for (let i = 0; i < 8; i++) b.put(lo.sphere(0.12), [0xe85d8a, 0xffe066, 0xb59cf0, 0xfff4e0][i % 4], 0.2 + (i % 4) * 0.16, 0.92 + (i > 3 ? 0.08 : 0), -0.15 + (i > 3 ? 0.25 : 0));
          for (let i = 0; i < 6; i++) b.put(lo.sphere(0.13), 0x5aa557, 0.15 + i * 0.13, 0.86, (i % 2 ? 0.2 : -0.2), { sy: 0.6 });
        } else {
          for (let i = 0; i < 14; i++) b.put(lo.ico(0.16), AUTUMN_CANOPY[i % 5], 0.15 + (i % 5) * 0.14, 0.88 + Math.sin(i) * 0.07 + (i > 7 ? 0.08 : 0), -0.22 + (i % 3) * 0.22, { sy: 0.6, ry: i });
          b.put(lo.sphere(0.17), PAL.orange, 0.5, 1.05, 0.05, { sy: 0.8 });
        }
      }),
    );
    wheel = part((b) => {
      b.put(lo.cyl(0.24, 0.24, 0.1), 0x2b3440, 0, 0, 0, { rx: Math.PI / 2 });
      b.put(lo.cyl(0.13, 0.13, 0.12), 0xffd166, 0, 0, 0, { rx: Math.PI / 2 });
    });
    wheel.position.set(0.98, 0.25, 0);
    face.add(wheel);
    legPart(0x5c4433, 0x4f8a5a, -0.64, 0.1, 0.78);
    legPart(0x5c4433, 0x4f8a5a, -0.64, -0.1, 0.78);
  }
  addShadow(o, 2.1, 1.1);
  const speed = 1.1;
  return visual(o, inner, (t, dt) => {
    const ph = t * 5.2;
    legs[0].rotation.z = Math.sin(ph) * 0.55;
    legs[1].rotation.z = -Math.sin(ph) * 0.55;
    body.position.y = Math.abs(Math.sin(ph)) * 0.04;
    if (wheel) wheel.rotation.z -= (speed / 0.24) * dt;
    if (ball) ball.rotation.z -= (speed / 0.86) * dt;
  });
}

function makeMoverLow(req: ObstacleRequest, season: Season): ObstacleVisual {
  const o = new THREE.Group();
  const inner = new THREE.Group();
  const face = new THREE.Group();
  o.add(inner);
  inner.add(face);
  const dir = req.dir ?? 1;
  face.rotation.y = dir > 0 ? 0 : Math.PI;
  const r = req.rng;
  const cap = Math.min(0.8, req.height > 0 ? req.height : 0.6) - 0.02;
  let anim: Upd;
  if (season === 'spring') {
    // two lambs pronking across together (a hop never lifts the top above the cap)
    const hop = cap * 0.16;
    const lambs: { g: THREE.Group; legs: THREE.Object3D[]; ph: number }[] = [];
    for (const [ox, oz, ph] of [[0.5, 0.12, 0], [-0.48, -0.14, 0.45]]) {
      const lamb = new THREE.Group();
      const legs: THREE.Object3D[] = [];
      lamb.add(
        part((b) => {
          for (let i = 0; i < 7; i++) b.put(lo.sphere(0.16), jitter(0xfbf8f2, r, 0.02), -0.18 + (i % 4) * 0.12, 0.42 + (i % 2) * 0.04, i < 4 ? -0.07 : 0.07);
          b.put(lo.sphere(0.12), 0x3b3330, 0.32, 0.48, 0, { sx: 1.15 });
          b.put(lo.sphere(0.1), 0xfbf8f2, 0.27, 0.57, 0);
          for (const sd of [-1, 1]) {
            b.put(lo.capsule(0.03, 0.1), 0x3b3330, 0.27, 0.5, sd * 0.13, { rx: sd * 1.3 });
            b.put(lo.sphere(0.025), 0xffffff, 0.41, 0.52, sd * 0.05);
          }
          b.put(lo.sphere(0.06), 0xfbf8f2, -0.3, 0.48, 0);
        }),
      );
      for (const [lx, lz] of [[-0.17, -0.09], [-0.17, 0.09], [0.17, -0.09], [0.17, 0.09]]) {
        const lg = part((b) => b.put(lo.capsule(0.035, 0.2), 0x3b3330, 0, -0.14, 0));
        lg.position.set(lx, 0.3, lz);
        lamb.add(lg);
        legs.push(lg);
      }
      lamb.scale.setScalar((cap - hop) / 0.68);
      lamb.position.set(ox, 0, oz);
      face.add(lamb);
      lambs.push({ g: lamb, legs, ph });
    }
    anim = (t) => {
      for (const L of lambs) {
        const p = (t * 1.9 + L.ph) % 1;
        const h = Math.sin(Math.min(1, p / 0.6) * Math.PI);
        L.g.position.y = p < 0.6 ? h * hop : 0;
        L.g.rotation.z = p < 0.6 ? Math.cos((p / 0.6) * Math.PI) * 0.15 : 0;
        for (let i = 0; i < 4; i++) L.legs[i].rotation.z = p < 0.6 ? (i < 2 ? 0.4 : -0.4) * h : 0;
      }
    };
  } else if (season === 'winter') {
    const R = cap / 2 - 0.03;
    const ball = part((b) => {
      b.put(lo.sphereHi(R), 0xf7fafd, 0, 0, 0);
      for (let i = 0; i < 6; i++) {
        const a = r() * TAU, e = (r() - 0.5) * 2.4;
        b.put(lo.sphere(0.08), 0xe2ebf4, Math.cos(a) * Math.cos(e) * R * 0.85, Math.sin(e) * R * 0.85, Math.sin(a) * Math.cos(e) * R * 0.85, { sy: 0.6 });
      }
      b.put(lo.leaf(0.1, 0.14), 0x8a6a40, 0.1, R * 0.8, 0.05, { rz: -0.6 });
    });
    ball.position.set(0.42, R, 0.1);
    face.add(ball);
    const ball2 = ball.clone();
    ball2.position.set(-0.5, R * 0.8, -0.12);
    ball2.scale.setScalar(0.8);
    face.add(ball2);
    anim = (_t, dt) => {
      ball.rotation.z -= (1.8 / R) * dt;
      ball2.rotation.z -= (1.8 / (R * 0.8)) * dt;
    };
  } else if (season === 'summer') {
    // mother duck leading her ducklings
    const ducks: THREE.Object3D[] = [];
    const mk = (s: number, body: number, x: number) => {
      const d = part((b) => {
        b.put(lo.sphere(0.24 * s), body, 0, 0.24 * s, 0, { sx: 1.35, sz: 0.9 });
        b.put(lo.sphere(0.12 * s), body, -0.3 * s, 0.34 * s, 0, { sy: 0.7 });
        b.put(lo.sphere(0.14 * s), body, 0.24 * s, 0.5 * s, 0);
        b.put(lo.sphere(0.07 * s), PAL.orange, 0.38 * s, 0.47 * s, 0, { sx: 1.6, sy: 0.5 });
        for (const sd of [-1, 1]) b.put(lo.sphere(0.03 * s), 0x2b3440, 0.31 * s, 0.55 * s, sd * 0.08 * s);
        for (const sd of [-1, 1]) b.put(lo.sphere(0.12 * s), mixHex(body, 0x000000, 0.08), -0.02, 0.26 * s, sd * 0.19 * s, { sx: 1.4, sy: 0.6, sz: 0.4 });
        for (const sd of [-1, 1]) b.put(geo.rbox(0.12 * s, 0.03, 0.08 * s, 0.01, 1), PAL.orange, 0.02, 0.015, sd * 0.07 * s);
      });
      d.position.x = x;
      face.add(d);
      ducks.push(d);
    };
    mk(1.25, 0xfbf7ef, 0.55);
    mk(0.65, 0xffe066, -0.15);
    mk(0.65, 0xffe066, -0.6);
    mk(0.65, 0xffe066, -1.05);
    face.scale.setScalar((cap - 0.04) / 0.8);
    anim = (t) => {
      for (let i = 0; i < ducks.length; i++) {
        const ph = t * 7 + i * 1.3;
        ducks[i].rotation.x = Math.sin(ph) * 0.14;
        ducks[i].position.y = Math.abs(Math.sin(ph)) * 0.03;
      }
    };
  } else {
    // a hedgehog snuffling along with a leaf on its back
    const hog = part((b) => {
      b.put(lo.sphereHi(0.4), 0x8a6a4a, 0, 0.22, 0, { sx: 1.25, sy: 0.7, sz: 0.95 });
      for (let i = 0; i < 34; i++) {
        const a = r() * Math.PI * 0.9 + 0.05 + Math.PI * 0.05, ph = r() * Math.PI;
        const dx = -Math.cos(a) * 0.9 - 0.1, dy = Math.sin(a) * Math.sin(ph) + 0.25, dz = Math.sin(a) * Math.cos(ph) * 0.9;
        const L = Math.hypot(dx, dy, dz);
        putAlong(b, lo.cone(0.06, 0.2), i % 3 ? 0x6b4a32 : 0x9a7a58, dx / L * 0.42, 0.22 + dy / L * 0.24, dz / L * 0.34, dx, dy, dz);
      }
      b.put(lo.sphere(0.18), 0xe0c59e, 0.42, 0.18, 0, { sx: 1.3, sy: 0.8, sz: 0.8 });
      b.put(lo.sphere(0.05), 0x2b3440, 0.64, 0.19, 0);
      for (const sd of [-1, 1]) b.put(lo.sphere(0.03), 0x2b3440, 0.48, 0.26, sd * 0.09);
      for (const sd of [-1, 1]) b.put(lo.sphere(0.05), 0xe0c59e, 0.38, 0.32, sd * 0.13);
      b.put(lo.leaf(0.22, 0.3), 0xe8892e, -0.05, 0.5, -0.1, { ry: 0.6 });
      for (const [fx, fz] of [[0.25, 0.15], [0.25, -0.15], [-0.25, 0.15], [-0.25, -0.15]]) b.put(lo.sphere(0.06), 0x5c4433, fx, 0.04, fz);
    });
    const k = Math.min(1.2, cap / 0.74);
    hog.scale.setScalar(k);
    hog.position.x = 0.35;
    face.add(hog);
    const babies: THREE.Object3D[] = [];
    for (const [bx, bz] of [[-0.45, 0.18], [-0.85, -0.12]]) {
      const hb = hog.clone();
      hb.scale.setScalar(k * 0.55);
      hb.position.set(bx, 0, bz);
      face.add(hb);
      babies.push(hb);
    }
    anim = (t) => {
      hog.position.y = Math.abs(Math.sin(t * 9)) * 0.02;
      hog.rotation.x = Math.sin(t * 9) * 0.06;
      for (let i = 0; i < babies.length; i++) {
        babies[i].position.y = Math.abs(Math.sin(t * 12 + i)) * 0.015;
        babies[i].rotation.x = Math.sin(t * 12 + i) * 0.08;
      }
    };
  }
  addShadow(o, 2.0, 1.0);
  return visual(o, inner, anim, 0.1);
}

// ------------------------------------------------------------------ ambient life (off the lanes)
interface Actor {
  obj: THREE.Object3D;
  season: Season;
  z: number;
  x: number;
  phase: number;
  active: boolean;
  place(pz: number, r: () => number): void;
  tick(t: number, dt: number): void;
}

function makeSnowmanActor(): Actor {
  const g = new THREE.Group();
  const r = mkRng(7);
  const k = 0.62;
  const body = part((b) => {
    snowmanStatic(b, 0, 0, k, 0, r, PAL.teal, false);
    // left stick arm static
    b.put(lo.cyl(0.035 * k, 0.05 * k, 0.8 * k), 0x7a5a42, -(0.66 * k + 0.35 * k), 0.8 * k + 0.92 * k * 0.75 + 0.66 * k * 0.7 + 0.2 * k, 0, { rz: -1.05 });
  });
  g.add(body);
  const arm = new THREE.Group();
  const y1 = 0.8 * k + 0.92 * k * 0.75 + 0.66 * k * 0.7;
  arm.position.set(0.66 * k * 0.9, y1 + 0.1, 0);
  arm.add(
    part((b) => {
      b.put(lo.cyl(0.03 * k, 0.05 * k, 0.9 * k), 0x7a5a42, 0, 0.45 * k, 0);
      b.put(lo.sphere(0.11 * k), PAL.red, 0, 0.92 * k, 0); // mitten
      b.put(lo.cyl(0.02 * k, 0.025 * k, 0.3 * k), 0x7a5a42, 0.08 * k, 0.6 * k, 0, { rz: -0.7 });
    }),
  );
  g.add(arm);
  const a: Actor = {
    obj: g,
    season: 'winter',
    z: 0,
    x: 0,
    phase: 0,
    active: false,
    place(pz, rr) {
      curR = rr;
      const side = rr() < 0.5 ? -1 : 1;
      this.x = side * R(6.7, 7.8);
      this.z = pz;
      g.position.set(this.x, 0, pz);
      g.rotation.y = side > 0 ? -0.55 : 0.55;
      arm.position.x = side > 0 ? -Math.abs(arm.position.x) : Math.abs(arm.position.x);
      arm.scale.x = side > 0 ? -1 : 1;
      this.phase = rr() * 3;
    },
    tick(t) {
      // wave toward the path
      const s = arm.scale.x;
      arm.rotation.z = s * (-0.6 - Math.sin(t * 4 + this.phase) * 0.45);
      body.rotation.z = Math.sin(t * 2 + this.phase) * 0.02;
    },
  };
  return a;
}

function makeLambActor(i: number): Actor {
  const g = new THREE.Group();
  const r = mkRng(30 + i);
  const isEwe = i === 0;
  g.add(part((b) => lambStatic(b, 0, 0, 0, isEwe ? 1 : 0.85, r, isEwe)));
  const a: Actor = {
    obj: g,
    season: 'spring',
    z: 0,
    x: 0,
    phase: i * 0.37,
    active: false,
    place(pz, rr) {
      curR = rr;
      const side = (i % 2 ? -1 : 1) * (rr() < 0.8 ? 1 : -1);
      this.x = side * R(6.4, 9.5);
      this.z = pz + (rr() - 0.5) * 5;
      g.position.set(this.x, 0, this.z);
      g.rotation.y = rr() * TAU;
    },
    tick(t) {
      if (isEwe) {
        g.rotation.z = Math.sin(t * 0.8) * 0.03;
        return;
      }
      const p = (t * 1.3 + this.phase) % 1;
      const h = p < 0.45 ? Math.sin((p / 0.45) * Math.PI) : 0;
      g.position.y = h * 0.42;
      g.rotation.z = h * 0.15 * Math.cos((p / 0.45) * Math.PI);
      if (p < 0.02) g.rotation.y += 0.6 * (Math.sin(t * 3 + i) > 0 ? 1 : -1);
      // little hops move it around its spot
      g.position.x = this.x + Math.sin(t * 0.4 + i) * 0.8;
      g.position.z = this.z + Math.cos(t * 0.33 + i * 2) * 1.0;
    },
  };
  return a;
}

function makeFrisbeeActor(): Actor {
  const g = new THREE.Group();
  const r = mkRng(55);
  const kid = (shirt: number, x: number) => {
    const k = new THREE.Group();
    k.position.x = x;
    k.add(part((b) => addPerson(b, 0, 0, 0, r, { shirt, scale: 0.72 })));
    const arm = new THREE.Group();
    arm.position.set(0, 0.95, 0);
    arm.add(part((b) => b.put(lo.capsule(0.045, 0.24), shirt, 0, 0.18, 0)));
    k.add(arm);
    g.add(k);
    return { k, arm };
  };
  const A = kid(PAL.sun, 0);
  const B2 = kid(PAL.berry, 7);
  const dog = part((b) => {
    b.put(lo.capsule(0.13, 0.35), 0xc98f5a, 0, 0.36, 0, { rz: Math.PI / 2 });
    b.put(lo.sphere(0.14), 0xc98f5a, 0.32, 0.5, 0);
    b.put(lo.sphere(0.06), 0x2b3440, 0.45, 0.48, 0);
    b.put(lo.capsule(0.05, 0.1), 0x9a6a40, 0.28, 0.6, 0.09, { rx: 0.4 });
    b.put(lo.capsule(0.05, 0.1), 0x9a6a40, 0.28, 0.6, -0.09, { rx: -0.4 });
    for (const [lx, lz] of [[-0.18, 0.08], [-0.18, -0.08], [0.18, 0.08], [0.18, -0.08]]) b.put(lo.capsule(0.04, 0.18), 0xc98f5a, lx, 0.13, lz);
    b.put(lo.capsule(0.03, 0.18), 0xc98f5a, -0.32, 0.5, 0, { rz: -0.8 });
  });
  g.add(dog);
  const fr = part((b) => {
    b.put(lo.cyl(0.16, 0.16, 0.03), PAL.coral, 0, 0, 0);
    b.put(geo.torus(0.14, 0.02, 4, 14), 0xfff4e0, 0, 0.012, 0, { rx: Math.PI / 2 });
  });
  g.add(fr);
  let side = 1;
  const a: Actor = {
    obj: g,
    season: 'summer',
    z: 0,
    x: 0,
    phase: 0,
    active: false,
    place(pz) {
      side = -side;
      this.z = pz;
      this.x = side * 5.4;
      g.position.set(this.x, 0, pz);
      g.rotation.y = side > 0 ? 0.25 : Math.PI - 0.25; // kids stand apart along the lawn
    },
    tick(t) {
      const T = 1.6;
      const p = (t % (2 * T)) / T; // 0..2
      const fwd = p < 1;
      const u = fwd ? p : p - 1;
      const x0 = fwd ? 0 : 7, x1 = fwd ? 7 : 0;
      fr.position.set(lerp(x0, x1, u), 1.15 + Math.sin(u * Math.PI) * 1.4, Math.sin(u * Math.PI) * 0.6);
      fr.rotation.y = t * 14;
      A.arm.rotation.z = fwd ? -0.4 - (u < 0.15 ? u * 6 : 0.9) : -2.4 + Math.min(1, u * 1.4) * 0.6;
      B2.arm.rotation.z = fwd ? 2.4 - Math.max(0, u - 0.6) * 2 : 0.4 + (u < 0.15 ? u * 6 : 0.9);
      A.k.rotation.y = Math.PI / 2;
      B2.k.rotation.y = -Math.PI / 2;
      A.k.position.y = Math.abs(Math.sin(t * 6)) * 0.03;
      B2.k.position.y = Math.abs(Math.sin(t * 6 + 1)) * 0.03;
      // the dog bounds back and forth chasing the frisbee
      dog.position.set(lerp(x0, x1, smooth(Math.min(1, u * 1.1))) * 0.9 + 0.3, Math.abs(Math.sin(t * 10)) * 0.12, 1.3);
      dog.rotation.y = fwd ? 0 : Math.PI;
    },
  };
  return a;
}

function makeDuckPuddleActor(i: number, drops: THREE.InstancedMesh): Actor {
  const g = new THREE.Group();
  const puddle = new THREE.Mesh(lo.disc(1, 20), ownedMat('parks-puddle', (m) => {
    m.color.set(0x8fbdd0);
    m.roughness = 0.08;
  }, 0.08));
  puddle.scale.set(1.5, 1, 1.0);
  puddle.position.y = 0.02;
  g.add(puddle);
  const rim = new THREE.Mesh(lo.disc(1, 20), mat(0x9c8466));
  rim.scale.set(1.75, 1, 1.25);
  rim.position.y = 0.01;
  g.add(rim);
  const ducks: THREE.Object3D[] = [];
  const r = mkRng(80 + i);
  for (let k = 0; k < 2; k++) {
    const d = part((b) => {
      const body = k ? 0xa47a52 : 0xfbf7ef;
      b.put(lo.sphere(0.26), body, 0, 0.18, 0, { sx: 1.35, sz: 0.9 });
      b.put(lo.sphere(0.12), body, -0.32, 0.27, 0, { sy: 0.7 });
      b.put(lo.sphere(0.15), k ? 0x3f7a5c : body, 0.26, 0.45, 0);
      b.put(lo.sphere(0.075), PAL.orange, 0.41, 0.42, 0, { sx: 1.6, sy: 0.5 });
      for (const sd of [-1, 1]) b.put(lo.sphere(0.03), 0x2b3440, 0.33, 0.5, sd * 0.09);
      for (const sd of [-1, 1]) b.put(lo.sphere(0.13), mixHex(body, 0x000000, 0.1), -0.02, 0.2, sd * 0.2, { sx: 1.4, sy: 0.6, sz: 0.4 });
    });
    d.position.set(k ? 0.5 : -0.45, 0, k ? -0.2 : 0.25);
    d.rotation.y = k ? 2.4 : -0.5;
    g.add(d);
    ducks.push(d);
  }
  void r;
  const base = i * 8;
  const _o = new THREE.Object3D();
  const a: Actor = {
    obj: g,
    season: 'autumn',
    z: 0,
    x: 0,
    phase: i * 1.7,
    active: false,
    place(pz, rr) {
      curR = rr;
      const side = (i % 2 ? 1 : -1) * (rr() < 0.75 ? 1 : -1);
      this.x = side * R(7.4, 8.8);
      this.z = pz;
      g.position.set(this.x, 0, pz);
    },
    tick(t) {
      for (let k = 0; k < 2; k++) {
        const ph = t * 3 + k * 2 + this.phase;
        const dunk = Math.max(0, Math.sin(ph * 0.7)) ** 6;
        ducks[k].rotation.z = -dunk * 0.6;
        ducks[k].position.y = Math.abs(Math.sin(ph * 2)) * 0.03;
      }
      // splash droplets
      for (let j = 0; j < 8; j++) {
        const ph = ((t * 1.4 + j * 0.13 + this.phase) % 1);
        const ang = j * 0.8 + Math.floor(t * 1.4 + this.phase) * 1.3;
        const rr = 0.15 + ph * 0.7;
        const visible = this.active && ph < 0.7;
        _o.position.set(this.x + Math.cos(ang) * rr + (j < 4 ? -0.45 : 0.5), visible ? 0.05 + Math.sin((ph / 0.7) * Math.PI) * 0.5 : -5, this.z + Math.sin(ang) * rr * 0.7);
        _o.scale.setScalar(0.6 + (1 - ph) * 0.6);
        _o.updateMatrix();
        drops.setMatrixAt(base + j, _o.matrix);
      }
      drops.instanceMatrix.needsUpdate = true;
    },
  };
  return a;
}

// ------------------------------------------------------------------ patterns
const P = (dz: number, lane: -1 | 0 | 1, kind: StagePattern['items'][number]['kind'], extra: Partial<StagePattern['items'][number]> = {}) => ({ dz, lane, kind, ...extra });
const PATTERNS: StagePattern[] = [
  // any season
  { id: 'parks-stroll', difficulty: 1, length: 30, items: [P(0, -1, 'low'), P(12, 1, 'low'), P(24, 0, 'block')] },
  { id: 'parks-arches', difficulty: 1, length: 18, items: [P(0, 0, 'high', { laneSpan: 3 }), P(14, 0, 'high', { laneSpan: 3 })] },
  { id: 'parks-bench-hop', difficulty: 1, length: 14, items: [P(0, 0, 'low', { laneSpan: 3 }), P(12, 0, 'low', { laneSpan: 3 })] },
  { id: 'parks-hedge-maze', difficulty: 2, length: 28, items: [P(0, -1, 'block'), P(0, 1, 'block'), P(12, 0, 'block'), P(12, 1, 'block'), P(24, -1, 'block'), P(24, 0, 'block')] },
  { id: 'parks-hedge-top', difficulty: 2, length: 28, items: [P(4.5, 0, 'ramp', { length: 9 }), P(17, 0, 'platform', { length: 16 }), P(12, -1, 'block'), P(22, -1, 'block')] },
  { id: 'parks-arch-bench', difficulty: 2, length: 28, items: [P(0, 0, 'high', { laneSpan: 3 }), P(12, 0, 'low', { laneSpan: 3 }), P(24, -1, 'high', { laneSpan: 2 }), P(24, 1, 'block')] },
  { id: 'parks-gardener', difficulty: 2, length: 23, items: [P(0, 0, 'moverBlock', { dir: 1 }), P(12, -1, 'low'), P(12, 1, 'low'), P(22, 0, 'moverBlock', { dir: -1 })] },
  { id: 'parks-zigzag', difficulty: 3, length: 30, items: [P(0, -1, 'low'), P(0, 0, 'block'), P(0, 1, 'low'), P(12, 0, 'high', { laneSpan: 3 }), P(24, -1, 'block'), P(24, 1, 'block'), P(24, 0, 'low')] },
  { id: 'parks-pergola-climb', difficulty: 3, length: 30, items: [P(4.5, -1, 'ramp', { length: 9 }), P(17, -1, 'platform', { length: 16 }), P(12, 0, 'high', { laneSpan: 2 }), P(24, 1, 'block'), P(24, 0, 'low')] },
  // winter
  { id: 'winter-snowmen', section: 'winter', difficulty: 1, length: 30, items: [P(0, -1, 'block'), P(12, 1, 'block'), P(24, 0, 'block'), P(24, -1, 'low')] },
  { id: 'winter-sledges', section: 'winter', difficulty: 2, length: 30, items: [P(0, 0, 'low', { laneSpan: 3 }), P(13, 0, 'moverLow', { dir: -1 }), P(26, 0, 'high', { laneSpan: 3 })] },
  { id: 'winter-snowball-roll', section: 'winter', difficulty: 3, length: 34, items: [P(0, 0, 'moverBlock', { dir: 1 }), P(11, -1, 'block'), P(11, 0, 'low'), P(22, -1, 'high', { laneSpan: 2 }), P(22, 1, 'block'), P(32, 0, 'moverLow', { dir: -1 })] },
  // spring
  { id: 'spring-lamb-crossing', section: 'spring', difficulty: 1, length: 28, items: [P(0, 0, 'moverLow', { dir: 1 }), P(14, 0, 'moverLow', { dir: -1 }), P(28, 0, 'low', { laneSpan: 3 })] },
  { id: 'spring-blossom-arches', section: 'spring', difficulty: 2, length: 24, items: [P(0, 0, 'high', { laneSpan: 3 }), P(9, 0, 'high', { laneSpan: 3 }), P(20, 0, 'block'), P(20, -1, 'low')] },
  // summer
  { id: 'summer-picnic-day', section: 'summer', difficulty: 1, length: 26, items: [P(0, -1, 'low'), P(12, 0, 'low'), P(24, 1, 'low')] },
  { id: 'summer-flower-carts', section: 'summer', difficulty: 2, length: 36, items: [P(0, -1, 'block'), P(0, 0, 'block'), P(14, 1, 'ramp', { length: 9 }), P(26.5, 1, 'platform', { length: 16 }), P(27, -1, 'low')] },
  // autumn
  { id: 'autumn-leaf-piles', section: 'autumn', difficulty: 1, length: 26, items: [P(0, -1, 'low', { laneSpan: 2 }), P(12, 0, 'low', { laneSpan: 2 }), P(24, 0, 'moverLow', { dir: 1 })] },
  { id: 'autumn-hay-maze', section: 'autumn', difficulty: 3, length: 28, items: [P(0, -1, 'block'), P(0, 1, 'block'), P(0, 0, 'high'), P(12, 0, 'low', { laneSpan: 3 }), P(24, 0, 'block'), P(24, -1, 'high'), P(24, 1, 'block')] },
];

// ------------------------------------------------------------------ the stage module
export function createParksStage(): StageModule & { sprinkleAt(dist: number): string[] } {
  const sections = makeSections();
  const root = new THREE.Group();
  root.name = 'parks-stage';
  let env: StageEnv | null = null;
  let fill: THREE.DirectionalLight | null = null;
  let backdrop: ReturnType<typeof buildBackdrop> | null = null;
  const fields: Partial<Record<Season, FallingField>> = {};
  const actors: Actor[] = [];
  let drops: THREE.InstancedMesh | null = null;
  let butterflies: THREE.InstancedMesh | null = null;
  const bf = { x: new Float32Array(10), y: new Float32Array(10), z: new Float32Array(10), ph: new Float32Array(10) };
  let birds: THREE.InstancedMesh | null = null;
  let birdT = -10;
  let birdZ = 0;
  let birdSide = 1;
  const ar = mkRng(2024);
  const weights: Record<Season, number> = { winter: 1, spring: 0, summer: 0, autumn: 0 };
  const _o = new THREE.Object3D();
  const _c = new THREE.Color();
  const _c2 = new THREE.Color();

  function computeMix(d: number): { a: Season; b: Season; t: number } {
    const k = Math.round(d / SEASON_LEN);
    const B = k * SEASON_LEN;
    if (k > 0 && Math.abs(d - B) < BLEND_BAND) {
      return { a: seasonAt(B - 1), b: seasonAt(B), t: smooth((d - B + BLEND_BAND) / (2 * BLEND_BAND)) };
    }
    const s = seasonAt(d);
    return { a: s, b: s, t: 0 };
  }

  const mod: StageModule & { sprinkleAt(dist: number): string[] } = {
    id: 'parks',
    name: 'Parks & Gardens',
    length: 1800,
    music: 'mus_parks',
    sections,
    patterns: PATTERNS,
    sprinkleSfx: ['bird_tweet', 'lamb_baa', 'snow_crunch', 'leaves_rustle', 'puddle_splash'],

    build(ctx: StageBuildContext) {
      ctx.scene.add(root);
      env = new StageEnv(ctx, root, LOOKS.winter);
      fill = new THREE.DirectionalLight(0xffffff, 0.35);
      root.add(fill, fill.target);
      const D = Math.max(60, Math.min(96, ctx.camera.far * 0.5));
      backdrop = buildBackdrop(env, D);
      root.add(backdrop.group);
      const r = mkRng(99);
      const hi = ctx.quality === 'high';
      densityK = hi ? 1 : 0.6;
      fields.winter = new FallingField(
        { geometry: lo.ico(0.055), material: mat(0xffffff, { emissive: 0xdde8f5, emissiveIntensity: 0.55 }), count: hi ? 320 : 160, size: [40, 13, 56], offset: [0, 0, -30], fall: [0.7, 1.4], drift: 0.6, spin: 1 },
        r,
      );
      fields.spring = new FallingField(
        { geometry: lo.leaf(0.13, 0.15), material: mat(0xffffff, { side: THREE.DoubleSide, rough: 0.7, emissive: 0x7a5a64, emissiveIntensity: 1 }), count: hi ? 150 : 80, size: [36, 7, 50], offset: [0, 0, -27], fall: [0.45, 0.8], drift: 1.3, spin: 2.2, colors: [0xffb3c9, 0xffc8d8, 0xfff0f4, 0xff9fbd] },
        r,
      );
      fields.autumn = new FallingField(
        { geometry: lo.leaf(0.22, 0.28), material: mat(0xffffff, { side: THREE.DoubleSide, rough: 0.75, emissive: 0x6a4420, emissiveIntensity: 1 }), count: hi ? 170 : 90, size: [38, 8, 50], offset: [0, 0, -27], fall: [0.7, 1.2], drift: 1.6, spin: 2.6, colors: AUTUMN_CANOPY },
        r,
      );
      for (const s of SEASONS) {
        const f = fields[s];
        if (f) {
          root.add(f.mesh);
          f.density = s === 'winter' ? 1 : 0;
        }
      }
      // ambient actors
      for (let i = 0; i < 2; i++) actors.push(makeSnowmanActor());
      for (let i = 0; i < 5; i++) actors.push(makeLambActor(i));
      actors.push(makeFrisbeeActor());
      drops = new THREE.InstancedMesh(lo.sphere(0.05), mat(0xd6eef7, { rough: 0.2 }), 16);
      drops.frustumCulled = false;
      root.add(drops);
      for (let i = 0; i < 2; i++) actors.push(makeDuckPuddleActor(i, drops));
      for (const a of actors) {
        a.obj.visible = false;
        root.add(a.obj);
        a.z = 1e9;
      }
      // butterflies (instanced wings)
      const wingG = new THREE.PlaneGeometry(0.2, 0.15);
      wingG.rotateX(-Math.PI / 2);
      wingG.translate(0, 0, 0.09);
      butterflies = new THREE.InstancedMesh(wingG, mat(0xffffff, { side: THREE.DoubleSide, rough: 0.6 }), 20);
      butterflies.frustumCulled = false;
      const bcol = [PAL.lemon, PAL.orange, PAL.lilac, 0xffffff, PAL.pink];
      for (let i = 0; i < 20; i++) butterflies.setColorAt(i, _c.setHex(bcol[Math.floor(i / 2) % bcol.length]));
      for (let i = 0; i < 10; i++) bf.ph[i] = i * 1.7;
      root.add(butterflies);
      // birds (tūī-ish) — 5 birds x (body + 2 wings)
      const birdG = new THREE.PlaneGeometry(0.5, 0.22);
      birdG.rotateX(-Math.PI / 2);
      birdG.translate(0, 0, 0.25);
      birds = new THREE.InstancedMesh(birdG, mat(0x2d3a4a, { side: THREE.DoubleSide }), 15);
      birds.frustumCulled = false;
      root.add(birds);
    },

    buildDecor(req) {
      const g = new THREE.Group();
      g.name = 'parks-decor';
      for (const piece of splitBySection(sections, req.d0, req.d1)) {
        decorPiece(g, piece.a, piece.b, piece.section.season ?? seasonAt(piece.a), req.rng);
      }
      return g;
    },

    makeObstacle(req) {
      const season = seasonOf(req);
      switch (req.kind) {
        case 'low':
          return makeLow(req, season);
        case 'high':
          return makeHigh(req, season);
        case 'block':
          return makeBlock(req, season);
        case 'platform':
          return makePlatform(req, season);
        case 'ramp':
          return makeRamp(req, season);
        case 'moverBlock':
          return makeMoverBlock(req, season);
        default:
          return makeMoverLow(req, season);
      }
    },

    update(time, dt, dist, playerPos) {
      setStageTime(time);
      if (!env) return;
      const m = computeMix(dist);
      env.blend(LOOKS[m.a], LOOKS[m.b], m.t);
      env.follow(playerPos);
      for (const s of SEASONS) weights[s] = 0;
      weights[m.a] += 1 - m.t;
      weights[m.b] += m.t;
      if (fill) {
        fill.intensity = lerp(FILL[m.a], FILL[m.b], m.t);
        fill.position.set(playerPos.x - 3, playerPos.y + 9, playerPos.z + 14);
        fill.target.position.set(playerPos.x, playerPos.y, playerPos.z - 10);
      }
      if (backdrop) {
        backdrop.group.position.set(0, 0, playerPos.z);
        const sm = backdrop.sun.material as THREE.SpriteMaterial;
        sm.opacity = lerp(SUN_SPRITE[m.a], SUN_SPRITE[m.b], m.t);
        sm.color.copy(_c.setHex(SUN_TINT[m.a]).lerp(_c2.setHex(SUN_TINT[m.b]), m.t));
        const ss = lerp(m.a === 'summer' ? 1.15 : 0.85, m.b === 'summer' ? 1.15 : 0.85, m.t);
        backdrop.sun.scale.setScalar(ss * 26);
        backdrop.groundMat.color.copy(_c.setHex(FAR_GROUND[m.a]).lerp(_c2.setHex(FAR_GROUND[m.b]), m.t));
      }
      for (const s of SEASONS) {
        const f = fields[s];
        if (!f) continue;
        f.density = weights[s];
        if (f.mesh.visible) f.update(dt, time, playerPos);
      }
      // ambient actors: recycle ahead of the runner, show only in their own season
      for (const a of actors) {
        if (a.z > playerPos.z + 12 || a.z < playerPos.z - 160) {
          curR = ar;
          const ahead = playerPos.z - R(26, 70);
          a.place(ahead, ar);
          a.active = seasonAt(-a.z) === a.season && seasonAt(-a.z - 8) === a.season && seasonAt(-a.z + 8) === a.season;
          a.obj.visible = a.active;
        }
        if (a.active) a.tick(time, dt);
        else if (a.season === 'autumn') a.tick(time, dt); // keeps its droplets hidden
      }
      // butterflies (spring + summer), fluttering beside the path near the runner
      if (butterflies) {
        const wB = weights.summer + weights.spring * 0.5;
        const n = Math.round(10 * wB);
        butterflies.count = n * 2;
        butterflies.visible = n > 0;
        for (let i = 0; i < n; i++) {
          if (bf.z[i] > playerPos.z + 6 || bf.z[i] < playerPos.z - 70 || bf.z[i] === 0) {
            const side = i % 2 ? 1 : -1;
            bf.x[i] = side * range(ar, 4.2, 8);
            bf.y[i] = range(ar, 0.6, 1.6);
            bf.z[i] = playerPos.z - range(ar, 12, 60);
          }
          const ph = bf.ph[i];
          const x = bf.x[i] + Math.sin(time * 0.9 + ph) * 0.8;
          const y = bf.y[i] + Math.sin(time * 2.3 + ph) * 0.25;
          const z = bf.z[i] + Math.cos(time * 0.7 + ph) * 1.2;
          const head = Math.atan2(Math.cos(time * 0.9 + ph), -Math.sin(time * 0.7 + ph));
          const flap = 0.3 + Math.abs(Math.sin(time * 16 + ph)) * 1.1;
          for (let w2 = 0; w2 < 2; w2++) {
            _o.position.set(x, y, z);
            _o.rotation.set(w2 ? -flap : flap, head, 0, 'YXZ');
            _o.scale.set(1, 1, w2 ? -1 : 1);
            _o.updateMatrix();
            butterflies.setMatrixAt(i * 2 + w2, _o.matrix);
          }
        }
        butterflies.instanceMatrix.needsUpdate = true;
      }
      // a little flock of birds crossing high overhead now and then (not in winter)
      if (birds) {
        const wb = 1 - weights.winter;
        if (time - birdT > 14 && wb > 0.5) {
          birdT = time;
          birdZ = playerPos.z - 38;
          birdSide = -birdSide;
        }
        const u = (time - birdT) / 7;
        birds.visible = u < 1 && wb > 0.2;
        if (birds.visible) {
          for (let i = 0; i < 5; i++) {
            const bx = birdSide * lerp(-34, 34, u) + Math.sin(i * 2.1) * 1.6;
            const by = 9 + Math.sin(i * 1.7) * 1.2 + Math.sin(time * 2 + i) * 0.2;
            const bz = birdZ + Math.cos(i * 2.7) * 3 - u * 6;
            const flap = Math.sin(time * 11 + i) * 0.8;
            for (let w2 = 0; w2 < 3; w2++) {
              _o.position.set(bx, by, bz);
              if (w2 === 2) {
                _o.rotation.set(0, birdSide > 0 ? 0 : Math.PI, 0);
                _o.scale.set(0.6, 1, 0.5);
                _o.position.z -= 0.1;
              } else {
                _o.rotation.set(w2 ? -flap : flap, birdSide > 0 ? 0 : Math.PI, 0, 'YXZ');
                _o.scale.set(1, 1, w2 ? -1 : 1);
              }
              _o.updateMatrix();
              birds.setMatrixAt(i * 3 + w2, _o.matrix);
            }
          }
          birds.instanceMatrix.needsUpdate = true;
        }
      }
    },

    ambienceAt(dist) {
      return `amb_${seasonAt(dist)}`;
    },

    sprinkleAt(dist) {
      switch (seasonAt(dist)) {
        case 'winter':
          return ['snow_crunch', 'bird_tweet'];
        case 'spring':
          return ['lamb_baa', 'bird_tweet'];
        case 'summer':
          return ['bird_tweet'];
        default:
          return ['leaves_rustle', 'puddle_splash', 'bird_tweet'];
      }
    },

    dispose() {
      for (const s of SEASONS) fields[s]?.dispose();
      env?.dispose();
      env = null;
      root.removeFromParent();
      root.traverse((c) => {
        const me = c as THREE.Mesh;
        if (me.isMesh && me.geometry.attributes.color) me.geometry.dispose();
      });
      if (backdrop) {
        backdrop.groundMat.dispose();
        backdrop.ground.geometry.dispose();
        const sm = backdrop.sun.material as THREE.SpriteMaterial;
        sm.map?.dispose();
        sm.dispose();
        backdrop.group.traverse((c) => {
          const me = c as THREE.Mesh;
          if (me.isMesh && me.material !== env?.backdropMat) (me.material as THREE.Material).dispose();
        });
        backdrop = null;
      }
      butterflies?.dispose();
      birds?.dispose();
      drops?.dispose();
      actors.length = 0;
    },
  };
  return mod;
}
