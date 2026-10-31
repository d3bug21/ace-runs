// Friendly Jungle stage: warm dappled light, an earthy jungle path, giant buttress-rooted trees, ferns,
// bamboo, a river with a plank bridge, a waterfall glade and a palm grove. Animals behave true to life
// and are always playful: swinging monkeys, ambling elephants, slow sloths, hopping frogs, parrots,
// a perched toucan, a plodding tortoise and fluttering butterflies.
import * as THREE from 'three';
import type { StageModule, StagePattern, PatternItem, ObstacleRequest, ObstacleVisual, StageBuildContext } from '../contracts';
import { PLATFORM_TOP } from '../contracts';
import { geo, rng as mkRng, clamp, lerp } from '../kit/kit';
import {
  GeoBuilder,
  StageEnv,
  Wobble,
  wedgeGeo,
  lo,
  floorStrip,
  tileTexture,
  ownedMat,
  vcMat,
  swayMat,
  addShadow,
  addBush,
  jitter,
  mixHex,
  css,
  setStageTime,
  part,
  TAU,
  type EnvLook,
} from './helpersB';

// ------------------------------------------------------------------ palette (jungle-tuned, cohesive with PAL)
const C = {
  earth: 0xcfa36a,
  moss: 0x6fae55,
  mossDeep: 0x55974a,
  mossLight: 0x8cc463,
  leaf: 0x4fae5a,
  leafDeep: 0x3a8f4f,
  leafDark: 0x2f7a47,
  leafLight: 0x86c95f,
  lime: 0xa6d466,
  bamboo: 0x9fcf5f,
  bambooNode: 0x7aa846,
  bark: 0x8a5a3a,
  barkDark: 0x6b4429,
  barkLight: 0xb07a4c,
  wood: 0xc98f5a,
  peachCap: 0xffb38a,
  woodRing: 0xe8c58f,
  rock: 0xa2aa9c,
  rockDark: 0x858f84,
  water: 0x5cc2c6,
  coral: 0xff7a6b,
  pink: 0xff9fc0,
  lemon: 0xffe066,
  orange: 0xff9a3c,
  berry: 0xe85d8a,
  cream: 0xfff4e0,
  ink: 0x2b3440,
  white: 0xffffff,
  // animals
  monkey: 0x8a5a3a,
  monkeyFace: 0xf0c9a0,
  sloth: 0xb29c80,
  slothFace: 0xf3e2c4,
  slothPatch: 0x6a5240,
  elephant: 0xa3abbd,
  elephantDark: 0x8d95a8,
  elephantEar: 0xf2b6c2,
  frog: 0x7cc46a,
  frogSpot: 0x5aa557,
  frogBelly: 0xe8f2b0,
  shell: 0x9c8550,
  shellPlate: 0xc2a865,
  tortoiseSkin: 0xa7b878,
  parrotRed: 0xf0564a,
  parrotYellow: 0xffc94a,
  parrotBlue: 0x5a8dee,
  toucan: 0x2b3440,
  toucanBeak: 0xffb347,
};
const FOG = 0xd6ebbf;

const LOOK: EnvLook = {
  skyTop: 0x6dbfe0,
  skyHorizon: 0xdff0c6,
  skyBottom: 0xc4e2a8,
  fog: FOG,
  fogNear: 24,
  fogFar: 108,
  hemiSky: 0xfff4d6,
  hemiGround: 0x5f9a4e,
  hemiIntensity: 1.25,
  sunColor: 0xffefc4,
  sunIntensity: 1.75,
  sunDir: [-0.35, 0.82, 0.42],
  sunGlow: 0.55,
  backdropTint: 0xffffff,
};

// ------------------------------------------------------------------ local helpers
const _M = new THREE.Matrix4();
const _R = new THREE.Matrix4();
const _S = new THREE.Matrix4();
/** Yaw first, then pitch (for radial fronds / leaves). */
function putYX(b: GeoBuilder, g: THREE.BufferGeometry, col: number, x: number, y: number, z: number, ry: number, rx: number, sx = 1, sy = 1, sz = 1, sway = 0): void {
  _M.makeTranslation(x, y, z);
  _M.multiply(_R.makeRotationY(ry));
  _M.multiply(_R.makeRotationX(rx));
  _M.multiply(_S.makeScale(sx, sy, sz));
  b.add(g, col, _M, sway, 0);
}
const _ta = new THREE.Vector3();
const _tb = new THREE.Vector3();
const _td = new THREE.Vector3();
const _tq = new THREE.Quaternion();
const _ts = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);
/** Chain of cylinders through points (vines, tails, branches). */
function addTube(b: GeoBuilder, pts: number[][], r0: number, col: number, sway = 0, r1 = r0, joints = false): void {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    _ta.set(pts[i][0], pts[i][1], pts[i][2]);
    _tb.set(pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]);
    _td.subVectors(_tb, _ta);
    const len = _td.length();
    if (len < 1e-4) continue;
    _tq.setFromUnitVectors(_UP, _td.multiplyScalar(1 / len));
    const rr = lerp(r0, r1, n > 1 ? i / (n - 1) : 0);
    _ta.add(_tb).multiplyScalar(0.5);
    _M.compose(_ta, _tq, _ts.set(rr, len * 1.02, rr));
    b.add(lo.cyl(1, 1, 1), col, _M, sway, 0);
    if (joints && i > 0) b.put(lo.sphere(rr), col, pts[i][0], pts[i][1], pts[i][2], { sway });
  }
}

/** Cheap small rounded blob for decor details. */
const blob = (r: number) => lo.ico(r, 1);
const ZONE_LEN = 200;
const ZONES = ['glade', 'bamboo', 'river', 'falls', 'palms'] as const;
type Zone = (typeof ZONES)[number];
const CYCLE = ZONE_LEN * ZONES.length; // 1000
const zoneAt = (d: number): Zone => ZONES[((Math.floor(Math.max(0, d) / ZONE_LEN) % ZONES.length) + ZONES.length) % ZONES.length];
/** River zone: the track crosses the river on a plank bridge here. */
const BRIDGE: [number, number] = [470, 530];
const isBridge = (d: number): boolean => {
  const m = ((d % CYCLE) + CYCLE) % CYCLE;
  return m >= BRIDGE[0] && m < BRIDGE[1];
};
/** River zone (outside the bridge): river runs along the left side. */
const isRiverSide = (d: number): boolean => zoneAt(d) === 'river' && !isBridge(d);
const FALLS_AT = 700; // waterfall glade centre within each cycle

function wrapDraw(h: number, y: number, s: number, fn: (yy: number) => void): void {
  fn(y);
  if (y - s < 0) fn(y + h);
  if (y + s > h) fn(y - h);
}

function pathTexture(): THREE.Texture {
  return tileTexture(256, 512, (g, w, h) => {
    const r = mkRng(41);
    g.fillStyle = css(C.earth);
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1100; i++) {
      const x = r() * w, y = r() * h, s = 2 + r() * 8;
      g.fillStyle = css(r() < 0.5 ? 0xbb8f5a : 0xdcb47e, 0.32);
      wrapDraw(h, y, s, (yy) => {
        g.beginPath();
        g.ellipse(x, yy, s, s * 0.65, r() * 3, 0, TAU);
        g.fill();
      });
    }
    // soft sun dapples
    for (let i = 0; i < 16; i++) {
      const x = 20 + r() * (w - 40), y = r() * h, s = 16 + r() * 34;
      wrapDraw(h, y, s, (yy) => {
        const gr = g.createRadialGradient(x, yy, 0, x, yy, s);
        gr.addColorStop(0, 'rgba(255,244,200,0.42)');
        gr.addColorStop(1, 'rgba(255,244,200,0)');
        g.fillStyle = gr;
        g.fillRect(x - s, yy - s, 2 * s, 2 * s);
      });
    }
    // leaf litter
    const leafCols = [0x8fbf5a, 0xd9a441, 0xa8743f, 0x6fae55, 0xe6b85c];
    for (let i = 0; i < 170; i++) {
      const x = r() * w, y = r() * h, s = 3 + r() * 4;
      g.fillStyle = css(leafCols[Math.floor(r() * leafCols.length)], 0.85);
      const a = r() * TAU;
      wrapDraw(h, y, s, (yy) => {
        g.beginPath();
        g.ellipse(x, yy, s, s * 0.42, a, 0, TAU);
        g.fill();
      });
    }
    // lane lines: rows of pale pebbles at x = +-1.1 m
    for (const lx of [w * (2.5 / 7.2), w * (4.7 / 7.2)]) {
      for (let y = 0; y < h; y += 8 + r() * 3) {
        const x = lx + (r() - 0.5) * 3, s = 2.6 + r() * 1.8;
        g.fillStyle = 'rgba(120,84,50,0.35)';
        g.beginPath();
        g.ellipse(x + 0.8, y + 1.2, s, s * 0.7, 0, 0, TAU);
        g.fill();
        g.fillStyle = css(r() < 0.5 ? 0xf3e4c2 : 0xe6d3ab);
        g.beginPath();
        g.ellipse(x, y, s, s * 0.7, r(), 0, TAU);
        g.fill();
      }
    }
    // mossy outer edges
    for (const [x0, x1] of [[0, 20], [w, w - 20]]) {
      const gr = g.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, css(C.moss, 0.95));
      gr.addColorStop(1, css(C.moss, 0));
      g.fillStyle = gr;
      g.fillRect(Math.min(x0, x1), 0, 20, h);
    }
  });
}

function plankTexture(): THREE.Texture {
  return tileTexture(256, 256, (g, w, h) => {
    const r = mkRng(77);
    const ph = 32;
    for (let y = 0; y < h; y += ph) {
      g.fillStyle = css(jitter(r() < 0.5 ? C.wood : 0xbf8650, r, 0.06));
      g.fillRect(0, y, w, ph);
      g.fillStyle = 'rgba(90,55,30,0.18)';
      for (let k = 0; k < 6; k++) g.fillRect(r() * w, y + 4 + r() * (ph - 8), 20 + r() * 50, 1.5);
      g.fillStyle = 'rgba(70,40,20,0.55)';
      g.fillRect(0, y, w, 3);
      g.fillStyle = 'rgba(255,230,190,0.25)';
      g.fillRect(0, y + 3, w, 2);
    }
    // lane hints: lashing pegs at x = +-1.1 m
    for (const lx of [w * (2.5 / 7.2), w * (4.7 / 7.2)]) {
      for (let y = 0; y < h; y += ph) {
        g.fillStyle = 'rgba(60,36,18,0.65)';
        g.beginPath();
        g.arc(lx, y + ph / 2, 3.2, 0, TAU);
        g.fill();
        g.fillStyle = 'rgba(243,228,194,0.9)';
        g.fillRect(lx - 1.2, y + 5, 2.4, ph - 10);
      }
    }
    for (const x0 of [0, w - 14]) {
      g.fillStyle = 'rgba(95,60,32,0.9)';
      g.fillRect(x0, 0, 14, h);
    }
  });
}

function waterTexture(): THREE.Texture {
  return tileTexture(128, 128, (g, w, h) => {
    const r = mkRng(5);
    g.fillStyle = css(C.water);
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const x = r() * w, y = r() * h, s = 6 + r() * 16;
      g.strokeStyle = `rgba(200,245,240,${0.25 + r() * 0.35})`;
      g.lineWidth = 1.5;
      wrapDraw(h, y, 4, (yy) => {
        g.beginPath();
        g.moveTo(x - s, yy);
        g.quadraticCurveTo(x, yy - 3, x + s, yy);
        g.stroke();
      });
    }
  });
}

function fallTexture(): THREE.Texture {
  return tileTexture(64, 256, (g, w, h) => {
    const r = mkRng(9);
    g.fillStyle = '#bfe8ef';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = r() * h, l = 20 + r() * 60;
      g.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.5})`;
      wrapDraw(h, y, l, (yy) => g.fillRect(x, yy, 1.5 + r() * 2.5, l));
    }
    g.fillStyle = 'rgba(120,200,215,0.35)';
    for (let i = 0; i < 12; i++) g.fillRect(r() * w, 0, 2, h);
  });
}

// ------------------------------------------------------------------ flora builders (bake into GeoBuilders)
/** Giant rainforest tree with buttress roots, a high canopy, hanging vines. side = which side of the track (+1 right). */
function addGiantTree(b: GeoBuilder, sb: GeoBuilder, x: number, z: number, s: number, r: () => number, overhang: boolean): void {
  const side = Math.sign(x) || 1;
  const h = (9 + r() * 3) * s;
  const tr = 0.62 * s;
  const bark = jitter(C.bark, r, 0.06);
  b.put(lo.cyl(tr * 0.75, tr, h), bark, x, h / 2, z);
  // bark ridges
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + r();
    b.put(geo.box(0.12 * s, h * 0.8, 0.12 * s), C.barkDark, x + Math.cos(a) * tr * 0.86, h * 0.42, z + Math.sin(a) * tr * 0.86, { ry: -a });
  }
  // buttress roots (fins)
  const nRoots = 5;
  for (let i = 0; i < nRoots; i++) {
    const a = (i / nRoots) * TAU + r() * 0.5;
    const len = (1.3 + r() * 0.6) * s;
    const rh = (1.3 + r() * 0.7) * s;
    const dd = tr * 0.7 + len / 2;
    const rx = x + Math.cos(a) * dd;
    const rz = z + Math.sin(a) * dd;
    if (Math.abs(rx) - 0.2 < 3.7) continue;
    putYX(b, wedgeGeo(0.42 * s, len, rh), bark, rx, 0, rz, Math.PI / 2 - a, 0);
    b.put(blob(0.25 * s), C.moss, x + Math.cos(a) * (dd + len * 0.3), 0.08, z + Math.sin(a) * (dd + len * 0.3), { sy: 0.35, sx: 1.6 });
  }
  // moss collar + a shelf fungus
  b.put(lo.sphere(1), C.mossDeep, x, 0.25 * s, z, { sx: tr * 1.5, sy: 0.35 * s, sz: tr * 1.5 });
  if (r() < 0.6) b.put(lo.sphere(0.32 * s), C.cream, x + side * -0.0 + Math.cos(1.2) * tr, 1.6 * s, z + tr * 0.9, { sy: 0.35 });
  // canopy
  const cy = h + 0.6 * s;
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r();
    const rr = (1.8 + r() * 0.9) * s;
    const ox = i === 0 ? 0 : Math.cos(a) * 1.9 * s;
    const oz = i === 0 ? 0 : Math.sin(a) * 1.9 * s;
    const px = x + ox;
    // keep canopy blobs above 6.5 when they hang over the lanes
    const py = i === 0 ? cy + 0.8 * s : cy + r() * 0.8 * s;
    const col = jitter([C.leafDeep, C.leaf, C.leafDark, C.leafLight][i % 4], r, 0.06);
    sb.put(lo.sphere(1), col, px, py, z + oz, { s: rr, sy: rr * 0.72, sway: 0.05 });
  }
  // branch arching over the path with leaf clouds (stays far above the lanes)
  if (overhang) {
    const by = h * 0.82;
    addTube(b, [[x, by, z], [x * 0.55, by + 0.9, z + 0.4], [x * 0.15, by + 1.5, z + 0.6]], 0.28 * s, bark, 0, 0.16 * s);
    for (let k = 0; k < 5; k++) {
      const lx = x * (0.85 - k * 0.32) + (r() - 0.5) * 0.6;
      const rr = (1.9 + r() * 0.6) * s;
      const ly = Math.max(by + 1.5 + r() * 0.5, 7.3 + rr * 0.45);
      sb.put(lo.sphere(1), jitter([C.leaf, C.leafDeep, C.leafLight][k % 3], r, 0.06), lx, ly, z + (r() - 0.5) * 2.5, { s: rr, sy: rr * 0.42, sway: 0.06 });
    }
  }
  // hanging vines (only beside the lanes)
  const nv = 2 + Math.floor(r() * 3);
  for (let i = 0; i < nv; i++) {
    const vx = x - side * (0.8 + r() * 2.2) * s;
    if (Math.abs(vx) < 3.9) continue;
    const vz = z + (r() - 0.5) * 3;
    const top = cy - 0.6;
    const bot = 1.8 + r() * 2.5;
    addTube(sb, [[vx, top, vz], [vx + 0.1, (top + bot) / 2, vz + 0.1], [vx, bot, vz]], 0.035, C.leafDark, 0.05);
    for (let k = 0; k < 4; k++) {
      const ly = lerp(bot, top, k / 4 + 0.05);
      putYX(sb, lo.leaf(0.18, 0.32), C.leafLight, vx, ly, vz, r() * TAU, -0.5, 1, 1, 1, 0.06);
    }
  }
}

function addFern(b: GeoBuilder, x: number, z: number, s: number, r: () => number, col = C.leaf): void {
  const n = 7 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.4;
    putYX(b, lo.leaf(0.38 * s, 1.35 * s), jitter(col, r, 0.08), x, 0.05, z, a, -0.75 - r() * 0.3, 1, 1, 1, 0.05);
    putYX(b, lo.leaf(0.26 * s, 0.9 * s), jitter(C.leafLight, r, 0.08), x, 0.05, z, a + 0.35, -1.05, 1, 1, 1, 0.04);
  }
}

/** Elephant-ear / monstera style plant with big leaves on stems. */
function addBigLeaf(b: GeoBuilder, x: number, z: number, s: number, r: () => number): void {
  const n = 4 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.5;
    const sh = (0.8 + r() * 0.7) * s;
    const tx = x + Math.cos(a) * 0.35 * s, tz = z + Math.sin(a) * 0.35 * s;
    addTube(b, [[x, 0, z], [tx, sh, tz]], 0.03 * s, C.leafDeep, 0.03);
    putYX(b, lo.leaf(1.0 * s, 1.5 * s), jitter(i % 2 ? C.leaf : C.leafDeep, r, 0.07), tx, sh, tz, Math.atan2(Math.cos(a), Math.sin(a)), 0.15 + r() * 0.35, 1, 1, 1, 0.06);
  }
}

function addBambooClump(b: GeoBuilder, sb: GeoBuilder, x: number, z: number, s: number, r: () => number): void {
  const n = 5 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const ox = x + (r() - 0.5) * 1.4 * s, oz = z + (r() - 0.5) * 1.4 * s;
    if (Math.abs(ox) < 4.7) continue;
    const h = (6 + r() * 4) * s;
    const lean = (r() - 0.5) * 0.12;
    const col = jitter(C.bamboo, r, 0.07);
    b.put(lo.cyl(0.08 * s, 0.1 * s, h), col, ox + lean * h * 0.5, h / 2, oz, { rz: -lean });
    for (let y = 1.1; y < h; y += 1.1 + r() * 0.3) b.put(lo.cyl(0.105 * s, 0.105 * s, 0.07), C.bambooNode, ox + lean * y, y, oz, { rz: -lean });
    for (let k = 0; k < 5; k++) {
      const ly = h * (0.65 + r() * 0.35);
      putYX(sb, lo.leaf(0.22, 0.9), jitter(C.lime, r, 0.1), ox + lean * ly, ly, oz, r() * TAU, 0.35 + r() * 0.4, 1, 1, 1, 0.08);
    }
  }
}

function addPalm(b: GeoBuilder, sb: GeoBuilder, x: number, z: number, s: number, r: () => number): void {
  const side = Math.sign(x) || 1;
  const h = (5 + r() * 2.5) * s;
  const lean = side * (0.08 + r() * 0.12);
  const segs = 6;
  let px = x, py = 0;
  for (let i = 0; i < segs; i++) {
    const sh = h / segs;
    const nx = px + lean * sh * (1 + i * 0.25);
    addTube(b, [[px, py, z], [nx, py + sh, z]], 0.2 * s * (1 - i * 0.06), i % 2 ? C.barkLight : C.wood);
    px = nx;
    py += sh;
  }
  for (let i = 0; i < 3; i++) b.put(lo.sphere(0.14 * s), 0x8a6a3a, px + (i - 1) * 0.15, py - 0.2, z + 0.1 * i);
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.3;
    const up = i % 3 === 0;
    putYX(sb, lo.leaf(1.25 * s, 3.1 * s), jitter(i % 2 ? C.leaf : C.leafLight, r, 0.07), px, py, z, a, up ? -0.15 : 0.3 + r() * 0.35, 1, 1, 1, 0.08);
    putYX(sb, lo.leaf(0.8 * s, 2.0 * s), jitter(C.leafDeep, r, 0.07), px, py - 0.05, z, a + 0.3, 0.55 + r() * 0.3, 1, 1, 1, 0.07);
  }
  sb.put(blob(0.35 * s), C.leafDeep, px, py, z, { sway: 0.05 });
}

function addFlowerBush(b: GeoBuilder, x: number, z: number, s: number, r: () => number): void {
  const n = 2 + Math.floor(r() * 2);
  const bloom = [C.coral, C.pink, C.lemon, C.orange][Math.floor(r() * 4)];
  for (let i = 0; i < n; i++) {
    const rr = (0.5 + r() * 0.3) * s;
    const bx = x + (r() - 0.5) * 0.9 * s, bz = z + (r() - 0.5) * 0.9 * s;
    b.put(lo.sphere(1), jitter(C.leafDeep, r, 0.07), bx, rr * 0.75, bz, { s: rr, sy: rr * 0.8, sway: 0.02 });
    for (let k = 0; k < 4; k++) {
      const a = r() * TAU;
      const fx = bx + Math.cos(a) * rr * 0.8, fz = bz + Math.sin(a) * rr * 0.8;
      b.put(lo.ico(0.13 * s, 0), bloom, fx, rr * (0.8 + r() * 0.5), fz, { sy: 0.6, sway: 0.02, ry: r() * 3 });
      b.put(lo.ico(0.05 * s, 0), C.lemon, fx, rr * 0.9 + 0.08, fz, { sway: 0.02 });
    }
  }
}

function addMushrooms(b: GeoBuilder, x: number, z: number, r: () => number): void {
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const mx = x + (r() - 0.5) * 0.6, mz = z + (r() - 0.5) * 0.6;
    const h = 0.12 + r() * 0.18;
    b.put(lo.cyl(0.035, 0.05, h), C.cream, mx, h / 2, mz);
    b.put(blob(0.12), r() < 0.5 ? C.coral : C.peachCap, mx, h, mz, { sy: 0.55 });
  }
}

function addMossRock(b: GeoBuilder, x: number, z: number, s: number, r: () => number): void {
  b.put(lo.dodeca(0.6), jitter(C.rock, r, 0.07), x, 0.28 * s, z, { s, sy: s * 0.65, ry: r() * 6 });
  b.put(blob(0.5), jitter(C.moss, r, 0.07), x, 0.48 * s, z, { sx: s * 0.95, sy: s * 0.28, sz: s * 0.95 });
}

function addReeds(b: GeoBuilder, x: number, z: number, r: () => number): void {
  for (let i = 0; i < 7; i++) {
    const h = 0.8 + r() * 0.9;
    const rx = x + (r() - 0.5) * 0.9, rz = z + (r() - 0.5) * 0.9;
    b.put(lo.cyl(0.015, 0.025, h), jitter(C.leafLight, r, 0.1), rx, h / 2, rz, { rz: (r() - 0.5) * 0.25, sway: 0.04 });
    if (r() < 0.4) b.put(lo.capsule(0.04, 0.16), 0x9a6a40, rx, h, rz, { sway: 0.05 });
  }
}

function addLilyPad(b: GeoBuilder, x: number, y: number, z: number, r: () => number): void {
  b.put(lo.disc(0.42 + r() * 0.25, 10), jitter(0x6cbf5a, r, 0.08), x, y + 0.02, z, { ry: r() * 6 });
  if (r() < 0.35) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU;
      putYX(b, lo.leaf(0.1, 0.2), C.pink, x, y + 0.06, z, a, -0.6);
    }
    b.put(lo.ico(0.05, 0), C.lemon, x, y + 0.1, z);
  }
}

// ------------------------------------------------------------------ creature builders
interface MonkeyRig {
  root: THREE.Group; // origin = grip point on the vine
  arm: THREE.Object3D;
  legs: THREE.Object3D;
}
/** Monkey hanging by its right hand from a vine at the origin, facing +z. Lowest point about -1.8 m. */
function buildHangingMonkey(fur = C.monkey): MonkeyRig {
  const root = new THREE.Group();
  const face = C.monkeyFace;
  const body = part((b) => {
    addTube(b, [[0.14, -0.55, 0], [0.02, -0.04, 0]], 0.075, fur);
    b.put(lo.sphere(0.095), face, 0.02, 0, 0.02);
    // head
    b.put(lo.sphereHi(0.25), fur, 0.02, -0.7, 0.0);
    b.put(lo.sphereHi(0.2), face, 0.02, -0.73, 0.13, { sy: 0.85, sz: 0.6 });
    b.put(lo.sphereHi(0.12), 0xf7dcbc, 0.02, -0.82, 0.21, { sy: 0.75 });
    for (const sx of [-1, 1]) {
      b.put(lo.sphere(0.048), C.ink, 0.02 + sx * 0.075, -0.67, 0.25);
      b.put(lo.sphere(0.016), C.white, 0.035 + sx * 0.075, -0.655, 0.29);
      b.put(lo.sphere(0.1), fur, 0.02 + sx * 0.26, -0.66, -0.01, { sz: 0.6 });
      b.put(lo.sphere(0.06), face, 0.02 + sx * 0.27, -0.66, 0.03, { sz: 0.5 });
    }
    b.put(geo.torus(0.05, 0.013, 6, 12, Math.PI), 0x8a4b3a, 0.02, -0.82, 0.31, { rz: Math.PI });
    // body + belly
    b.put(lo.capsule(0.24, 0.3), fur, 0.02, -1.1, 0);
    b.put(lo.sphere(0.19), face, 0.02, -1.1, 0.15, { sy: 1.15, sz: 0.5 });
    // curly tail
    addTube(b, [[0, -1.3, -0.18], [-0.16, -1.44, -0.3], [-0.36, -1.4, -0.34], [-0.46, -1.2, -0.3], [-0.38, -1.03, -0.24], [-0.27, -1.08, -0.2]], 0.045, fur, 0, 0.035, true);
  });
  root.add(body);
  const arm = new THREE.Group();
  arm.position.set(-0.2, -0.9, 0);
  arm.add(
    part((b) => {
      addTube(b, [[0, 0, 0], [-0.12, -0.2, 0.05], [-0.18, -0.4, 0.1]], 0.065, fur);
      b.put(lo.sphere(0.08), face, -0.18, -0.44, 0.1);
    }),
  );
  root.add(arm);
  const legs = new THREE.Group();
  legs.position.set(0.02, -1.33, 0);
  legs.add(
    part((b) => {
      for (const sx of [-1, 1]) {
        addTube(b, [[sx * 0.11, 0, 0], [sx * 0.15, -0.22, 0.06], [sx * 0.12, -0.38, 0.03]], 0.075, fur);
        b.put(lo.sphere(0.085), face, sx * 0.12, -0.43, 0.05, { sz: 1.3 });
      }
    }),
  );
  root.add(legs);
  return { root, arm, legs };
}

interface ElephantRig {
  root: THREE.Group; // origin on the ground, faces +x
  body: THREE.Object3D;
  legs: THREE.Object3D[]; // FL, FR, BL, BR
  ears: THREE.Object3D[];
  trunk: THREE.Object3D;
  tail: THREE.Object3D;
}
/** Young friendly elephant (no tusks), walks toward +x. Height ~2.1, length ~2.85. */
function buildElephant(): ElephantRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.x = -0.12;
  inner.scale.setScalar(0.95);
  root.add(inner);
  inner.add(body);
  const E = C.elephant, ED = C.elephantDark;
  body.add(
    part((b) => {
      b.put(lo.sphereHi(0.78), E, -0.05, 1.33, 0, { sx: 1.15, sy: 0.92, sz: 0.85 });
      b.put(lo.sphereHi(0.52), E, 0.86, 1.56, 0);
      // forehead dome + cheeks
      b.put(lo.sphereHi(0.34), E, 0.98, 1.78, 0);
      for (const sz of [-1, 1]) {
        b.put(lo.sphere(0.075), C.ink, 1.18, 1.72, sz * 0.3);
        b.put(lo.sphere(0.025), C.white, 1.23, 1.75, sz * 0.31);
        b.put(lo.sphere(0.1), 0xf7c3cc, 1.16, 1.52, sz * 0.36, { sy: 0.6, sx: 0.5 });
      }
      // a little smile under the trunk
      b.put(geo.torus(0.07, 0.016, 6, 12, Math.PI), 0x6f7890, 1.3, 1.3, 0, { ry: Math.PI / 2, rz: Math.PI });
    }),
  );
  const legs: THREE.Object3D[] = [];
  for (const [lx, lz] of [[0.48, 0.38], [0.48, -0.38], [-0.52, 0.38], [-0.52, -0.38]]) {
    const leg = new THREE.Group();
    leg.position.set(lx, 0.92, lz);
    leg.add(
      part((b) => {
        b.put(lo.capsule(0.21, 0.5), ED, 0, -0.46, 0);
        for (let k = -1; k <= 1; k++) b.put(lo.sphere(0.05), C.cream, 0.18, -0.84, k * 0.09, { sy: 0.7 });
      }),
    );
    legs.push(leg);
    body.add(leg);
  }
  const ears: THREE.Object3D[] = [];
  for (const sz of [-1, 1]) {
    const ear = new THREE.Group();
    ear.position.set(0.8, 1.66, sz * 0.42);
    ear.add(
      part((b) => {
        b.put(lo.sphereHi(1), E, -0.28, -0.04, sz * 0.04, { sx: 0.42, sy: 0.5, sz: 0.07 });
        b.put(lo.sphereHi(1), C.elephantEar, -0.27, -0.05, sz * 0.085, { sx: 0.3, sy: 0.38, sz: 0.03 });
      }),
    );
    ears.push(ear);
    body.add(ear);
  }
  const trunk = new THREE.Group();
  trunk.position.set(1.22, 1.45, 0);
  trunk.add(
    part((b) => {
      addTube(b, [[0, 0.05, 0], [0.12, -0.25, 0], [0.18, -0.55, 0], [0.13, -0.82, 0], [0.2, -0.96, 0]], 0.15, E, 0, 0.08, true);
      b.put(lo.sphere(0.09), ED, 0.21, -0.98, 0);
    }),
  );
  body.add(trunk);
  const tail = new THREE.Group();
  tail.position.set(-0.92, 1.45, 0);
  tail.add(
    part((b) => {
      addTube(b, [[0, 0, 0], [-0.1, -0.25, 0], [-0.12, -0.5, 0]], 0.03, ED);
      b.put(lo.sphere(0.06), 0x5a6275, -0.12, -0.55, 0, { sy: 1.4 });
    }),
  );
  body.add(tail);
  return { root, body, legs, ears, trunk, tail };
}

/** Animate an elephant walk cycle (phase in radians). */
function animateElephant(e: ElephantRig, t: number, walk: number): void {
  const ph = t * 3.2;
  const sw = 0.32 * walk;
  e.legs[0].rotation.z = Math.sin(ph) * sw;
  e.legs[3].rotation.z = Math.sin(ph) * sw;
  e.legs[1].rotation.z = Math.sin(ph + Math.PI) * sw;
  e.legs[2].rotation.z = Math.sin(ph + Math.PI) * sw;
  e.body.position.y = Math.abs(Math.cos(ph)) * 0.045 * walk;
  e.body.rotation.x = Math.sin(ph) * 0.025 * walk;
  const flap = Math.sin(t * 2.1) * 0.35 + 0.15;
  e.ears[0].rotation.y = flap;
  e.ears[1].rotation.y = -flap;
  e.trunk.rotation.z = Math.sin(t * 1.7) * 0.07 - 0.04;
  e.trunk.rotation.x = Math.sin(t * 1.1) * 0.3;
  e.tail.rotation.x = Math.sin(t * 2.6) * 0.4;
}

interface FrogRig {
  root: THREE.Group;
  body: THREE.Object3D;
  backLegs: THREE.Object3D;
  shadow: THREE.Mesh | null;
}
/** Cheerful frog, faces +x. Sitting height ~0.5. */
function buildFrog(): FrogRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(
    part((b) => {
      b.put(lo.sphereHi(0.3), C.frog, 0, 0.24, 0, { sx: 1.15, sy: 0.72, sz: 1 });
      b.put(lo.sphereHi(0.24), C.frogBelly, 0.1, 0.18, 0, { sx: 0.9, sy: 0.6, sz: 0.85 });
      for (const sz of [-1, 1]) {
        b.put(lo.sphereHi(0.11), C.frog, 0.16, 0.38, sz * 0.14);
        b.put(lo.sphere(0.085), C.white, 0.21, 0.4, sz * 0.15);
        b.put(lo.sphere(0.045), C.ink, 0.27, 0.41, sz * 0.16);
        b.put(lo.sphere(0.06), C.frogSpot, -0.12, 0.38, sz * 0.12, { sy: 0.4 });
        // front feet
        b.put(lo.sphere(0.07), C.frog, 0.26, 0.04, sz * 0.18, { sy: 0.45, sx: 1.4 });
      }
      b.put(geo.torus(0.1, 0.014, 6, 12, Math.PI), 0x3f7f3a, 0.3, 0.26, 0, { ry: Math.PI / 2, rz: Math.PI });
      b.put(lo.sphere(0.03), 0xff9fc0, 0.3, 0.3, 0.16);
      b.put(lo.sphere(0.03), 0xff9fc0, 0.3, 0.3, -0.16);
    }),
  );
  const backLegs = new THREE.Group();
  backLegs.position.set(-0.18, 0.16, 0);
  backLegs.add(
    part((b) => {
      for (const sz of [-1, 1]) {
        b.put(lo.sphereHi(0.14), C.frog, 0, 0, sz * 0.24, { sx: 1.3, sy: 0.8 });
        b.put(lo.sphere(0.08), C.frogSpot, -0.02, 0.07, sz * 0.25, { sy: 0.4 });
        b.put(lo.sphere(0.09), C.frog, 0.12, -0.12, sz * 0.27, { sx: 1.9, sy: 0.35 });
      }
    }),
  );
  body.add(backLegs);
  return { root, body, backLegs, shadow: null };
}
/** True hop cycle: crouch, spring (legs extend), arc, squash landing. Max top stays < 0.8 (scale 1.05). */
function animateFrog(f: FrogRig, t: number, period = 1.15): void {
  const p = ((t / period) % 1 + 1) % 1;
  let y = 0, sq = 1, legs = 0, pitch = 0;
  if (p < 0.22) {
    const u = p / 0.22;
    sq = 1 - 0.12 * Math.sin(u * Math.PI * 0.5);
    pitch = -0.08 * u;
  } else if (p < 0.72) {
    const u = (p - 0.22) / 0.5;
    y = 0.2 * Math.sin(u * Math.PI);
    legs = Math.sin(u * Math.PI) * 0.9;
    sq = 1.06;
    pitch = lerp(0.25, -0.2, u);
  } else {
    const u = (p - 0.72) / 0.28;
    sq = 1 - 0.1 * Math.sin(u * Math.PI);
  }
  f.body.position.y = y;
  f.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
  f.body.rotation.z = pitch;
  f.backLegs.rotation.z = legs;
  f.backLegs.scale.x = 1 + legs * 0.5;
  if (f.shadow) f.shadow.scale.set(0.9 - y, 1, 0.7 - y * 0.8);
}

interface SlothRig {
  root: THREE.Group; // origin = liana contact point
  hang: THREE.Object3D;
  arm: THREE.Object3D;
  lids: THREE.Object3D;
  head: THREE.Object3D;
}
/** Sloth hanging under a liana at the origin, face toward +z. Lowest point about -0.9. */
function buildSloth(): SlothRig {
  const root = new THREE.Group();
  const hang = new THREE.Group();
  root.add(hang);
  const F = C.sloth;
  hang.add(
    part((b) => {
      b.put(lo.capsule(0.32, 0.5), F, 0, -0.55, 0, { rz: Math.PI / 2, sz: 0.9 });
      b.put(lo.sphere(0.3), 0xc9b597, 0, -0.42, 0.05, { sx: 1.4, sy: 0.6, sz: 0.8 });
      // limbs hooked onto the liana (back legs + left arm)
      for (const [x0, z0] of [[-0.42, 0.14], [-0.42, -0.14], [0.36, -0.14]]) {
        addTube(b, [[x0, -0.45, z0], [x0 * 1.05, -0.2, z0 * 0.7], [x0 * 1.08, -0.02, 0]], 0.085, F);
        b.put(geo.torus(0.07, 0.02, 5, 10, Math.PI), C.cream, x0 * 1.08, 0.02, 0, { ry: Math.PI / 2 });
      }
    }),
  );
  const head = new THREE.Group();
  head.position.set(0.62, -0.55, 0.12);
  head.add(
    part((b) => {
      b.put(lo.sphereHi(0.25), F, 0, 0, 0);
      b.put(lo.sphereHi(0.21), C.slothFace, 0, -0.01, 0.12, { sz: 0.6 });
      for (const sx of [-1, 1]) {
        b.put(lo.sphereHi(0.07), C.slothPatch, sx * 0.085, 0.02, 0.22, { sx: 1.6, sy: 0.85, sz: 0.4, rz: sx * 0.35 });
        b.put(lo.sphere(0.035), C.ink, sx * 0.085, 0.025, 0.25);
        b.put(lo.sphere(0.012), C.white, sx * 0.085 + 0.012, 0.04, 0.275);
      }
      b.put(lo.sphere(0.04), 0x4a3a30, 0, -0.04, 0.27, { sx: 1.3 });
      b.put(geo.torus(0.05, 0.012, 6, 12, Math.PI), 0x7a5a48, 0, -0.08, 0.25, { rz: Math.PI });
    }),
  );
  const lids = new THREE.Group();
  lids.position.set(0, 0.03, 0.245);
  lids.add(
    part((b) => {
      for (const sx of [-1, 1]) b.put(lo.sphere(0.042), C.slothPatch, sx * 0.085, 0, 0.005, { sz: 0.6 });
    }),
  );
  lids.scale.y = 0.05;
  head.add(lids);
  hang.add(head);
  const arm = new THREE.Group();
  arm.position.set(0.36, -0.45, 0.14);
  arm.add(
    part((b) => {
      addTube(b, [[0, 0, 0], [0.02, 0.24, -0.06], [0.03, 0.43, -0.14]], 0.085, F);
      b.put(geo.torus(0.07, 0.02, 5, 10, Math.PI), C.cream, 0.03, 0.47, -0.14, { ry: Math.PI / 2 });
    }),
  );
  hang.add(arm);
  return { root, hang, arm, lids, head };
}

interface ParrotRig {
  root: THREE.Group; // faces +z
  wingL: THREE.Object3D;
  wingR: THREE.Object3D;
}
function buildParrot(body: number, wing1: number, wing2: number): ParrotRig {
  const root = new THREE.Group();
  root.add(
    part((b) => {
      b.put(lo.capsule(0.13, 0.3), body, 0, 0, 0, { rx: Math.PI / 2 - 0.15 });
      b.put(lo.sphereHi(0.14), body, 0, 0.1, 0.27);
      b.put(lo.sphere(0.07), C.cream, 0, 0.1, 0.36, { sx: 1.6, sy: 1.2, sz: 0.6 });
      b.put(lo.cone(0.05, 0.14), 0x3a3a3a, 0, 0.06, 0.42, { rx: Math.PI / 2 + 0.6 });
      for (const sx of [-1, 1]) b.put(lo.sphere(0.025), C.ink, sx * 0.09, 0.14, 0.33);
      // long tail feathers
      b.put(geo.box(0.12, 0.03, 0.55), body, 0, -0.06, -0.5, { rx: -0.12 });
      b.put(geo.box(0.08, 0.025, 0.45), wing2, 0, -0.04, -0.6, { rx: -0.12 });
    }),
  );
  const mk = (side: number) => {
    const w = new THREE.Group();
    w.position.set(side * 0.1, 0.04, 0.02);
    w.add(
      part((b) => {
        putYX(b, lo.leaf(0.42, 0.62), body, 0, 0, 0, side * Math.PI / 2, 0);
        putYX(b, lo.leaf(0.3, 0.5), wing1, side * 0.12, 0.01, -0.04, side * Math.PI / 2 - side * 0.25, 0);
        putYX(b, lo.leaf(0.2, 0.34), wing2, side * 0.36, 0.02, -0.1, side * Math.PI / 2 - side * 0.45, 0);
      }),
    );
    root.add(w);
    return w;
  };
  return { root, wingL: mk(-1), wingR: mk(1) };
}

interface ToucanRig {
  root: THREE.Group;
  head: THREE.Object3D;
  tail: THREE.Object3D;
}
/** Toucan on a mossy perch post. Faces +x (profile), origin on the ground. */
function buildToucan(): ToucanRig {
  const root = new THREE.Group();
  const py = 2.7;
  root.add(
    part((b) => {
      b.put(lo.cyl(0.12, 0.16, py), C.bark, 0, py / 2, 0);
      b.put(lo.sphere(0.2), C.moss, 0, py, 0, { sy: 0.4, sx: 1.1 });
      addTube(b, [[-0.5, py - 0.1, 0], [0.5, py, 0]], 0.06, C.barkLight);
      putYX(b, lo.leaf(0.25, 0.5), C.leafLight, 0.45, py, 0, 0.6, -0.3);
      putYX(b, lo.leaf(0.25, 0.5), C.leaf, -0.45, py - 0.1, 0, -2.2, -0.3);
      // body
      b.put(lo.capsule(0.15, 0.22), C.toucan, -0.02, py + 0.3, 0, { rz: 0.35 });
      b.put(lo.sphere(0.12), C.cream, 0.08, py + 0.4, 0, { sx: 0.7, sz: 0.9 });
      for (const sz of [-1, 1]) b.put(lo.sphere(0.04), 0xffd166, 0.02, py + 0.08, sz * 0.06);
    }),
  );
  const tail = new THREE.Group();
  tail.position.set(-0.12, py + 0.15, 0);
  tail.add(part((b) => b.put(geo.box(0.06, 0.4, 0.14), C.toucan, -0.06, -0.18, 0, { rz: 0.35 })));
  root.add(tail);
  const head = new THREE.Group();
  head.position.set(0.06, py + 0.55, 0);
  head.add(
    part((b) => {
      b.put(lo.sphereHi(0.13), C.toucan, 0, 0, 0);
      b.put(lo.sphere(0.06), C.cream, 0.06, -0.04, 0, { sz: 1.6 });
      for (const sz of [-1, 1]) {
        b.put(lo.sphere(0.04), 0x7fdcc0, 0.06, 0.03, sz * 0.09);
        b.put(lo.sphere(0.022), C.ink, 0.07, 0.03, sz * 0.115);
      }
      b.put(lo.capsule(0.07, 0.28), C.toucanBeak, 0.27, -0.01, 0, { rz: Math.PI / 2 + 0.12, sz: 0.7 });
      b.put(lo.sphere(0.05), C.coral, 0.44, -0.05, 0, { sz: 0.7 });
      b.put(lo.sphere(0.04), 0x5ac06a, 0.15, 0.05, 0, { sz: 0.7 });
    }),
  );
  root.add(head);
  return { root, head, tail };
}

interface TortoiseRig {
  root: THREE.Group; // faces +z
  head: THREE.Object3D;
  legs: THREE.Object3D[];
}
function buildTortoise(): TortoiseRig {
  const root = new THREE.Group();
  root.add(
    part((b) => {
      b.put(lo.sphereHi(0.45), C.shell, 0, 0.22, 0, { sy: 0.7, sz: 1.15 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 6) * TAU;
        const rr = i === 6 ? 0 : 0.24;
        b.put(lo.sphere(0.13), C.shellPlate, Math.cos(a) * rr, i === 6 ? 0.53 : 0.47, Math.sin(a) * rr * 1.1, { sy: 0.35 });
      }
      b.put(lo.cyl(0.47, 0.47, 0.06), 0x7f6a3e, 0, 0.12, 0, { sz: 1.15 });
      b.put(lo.capsule(0.06, 0.1), C.tortoiseSkin, 0, 0.12, -0.55, { rx: -1.2 });
    }),
  );
  const head = new THREE.Group();
  head.position.set(0, 0.2, 0.5);
  head.add(
    part((b) => {
      b.put(lo.capsule(0.09, 0.14), C.tortoiseSkin, 0, 0.04, 0.05, { rx: 1.0 });
      b.put(lo.sphereHi(0.12), C.tortoiseSkin, 0, 0.12, 0.17);
      for (const sx of [-1, 1]) b.put(lo.sphere(0.025), C.ink, sx * 0.07, 0.16, 0.25);
      b.put(geo.torus(0.04, 0.01, 5, 10, Math.PI), 0x5d6b3e, 0, 0.09, 0.28, { rz: Math.PI });
    }),
  );
  root.add(head);
  const legs: THREE.Object3D[] = [];
  for (const [lx, lz] of [[0.32, 0.3], [-0.32, 0.3], [0.32, -0.3], [-0.32, -0.3]]) {
    const leg = new THREE.Group();
    leg.position.set(lx, 0.14, lz);
    leg.add(part((b) => b.put(lo.capsule(0.08, 0.08), C.tortoiseSkin, 0, -0.08, 0)));
    legs.push(leg);
    root.add(leg);
  }
  return { root, head, legs };
}

// ------------------------------------------------------------------ obstacles
function wobApply(o: THREE.Object3D, w: Wobble, stretch: boolean): void {
  o.rotation.z = clamp(w.tilt * 0.08, -0.2, 0.2);
  const s = clamp(w.squash * 0.03, -0.1, 0.1);
  const sy = stretch ? 1 - s : Math.min(1, 1 - Math.abs(s));
  o.scale.set(1 + Math.abs(s) * 0.5, sy, 1 + Math.abs(s) * 0.5);
}

function makeLow(req: ObstacleRequest): ObstacleVisual {
  const w = req.laneSpan * 2.2;
  const hw = w / 2;
  const h = Math.min(req.height, 0.9);
  const r = req.rng;
  const o = new THREE.Group();
  const wob = new THREE.Group();
  o.add(wob);
  const variant = r() < 0.7 ? 'log' : 'rocks';
  const b = new GeoBuilder();
  if (variant === 'log') {
    const rad = Math.min(0.42, (h - 0.06) / 2, req.length / 2);
    const len = w - 0.25;
    const bark = jitter(C.bark, r, 0.05);
    b.put(geo.cyl(1, 1, 1, 14), bark, 0, rad, 0, { rz: Math.PI / 2, sx: rad, sy: len, sz: rad });
    for (const ex of [-1, 1]) {
      b.put(lo.disc(rad * 0.98, 14), C.woodRing, ex * (len / 2 + 0.005), rad, 0, { rz: ex * -Math.PI / 2 });
      b.put(lo.disc(rad * 0.62, 14), 0xd8ad72, ex * (len / 2 + 0.01), rad, 0, { rz: ex * -Math.PI / 2 });
      b.put(lo.disc(rad * 0.28, 14), C.woodRing, ex * (len / 2 + 0.015), rad, 0, { rz: ex * -Math.PI / 2 });
    }
    // bark ridges on the sides (not the top)
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI * 0.5 + (k - 2) * 0.55;
      const yy = rad + Math.sin(a) * rad * 0.97;
      const zz = Math.cos(a) * rad * 0.97;
      if (yy > 2 * rad - 0.12) continue;
      b.put(geo.box(len * 0.92, 0.05, 0.05), C.barkDark, 0, yy, zz);
      b.put(geo.box(len * 0.92, 0.05, 0.05), C.barkDark, 0, yy, -zz);
    }
    // moss blanket on top (kept under the height)
    const mossTop = Math.min(h - 0.01, 2 * rad + 0.04);
    for (let k = 0; k < Math.max(2, req.laneSpan * 2); k++) {
      const mx = -len / 2 + (k + 0.5) * (len / Math.max(2, req.laneSpan * 2));
      b.put(lo.sphere(1), jitter(C.moss, r, 0.06), mx + (r() - 0.5) * 0.3, mossTop - 0.07, 0.02, { sx: 0.42, sy: 0.07, sz: rad * 0.75 });
    }
    // mushrooms on the front face + a little sprout
    for (let k = 0; k < req.laneSpan * 2; k++) {
      const mx = -len / 2 + 0.4 + r() * (len - 0.8);
      const my = rad * (0.5 + r() * 0.5);
      b.put(lo.sphere(0.09), r() < 0.5 ? C.coral : 0xffb38a, mx, my, rad * 0.95, { sy: 0.5, rx: 1.2 });
      b.put(lo.sphere(0.035), C.cream, mx + 0.03, my + 0.02, rad * 1.02);
    }
    const sx = (r() - 0.5) * len * 0.6;
    addTube(b, [[sx, rad * 1.6, -0.1], [sx + 0.08, Math.min(h - 0.12, rad * 2 + 0.12), -0.22]], 0.035, C.barkLight);
    putYX(b, lo.leaf(0.16, 0.26), C.leafLight, sx + 0.08, Math.min(h - 0.12, rad * 2 + 0.1), -0.22, 0.4, -0.1);
  } else {
    const n = req.laneSpan * 2 + 1;
    for (let k = 0; k < n; k++) {
      const x = -hw + 0.35 + (k / (n - 1)) * (w - 0.7);
      const s = Math.min(0.9, h * (0.8 + r() * 0.35));
      const rh = Math.min(h - 0.06, s * 0.78);
      b.put(lo.dodeca(0.5), jitter(C.rock, r, 0.08), x, rh / 2, (r() - 0.5) * 0.2, { sx: 0.62, sy: rh, sz: 0.62, ry: r() * 6 });
      b.put(lo.sphere(0.32), jitter(C.moss, r, 0.07), x, rh * 0.82, 0.02, { sy: 0.25, sx: 0.95, sz: 0.85 });
    }
    for (let k = 0; k < req.laneSpan * 3; k++) addFernTiny(b, -hw + 0.3 + r() * (w - 0.6), 0.35 + r() * 0.2, r);
  }
  b.into(wob);
  addShadow(o, w * 1.05, Math.max(1.1, req.length * 1.1));
  const wo = new Wobble();
  return {
    object: o,
    update(_t, dt) {
      wo.update(dt);
      wobApply(wob, wo, false);
    },
    react(k) {
      wo.react(k);
    },
  };
}
function addFernTiny(b: GeoBuilder, x: number, z: number, r: () => number): void {
  for (let i = 0; i < 5; i++) putYX(b, lo.leaf(0.12, 0.38), jitter(C.leafLight, r, 0.1), x, 0.02, z, (i / 5) * TAU + r(), -0.7);
}

let highCounter = 0;
function makeHigh(req: ObstacleRequest): ObstacleVisual {
  const w = req.laneSpan * 2.2;
  const hw = w / 2;
  const o = new THREE.Group();
  const useSloth = req.laneSpan === 1 && highCounter++ % 2 === 1;
  const wo = new Wobble();
  if (useSloth) {
    // drooping liana loop between two canopy clumps; sloth hangs from its lowest point
    const low = 2.82;
    const xe = hw + 2.5;
    const k = (7.0 - low) / (xe * xe);
    const pts: number[][] = [];
    for (let i = 0; i <= 12; i++) {
      const x = -xe + (i / 12) * 2 * xe;
      pts.push([x, low + k * x * x, 0]);
    }
    const b = new GeoBuilder();
    addTube(b, pts, 0.085, 0x6f8f3a, 0, 0.085, true);
    // twist strand
    addTube(b, pts.map((p, i) => [p[0], p[1] + 0.06 * Math.sin(i * 1.7), 0.05 * Math.cos(i * 1.7)]), 0.04, 0x557a2e);
    for (let i = 1; i < 12; i++) {
      if (Math.abs(pts[i][0]) < 0.7) continue;
      putYX(b, lo.leaf(0.22, 0.36), i % 2 ? C.leafLight : C.leaf, pts[i][0], pts[i][1] + 0.05, 0.05, r2(i) * TAU, 0.9);
    }
    for (const sx of [-1, 1]) {
      for (let kk = 0; kk < 3; kk++) b.put(lo.sphere(1), jitter(kk % 2 ? C.leaf : C.leafDeep, req.rng, 0.05), sx * (xe + 0.3 - kk * 0.6), 7.2 + kk * 0.4, (kk - 1) * 0.6, { s: 1.0 + kk * 0.15, sy: 0.65 });
    }
    b.into(o);
    const s = buildSloth();
    s.root.position.set(-0.1, low, 0);
    s.root.scale.setScalar(1.3); // lowest point stays ~1.7 m above the ground
    o.add(s.root);
    addShadow(o, 1.3, 0.8, -0.05, 0.08);
    let blinkT = 2 + req.rng() * 3;
    return {
      object: o,
      update(t, dt) {
        wo.update(dt);
        s.hang.rotation.x = Math.sin(t * 0.55) * 0.07 + clamp(wo.tilt * 0.05, -0.25, 0.25);
        s.arm.rotation.z = -0.25 + Math.sin(t * 0.45) * 0.45;
        s.arm.rotation.x = Math.sin(t * 0.3) * 0.2;
        s.head.rotation.z = Math.sin(t * 0.35) * 0.12;
        blinkT -= dt;
        const bt = blinkT < 0 ? clamp(-blinkT / 0.9, 0, 1) : 0;
        s.lids.scale.y = 0.05 + Math.sin(bt * Math.PI) * 0.95;
        if (blinkT < -0.9) blinkT = 3 + ((t * 7.3) % 3);
      },
      react(kk) {
        wo.react(kk);
        blinkT = 0;
      },
    };
  }
  // monkey troupe: a branch overhead, one monkey per covered lane, swinging across the lane
  const by = 5.85;
  const xe = hw + 3.4;
  const b = new GeoBuilder();
  const bp: number[][] = [];
  for (let i = 0; i <= 10; i++) {
    const x = -xe + (i / 10) * 2 * xe;
    bp.push([x, by + 0.055 * x * x, 0]);
  }
  addTube(b, bp, 0.2, C.bark, 0, 0.2, true);
  for (let i = 0; i < bp.length; i += 2) b.put(lo.sphere(0.2), C.moss, bp[i][0], bp[i][1] + 0.14, 0, { sx: 1.8, sy: 0.4 });
  for (const sx of [-1, 1]) {
    for (let kk = 0; kk < 3; kk++)
      b.put(lo.sphere(1), jitter(kk % 2 ? C.leaf : C.leafDeep, req.rng, 0.05), sx * (xe + 0.2 - kk * 0.7), by + 0.055 * xe * xe + 0.3 + kk * 0.25, (kk - 1) * 0.7, { s: 1.1 + kk * 0.15, sy: 0.7 });
  }
  // short leafy vines dangling from the branch (bottoms stay far above head height)
  for (let i = 0; i < req.laneSpan * 3 + 2; i++) {
    const vx = -xe + 1.2 + req.rng() * (2 * xe - 2.4);
    const top = by + 0.055 * vx * vx;
    const bot = top - 0.8 - req.rng() * 0.9;
    addTube(b, [[vx, top, 0.05], [vx + 0.05, bot, 0.08]], 0.025, C.leafDark);
    for (let kk = 0; kk < 3; kk++) putYX(b, lo.leaf(0.16, 0.28), C.leafLight, vx, lerp(bot, top, kk / 3), 0.08, req.rng() * TAU, 0.8);
  }
  b.into(o);
  const monkeys: { pivot: THREE.Group; rig: MonkeyRig; ph: number }[] = [];
  const MS = 1.2; // monkey scale; its lowest point hangs 1.85 * MS below the grip
  const Lv = by - 1.27 - 1.85 * MS;
  const amp = Math.min(0.15, (hw - 0.45) / (Lv + 1.85 * MS));
  for (let i = 0; i < req.laneSpan; i++) {
    const mx = -hw + 1.1 + i * 2.2;
    const pivot = new THREE.Group();
    pivot.position.set(mx, by + 0.055 * mx * mx - 0.12, 0);
    const vb = new GeoBuilder();
    addTube(vb, [[0, 0.1, 0], [0.04, -Lv / 2, 0.02], [0, -Lv, 0]], 0.04, 0x6f8f3a);
    for (let kk = 0; kk < 3; kk++) putYX(vb, lo.leaf(0.15, 0.26), C.leafLight, 0, -Lv * (0.2 + kk * 0.25), 0.03, kk * 2.1, 0.8);
    const vine = vb.build() as THREE.Mesh;
    vine.matrixAutoUpdate = true;
    pivot.add(vine);
    const rig = buildHangingMonkey(i % 2 ? 0x9a6642 : C.monkey);
    rig.root.position.y = -Lv;
    rig.root.scale.setScalar(MS);
    pivot.add(rig.root);
    o.add(pivot);
    monkeys.push({ pivot, rig, ph: i * 1.9 + req.rng() * 2 });
  }
  addShadow(o, w * 0.8, 1.0);
  return {
    object: o,
    update(t, dt) {
      wo.update(dt);
      const extra = clamp(Math.abs(wo.tilt) * 0.02, 0, 0.12);
      for (const m of monkeys) {
        const a = Math.sin(t * 1.7 + m.ph) * (amp + extra);
        m.pivot.rotation.z = a;
        m.rig.arm.rotation.z = -0.4 + Math.sin(t * 5 + m.ph) * 0.55; // waving hello
        m.rig.legs.rotation.x = Math.sin(t * 3.4 + m.ph) * 0.35;
        m.rig.root.rotation.y = Math.sin(t * 0.8 + m.ph) * 0.25;
      }
    },
    react(kk) {
      wo.react(kk);
    },
  };
}
function r2(i: number): number {
  const x = Math.sin(i * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function makeBlock(req: ObstacleRequest): ObstacleVisual {
  const w = req.laneSpan * 2.2;
  const hw = w / 2;
  const h = clamp(req.height, 2.45, 3.1);
  const r = req.rng;
  const o = new THREE.Group();
  const wob = new THREE.Group();
  o.add(wob);
  const b = new GeoBuilder();
  const stump = r() < 0.5;
  for (let i = 0; i < req.laneSpan; i++) {
    const cx = -hw + 1.1 + i * 2.2;
    if (stump) {
      const rad = Math.min(1.0, hw - 0.12);
      const sh = h - 0.12;
      b.put(geo.cyl(rad * 0.92, rad, sh, 14), jitter(C.bark, r, 0.05), cx, sh / 2, 0);
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * TAU + r() * 0.3;
        b.put(geo.box(0.11, sh * (0.75 + r() * 0.2), 0.11), C.barkDark, cx + Math.sin(a) * rad * 0.95, sh * 0.42, Math.cos(a) * rad * 0.95, { ry: a });
      }
      // top rings
      b.put(lo.disc(rad * 0.9, 16), C.woodRing, cx, sh + 0.005, 0);
      b.put(lo.disc(rad * 0.62, 16), 0xd8ad72, cx, sh + 0.01, 0);
      b.put(lo.disc(rad * 0.32, 16), C.woodRing, cx, sh + 0.015, 0);
      // moss rim + sapling on top
      b.put(lo.sphere(1), C.moss, cx - rad * 0.5, sh, -rad * 0.4, { sx: rad * 0.5, sy: 0.09, sz: rad * 0.45 });
      addTube(b, [[cx + 0.2, sh, 0.1], [cx + 0.25, sh + 0.08, 0.1]], 0.03, C.leafDeep);
      putYX(b, lo.leaf(0.12, 0.2), C.leafLight, cx + 0.25, sh + 0.07, 0.1, 0.5, -0.4);
      putYX(b, lo.leaf(0.12, 0.2), C.leafLight, cx + 0.25, sh + 0.07, 0.1, 2.8, -0.4);
      // shelf fungi + flaring roots
      for (let k = 0; k < 3; k++) b.put(lo.sphere(0.2), C.cream, cx + (k - 1) * 0.45, 0.8 + k * 0.45, rad * 0.95, { sy: 0.3, sz: 0.7 });
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU + 0.4;
        const len = 0.7;
        const dd = rad * 0.75 + len / 2;
        const rx = cx + Math.cos(a) * dd;
        if (Math.abs(rx - cx) + 0.12 > hw) continue;
        putYX(b, wedgeGeo(0.2, len, 0.9), C.bark, rx, 0, Math.sin(a) * dd, Math.PI / 2 - a, 0);
      }
      addMushrooms(b, cx + rad * 0.7, rad * 0.75, r);
    } else {
      // mossy boulder with a friendly little frog on top
      const bw = Math.min(1.0, hw - 0.1);
      b.put(lo.ico(1, 1), jitter(C.rock, r, 0.06), cx, h * 0.47, 0, { sx: bw, sy: h * 0.47, sz: Math.min(1.0, req.length / 2 + 0.2), ry: r() * 3 });
      b.put(lo.ico(1, 1), jitter(C.rockDark, r, 0.06), cx + (r() - 0.5) * 0.6, 0.45, 0.6, { sx: bw * 0.6, sy: 0.45, sz: 0.5 });
      b.put(lo.sphere(1), jitter(C.moss, r, 0.05), cx, h * 0.84, -0.05, { sx: bw * 0.78, sy: h * 0.13, sz: 0.75 });
      b.put(lo.sphere(1), C.mossLight, cx - 0.3, h * 0.6, 0.62, { sx: 0.5, sy: 0.25, sz: 0.25 });
      for (let k = 0; k < 3; k++) addFernTiny(b, cx - bw + r() * bw * 2, 0.6 + r() * 0.3, r);
      // tiny frog friend
      const fy = h * 0.95;
      b.put(lo.sphere(0.13), C.frog, cx + 0.15, fy, 0.1, { sx: 1.1, sy: 0.7 });
      for (const sz of [-1, 1]) {
        b.put(lo.sphere(0.05), C.white, cx + 0.15 + sz * 0.06, fy + 0.08, 0.2);
        b.put(lo.sphere(0.025), C.ink, cx + 0.15 + sz * 0.06, fy + 0.085, 0.24);
      }
    }
  }
  b.into(wob);
  addShadow(o, w * 1.05, req.length * 1.3 + 0.6);
  const wo = new Wobble();
  return {
    object: o,
    update(_t, dt) {
      wo.update(dt);
      wobApply(wob, wo, false);
    },
    react(k) {
      wo.react(k);
    },
  };
}

function makePlatform(req: ObstacleRequest): ObstacleVisual {
  const w = req.laneSpan * 2.2;
  const hw = w / 2;
  const len = req.length;
  const hl = len / 2;
  const r = req.rng;
  const o = new THREE.Group();
  const b = new GeoBuilder();
  const rx = hw - 0.04;
  const ry = PLATFORM_TOP / 2;
  const bark = jitter(C.bark, r, 0.04);
  b.put(geo.cyl(1, 1, 1, 18), bark, 0, ry, 0, { rx: Math.PI / 2, sx: rx, sy: len, sz: ry });
  // the front face shows the tree rings
  const ringCols = [C.woodRing, 0xd8ad72, C.woodRing, 0xd8ad72, 0xb98656];
  for (let i = 0; i < ringCols.length; i++) {
    const f = 0.97 - i * 0.2;
    b.put(geo.circle(1, 20), ringCols[i], 0, ry, hl + 0.005 + i * 0.004, { sx: rx * f, sy: ry * f });
    b.put(geo.circle(1, 20), ringCols[i], 0, ry, -hl - 0.005 - i * 0.004, { sx: rx * f, sy: ry * f, ry: Math.PI });
  }
  // bark ridges along the sides (never above the walkway)
  for (let k = 0; k < 7; k++) {
    const a = -Math.PI * 0.95 + k * 0.32;
    if (a > -0.2 && a < 0.2) continue;
    for (const sd of [-1, 1]) {
      const yy = ry + Math.sin(a) * ry * 0.98;
      if (yy > PLATFORM_TOP - 0.35) continue;
      b.put(geo.box(0.06, 0.06, len * 0.94), C.barkDark, sd * Math.cos(a) * rx * 0.98, yy, 0);
    }
  }
  // moss drapes, fungi, ferns and a knot hole along the sides
  for (let z = -hl + 1; z < hl - 0.5; z += 1.6 + r() * 1.4) {
    const sd = r() < 0.5 ? -1 : 1;
    b.put(lo.sphere(1), jitter(C.moss, r, 0.06), sd * rx * 0.9, ry * (1.1 + r() * 0.4), z, { sx: 0.18, sy: 0.35, sz: 0.6 });
    if (r() < 0.5) b.put(lo.sphere(0.2), C.cream, sd * rx * 1.0, ry * (0.6 + r() * 0.5), z + 0.4, { sy: 0.3, sx: 0.6 });
    if (r() < 0.4) addFernTiny(b, sd * (rx + 0.15), z + 0.6, r);
  }
  // broken branch stubs low on the sides
  for (const sd of [-1, 1]) addTube(b, [[sd * rx * 0.9, 0.9, -hl * 0.3], [sd * (rx + 0.32), 1.15, -hl * 0.3 - 0.2]], 0.11, bark);
  b.into(o);
  addShadow(o, w * 1.15, len + 0.8);
  return { object: o };
}

function makeRamp(req: ObstacleRequest): ObstacleVisual {
  const w = req.laneSpan * 2.2;
  const hw = w / 2;
  const len = req.length;
  const hl = len / 2;
  const r = req.rng;
  const o = new THREE.Group();
  const b = new GeoBuilder();
  b.put(wedgeGeo(w - 0.12, len, PLATFORM_TOP), 0x6f9a4e, 0, 0, 0);
  const slope = (z: number) => (PLATFORM_TOP * (hl - z)) / len;
  const ang = Math.atan2(PLATFORM_TOP, len);
  // bright step boards up the slope (high contrast = obviously a ramp to run up)
  const step = 0.62;
  let k = 0;
  for (let z = hl - 0.45; z > -hl + 0.2; z -= step, k++) {
    b.put(geo.box(w - 0.34, 0.06, step * 0.72), k % 2 ? 0xd9b07a : 0xe6c48f, 0, slope(z) - 0.005, z, { rx: ang });
  }
  // side roots framing the ramp
  for (const sd of [-1, 1]) {
    const xx = sd * (hw + 0.2);
    addTube(b, [[xx, 0.1, hl], [xx, PLATFORM_TOP * 0.5 + 0.18, 0], [xx, PLATFORM_TOP + 0.12, -hl]], 0.13, C.bark, 0, 0.15, true);
    for (let z = hl - 1; z > -hl; z -= 2) b.put(lo.sphere(0.18), C.moss, xx, slope(z) + 0.22, z, { sx: 0.5, sy: 0.45, sz: 1.6 });
  }
  b.into(o);
  addShadow(o, w * 1.1, len);
  return { object: o };
}

function makeMoverBlock(req: ObstacleRequest): ObstacleVisual {
  const o = new THREE.Group();
  const wob = new THREE.Group();
  o.add(wob);
  const e = buildElephant();
  e.root.rotation.y = (req.dir ?? 1) === 1 ? 0 : Math.PI;
  wob.add(e.root);
  addShadow(o, 2.6, 1.5);
  const wo = new Wobble();
  const ph = req.rng() * 10;
  return {
    object: o,
    update(t, dt) {
      wo.update(dt);
      animateElephant(e, t + ph, 1);
      wobApply(wob, wo, false);
    },
    react(k) {
      wo.react(k);
      e.trunk.rotation.x = 0.6; // happy trunk wiggle
    },
  };
}

function makeMoverLow(req: ObstacleRequest): ObstacleVisual {
  const o = new THREE.Group();
  const f = buildFrog();
  f.root.rotation.y = (req.dir ?? 1) === 1 ? 0 : Math.PI;
  // unscaled peak top (eyes at hop apex) is ~0.72 m: scale so it never exceeds the requested height
  const vs = clamp((Math.min(0.8, req.height) - 0.02) / 0.72, 0.6, 1.08);
  const hs = Math.max(vs, 1.45); // chunky and easy to spot, but never taller than allowed
  f.root.scale.set(hs, vs, hs);
  o.add(f.root);
  f.shadow = addShadow(o, 0.9, 0.7);
  const wo = new Wobble();
  const ph = req.rng() * 2;
  return {
    object: o,
    update(t, dt) {
      wo.update(dt);
      animateFrog(f, t + ph);
      f.root.rotation.z = clamp(wo.tilt * 0.05, -0.2, 0.2);
    },
    react(k) {
      wo.react(k);
    },
  };
}

// ------------------------------------------------------------------ patterns
const it = (dz: number, lane: -1 | 0 | 1, kind: PatternItem['kind'], o: Partial<PatternItem> = {}): PatternItem => ({ dz, lane, kind, ...o });
const PATTERNS: StagePattern[] = [
  { id: 'jg-log-hops', difficulty: 1, length: 28, items: [it(0, 0, 'low', { laneSpan: 3 }), it(14, -1, 'low', { laneSpan: 2 }), it(14, 1, 'block'), it(28, 0, 'low', { laneSpan: 3 })] },
  { id: 'jg-monkey-business', difficulty: 1, length: 17, items: [it(0, 0, 'high', { laneSpan: 3 }), it(16, -1, 'block'), it(16, 1, 'block')] },
  { id: 'jg-sloth-hello', difficulty: 1, length: 21, items: [it(0, -1, 'high'), it(0, 1, 'block'), it(10, 1, 'low'), it(20, 0, 'high'), it(20, -1, 'block')] },
  { id: 'jg-frog-hops', difficulty: 1, length: 18, items: [it(0, -1, 'moverLow', { dir: 1 }), it(18, 1, 'moverLow', { dir: -1 })] },
  { id: 'jg-boulder-gate', difficulty: 1, length: 14, items: [it(0, -1, 'block'), it(0, 1, 'block'), it(14, 0, 'low', { laneSpan: 3 })] },
  {
    id: 'jg-log-bridge',
    difficulty: 2,
    length: 24,
    items: [it(0, 0, 'ramp', { length: 9 }), it(12.5, 0, 'platform', { length: 16 }), it(12, -1, 'block'), it(12, 1, 'block'), it(24, -1, 'low'), it(24, 1, 'low')],
  },
  { id: 'jg-elephant-crossing', difficulty: 2, length: 18, items: [it(0, 0, 'moverBlock', { dir: 1 }), it(18, 0, 'low', { laneSpan: 3 })] },
  { id: 'jg-roots-and-vines', difficulty: 2, length: 24, items: [it(0, -1, 'low', { laneSpan: 2 }), it(0, 1, 'block'), it(12, 0, 'high', { laneSpan: 3 }), it(24, 0, 'low', { laneSpan: 3 })] },
  { id: 'jg-frog-pond', difficulty: 2, length: 26, items: [it(0, 0, 'moverLow', { dir: -1 }), it(13, 0, 'high', { laneSpan: 3 }), it(26, 0, 'moverLow', { dir: 1 })] },
  { id: 'jg-log-ladder', difficulty: 2, length: 23, items: [it(0, -1, 'low'), it(0, 0, 'block'), it(11, 0, 'low'), it(11, 1, 'block'), it(22, 1, 'low'), it(22, -1, 'block')] },
  { id: 'jg-sloth-slalom', difficulty: 2, length: 24, items: [it(0, -1, 'high'), it(0, 0, 'block'), it(12, 1, 'high'), it(12, 0, 'block'), it(24, -1, 'low', { laneSpan: 3 })] },
  { id: 'jg-herd', difficulty: 3, length: 30, items: [it(0, -1, 'moverBlock', { dir: 1 }), it(15, 1, 'moverBlock', { dir: -1 }), it(30, 0, 'low', { laneSpan: 3 })] },
  {
    id: 'jg-canopy-run',
    difficulty: 3,
    length: 32,
    items: [
      it(0, -1, 'ramp', { length: 9 }),
      it(14.5, -1, 'platform', { length: 20 }),
      it(11, 0, 'high'),
      it(11, 1, 'block'),
      it(22, 0, 'low'),
      it(22, 1, 'block'),
      it(32, 0, 'high', { laneSpan: 3 }),
    ],
  },
  { id: 'jg-zigzag', difficulty: 3, length: 26, items: [it(0, -1, 'block'), it(0, 0, 'block'), it(13, 0, 'block'), it(13, 1, 'block'), it(26, 0, 'high', { laneSpan: 3 })] },
  {
    id: 'jg-sloth-bridge',
    difficulty: 3,
    length: 34,
    items: [it(0, 1, 'ramp', { length: 9 }), it(12.5, 1, 'platform', { length: 16 }), it(12, -1, 'high', { laneSpan: 2 }), it(24, -1, 'low', { laneSpan: 2 }), it(34, 0, 'moverLow', { dir: -1 })],
  },
  { id: 'jg-monkey-frog', difficulty: 3, length: 29, items: [it(0, 0, 'high', { laneSpan: 2, lane: -1 }), it(0, 1, 'block'), it(14, 0, 'moverLow', { dir: 1 }), it(28, 0, 'moverBlock', { dir: -1 })] },
];

// ------------------------------------------------------------------ stage
export function createJungleStage(): StageModule {
  const root = new THREE.Group();
  root.name = 'jungle-stage';
  let env: StageEnv | null = null;
  let backdrop: THREE.Group | null = null;
  let quality: 'low' | 'high' = 'high';
  const pathTex = pathTexture();
  const plankTex = plankTexture();
  const waterTex = waterTexture();
  const fallTex = fallTexture();
  const pathMat = ownedMat('jungle:path', (m) => (m.map = pathTex), 0.92);
  const plankMat = ownedMat('jungle:plank', (m) => (m.map = plankTex), 0.8);
  const waterMat = ownedMat('jungle:water', (m) => {
    m.map = waterTex;
    m.emissive.set(0x1d5a5e);
    m.emissiveIntensity = 0.35;
  }, 0.18);
  const fallMat = ownedMat('jungle:fall', (m) => {
    m.map = fallTex;
    m.emissive.set(0xffffff);
    m.emissiveMap = fallTex;
    m.emissiveIntensity = 0.5;
    m.side = THREE.DoubleSide;
  }, 0.4);
  const rainbowMat = ownedMat('jungle:rainbow', (m) => {
    m.vertexColors = true;
    m.transparent = true;
    m.opacity = 0.42;
    m.depthWrite = false;
    m.emissive.set(0x333333);
  }, 0.5);

  // ambient life
  const parrots: { rig: ParrotRig; x: number; y: number; z: number; v: number; ph: number }[] = [];
  const toucans: { rig: ToucanRig; ph: number }[] = [];
  const canopyMonkeys: { anchor: THREE.Group; pivot: THREE.Group; rig: MonkeyRig; ph: number }[] = [];
  const tortoises: { rig: TortoiseRig; ph: number }[] = [];
  const herd: { rig: ElephantRig; ph: number; v: number }[] = [];
  let flies: THREE.InstancedMesh | null = null;
  const NF = 18;
  const fx = new Float32Array(NF), fy = new Float32Array(NF), fz = new Float32Array(NF), fph = new Float32Array(NF);
  const fax = new Float32Array(NF), faz = new Float32Array(NF);
  const ar = mkRng(2024);
  const dummy = new THREE.Object3D();

  function buildBackdrop(): THREE.Group {
    const g = new THREE.Group();
    const bb = new GeoBuilder();
    const r = mkRng(99);
    const hz = (c: number, t: number) => mixHex(c, FOG, t);
    for (const side of [-1, 1]) {
      for (let z = -210; z < 50; z += 8 + r() * 6) {
        const x = side * (46 + r() * 22);
        const rr = 7 + r() * 6;
        bb.put(lo.sphere(1), hz([C.leafDeep, C.leaf, C.leafDark][Math.floor(r() * 3)], 0.42 + r() * 0.12), x, 6 + r() * 9, z, { s: rr, sy: rr * 0.75 });
        if (r() < 0.4) bb.put(lo.cyl(0.6, 0.9, 12), hz(C.barkDark, 0.5), x - side * 3, 6, z + 2);
      }
    }
    // canopy wall far ahead framing the vanishing point
    for (let x = -110; x <= 110; x += 9 + r() * 5) {
      const rr = 9 + r() * 7;
      bb.put(lo.sphere(1), hz([C.leafDeep, C.leaf][Math.floor(r() * 2)], 0.62 + r() * 0.08), x, 10 + r() * 12, -175 - r() * 15, { s: rr, sy: rr * 0.7 });
    }
    // distant hills
    for (let k = 0; k < 7; k++) {
      const x = -120 + k * 40 + r() * 10;
      bb.put(lo.sphere(1), hz(0x5aa557, 0.72), x, -8, -200, { s: 40 + r() * 10, sy: 26 });
    }
    // two distant waterfalls on cliffs
    for (const [x, z, h] of [[-62, -120, 24], [70, -80, 18]]) {
      const sd = Math.sign(x);
      bb.put(geo.box(16, h, 10), hz(0x8c9a86, 0.5), x + sd * 4, h / 2, z);
      bb.put(lo.sphere(1), hz(C.leafDeep, 0.48), x + sd * 4, h + 1, z, { sx: 10, sy: 4, sz: 7 });
      bb.put(geo.box(3.2, h - 1, 0.6), hz(0xe8f7fa, 0.25), x - sd * 4.1, h / 2, z + 1.5);
      bb.put(lo.sphere(1), hz(0xffffff, 0.3), x - sd * 4.1, 1, z + 2, { sx: 4, sy: 1.6, sz: 2 });
    }
    const m = bb.build(env!.backdropMat);
    if (m) g.add(m);
    // wide ground under everything (fogged) so the world never shows its edges
    const gb = new GeoBuilder();
    gb.put(lo.disc(240, 24), C.mossDeep, 0, -0.5, -60);
    gb.into(g, vcMat(0.95));
    return g;
  }

  function buildAmbient(): void {
    const pc: [number, number, number][] = [
      [C.parrotRed, C.parrotYellow, C.parrotBlue],
      [C.parrotBlue, C.parrotYellow, 0x2fb5a8],
      [C.parrotRed, C.parrotBlue, C.parrotYellow],
    ];
    for (let i = 0; i < 3; i++) {
      const rig = buildParrot(...pc[i]);
      rig.root.scale.setScalar(1.6);
      root.add(rig.root);
      parrots.push({ rig, x: 999, y: 8, z: 0, v: 0, ph: i * 1.3 });
    }
    for (let i = 0; i < 2; i++) {
      const rig = buildToucan();
      root.add(rig.root);
      rig.root.position.set(999, 0, 0);
      toucans.push({ rig, ph: i * 2.2 });
    }
    for (let i = 0; i < 2; i++) {
      const anchor = new THREE.Group();
      const pivot = new THREE.Group();
      const Lv = 3.4;
      const ab = new GeoBuilder();
      addTube(ab, [[-3, 0.5, 0], [0, 0.05, 0], [3, 0.6, 0.3]], 0.16, C.bark, 0, 0.12, true);
      for (let k = 0; k < 4; k++) ab.put(lo.sphere(1), k % 2 ? C.leaf : C.leafDeep, -3 + k * 2, 0.9 + (k % 2) * 0.4, (k - 1.5) * 0.5, { sx: 1.7, sy: 1.0, sz: 1.5 });
      anchor.add(ab.build() as THREE.Mesh);
      const vb = new GeoBuilder();
      addTube(vb, [[0, 0, 0], [0.05, -Lv / 2, 0], [0, -Lv, 0]], 0.04, 0x6f8f3a);
      const v = vb.build() as THREE.Mesh;
      v.matrixAutoUpdate = true;
      pivot.add(v);
      const rig = buildHangingMonkey(i ? 0x9a6642 : C.monkey);
      rig.root.position.y = -Lv;
      pivot.add(rig.root);
      anchor.add(pivot);
      anchor.position.set(999, 10, 0);
      root.add(anchor);
      canopyMonkeys.push({ anchor, pivot, rig, ph: i * 2.7 });
    }
    {
      const rig = buildTortoise();
      root.add(rig.root);
      rig.root.position.set(999, 0, 0);
      tortoises.push({ rig, ph: 0 });
    }
    for (let i = 0; i < 2; i++) {
      const rig = buildElephant();
      rig.root.scale.setScalar(i === 0 ? 1.15 : 0.62);
      rig.root.position.set(999, 0, 0);
      root.add(rig.root);
      herd.push({ rig, ph: i * 0.9, v: 0.9 });
    }
    // butterflies
    const bg = new THREE.BufferGeometry();
    const P = [0, 0, 0.05, -0.2, 0, 0.2, -0.17, 0, -0.06, 0, 0, -0.02, -0.12, 0, -0.06, -0.1, 0, -0.2];
    const all: number[] = [];
    for (let i = 0; i < P.length; i += 3) all.push(P[i], P[i + 1], P[i + 2]);
    for (let i = 0; i < P.length; i += 3) all.push(-P[i], P[i + 1], P[i + 2]);
    bg.setAttribute('position', new THREE.Float32BufferAttribute(all, 3));
    bg.computeVertexNormals();
    const bm = ownedMat('jungle:butterfly', (m) => {
      m.side = THREE.DoubleSide;
      m.emissive.set(0x332211);
    }, 0.6);
    flies = new THREE.InstancedMesh(bg, bm, NF);
    flies.frustumCulled = false;
    const cols = [C.lemon, C.orange, 0x5a8dee, C.pink, 0x7fdcc0, C.lemon];
    const cc = new THREE.Color();
    for (let i = 0; i < NF; i++) {
      flies.setColorAt(i, cc.setHex(cols[i % cols.length]));
      fph[i] = ar() * TAU;
      fax[i] = 999;
    }
    root.add(flies);
  }

  function ambientUpdate(t: number, dt: number, p: THREE.Vector3): void {
    const pz = p.z;
    // parrots flying across high above
    for (const pr of parrots) {
      if (Math.abs(pr.x) > 34 || pr.z > pz + 8) {
        const dir = ar() < 0.5 ? 1 : -1;
        pr.x = -dir * (30 + ar() * 25);
        pr.y = 7.5 + ar() * 4;
        pr.z = pz - 22 - ar() * 40;
        pr.v = dir * (6 + ar() * 3);
      }
      pr.x += pr.v * dt;
      const o = pr.rig.root;
      o.position.set(pr.x, pr.y + Math.sin(t * 2 + pr.ph) * 0.4, pr.z);
      o.rotation.set(0, pr.v > 0 ? Math.PI / 2 : -Math.PI / 2, Math.sin(t * 1.3 + pr.ph) * 0.15);
      const fl = Math.sin(t * 11 + pr.ph);
      pr.rig.wingL.rotation.z = fl * 0.75;
      pr.rig.wingR.rotation.z = -fl * 0.75;
    }
    // toucans perched beside the path, bobbing heads
    for (const tc of toucans) {
      const o = tc.rig.root;
      if (o.position.x === 999 || o.position.z > pz + 10) {
        const side = ar() < 0.5 ? -1 : 1;
        o.position.set(side * (4.6 + ar() * 1.4), 0, pz - 45 - ar() * 50);
        o.rotation.y = side > 0 ? Math.PI : 0; // look toward the path
      }
      const hop = (t * 0.7 + tc.ph) % 4;
      tc.rig.head.rotation.z = Math.sin(t * 3.2 + tc.ph) * 0.18 + (hop < 0.3 ? 0.4 : 0);
      tc.rig.head.rotation.y = Math.sin(t * 0.9 + tc.ph) * 0.5;
      tc.rig.tail.rotation.z = Math.sin(t * 4 + tc.ph) * 0.12;
    }
    // monkeys swinging in the canopy
    for (const cm of canopyMonkeys) {
      const o = cm.anchor;
      if (o.position.x === 999 || o.position.z > pz + 12) {
        const side = ar() < 0.5 ? -1 : 1;
        o.position.set(side * (7 + ar() * 5), 10.2 + ar(), pz - 40 - ar() * 50);
      }
      cm.pivot.rotation.x = Math.sin(t * 1.4 + cm.ph) * 0.55;
      cm.rig.arm.rotation.z = -0.4 + Math.sin(t * 4 + cm.ph) * 0.6;
      cm.rig.legs.rotation.x = Math.sin(t * 2.8 + cm.ph) * 0.4;
    }
    // tortoise plodding toward the runner beside the path
    for (const tt of tortoises) {
      const o = tt.rig.root;
      if (o.position.x === 999 || o.position.z > pz + 8) {
        const side = ar() < 0.5 ? -1 : 1;
        o.position.set(side * (4.3 + ar() * 0.6), 0, pz - 50 - ar() * 60);
      }
      o.position.z += 0.18 * dt;
      const w = t * 2.4;
      tt.rig.legs[0].rotation.x = Math.sin(w) * 0.4;
      tt.rig.legs[3].rotation.x = Math.sin(w) * 0.4;
      tt.rig.legs[1].rotation.x = -Math.sin(w) * 0.4;
      tt.rig.legs[2].rotation.x = -Math.sin(w) * 0.4;
      tt.rig.head.rotation.x = Math.sin(w * 0.5) * 0.15;
      tt.rig.head.rotation.y = Math.sin(t * 0.5) * 0.3;
    }
    // elephant mum + baby ambling far beside the path
    {
      const mum = herd[0].rig.root;
      if (mum.position.x === 999 || mum.position.z > pz + 20) {
        const side = ar() < 0.5 ? -1 : 1;
        mum.position.set(side * (14 + ar() * 4), 0, pz - 70 - ar() * 40);
      }
      mum.position.z += 0.9 * dt;
      mum.rotation.y = -Math.PI / 2;
      const baby = herd[1].rig.root;
      baby.position.set(mum.position.x + (mum.position.x > 0 ? -1.8 : 1.8), 0, mum.position.z - 2.6);
      baby.rotation.y = -Math.PI / 2;
      animateElephant(herd[0].rig, t, 0.7);
      animateElephant(herd[1].rig, t * 1.25 + 0.6, 0.8);
    }
    // butterflies fluttering off the lanes
    if (flies) {
      for (let i = 0; i < NF; i++) {
        if (fax[i] === 999 || faz[i] > pz + 6) {
          const side = ar() < 0.5 ? -1 : 1;
          fax[i] = side * (4.5 + ar() * 5);
          faz[i] = pz - 8 - ar() * 50;
          fy[i] = 0.8 + ar() * 1.8;
        }
        const ph = fph[i];
        fx[i] = fax[i] + Math.sin(t * 0.9 + ph) * 0.6;
        fz[i] = faz[i] + Math.cos(t * 0.7 + ph * 1.3) * 0.8;
        dummy.position.set(fx[i], fy[i] + Math.sin(t * 2.3 + ph) * 0.35, fz[i]);
        dummy.rotation.set(0.2, t * 0.9 + ph, Math.sin(t * 3 + ph) * 0.2);
        const flap = 0.2 + 0.8 * Math.abs(Math.sin(t * 13 + ph));
        dummy.scale.set(flap * 1.3, 1.3, 1.3);
        dummy.updateMatrix();
        flies.setMatrixAt(i, dummy.matrix);
      }
      flies.instanceMatrix.needsUpdate = true;
    }
  }

  // --------------------------------------------------------------- decor
  function fallsNear(d0: number, d1: number): number[] {
    const cyc = Math.floor(d0 / CYCLE) * CYCLE;
    return [cyc - CYCLE + FALLS_AT, cyc + FALLS_AT, cyc + FALLS_AT + CYCLE].filter((wd) => wd + 18 > d0 && wd - 18 < d1);
  }
  function scatterSide(b: GeoBuilder, sb: GeoBuilder, side: number, d0: number, d1: number, r: () => number, dense: number): void {
    const falls = side > 0 ? fallsNear(d0, d1) : [];
    const nearFalls = (d: number) => falls.some((wd) => Math.abs(d - wd) < 17);
    const zone0 = zoneAt((d0 + d1) / 2);
    const river = isRiverSide((d0 + d1) / 2) && side < 0;
    const bridge = isBridge((d0 + d1) / 2);
        // near band undergrowth
    if (!bridge && !river) {
      for (let d = d0 + r() * 2; d < d1; d += (1.6 + r() * 1.8) / dense) {
        const z = -d;
        const zone = zoneAt(d + (r() - 0.5) * 30);
        const k = nearFalls(d) ? 0.3 + r() * 0.6 : r();
        const s = 0.8 + r() * 0.5;
        if (zone === 'bamboo' && k < 0.25) addBambooClump(b, sb, side * (5.6 + r() * 2), z, 0.8 + r() * 0.3, r);
        else if (k < 0.38) addFern(sb, side * (3.55 + 1.2 * s + r() * 3), z, s, r);
        else if (k < 0.55) addBigLeaf(sb, side * (3.55 + 1.95 * s + r() * 3), z, s, r);
        else if (k < 0.68) addFlowerBush(sb, side * (3.6 + 1.4 * s + r() * 3), z, s, r);
        else if (k < 0.78) addMushrooms(b, side * (4.0 + r() * 1.2), z, r);
        else if (k < 0.88) addMossRock(b, side * (4.4 + r() * 2), z, 0.6 + r() * 0.7, r);
        else addFernTiny(sb, side * (3.95 + r() * 0.6), z, r);
      }
      // mossy edge stones along the path
      for (let d = d0 + r(); d < d1; d += 1.3 + r() * 1.6) {
        b.put(lo.dodeca(0.3), jitter(r() < 0.5 ? C.rock : C.rockDark, r, 0.08), side * (3.86 + r() * 0.12), 0.06, -d, { sy: 0.45, ry: r() * 6, s: 0.8 + r() * 0.4 });
        if (r() < 0.5) b.put(blob(0.2), C.moss, side * (3.95 + r() * 0.2), 0.12, -d - 0.3, { sy: 0.4, sx: 1.2 });
      }
    }
    // mid band: big trees / palms / bamboo
    const midStart = river ? 22 : 7.5;
    for (let d = d0 + r() * 4; d < d1; d += (6 + r() * 5) / Math.max(0.6, dense)) {
      const z = -d;
      const zone = zoneAt(d + (r() - 0.5) * 30);
      const x = side * (midStart + r() * 6);
      if (nearFalls(d)) continue;
      if (zone === 'bamboo') addBambooClump(b, sb, x, z, 1 + r() * 0.3, r);
      else if (zone === 'palms') r() < 0.7 ? addPalm(b, sb, x, z, 1 + r() * 0.3, r) : addGiantTree(b, sb, x, z, 0.85, r, false);
      else addGiantTree(b, sb, x, z, 0.9 + r() * 0.35, r, !river && !bridge && r() < 0.55 && Math.abs(x) < 10);
      if (r() < 0.5) addBush(sb, x + side * 2, z + 2, 1.2, C.leafDeep, r);
    }
    // far band
    for (let d = d0 + r() * 5; d < d1; d += (7 + r() * 6) / Math.max(0.6, dense)) {
      const x = side * (20 + r() * 12);
      if (river && Math.abs(x) < 24) continue;
      if (nearFalls(d)) continue;
      const zone = zoneAt(d);
      if (zone === 'palms' && r() < 0.5) addPalm(b, sb, x, -d, 1.3, r);
      else addGiantTree(b, sb, x, -d, 1.1 + r() * 0.4, r, false);
    }
    void zone0;
  }

  function groundTiles(b: GeoBuilder, side: number, d0: number, d1: number, r: () => number, xFrom: number): void {
    const len = d1 - d0;
    const nz = Math.max(1, Math.round(len / 8));
    const tz = len / nz;
    for (let i = 0; i < nz; i++) {
      for (let x = xFrom; x < 34; x += 6) {
        b.put(lo.flat(1, 1), jitter(0x6aaa52, r, 0.025), side * (x + 3), -0.012, -(d0 + (i + 0.5) * tz), { sx: 6.02, sz: tz + 0.02 });
      }
    }
    // soft ground cover patches (moss, leaf litter, clover) break up the flat floor
    const pc = [C.mossDeep, 0x7bb85c, 0x8fbf5a, 0xa89a58, 0x5e9e4b];
    const n = Math.round(len * 0.9);
    for (let i = 0; i < n; i++) {
      const x = xFrom + 0.6 + r() * (30 - xFrom);
      b.put(lo.disc(1, 9), jitter(pc[Math.floor(r() * pc.length)], r, 0.05), side * x, -0.008 + r() * 0.006, -(d0 + r() * len), { sx: 0.6 + r() * 1.4, sz: 0.5 + r() * 1.2, ry: r() * 3 });
    }
  }

  function buildDecorRange(g: THREE.Group, d0: number, d1: number, r: () => number): void {
    const mid = (d0 + d1) / 2;
    const bridge = isBridge(mid);
    const river = isRiverSide(mid);
    const dense = quality === 'low' ? 0.6 : 1;
    g.add(floorStrip(d0, d1, -3.6, 3.6, bridge ? plankMat : pathMat, bridge ? 7.2 : 13.2));
    const b = new GeoBuilder();
    const sb = new GeoBuilder();
    const len = d1 - d0;
    if (bridge) {
      // water on both sides, rope rails and posts outside the lanes
      g.add(floorStrip(d0, d1, -40, -3.6, waterMat, 6, -0.35));
      g.add(floorStrip(d0, d1, 3.6, 40, waterMat, 6, -0.35));
      b.put(geo.box(7.4, 0.4, len), C.barkDark, 0, -0.21, -mid);
      for (let d = Math.ceil(d0 / 3) * 3; d < d1; d += 3) {
        for (const sd of [-1, 1]) {
          b.put(lo.cyl(0.11, 0.13, 1.5), C.bark, sd * 3.8, 0.4, -d);
          b.put(lo.sphere(0.13), C.barkLight, sd * 3.8, 1.18, -d);
          b.put(lo.cyl(0.14, 0.14, 1.2), C.barkDark, sd * 3.8, -0.8, -d);
        }
      }
      for (const sd of [-1, 1]) {
        b.put(lo.cyl(0.03, 0.03, len), 0xe8d6a8, sd * 3.8, 1.0, -mid, { rx: Math.PI / 2 });
        b.put(lo.cyl(0.025, 0.025, len), 0xe8d6a8, sd * 3.8, 0.6, -mid, { rx: Math.PI / 2 });
      }
      for (let i = 0; i < 6; i++) {
        const sd = r() < 0.5 ? -1 : 1;
        addLilyPad(b, sd * (5 + r() * 12), -0.35, -(d0 + r() * len), r);
      }
      for (let i = 0; i < 4; i++) addMossRock(b, (r() < 0.5 ? -1 : 1) * (7 + r() * 14), -(d0 + r() * len), 1 + r(), r);
      for (const sd of [-1, 1]) groundTiles(b, sd, d0, d1, r, 26);
      for (const sd of [-1, 1]) for (let d = d0 + r() * 6; d < d1; d += 9) addGiantTree(b, sb, sd * (28 + r() * 4), -d, 1.2, r, false);
    } else {
      if (river) {
        g.add(floorStrip(d0, d1, -22, -6.2, waterMat, 6, -0.3));
        // muddy bank between path and river
        b.put(lo.flat(1, 1), 0x8fa45a, -4.9, -0.01, -mid, { sx: 2.6, sz: len + 0.02 });
        for (let d = d0 + r() * 2; d < d1; d += 2.5 + r() * 2) {
          if (r() < 0.5) addReeds(sb, -6.2 - r() * 0.4, -d, r);
          else addMossRock(b, -6.3, -d, 0.6 + r() * 0.4, r);
        }
        for (let i = 0; i < 7; i++) addLilyPad(b, -(8 + r() * 12), -0.3, -(d0 + r() * len), r);
        groundTiles(b, -1, d0, d1, r, 22);
        b.put(lo.flat(1, 1), 0x7f9a52, -3.9, -0.009, -mid, { sx: 0.8, sz: len + 0.02 });
      } else groundTiles(b, -1, d0, d1, r, 3.6);
      groundTiles(b, 1, d0, d1, r, 3.6);
      scatterSide(b, sb, -1, d0, d1, r, dense);
      scatterSide(b, sb, 1, d0, d1, r, dense);
      // waterfall glade: a close waterfall tumbling into a pool on the right, with a soft rainbow
      for (const wd of fallsNear(d0, d1)) {
        if (wd < d0 || wd >= d1) continue;
        const wx = 10.5, wz = -wd;
        const rock = (x: number, y: number, z: number, sc: number) =>
          b.put(lo.dodeca(1), jitter(r() < 0.5 ? C.rock : C.rockDark, r, 0.06), x, y, z, { s: sc, sy: sc * 0.9, ry: r() * 6, rx: r() * 0.5 });
        for (let k = 0; k < 7; k++) rock(wx + 5 + r() * 2, 1.5 + k * 1.6, wz + (r() - 0.5) * 3, 2.6 + r());
        for (const sz of [-1, 1]) for (let k = 0; k < 6; k++) rock(wx + 2.5 + r() * 3, 1 + k * 1.7, wz + sz * (4.2 + r() * 1.5), 2.2 + r() * 0.8);
        b.put(geo.box(6, 11, 6), C.rockDark, wx + 5.5, 5.5, wz);
        for (let k = 0; k < 4; k++) sb.put(lo.sphere(1), jitter(k % 2 ? C.leaf : C.leafDeep, r, 0.05), wx + 3 + k * 1.2, 11.5 + (k % 2), wz + (k - 1.5) * 3, { sx: 2.8, sy: 1.3, sz: 2.6, sway: 0.03 });
        for (let k = 0; k < 6; k++) {
          const vz = wz + (r() - 0.5) * 9;
          addTube(sb, [[wx + 2.6, 11.5, vz], [wx + 2.2, 8 - r() * 2, vz + 0.2]], 0.035, C.leafDark, 0.05);
        }
        const fall = new THREE.Mesh(geo.plane(3.6, 10.6), fallMat);
        fall.position.set(wx + 1.4, 5.5, wz);
        fall.rotation.y = -Math.PI / 2 + 0.35;
        g.add(fall);
        g.add(floorStrip(wd - 6.5, wd + 6.5, wx - 5.5, wx + 2.8, waterMat, 6, 0.03));
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * TAU;
          addMossRock(b, wx - 1.4 + Math.cos(a) * 4.6, wz + Math.sin(a) * 6.8, 0.7 + r() * 0.5, r);
        }
        for (let k = 0; k < 12; k++) sb.put(blob(0.35 + r() * 0.3), C.white, wx + 0.9 + (r() - 0.5) * 2.2, 0.12, wz + (r() - 0.5) * 3.2, { sy: 0.55, wave: 0.16 });
        for (let k = 0; k < 4; k++) addLilyPad(b, wx - 3 + r() * 2, 0.03, wz + (r() - 0.5) * 8, r);
        const rb = new GeoBuilder();
        const bands = [0xff9c8a, 0xffd27a, 0xa8e6a0, 0x8cc8f0, 0xc0a8f0];
        bands.forEach((c, i) => rb.put(lo.torusArc(3.2 - i * 0.17, 0.09, Math.PI), c, wx - 1.8, 1.6, wz + 1.5, { ry: -0.9 }));
        rb.into(g, rainbowMat);
      }
    }
    b.into(g, vcMat(0.86));
    sb.into(g, swayMat(0.84));
  }

  return {
    id: 'jungle',
    name: 'Friendly Jungle',
    length: 1700,
    music: 'mus_jungle',
    sections: [{ id: 'jungle', label: 'Friendly Jungle', start: 0 }],
    sprinkleSfx: ['monkey_ooh', 'parrot_squawk', 'elephant_toot', 'frog_ribbit', 'bird_tweet'],
    patterns: PATTERNS,
    build(ctx: StageBuildContext) {
      quality = ctx.quality;
      ctx.scene.add(root);
      env = new StageEnv(ctx, root, LOOK);
      backdrop = buildBackdrop();
      root.add(backdrop);
      buildAmbient();
    },
    buildDecor(req) {
      const g = new THREE.Group();
      g.name = `jungle-decor-${req.d0}`;
      // split at the bridge edges so the plank bridge starts/ends exactly
      const cuts = [req.d0];
      const c0 = Math.floor(req.d0 / CYCLE) * CYCLE;
      for (const c of [c0, c0 + CYCLE]) for (const e of BRIDGE) if (c + e > req.d0 && c + e < req.d1) cuts.push(c + e);
      cuts.push(req.d1);
      cuts.sort((a, b) => a - b);
      for (let i = 0; i < cuts.length - 1; i++) if (cuts[i + 1] - cuts[i] > 0.01) buildDecorRange(g, cuts[i], cuts[i + 1], req.rng);
      return g;
    },
    makeObstacle(req) {
      switch (req.kind) {
        case 'low':
          return makeLow(req);
        case 'high':
          return makeHigh(req);
        case 'block':
          return makeBlock(req);
        case 'platform':
          return makePlatform(req);
        case 'ramp':
          return makeRamp(req);
        case 'moverBlock':
          return makeMoverBlock(req);
        case 'moverLow':
          return makeMoverLow(req);
      }
    },
    update(time, dt, _dist, playerPos) {
      setStageTime(time);
      env?.follow(playerPos);
      if (backdrop) backdrop.position.set(0, 0, playerPos.z);
      fallTex.offset.y = (time * 0.9) % 1;
      waterTex.offset.set((time * 0.02) % 1, (time * 0.05) % 1);
      ambientUpdate(time, dt, playerPos);
    },
    ambienceAt() {
      return 'amb_jungle';
    },
    dispose() {
      env?.dispose();
      env = null;
      root.removeFromParent();
      flies?.dispose();
    },
  };
}
