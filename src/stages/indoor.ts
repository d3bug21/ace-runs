// Indoor playground: a big, bright soft-play warehouse. Padded mats, ball pits, foam blocks,
// tube slides, crawl tunnels, cargo nets and bunting under a skylit roof.
import * as THREE from 'three';
import { LANE_WIDTH, type DecorRequest, type ObstacleRequest, type ObstacleVisual, type StageBuildContext, type StageModule, type StagePattern } from '../contracts';
import { PAL, blobShadow, canvasTexture, geo, mat, pick, range } from '../kit/kit';
import {
  Batch,
  DecorAnims,
  archGeo,
  ballGeo,
  floorStrip,
  frameM,
  heartGeo,
  helixTube,
  keep,
  laneOffsets,
  pennantGeo,
  roundRect,
  sphereWedge,
  starGeo,
  texMat,
  vcGlow,
  vcMat,
  visual,
  wedgeGeo,
  cached,
} from './helpersA';

// Soft-play colours: bright but gentle.
const C = {
  coral: 0xff8b7b,
  sun: 0xffcd5c,
  mint: 0x7ed9bf,
  sky: 0x7fc2ef,
  lilac: 0xb9a3f2,
  cream: 0xfff3df,
  teal: 0x35b3a6,
  blue: 0x5e90e8,
  navy: 0x34507a,
  wall: 0xf6eadb,
  steel: 0x8796a8,
  floorSide: 0xe9dcc8,
  white: 0xffffff,
};
const SOFT = [C.coral, C.sun, C.mint, C.sky, C.lilac];
const BALLS = [C.coral, C.sun, C.sky, C.mint, 0xffffff, C.lilac];

const WALL_X = 22;
const ROOF_Y = 12.5;

// ------------------------------------------------------------------ textures
function trackTexture(): THREE.Texture {
  // 7.2 m wide x 4.4 m long at 80 px / m
  return canvasTexture(576, 352, (g, w, h) => {
    g.fillStyle = '#c9b99f';
    g.fillRect(0, 0, w, h);
    const lanes = [
      [24, 200],
      [200, 376],
      [376, 552],
    ];
    const cols = [
      ['#8fdcc6', '#b6e9da'],
      ['#ffd987', '#ffe7b0'],
      ['#93cbf2', '#bcdff7'],
    ];
    for (let li = 0; li < 3; li++) {
      for (let row = 0; row < 2; row++) {
        const [x0, x1] = lanes[li];
        const y0 = row * 176;
        const col = cols[li][(row + li) % 2];
        const inset = 3;
        const grd = g.createRadialGradient((x0 + x1) / 2, y0 + 88, 10, (x0 + x1) / 2, y0 + 88, 120);
        grd.addColorStop(0, lighten(col, 0.18));
        grd.addColorStop(1, col);
        g.fillStyle = grd;
        roundRect(g, x0 + inset, y0 + inset, x1 - x0 - inset * 2, 176 - inset * 2, 14);
        g.fill();
        // stitched edge
        g.strokeStyle = 'rgba(255,255,255,0.55)';
        g.setLineDash([7, 6]);
        g.lineWidth = 2.5;
        roundRect(g, x0 + 12, y0 + 12, x1 - x0 - 24, 176 - 24, 9);
        g.stroke();
        g.setLineDash([]);
      }
    }
    // outer edge bands (track border, inside |x| < 3.6)
    g.fillStyle = '#3aa79b';
    g.fillRect(0, 0, 22, h);
    g.fillRect(w - 22, 0, 22, h);
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(16, 0, 3, h);
    g.fillRect(w - 19, 0, 3, h);
  });
}
function lighten(hexs: string, k: number): string {
  const n = parseInt(hexs.slice(1), 16);
  const r = (n >> 16) & 255,
    gg = (n >> 8) & 255,
    b = n & 255;
  const f = (v: number) => Math.round(v + (255 - v) * k);
  return `rgb(${f(r)},${f(gg)},${f(b)})`;
}
function sideFloorTexture(): THREE.Texture {
  // 4 m x 4 m warm vinyl with a soft 2 m grid and speckles
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#ece0cc';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(170,140,110,0.10)' : 'rgba(255,255,255,0.25)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.strokeStyle = 'rgba(160,130,100,0.18)';
    g.lineWidth = 2;
    for (let i = 0; i <= 2; i++) {
      g.beginPath();
      g.moveTo(0, (i * h) / 2);
      g.lineTo(w, (i * h) / 2);
      g.moveTo((i * w) / 2, 0);
      g.lineTo((i * w) / 2, h);
      g.stroke();
    }
  });
}
function wallTexture(): THREE.Texture {
  // 40 m long x 12 m high mural wall, 51 px / m
  return canvasTexture(2048, 616, (g, w, h) => {
    const m = h / 12; // px per metre
    const Y = (metres: number) => h - metres * m;
    g.fillStyle = '#f7ecdc';
    g.fillRect(0, 0, w, h);
    // mural: sky wash
    const sky = g.createLinearGradient(0, Y(6.4), 0, Y(1.4));
    sky.addColorStop(0, '#d8eef8');
    sky.addColorStop(1, '#f2f7f2');
    g.fillStyle = sky;
    roundRect(g, 30, Y(6.6), w - 60, 5.2 * m, 40);
    g.fill();
    // sun + rainbow (muted)
    const sx = w * 0.72;
    const arcs = ['#ffb7a8', '#ffdf9a', '#bfe8c9', '#a9d7f2'];
    arcs.forEach((c, i) => {
      g.strokeStyle = c;
      g.lineWidth = 0.32 * m;
      g.beginPath();
      g.arc(w * 0.3, Y(1.5), (3.8 - i * 0.32) * m, Math.PI, Math.PI * 2);
      g.stroke();
    });
    g.fillStyle = '#ffd36a';
    g.beginPath();
    g.arc(sx, Y(5.0), 0.8 * m, 0, Math.PI * 2);
    g.fill();
    // clouds
    g.fillStyle = '#ffffff';
    for (const [cx, cy] of [
      [0.12, 5.4],
      [0.55, 5.7],
      [0.88, 5.2],
    ]) {
      for (const [dx, dy, r] of [
        [0, 0, 0.5],
        [0.55, 0.1, 0.4],
        [-0.5, 0.08, 0.38],
        [0.2, 0.35, 0.42],
      ])
        g.beginPath(), g.arc(cx * w + dx * m, Y(cy + dy), r * m, 0, Math.PI * 2), g.fill();
    }
    // hills
    const hill = (c: string, base: number, amp: number, f: number, ph: number) => {
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(30, Y(1.4));
      for (let x = 30; x <= w - 30; x += 16) g.lineTo(x, Y(base + amp * (0.5 + 0.5 * Math.sin(x * f + ph))));
      g.lineTo(w - 30, Y(1.4));
      g.closePath();
      g.fill();
    };
    hill('#bfe3a8', 3.0, 1.2, 0.004, 1);
    hill('#9fd48d', 2.2, 0.9, 0.0062, 3);
    // round trees + ferns
    for (let i = 0; i < 9; i++) {
      const x = 120 + i * 230 + (i % 3) * 30;
      g.fillStyle = '#b48a62';
      g.fillRect(x - 6, Y(2.6), 12, 0.9 * m);
      g.fillStyle = i % 2 ? '#7cc46a' : '#8fd07a';
      g.beginPath();
      g.arc(x, Y(2.9), 0.55 * m, 0, Math.PI * 2);
      g.fill();
    }
    // dado rail
    g.fillStyle = '#44b3a6';
    g.fillRect(0, Y(1.3), w, 1.3 * m);
    g.fillStyle = '#fff3df';
    g.fillRect(0, Y(1.36), w, 0.12 * m);
    // padded wall panels on the dado
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 3;
    for (let x = 0; x < w; x += 1.25 * m) {
      roundRect(g, x + 6, Y(1.22), 1.25 * m - 12, 1.1 * m, 10);
      g.stroke();
    }
    // high windows
    for (let x = 60; x < w; x += 4 * m) {
      g.fillStyle = '#e1d4c2';
      roundRect(g, x - 6, Y(10.6) - 6, 2.6 * m + 12, 2.2 * m + 12, 10);
      g.fill();
      const wg = g.createLinearGradient(0, Y(10.6), 0, Y(8.4));
      wg.addColorStop(0, '#d4efff');
      wg.addColorStop(1, '#fdfcf4');
      g.fillStyle = wg;
      roundRect(g, x, Y(10.6), 2.6 * m, 2.2 * m, 6);
      g.fill();
      g.fillStyle = '#e1d4c2';
      g.fillRect(x + 1.3 * m - 3, Y(10.6), 6, 2.2 * m);
    }
  });
}

// ------------------------------------------------------------------ shared geometry bits
const quarterCyl = (r: number, h: number, i: number) =>
  cached(`qc${r},${h},${i}`, () => new THREE.CylinderGeometry(r, r, h, 8, 1, false, (i * Math.PI) / 2, Math.PI / 2));

function emblem(b: Batch, M: THREE.Matrix4, kind: number, x: number, y: number, z: number, s: number, color: number): void {
  if (kind === 0) b.addIn(M, starGeo(s, 0.06), color, x, y, z);
  else if (kind === 1) b.addIn(M, heartGeo(s * 0.8, 0.06), color, x, y, z);
  else if (kind === 2) b.addIn(M, geo.cyl(s * 0.8, s * 0.8, 0.06, 20), color, x, y, z, Math.PI / 2);
  else b.addIn(M, geo.cyl(s * 0.95, s * 0.95, 0.06, 3), color, x, y - s * 0.12, z, Math.PI / 2, 0, 0);
}

const rb = (w: number, h: number, d: number, r = 0.08) => geo.rbox(w, h, d, r, 2);

// ------------------------------------------------------------------ side props (all write into a Batch in world coords)
function ballPit(b: Batch, M: THREE.Matrix4, w: number, d: number, r: () => number, q: number): void {
  const wallH = 0.75,
    t = 0.32;
  const col = pick(r, [C.teal, C.blue, C.coral]);
  b.addIn(M, rb(w, wallH, t, 0.12), col, 0, wallH / 2, d / 2 - t / 2);
  b.addIn(M, rb(w, wallH, t, 0.12), col, 0, wallH / 2, -d / 2 + t / 2);
  b.addIn(M, rb(t, wallH, d - t * 2, 0.12), col, -w / 2 + t / 2, wallH / 2, 0);
  b.addIn(M, rb(t, wallH, d - t * 2, 0.12), col, w / 2 - t / 2, wallH / 2, 0);
  // padded rim caps
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.addIn(M, geo.cyl(0.24, 0.24, 0.1, 14), C.cream, (sx * (w - t)) / 2, wallH + 0.04, (sz * (d - t)) / 2);
  // balls, a soft heap
  const rr = 0.23;
  b.addIn(M, geo.box(w - t * 2, 0.5, d - t * 2), pick(r, [C.sky, C.mint]), 0, 0.25, 0);
  const nx = Math.floor((w - t * 2) / (rr * 1.9)),
    nz = Math.floor((d - t * 2) / (rr * 1.9));
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      if (r() > q) continue;
      const x = -w / 2 + t + rr + i * rr * 1.9 + (r() - 0.5) * 0.08;
      const z = -d / 2 + t + rr + j * rr * 1.9 + (r() - 0.5) * 0.08;
      const heap = 0.1 * Math.cos(((i / nx) - 0.5) * Math.PI) * Math.cos(((j / nz) - 0.5) * Math.PI);
      b.addIn(M, ballGeo(rr), pick(r, BALLS), x, 0.42 + heap + r() * 0.08, z);
    }
  // a few balls that escaped onto the floor
  for (let i = 0; i < 4; i++) b.addIn(M, ballGeo(rr), pick(r, BALLS), (r() - 0.5) * (w + 1.6), rr, d / 2 + 0.3 + r() * 0.9);
}

function foamBlocks(b: Batch, M: THREE.Matrix4, r: () => number): void {
  // a playful heap: big cubes, cylinders, wedges, an arch
  const s = 0.75;
  for (let i = 0; i < 3; i++) b.addIn(M, rb(s, s, s, 0.12), pick(r, SOFT), (i - 1) * (s + 0.05), s / 2, 0, 0, (r() - 0.5) * 0.3);
  b.addIn(M, rb(s, s, s, 0.12), pick(r, SOFT), -0.4, s * 1.5, 0, 0, 0.3);
  b.addIn(M, rb(s, s, s, 0.12), pick(r, SOFT), 0.42, s * 1.5, 0.05, 0, -0.2);
  b.addIn(M, geo.cyl(0.38, 0.38, 0.8, 18), pick(r, SOFT), 1.7, 0.4, 0.6);
  b.addIn(M, geo.cyl(0.38, 0.38, 0.8, 18), pick(r, SOFT), 1.4, 0.38, -0.7, Math.PI / 2, 0.5);
  b.addIn(M, wedgeGeo(0.8, 0.6, 1.1), pick(r, SOFT), -1.7, 0, 0.4, 0, 0.8);
  b.addIn(M, archGeo(0.75, 0.38, 0.6), pick(r, SOFT), 0.1, 0, 1.3, 0, 0.2);
  emblem(b, M, Math.floor(r() * 4), 0, s / 2, s / 2 + 0.03, 0.2, C.cream);
}

function caterpillar(b: Batch, M: THREE.Matrix4, r: () => number): void {
  // a padded soft-play caterpillar to climb on
  const n = 6;
  const cols = [C.mint, C.sun];
  for (let i = 0; i < n; i++) {
    const rad = 0.55 - i * 0.03;
    b.addIn(M, geo.sphere(rad, 16, 12), cols[i % 2], 0, rad * 0.95, -i * 0.8, 0, 0, 0, 1, 0.9, 0.85);
  }
  const hy = 1.05;
  b.addIn(M, geo.sphere(0.6, 18, 14), C.mint, 0, hy, 0.75);
  b.addIn(M, geo.sphere(0.12, 10, 8), C.white, -0.2, hy + 0.18, 1.27);
  b.addIn(M, geo.sphere(0.12, 10, 8), C.white, 0.2, hy + 0.18, 1.27);
  b.addIn(M, geo.sphere(0.06, 8, 6), C.navy, -0.2, hy + 0.18, 1.37);
  b.addIn(M, geo.sphere(0.06, 8, 6), C.navy, 0.2, hy + 0.18, 1.37);
  b.addIn(M, geo.torus(0.16, 0.035, 6, 12, Math.PI), C.navy, 0, hy - 0.08, 1.3, Math.PI, 0, 0);
  b.addIn(M, geo.sphere(0.1, 8, 6), C.coral, -0.36, hy - 0.02, 1.2);
  b.addIn(M, geo.sphere(0.1, 8, 6), C.coral, 0.36, hy - 0.02, 1.2);
  for (const sx of [-1, 1]) {
    b.addIn(M, geo.cyl(0.03, 0.03, 0.5, 6), C.navy, sx * 0.25, hy + 0.7, 0.6, 0, 0, -sx * 0.35);
    b.addIn(M, geo.sphere(0.1, 8, 6), C.coral, sx * 0.36, hy + 0.95, 0.6);
  }
  void r;
}

function trampoline(b: Batch, M: THREE.Matrix4): void {
  b.addIn(M, geo.cyl(1.5, 1.5, 0.12, 28), C.navy, 0, 0.42, 0);
  b.addIn(M, geo.torus(1.55, 0.16, 8, 28), C.blue, 0, 0.48, 0, Math.PI / 2);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.addIn(M, geo.cyl(0.06, 0.06, 0.45, 8), C.steel, Math.cos(a) * 1.45, 0.22, Math.sin(a) * 1.45);
  }
}

function mushroomStools(b: Batch, M: THREE.Matrix4, r: () => number): void {
  for (let i = 0; i < 4; i++) {
    const x = (r() - 0.5) * 2.4,
      z = (r() - 0.5) * 2.4,
      s = range(r, 0.8, 1.2);
    b.addIn(M, geo.cyl(0.2 * s, 0.24 * s, 0.5 * s, 12), C.cream, x, 0.25 * s, z);
    b.addIn(M, geo.sphere(0.45 * s, 16, 8), pick(r, [C.coral, C.sun, C.lilac]), x, 0.5 * s, z, 0, 0, 0, 1, 0.5, 1);
    b.addIn(M, geo.sphere(0.08 * s, 8, 6), C.white, x + 0.18 * s, 0.68 * s, z + 0.12 * s);
    b.addIn(M, geo.sphere(0.06 * s, 8, 6), C.white, x - 0.15 * s, 0.7 * s, z - 0.1 * s);
  }
}

function paddedColumn(b: Batch, M: THREE.Matrix4, col: number): void {
  b.addIn(M, geo.cyl(0.32, 0.32, ROOF_Y, 12), C.steel, 0, ROOF_Y / 2, 0);
  b.addIn(M, geo.cyl(0.5, 0.5, 2.2, 18), col, 0, 1.1, 0);
  b.addIn(M, geo.torus(0.5, 0.08, 6, 18), C.cream, 0, 2.2, 0, Math.PI / 2);
  b.addIn(M, geo.torus(0.5, 0.08, 6, 18), C.cream, 0, 0.05, 0, Math.PI / 2);
  b.addIn(M, geo.cyl(0.52, 0.52, 0.25, 18), C.cream, 0, 1.1, 0);
}

/** Multi-level play frame with a spiral tube slide and nets. Footprint ~6 x 6. */
function playFrame(b: Batch, M: THREE.Matrix4, r: () => number, slideCol: number): void {
  const s = 3.2; // tower width
  const levels = [2.2, 4.4];
  const postH = 6.4;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      b.addIn(M, geo.cyl(0.12, 0.12, postH, 10), C.steel, (sx * s) / 2, postH / 2, (sz * s) / 2);
      b.addIn(M, geo.cyl(0.2, 0.2, 1.4, 12), pick(r, [C.coral, C.sun, C.teal]), (sx * s) / 2, 0.7, (sz * s) / 2);
    }
  for (const y of levels) {
    b.addIn(M, rb(s + 0.2, 0.22, s + 0.2, 0.08), C.teal, 0, y, 0);
    // padded rails
    for (const sz of [-1, 1]) b.addIn(M, rb(s, 0.18, 0.18, 0.08), C.sun, 0, y + 0.95, (sz * s) / 2);
    for (const sx of [-1, 1]) b.addIn(M, rb(0.18, 0.18, s, 0.08), C.coral, (sx * s) / 2, y + 0.95, 0);
  }
  // cargo net panels (front side, facing the track at +x local)
  for (let i = 0; i <= 6; i++) {
    const zz = -s / 2 + (i * s) / 6;
    b.addIn(M, geo.cyl(0.025, 0.025, 2.1, 4), C.navy, s / 2 + 0.02, levels[0] + 1.05, zz);
  }
  for (let j = 0; j <= 5; j++) b.addIn(M, geo.cyl(0.025, 0.025, s, 4), C.navy, s / 2 + 0.02, levels[0] + 0.15 + j * 0.38, 0, Math.PI / 2);
  // roof: striped pyramid
  b.addIn(M, geo.cone(s * 0.82, 1.6, 4), C.coral, 0, postH + 0.75, 0, 0, Math.PI / 4);
  b.addIn(M, geo.sphere(0.25, 12, 8), C.sun, 0, postH + 1.65, 0);
  // spiral tube slide around a pole next to the tower
  const cx = 0,
    cz = s / 2 + 1.9;
  b.addIn(M, geo.cyl(0.14, 0.14, levels[1] + 0.6, 10), C.steel, cx, (levels[1] + 0.6) / 2, cz);
  b.addIn(M, helixTube(1.4, 0.62, levels[1] + 0.3, 0.75, 1.6, Math.PI * 1.5), slideCol, cx, 0, cz);
  // exit mat
  b.addIn(M, rb(1.8, 0.16, 1.4, 0.07), C.sun, cx + 1.4, 0.08, cz + 0.6);
  // a straight wavy drop slide down the other side
  const sl = 5.2;
  const ang = Math.atan2(levels[0], sl);
  b.addIn(M, rb(1.3, 0.14, Math.hypot(sl, levels[0]), 0.06), C.sky, 0, levels[0] / 2 + 0.05, -s / 2 - sl / 2, -ang, 0, 0);
  for (const sx of [-1, 1]) b.addIn(M, rb(0.14, 0.32, Math.hypot(sl, levels[0]), 0.06), C.blue, sx * 0.65, levels[0] / 2 + 0.22, -s / 2 - sl / 2, -ang, 0, 0);
}

/** Climbing cargo-net pyramid. */
function netPyramid(b: Batch, M: THREE.Matrix4): void {
  const R = 2.4,
    H = 4.2,
    n = 8;
  b.addIn(M, geo.cyl(0.1, 0.12, H, 8), C.steel, 0, H / 2, 0);
  b.addIn(M, geo.sphere(0.22, 12, 8), C.coral, 0, H + 0.1, 0);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * R,
      z = Math.sin(a) * R;
    const len = Math.hypot(R, H);
    const tilt = Math.atan2(R, H);
    const m = new THREE.Matrix4().makeRotationY(-a).multiply(new THREE.Matrix4().makeRotationZ(tilt));
    const p = new THREE.Matrix4().makeTranslation(x / 2, H / 2, z / 2).multiply(m);
    b.addMatrix(geo.cyl(0.03, 0.03, len, 4), C.navy, M.clone().multiply(p));
    b.addIn(M, geo.sphere(0.14, 8, 6), C.sun, x, 0.08, z);
  }
  for (let k = 1; k <= 4; k++) {
    const y = (k / 5) * H;
    const rr = R * (1 - y / H);
    b.addIn(M, geo.torus(rr, 0.03, 4, 16), C.navy, 0, y, 0, Math.PI / 2);
  }
  b.addIn(M, geo.cyl(R + 0.5, R + 0.5, 0.1, 24), C.sky, 0, 0.05, 0);
}

/** Shoe cubbies + bench against the wall. */
function cubbies(b: Batch, M: THREE.Matrix4, r: () => number): void {
  const w = 4.2,
    h = 1.5,
    d = 0.6;
  b.addIn(M, rb(w, h, d, 0.05), C.cream, 0, h / 2, 0);
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 3; j++) {
      const x = -w / 2 + 0.36 + i * 0.7,
        y = 0.25 + j * 0.45;
      b.addIn(M, geo.box(0.6, 0.36, 0.06), pick(r, [0xe9d8c0, 0xdccbb2]), x, y, d / 2 - 0.02);
      if (r() < 0.75) {
        const sc = pick(r, SOFT);
        b.addIn(M, geo.capsule(0.07, 0.14, 4), sc, x - 0.1, y - 0.08, d / 2 + 0.02, 0, 0, Math.PI / 2);
        b.addIn(M, geo.capsule(0.07, 0.14, 4), sc, x + 0.1, y - 0.08, d / 2 + 0.02, 0, 0, Math.PI / 2);
      }
    }
  b.addIn(M, rb(w, 0.12, 0.6, 0.05), PAL.wood, 0, 0.45, 0.9);
  b.addIn(M, rb(0.12, 0.45, 0.5, 0.04), C.steel, -w / 2 + 0.3, 0.22, 0.9);
  b.addIn(M, rb(0.12, 0.45, 0.5, 0.04), C.steel, w / 2 - 0.3, 0.22, 0.9);
}

// ------------------------------------------------------------------ obstacle builders
function lowObstacle(req: ObstacleRequest): ObstacleVisual {
  const w = req.laneSpan * LANE_WIDTH,
    h = Math.min(req.height, 0.9),
    L = Math.max(0.6, req.length);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const b = new Batch();
  const I = new THREE.Matrix4();
  const r = req.rng;
  const v = Math.floor(r() * 3);
  if (v === 0) {
    // row of soft foam blocks with emblems
    const n = req.laneSpan * 2;
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + bw * (i + 0.5);
      const col = SOFT[(i + Math.floor(r() * 5)) % SOFT.length];
      b.addIn(I, geo.rbox(bw - 0.06, h, L, 0.12), col, x, h / 2, 0);
      emblem(b, I, (i + 1) % 4, x, h / 2, L / 2 + 0.02, Math.min(bw, h) * 0.26, C.cream);
    }
  } else if (v === 1) {
    // striped bolster roll lying across the lanes
    const rad = Math.min(h / 2, L / 2, 0.45);
    const bands = req.laneSpan * 3;
    const bw = (w - rad) / bands;
    for (let i = 0; i < bands; i++) b.addIn(I, geo.cyl(rad, rad, bw, 18), i % 2 ? C.cream : pick(r, [C.coral, C.sky, C.teal]), -w / 2 + rad / 2 + bw * (i + 0.5), rad, 0, 0, 0, Math.PI / 2);
    b.addIn(I, geo.sphere(rad, 18, 12), C.sun, -w / 2 + rad / 2, rad, 0, 0, 0, 0, 0.5, 1, 1);
    b.addIn(I, geo.sphere(rad, 18, 12), C.sun, w / 2 - rad / 2, rad, 0, 0, 0, 0, 0.5, 1, 1);
    // small feet keep it from rolling
    for (const x of laneOffsets(req.laneSpan)) b.addIn(I, wedgeGeo(0.5, 0.18, 0.5), C.navy, x, 0, rad * 0.9, 0, 0, 0);
  } else {
    // mini ball-pit box: jump over the balls
    const t = Math.min(0.26, L / 4);
    const col = pick(r, [C.teal, C.blue, C.lilac]);
    const rh = h * 0.78;
    b.addIn(I, geo.rbox(w, rh, t, 0.08), col, 0, rh / 2, L / 2 - t / 2);
    b.addIn(I, geo.rbox(w, rh, t, 0.08), col, 0, rh / 2, -L / 2 + t / 2);
    b.addIn(I, geo.rbox(t, rh, L - 2 * t, 0.08), col, -w / 2 + t / 2, rh / 2, 0);
    b.addIn(I, geo.rbox(t, rh, L - 2 * t, 0.08), col, w / 2 - t / 2, rh / 2, 0);
    b.addIn(I, geo.box(w - 2 * t, h * 0.5, L - 2 * t), col, 0, h * 0.25, 0);
    const rr = 0.15;
    const nx = Math.max(1, Math.floor((w - 2 * t) / (rr * 1.9)));
    const nz = Math.max(1, Math.floor((L - 2 * t) / (rr * 1.9)));
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const x = -w / 2 + t + (w - 2 * t) * ((i + 0.5) / nx);
        const z = -L / 2 + t + (L - 2 * t) * ((j + 0.5) / nz);
        b.addIn(I, ballGeo(rr), pick(r, BALLS), x, h - rr - r() * 0.05, z);
        if (j === 0 && r() < 0.5) b.addIn(I, ballGeo(rr), pick(r, BALLS), x + rr, h - rr * 2.2, z + rr * 0.6);
      }
  }
  b.into(body);
  root.add(blobShadow(w * 1.05, L * 1.6, 0.22));
  return visual(root, body);
}

function highObstacle(req: ObstacleRequest): ObstacleVisual {
  const w = req.laneSpan * LANE_WIDTH,
    top = Math.max(2.2, req.height),
    L = Math.max(0.8, req.length);
  const bottom = 1.12;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const b = new Batch();
  const I = new THREE.Matrix4();
  const r = req.rng;
  const postX = w / 2 + 0.42;
  const postCol = pick(r, [C.teal, C.blue]);
  for (const sx of [-1, 1]) {
    b.addIn(I, geo.cyl(0.28, 0.3, top + 0.1, 16), postCol, sx * postX, (top + 0.1) / 2, 0);
    b.addIn(I, geo.sphere(0.33, 16, 10), C.sun, sx * postX, top + 0.16, 0);
    b.addIn(I, geo.torus(0.3, 0.06, 6, 16), C.cream, sx * postX, 0.5, 0, Math.PI / 2);
    b.addIn(I, geo.torus(0.3, 0.06, 6, 16), C.cream, sx * postX, bottom, 0, Math.PI / 2);
  }
  const v = Math.floor(r() * 2);
  const beamH = top - bottom;
  if (v === 0) {
    // crawl-tunnel lintel: padded beam with a rounded tunnel roof on top
    b.addIn(I, geo.rbox(w + 0.5, beamH * 0.62, L, 0.14), C.coral, 0, bottom + beamH * 0.31, 0);
    b.addIn(I, geo.rbox(w + 0.52, 0.16, L + 0.04, 0.07), C.sun, 0, bottom + beamH * 0.31, 0);
    const rr = Math.min(beamH * 0.38, L / 2);
    // tunnel roof: half cylinder lying across X
    b.addIn(I, cached(`hcyl${rr},${w}`, () => new THREE.CylinderGeometry(rr, rr, w + 0.3, 20, 1, false, -Math.PI / 2, Math.PI)), C.mint, 0, bottom + beamH * 0.62, 0, 0, 0, Math.PI / 2, 1, 1, L / (2 * rr));
    // friendly shapes on the face
    const n = req.laneSpan;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w / n) * (i + 0.5);
      emblem(b, I, i % 4, x, bottom + beamH * 0.31, L / 2 + 0.03, Math.min(0.24, beamH * 0.2), C.cream);
    }
  } else {
    // big candy-striped padded roll on two posts
    const rad = Math.min(beamH / 2, 0.75);
    const bands = req.laneSpan * 4;
    const bw = (w + 0.3) / bands;
    for (let i = 0; i < bands; i++) b.addIn(I, geo.cyl(rad, rad, bw, 20), i % 2 ? C.cream : C.lilac, -(w + 0.3) / 2 + bw * (i + 0.5), bottom + rad, 0, 0, 0, Math.PI / 2, 1, 1, L > rad * 2 ? 1 : 1);
    // pompoms on top
    for (let i = 0; i < req.laneSpan * 3; i++) b.addIn(I, geo.sphere(0.16, 10, 8), SOFT[i % SOFT.length], -w / 2 + (w / (req.laneSpan * 3)) * (i + 0.5), bottom + rad * 2 + 0.1, 0);
    // top up to required height if needed
    if (bottom + rad * 2 + 0.26 < top) b.addIn(I, geo.rbox(w + 0.3, top - (bottom + rad * 2), 0.3, 0.1), C.teal, 0, (top + bottom + rad * 2) / 2, 0);
  }
  b.into(body);
  for (const sx of [-1, 1]) {
    const s = blobShadow(0.9, 0.9, 0.25);
    s.position.x = sx * postX;
    root.add(s);
  }
  return visual(root, body);
}

function blockObstacle(req: ObstacleRequest): ObstacleVisual {
  const h = Math.min(3.2, Math.max(2.4, req.height)),
    L = Math.max(1, req.length);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const b = new Batch();
  const I = new THREE.Matrix4();
  const r = req.rng;
  const v = Math.floor(r() * 2);
  const offs = laneOffsets(req.laneSpan);
  offs.forEach((x, i) => {
    if (v === 0) {
      // stacked giant foam cubes
      const h1 = h * 0.55,
        h2 = h - h1;
      const c1 = SOFT[(i * 2 + Math.floor(r() * 5)) % 5],
        c2 = SOFT[(i * 2 + 2 + Math.floor(r() * 3)) % 5];
      b.addIn(I, geo.rbox(2.0, h1, L, 0.16), c1, x, h1 / 2, 0);
      const tw = 1.7,
        rot = (r() - 0.5) * 0.24;
      b.addIn(I, geo.rbox(tw, h2, Math.min(L, 1.7), 0.16), c2, x + (r() - 0.5) * 0.12, h1 + h2 / 2, 0, 0, rot);
      emblem(b, I, (i + 1) % 4, x, h1 / 2, L / 2 + 0.03, 0.36, C.cream);
      emblem(b, I, i % 4, x, h1 + h2 / 2, Math.min(L, 1.7) / 2 + 0.03, 0.26, C.cream);
    } else {
      // padded pillar: chunky striped cylinder with a dome
      const rad = 0.95;
      const nb = 4;
      for (let k = 0; k < nb; k++) b.addIn(I, geo.cyl(rad, rad, (h - rad * 0.5) / nb - 0.02, 24), k % 2 ? C.cream : SOFT[(i + 1) % 5], x, ((h - rad * 0.5) / nb) * (k + 0.5), 0, 0, 0, 0, 1, 1, L / (rad * 2) < 1 ? L / (rad * 2) : 1);
      b.addIn(I, geo.sphere(rad, 24, 12), C.sun, x, h - rad * 0.5, 0, 0, 0, 0, 1, 0.5, L / (rad * 2) < 1 ? L / (rad * 2) : 1);
    }
  });
  b.into(body);
  root.add(blobShadow(req.laneSpan * LANE_WIDTH * 1.05, L * 1.5, 0.3));
  return visual(root, body);
}

function platformObstacle(req: ObstacleRequest): ObstacleVisual {
  const w = req.laneSpan * LANE_WIDTH - 0.04,
    L = Math.max(4, req.length),
    T = 2.0;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const b = new Batch();
  const I = new THREE.Matrix4();
  const r = req.rng;
  const side = pick(r, [C.teal, C.blue]);
  b.addIn(I, geo.rbox(w, T - 0.08, L, 0.1), side, 0, (T - 0.08) / 2, 0);
  // top mats (exactly y = 2.0)
  const nz = Math.max(1, Math.round(L / 2.2));
  const tl = L / nz;
  laneOffsets(req.laneSpan).forEach((x, i) => {
    for (let k = 0; k < nz; k++) b.addIn(I, geo.rbox(2.14, 0.1, tl - 0.05, 0.04, 1), (i + k) % 2 ? C.sun : C.mint, x, T - 0.05, L / 2 - tl * (k + 0.5));
  });
  // front face: padded panel with portholes
  for (const x of laneOffsets(req.laneSpan)) {
    b.addIn(I, geo.rbox(2.0, 1.7, 0.12, 0.08), C.coral, x, 1.0, L / 2 + 0.02);
    b.addIn(I, geo.cyl(0.42, 0.42, 0.08, 24), C.cream, x, 1.05, L / 2 + 0.1, Math.PI / 2);
    b.addIn(I, geo.cyl(0.3, 0.3, 0.1, 24), C.navy, x, 1.05, L / 2 + 0.11, Math.PI / 2);
    for (let i = 0; i < 3; i++) b.addIn(I, ballGeo(0.1), BALLS[i], x - 0.12 + i * 0.12, 0.9 + (i % 2) * 0.12, L / 2 + 0.14);
  }
  // side panels, alternating soft colours
  const np = Math.max(1, Math.round(L / 2));
  for (let k = 0; k < np; k++) {
    const z = L / 2 - (L / np) * (k + 0.5);
    for (const sx of [-1, 1]) b.addIn(I, geo.rbox(0.08, 1.5, L / np - 0.2, 0.04, 1), k % 2 ? C.lilac : C.sky, sx * (w / 2 + 0.03), 1.0, z);
  }
  b.into(body);
  root.add(blobShadow(w * 1.1, L + 1.5, 0.28));
  return visual(root, body);
}

function rampObstacle(req: ObstacleRequest): ObstacleVisual {
  const w = req.laneSpan * LANE_WIDTH - 0.04,
    L = Math.max(3, req.length),
    T = 2.0;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const b = new Batch();
  const I = new THREE.Matrix4();
  const r = req.rng;
  b.addIn(I, wedgeGeo(w, T, L), pick(r, [C.sky, C.mint]), 0, 0, 0);
  // stripes across the slope
  const ang = Math.atan2(T, L);
  const n = Math.max(2, Math.round(L / 1.6));
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n; // 0 front .. 1 back
    const z = L / 2 - u * L;
    const y = u * T;
    b.addIn(I, geo.box(w - 0.5, 0.04, 0.42), k % 2 ? C.cream : C.sun, 0, y + 0.005, z, ang, 0, 0);
  }
  // soft side bolsters along the slope edges
  const hyp = Math.hypot(L, T);
  for (const sx of [-1, 1]) b.addIn(I, geo.cyl(0.1, 0.1, hyp, 10), C.coral, sx * (w / 2 - 0.07), T / 2 + 0.1, 0, Math.PI / 2 - ang, 0, 0);
  b.into(body);
  root.add(blobShadow(w * 1.1, L, 0.2));
  return visual(root, body);
}

function moverBlockObstacle(req: ObstacleRequest): ObstacleVisual {
  // big soft-play roller cylinder rolling across the lanes
  const R = 0.86,
    D = Math.min(1.5, Math.max(0.9, req.length));
  const root = new THREE.Group();
  const body = new THREE.Group();
  const roll = new THREE.Group();
  root.add(body);
  body.add(roll);
  roll.position.y = R;
  const b = new Batch();
  const I = new THREE.Matrix4();
  const r = req.rng;
  const cols = pick(r, [
    [C.coral, C.sun],
    [C.sky, C.cream],
    [C.mint, C.lilac],
  ]);
  for (let i = 0; i < 4; i++) b.addIn(I, quarterCyl(R, D, i), cols[i % 2], 0, 0, 0, Math.PI / 2, 0, 0);
  for (const sz of [-1, 1]) {
    b.addIn(I, geo.torus(R - 0.06, 0.08, 8, 28), C.cream, 0, 0, (sz * D) / 2, 0, 0, 0);
    b.addIn(I, geo.cyl(0.22, 0.22, 0.06, 16), C.navy, 0, 0, (sz * D) / 2 + sz * 0.02, Math.PI / 2);
  }
  b.into(roll);
  root.add(blobShadow(1.9, D + 0.6, 0.3));
  return visual(root, body, (_t, _dt, _d, moved) => {
    roll.rotation.z -= moved / R;
  });
}

function moverLowObstacle(req: ObstacleRequest): ObstacleVisual {
  // a big beach-ball style soft play ball rolling across
  const R = 0.37;
  const root = new THREE.Group();
  const body = new THREE.Group();
  const roll = new THREE.Group();
  root.add(body);
  body.add(roll);
  roll.position.y = R;
  const b = new Batch();
  const I = new THREE.Matrix4();
  const r = req.rng;
  const seq = pick(r, [
    [C.coral, C.white, C.sun, C.white, C.sky, C.white],
    [C.mint, C.white, C.lilac, C.white, C.sun, C.white],
  ]);
  for (let i = 0; i < 6; i++) b.addIn(I, sphereWedge(R, (i * Math.PI) / 3, Math.PI / 3, 4, 12), seq[i], 0, 0, 0, Math.PI / 2, 0, 0);
  b.into(roll);
  root.add(blobShadow(0.9, 0.9, 0.3));
  return visual(root, body, (t, _dt, _d, moved) => {
    roll.rotation.z -= moved / R;
    roll.position.y = R + Math.abs(Math.sin(t * 5.5)) * 0.03;
  });
}

// ------------------------------------------------------------------ patterns
const PATTERNS: StagePattern[] = [
  { id: 'in-foam-hops', difficulty: 1, length: 32, items: [
    { dz: 4, lane: 0, kind: 'low', laneSpan: 3, height: 0.6 },
    { dz: 18, lane: 0, kind: 'low', laneSpan: 3, height: 0.75 },
    { dz: 30, lane: -1, kind: 'low', laneSpan: 2, height: 0.8 },
  ] },
  { id: 'in-crawl-tunnel', difficulty: 1, length: 28, items: [
    { dz: 4, lane: 0, kind: 'high', laneSpan: 3, height: 2.5 },
    { dz: 17, lane: -1, kind: 'block', height: 2.8 },
    { dz: 17, lane: 1, kind: 'block', height: 2.6 },
  ] },
  { id: 'in-soft-slalom', difficulty: 1, length: 38, items: [
    { dz: 4, lane: -1, kind: 'block', height: 2.8 },
    { dz: 16, lane: 1, kind: 'block', height: 3.0 },
    { dz: 28, lane: -1, kind: 'block', laneSpan: 2, height: 2.6 },
  ] },
  { id: 'in-ball-pit-row', difficulty: 2, length: 34, items: [
    { dz: 4, lane: -1, kind: 'low', height: 0.7 },
    { dz: 4, lane: 0, kind: 'block', height: 2.8 },
    { dz: 4, lane: 1, kind: 'low', height: 0.7 },
    { dz: 17, lane: 0, kind: 'high', laneSpan: 3, height: 2.4 },
    { dz: 30, lane: -1, kind: 'block', laneSpan: 2, height: 2.6 },
  ] },
  { id: 'in-deck-run', difficulty: 2, length: 44, items: [
    { dz: 4, lane: 0, kind: 'ramp', length: 8 },
    { dz: 18, lane: 0, kind: 'platform', length: 20 },
    { dz: 12, lane: -1, kind: 'block', height: 2.6 },
    { dz: 24, lane: 1, kind: 'block', height: 3.0 },
    { dz: 40, lane: 0, kind: 'low', laneSpan: 3, height: 0.6 },
  ] },
  { id: 'in-rollers', difficulty: 2, length: 32, items: [
    { dz: 4, lane: -1, kind: 'moverBlock', dir: 1 },
    { dz: 18, lane: 1, kind: 'moverLow', dir: -1 },
    { dz: 30, lane: 0, kind: 'low', laneSpan: 1, height: 0.7 },
  ] },
  { id: 'in-tunnel-steps', difficulty: 2, length: 32, items: [
    { dz: 4, lane: -1, kind: 'high', laneSpan: 2, height: 2.4 },
    { dz: 4, lane: 1, kind: 'low', height: 0.6 },
    { dz: 16, lane: 0, kind: 'block', height: 2.8 },
    { dz: 29, lane: 0, kind: 'low', laneSpan: 3, height: 0.7 },
  ] },
  { id: 'in-double-deck', difficulty: 3, length: 54, items: [
    { dz: 4, lane: -1, kind: 'ramp', length: 8 },
    { dz: 20, lane: -1, kind: 'platform', length: 24 },
    { dz: 16, lane: 0, kind: 'block', height: 2.8 },
    { dz: 30, lane: 1, kind: 'ramp', length: 8 },
    { dz: 42, lane: 1, kind: 'platform', length: 16 },
    { dz: 42, lane: 0, kind: 'low', height: 0.7 },
  ] },
  { id: 'in-roll-zigzag', difficulty: 3, length: 40, items: [
    { dz: 4, lane: 0, kind: 'moverBlock', dir: 1 },
    { dz: 15, lane: -1, kind: 'block', height: 3.0 },
    { dz: 15, lane: 1, kind: 'high', height: 2.4 },
    { dz: 27, lane: 1, kind: 'moverLow', dir: -1 },
    { dz: 38, lane: 0, kind: 'high', laneSpan: 3, height: 2.5 },
  ] },
  { id: 'in-soft-gauntlet', difficulty: 3, length: 50, items: [
    { dz: 4, lane: 0, kind: 'low', laneSpan: 3, height: 0.6 },
    { dz: 14, lane: 0, kind: 'high', laneSpan: 3, height: 2.4 },
    { dz: 24, lane: -1, kind: 'block', height: 2.8 },
    { dz: 24, lane: 1, kind: 'block', height: 2.8 },
    { dz: 35, lane: 0, kind: 'high', height: 2.4 },
    { dz: 35, lane: -1, kind: 'block', height: 2.6 },
    { dz: 35, lane: 1, kind: 'block', height: 2.6 },
    { dz: 47, lane: 0, kind: 'low', laneSpan: 3, height: 0.75 },
  ] },
  { id: 'in-caterpillar-slide', difficulty: 1, length: 26, items: [
    { dz: 4, lane: 1, kind: 'ramp', length: 8 },
    { dz: 14, lane: 1, kind: 'platform', length: 12 },
    { dz: 14, lane: -1, kind: 'low', height: 0.6 },
  ] },
  { id: 'in-pit-mix', difficulty: 2, length: 32, items: [
    { dz: 4, lane: 0, kind: 'low', height: 0.75 },
    { dz: 4, lane: -1, kind: 'block', height: 2.6 },
    { dz: 16, lane: 1, kind: 'moverLow', dir: -1 },
    { dz: 29, lane: 0, kind: 'high', laneSpan: 3, height: 2.5 },
  ] },
];

// ------------------------------------------------------------------ the stage
export function createIndoorStage(): StageModule {
  const group = new THREE.Group();
  group.name = 'indoor-stage';
  const anims = new DecorAnims();
  let quality: 'low' | 'high' = 'high';
  let scene: THREE.Scene | null = null;
  let prevBg: THREE.Scene['background'] = null;
  let prevFog: THREE.Fog | THREE.FogExp2 | null = null;

  const trackMat = () => texMat('indoor-track', trackTexture, { repeat: true, rough: 0.9 });
  const sideMat = () => texMat('indoor-side', sideFloorTexture, { repeat: true, rough: 0.8 });
  const wallMat = () => texMat('indoor-wall', wallTexture, { repeat: true, rough: 0.95 });

  // ball pits seen in decor (world x, z) for the burst surprise
  const pits: { x: number; z: number; w: number }[] = [];

  // ---- ambient: balls bursting out of ball pits + balloons drifting up
  const NB = 24;
  const balls = new THREE.InstancedMesh(ballGeo(0.16), keep(new THREE.MeshStandardMaterial({ roughness: 0.55 })), NB);
  balls.frustumCulled = false;
  const bp = new Float32Array(NB * 3),
    bv = new Float32Array(NB * 3),
    bl = new Float32Array(NB);
  const NBL = 7;
  const balloons = new THREE.InstancedMesh(geo.sphere(0.32, 14, 12), keep(new THREE.MeshStandardMaterial({ roughness: 0.35 })), NBL);
  const strings = new THREE.InstancedMesh(geo.cyl(0.008, 0.008, 1.2, 3), keep(new THREE.MeshBasicMaterial({ color: 0xffffff })), NBL);
  balloons.frustumCulled = strings.frustumCulled = false;
  const blp = new Float32Array(NBL * 3),
    blPhase = new Float32Array(NBL);
  const dummy = new THREE.Object3D();
  const tmpC = new THREE.Color();
  {
    for (let i = 0; i < NB; i++) balls.setColorAt(i, tmpC.setHex(BALLS[i % BALLS.length]));
    for (let i = 0; i < NBL; i++) balloons.setColorAt(i, tmpC.setHex([C.coral, C.sun, C.sky, C.mint, C.lilac, C.coral, C.sun][i]));
    group.add(balls, balloons, strings);
  }
  let nextBurst = 1.5;

  function burst(px: number, pz: number, w: number): void {
    let n = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < NB && n > 0; i++) {
      if (bl[i] > 0) continue;
      n--;
      bp[i * 3] = px + (Math.random() - 0.5) * w * 0.5;
      bp[i * 3 + 1] = 0.7;
      bp[i * 3 + 2] = pz + (Math.random() - 0.5) * 2;
      const towardTrack = -Math.sign(px);
      bv[i * 3] = (Math.random() * 1.6 + 0.4) * towardTrack;
      bv[i * 3 + 1] = 4.5 + Math.random() * 2.5;
      bv[i * 3 + 2] = (Math.random() - 0.5) * 2.5;
      bl[i] = 4 + Math.random() * 2;
    }
  }

  function stepBalls(dt: number): void {
    for (let i = 0; i < NB; i++) {
      if (bl[i] <= 0) {
        dummy.position.set(0, -10, 0);
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        balls.setMatrixAt(i, dummy.matrix);
        continue;
      }
      bl[i] -= dt;
      const k = i * 3;
      bv[k + 1] -= 9.8 * dt;
      bp[k] += bv[k] * dt;
      bp[k + 1] += bv[k + 1] * dt;
      bp[k + 2] += bv[k + 2] * dt;
      if (bp[k + 1] < 0.16) {
        bp[k + 1] = 0.16;
        bv[k + 1] = Math.abs(bv[k + 1]) * 0.55;
        bv[k] *= 0.8;
        bv[k + 2] *= 0.8;
      }
      // never roll onto the lanes: bounce off the edge bolsters
      if (Math.abs(bp[k]) < 4.45) {
        bp[k] = Math.sign(bp[k] || 1) * 4.45;
        bv[k] = -bv[k] * 0.6;
      }
      dummy.position.set(bp[k], bp[k + 1], bp[k + 2]);
      dummy.scale.setScalar(Math.min(1, bl[i] * 2));
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      balls.setMatrixAt(i, dummy.matrix);
    }
    balls.instanceMatrix.needsUpdate = true;
  }

  function stepBalloons(t: number, dt: number, pz: number): void {
    for (let i = 0; i < NBL; i++) {
      const k = i * 3;
      const rel = blp[k + 2] - pz;
      if (blp[k + 1] === 0 || blp[k + 1] > ROOF_Y - 0.6 || rel > 12) {
        // respawn ahead at a side, low
        const side = i % 2 ? 1 : -1;
        blp[k] = side * (5 + Math.random() * 9);
        blp[k + 1] = 1.2 + Math.random() * 2;
        blp[k + 2] = pz - 25 - Math.random() * 60;
        blPhase[i] = Math.random() * 6;
      }
      blp[k + 1] += dt * (0.45 + (i % 3) * 0.12);
      const sway = Math.sin(t * 0.9 + blPhase[i]) * 0.3;
      dummy.position.set(blp[k] + sway, blp[k + 1], blp[k + 2]);
      dummy.rotation.set(0, 0, sway * 0.2);
      dummy.scale.set(1, 1.15, 1);
      dummy.updateMatrix();
      balloons.setMatrixAt(i, dummy.matrix);
      dummy.position.set(blp[k] + sway * 0.8, blp[k + 1] - 0.95, blp[k + 2]);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      strings.setMatrixAt(i, dummy.matrix);
    }
    balloons.instanceMatrix.needsUpdate = true;
    strings.instanceMatrix.needsUpdate = true;
  }

  // ---- decor
  function wallsMesh(d0: number, d1: number): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    const za = -d0,
      zb = -d1,
      H = ROOF_Y;
    const u0 = d0 / 40,
      u1 = d1 / 40;
    // left wall (faces +x), right wall (faces -x)
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-WALL_X, 0, za, -WALL_X, 0, zb, -WALL_X, H, zb, -WALL_X, H, za, WALL_X, 0, zb, WALL_X, 0, za, WALL_X, H, za, WALL_X, H, zb], 3),
    );
    g.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, 0, u1, 0, u1, 1, u0, 1, u1, 0, u0, 0, u0, 1, u1, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    const m = new THREE.Mesh(g, wallMat());
    m.matrixAutoUpdate = false;
    return m;
  }

  function buildDecor(req: DecorRequest): THREE.Object3D {
    const { d0, d1, rng: r } = req;
    const root = new THREE.Group();
    root.name = `indoor-decor-${d0}`;
    root.add(floorStrip(d0, d1, -3.6, 3.6, trackMat(), 4.4));
    const side = floorStrip(d0, d1, -WALL_X, WALL_X, sideMat(), 4, -0.01, (WALL_X * 2) / 4);
    root.add(side);
    root.add(wallsMesh(d0, d1));

    const b = new Batch();
    const glow = new Batch();
    const I = new THREE.Matrix4();
    const len = d1 - d0;
    const q = quality === 'low' ? 0.4 : 0.72;
    let pitCount = 0;

    // edge bolsters along the track (outside |x| 3.6)
    const segL = 4.4;
    for (let z = d0; z < d1 - 0.01; z += segL) {
      const k = Math.round(z / segL);
      for (const sx of [-1, 1]) b.addIn(I, geo.rbox(0.5, 0.42, segL - 0.06, 0.18, 2), k % 2 ? C.teal : C.lilac, sx * 3.88, 0.21, -(z + segL / 2));
    }

    // ceiling, trusses, skylights, bunting, lamps
    glow.addIn(I, geo.box(WALL_X * 2, 0.2, len), 0xe8ddcc, 0, ROOF_Y + 0.1, -(d0 + len / 2));
    for (let z = Math.ceil(d0 / 10) * 10; z < d1; z += 10) {
      b.addIn(I, geo.box(WALL_X * 2, 0.22, 0.22), C.steel, 0, ROOF_Y - 0.15, -z);
      b.addIn(I, geo.box(WALL_X * 2, 0.16, 0.16), C.steel, 0, ROOF_Y - 1.4, -z);
      for (let x = -WALL_X + 2; x <= WALL_X - 2; x += 4) b.addIn(I, geo.box(0.1, 1.3, 0.1), C.steel, x, ROOF_Y - 0.78, -z, 0, 0, ((x / 4) % 2 ? 1 : -1) * 0.5);
      // pendant lamps
      for (const x of [-7, 7]) {
        b.addIn(I, geo.cyl(0.02, 0.02, 2.6, 4), C.steel, x, ROOF_Y - 2.7, -z - 5);
        b.addIn(I, geo.cone(0.6, 0.45, 18), C.sun, x, ROOF_Y - 4.1, -z - 5);
        glow.addIn(I, geo.circle(0.45, 16), 0xfff6d8, x, ROOF_Y - 4.34, -z - 5, Math.PI / 2);
      }
    }
    for (const x of [-11, 0, 11]) glow.addIn(I, geo.box(3.2, 0.05, len - 0.6), 0xf3fbff, x, ROOF_Y - 0.01, -(d0 + len / 2));
    // bunting: sagging strings of pennants crossing over the track
    for (let s = 0; s < 2; s++) {
      const zc = -(d0 + 10 + s * 20);
      const y0 = 8.2 + s * 0.6;
      const cols = [C.coral, C.sun, C.mint, C.sky, C.lilac];
      let i = 0;
      for (let x = -WALL_X + 1; x <= WALL_X - 1; x += 0.7) {
        const sag = 1.4 * (1 - (x / WALL_X) ** 2);
        const y = y0 + 1.6 - sag;
        b.addIn(I, pennantGeo(0.55, 0.6), cols[i++ % cols.length], x, y, zc);
        b.addIn(I, geo.box(0.72, 0.025, 0.025), 0xffffff, x + 0.35, y + 0.01, zc, 0, 0, -((2 * 1.4 * x) / (WALL_X * WALL_X)) * 0.9);
      }
    }

    // structural padded columns
    for (let z = Math.ceil(d0 / 20) * 20 + 6; z < d1; z += 20) for (const sx of [-1, 1]) paddedColumn(b, frameM(sx * 11.5, 0, -z), sx > 0 ? C.coral : C.sun);

    // side play features: two rows per side
    for (const sx of [-1, 1]) {
      // near row (|x| 5..10)
      let z = d0 + 1 + r() * 3;
      while (z < d1 - 3) {
        const kind = r();
        const x = sx * range(r, 6.2, 8.4);
        if (kind < 0.3 && pitCount < 2) {
          pitCount++;
          const w = range(r, 3.2, 4.2),
            d = range(r, 4, 5.6);
          if (z + d > d1) break;
          const M = frameM(sx * (4.6 + w / 2 + r() * 0.8), 0, -(z + d / 2));
          ballPit(b, M, w, d, r, q);
          pits.push({ x: sx * (4.6 + w / 2), z: -(z + d / 2), w });
          z += d + range(r, 2, 4);
        } else if (kind < 0.52) {
          foamBlocks(b, frameM(x, 0, -(z + 1.5), r() * Math.PI), r);
          z += 5 + r() * 2;
        } else if (kind < 0.6) {
          caterpillar(b, frameM(sx * 9.2, 0, -(z + 3), sx > 0 ? -Math.PI * 0.7 : Math.PI * 0.7, 0.85), r);
          z += 7;
        } else if (kind < 0.8) {
          trampoline(b, frameM(sx * 7, 0, -(z + 2)));
          z += 5;
        } else {
          mushroomStools(b, frameM(x, 0, -(z + 1.5)), r);
          z += 5;
        }
      }
      // back row (|x| 12..20): big structures
      let zb = d0 + r() * 4;
      while (zb < d1 - 4) {
        const kind = r();
        if (kind < 0.5) {
          const M = frameM(sx * range(r, 15, 17), 0, -(zb + 4), sx > 0 ? Math.PI : 0);
          playFrame(b, M, r, pick(r, [C.sun, C.sky, C.coral]));
          zb += 13;
        } else if (kind < 0.78) {
          netPyramid(b, frameM(sx * range(r, 14, 16), 0, -(zb + 3)));
          zb += 8;
        } else {
          cubbies(b, frameM(sx * (WALL_X - 0.5), 0, -(zb + 2.5), sx > 0 ? -Math.PI / 2 : Math.PI / 2), r);
          zb += 7;
        }
      }
    }

    b.into(root, vcMat(0.72));
    glow.into(root, vcGlow());

    // a big slow ceiling fan
    const fan = new THREE.Group();
    const fb = new Batch();
    fb.add(geo.cyl(0.35, 0.35, 0.3, 16), C.steel, 0, 0, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      fb.add(geo.rbox(3.4, 0.05, 0.42, 0.02, 2), 0xdfe6ee, Math.cos(a) * 1.9, -0.05, Math.sin(a) * 1.9, 0, -a, 0.05);
    }
    const fanMesh = new THREE.Mesh(fb.geometry(), vcMat(0.6));
    fan.add(fanMesh);
    fan.position.set((r() < 0.5 ? -1 : 1) * range(r, 4, 9), ROOF_Y - 1.8, -(d0 + len * 0.5));
    root.add(fan);
    anims.add(root, fan.position.z, (_t, dt) => {
      fan.rotation.y += dt * 0.9;
    });

    // keep the pit list short
    while (pits.length > 24) pits.shift();
    return root;
  }

  return {
    id: 'indoor',
    name: 'Indoor Playground',
    length: 1300,
    music: 'mus_indoor',
    sections: [{ id: 'indoor', label: 'Indoor Playground', start: 0 }],
    sprinkleSfx: ['ball_pit_rustle', 'foam_squish', 'tube_slide_whee'],
    patterns: PATTERNS,
    build(ctx: StageBuildContext) {
      scene = ctx.scene;
      quality = ctx.quality;
      prevBg = scene.background;
      prevFog = scene.fog;
      const fogCol = 0xf5e9d8;
      scene.background = new THREE.Color(fogCol);
      scene.fog = new THREE.Fog(fogCol, 28, 105);
      const hemi = new THREE.HemisphereLight(0xfff8ee, 0xd9c4a6, 1.7);
      const sun = new THREE.DirectionalLight(0xfff1dc, 1.7);
      sun.position.set(-6, 14, 8);
      const fill = new THREE.DirectionalLight(0xdcecff, 0.5);
      fill.position.set(8, 6, -10);
      group.add(hemi, sun, sun.target, fill);
      scene.add(group);
    },
    buildDecor,
    makeObstacle(req: ObstacleRequest): ObstacleVisual {
      switch (req.kind) {
        case 'low':
          return lowObstacle(req);
        case 'high':
          return highObstacle(req);
        case 'block':
          return blockObstacle(req);
        case 'platform':
          return platformObstacle(req);
        case 'ramp':
          return rampObstacle(req);
        case 'moverBlock':
          return moverBlockObstacle(req);
        case 'moverLow':
        default:
          return moverLowObstacle(req);
      }
    },
    update(time, dt, _dist, playerPos) {
      anims.run(time, dt, playerPos.z);
      nextBurst -= dt;
      if (nextBurst <= 0) {
        nextBurst = 2.2 + Math.random() * 2.8;
        // nearest ball pit ahead of the runner, 8..40 m away
        let best: { x: number; z: number; w: number } | null = null;
        for (const p of pits) {
          const ahead = playerPos.z - p.z;
          if (ahead > 8 && ahead < 40 && (!best || ahead < playerPos.z - best.z)) best = p;
        }
        if (best) burst(best.x, best.z, best.w);
      }
      stepBalls(dt);
      stepBalloons(time, dt, playerPos.z);
    },
    ambienceAt: () => 'amb_indoor',
    dispose() {
      if (scene) {
        scene.remove(group);
        scene.background = prevBg;
        scene.fog = prevFog;
      }
      anims.clear();
      pits.length = 0;
      group.clear();
    },
  };
}
