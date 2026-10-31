// Outdoor playground: a sunny Kiwi park playground. Rubber softfall track, bark chips, mown grass,
// swings (that swing), see-saws (that tilt), climbing frames, sandpits, roundabouts (that spin),
// slides, pohutukawa and cabbage trees, ferns. Little surprises: a dog chasing a frisbee, a kite,
// bubbles drifting by, tui flying over, pukeko strutting across the lanes.
import * as THREE from 'three';
import { LANE_WIDTH, type DecorRequest, type ObstacleRequest, type ObstacleVisual, type StageBuildContext, type StageModule, type StagePattern } from '../contracts';
import { PAL, blobShadow, canvasTexture, geo, pick, range } from '../kit/kit';
import {
  Batch,
  DecorAnims,
  ballGeo,
  cached,
  floorStrip,
  frameM,
  keep,
  laneOffsets,
  skyDome,
  sphereWedge,
  texMat,
  vcGlow,
  vcMat,
  visual,
  wedgeGeo,
} from './helpersA';

const C = {
  grass: 0x86c86e,
  grassDark: 0x6bb35c,
  leaf: 0x4fa957,
  leafDark: 0x3b8a4a,
  pohu: 0x3f7f4c,
  flower: 0xe8463c,
  trunk: 0x8a5e3c,
  bark: 0xa8714a,
  wood: 0xc98f5a,
  woodLight: 0xdcae7a,
  sand: 0xf1d79a,
  red: 0xf0645a,
  coral: 0xff8a6e,
  sun: 0xffc94a,
  blue: 0x4f8fe8,
  teal: 0x2fb5a8,
  mint: 0x7fdcc0,
  lilac: 0xb59cf0,
  cream: 0xfff4e0,
  steel: 0x9aa6b4,
  ink: 0x2b3440,
  white: 0xffffff,
  stone: 0xc9c2b4,
};
const PLAY = [C.red, C.sun, C.blue, C.teal];

// ------------------------------------------------------------------ textures
function trackTexture(): THREE.Texture {
  // softfall rubber wetpour, 7.2 m x 8.8 m (80 px / m), lanes split by rows of painted dots
  return canvasTexture(576, 704, (g, w, h) => {
    g.fillStyle = '#5fb0a2';
    g.fillRect(0, 0, w, h);
    // centre lane in a warm sunny softfall so the three lanes read at a glance
    g.fillStyle = '#e7a86a';
    g.fillRect(204, 0, 168, h);
    const specks = ['#f6f1e4', '#3e8f86', '#ffd27a', '#ff9d85', '#88c9c0'];
    for (let i = 0; i < 5200; i++) {
      const x = Math.random() * w;
      const centre = x > 204 && x < 372;
      g.fillStyle = centre ? ['#fff1d6', '#c98a50', '#ffd27a', '#f2b98a'][i % 4] : specks[i % specks.length];
      g.globalAlpha = 0.45;
      const s = 1.5 + Math.random() * 2.2;
      g.fillRect(x, Math.random() * h, s, s);
    }
    g.globalAlpha = 1;
    // painted dots between lanes
    g.fillStyle = '#fff7e6';
    for (const x of [200, 376]) for (let y = 22; y < h; y += 44) {
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.fill();
    }
    // painted motifs: a sun in the centre lane, flowers in the side lanes
    const flower = (cx: number, cy: number, c: string) => {
      g.fillStyle = c;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        g.beginPath();
        g.arc(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15, 11, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#ffe27a';
      g.beginPath();
      g.arc(cx, cy, 10, 0, Math.PI * 2);
      g.fill();
    };
    g.globalAlpha = 0.85;
    flower(112, 170, '#fff3e0');
    flower(464, 520, '#fff3e0');
    g.fillStyle = '#fff1d0';
    g.beginPath();
    g.arc(288, 420, 26, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#fff1d0';
    g.lineWidth = 7;
    g.lineCap = 'round';
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.beginPath();
      g.moveTo(288 + Math.cos(a) * 36, 420 + Math.sin(a) * 36);
      g.lineTo(288 + Math.cos(a) * 52, 420 + Math.sin(a) * 52);
      g.stroke();
    }
    g.globalAlpha = 1;
    // edges: sunny painted line + timber edging (inside |x| < 3.6)
    g.fillStyle = '#ffd56a';
    g.fillRect(22, 0, 6, h);
    g.fillRect(w - 28, 0, 6, h);
    g.fillStyle = '#b07a4c';
    g.fillRect(0, 0, 18, h);
    g.fillRect(w - 18, 0, 18, h);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    for (let y = 0; y < h; y += 88) {
      g.fillRect(0, y, 18, 3);
      g.fillRect(w - 18, y, 18, 3);
    }
  });
}
function grassTexture(): THREE.Texture {
  // 8 m tile, soft mown stripes and little clover flecks
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#86c86e';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#7dbf66';
    g.fillRect(0, 0, w, h / 2);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(60,130,60,0.25)' : 'rgba(200,240,160,0.25)';
      g.fillRect(Math.random() * w, Math.random() * h, 2, 3);
    }
    for (let i = 0; i < 14; i++) {
      g.fillStyle = i % 3 ? '#fffdf2' : '#ffe680';
      const x = Math.random() * w,
        y = Math.random() * h;
      for (let k = 0; k < 5; k++) g.fillRect(x + Math.cos(k * 1.26) * 2.5, y + Math.sin(k * 1.26) * 2.5, 2.4, 2.4);
    }
  });
}
function barkTexture(): THREE.Texture {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#b07d55';
    g.fillRect(0, 0, w, h);
    const cols = ['#8e5f3d', '#c4936a', '#9c6a45', '#d6a77a'];
    for (let i = 0; i < 700; i++) {
      g.fillStyle = cols[i % 4];
      g.save();
      g.translate(Math.random() * w, Math.random() * h);
      g.rotate(Math.random() * Math.PI);
      g.fillRect(-3, -1, 6 + Math.random() * 3, 2.2);
      g.restore();
    }
  });
}

// ------------------------------------------------------------------ props
const rb = (w: number, h: number, d: number, r = 0.06) => geo.rbox(w, h, d, r, 2);
const lp = (r: number) => cached(`lpi${r}`, () => new THREE.IcosahedronGeometry(r, 1));

function pohutukawa(b: Batch, M: THREE.Matrix4, r: () => number, s: number): void {
  const L = M.clone().multiply(new THREE.Matrix4().makeScale(s, s, s));
  // gnarly multi-trunk
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + r();
    b.addIn(L, geo.cyl(0.14, 0.24, 2.4, 7), C.trunk, Math.cos(a) * 0.35, 1.1, Math.sin(a) * 0.35, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
  }
  // wide, low canopy of clumps
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r();
    const d = i === 0 ? 0 : range(r, 1.1, 1.9);
    const rr = range(r, 1.0, 1.4);
    const x = Math.cos(a) * d,
      z = Math.sin(a) * d,
      y = 2.6 + r() * 0.6;
    b.addIn(L, lp(rr), i % 2 ? C.pohu : 0x4a8c55, x, y, z, 0, 0, 0, 1, 0.72, 1);
    // crimson summer flowers dotted on the top
    for (let k = 0; k < 4; k++) {
      const fa = r() * Math.PI * 2,
        fr = rr * 0.75;
      b.addIn(L, geo.sphere(0.14, 6, 4), C.flower, x + Math.cos(fa) * fr * 0.8, y + 0.45 + r() * 0.2, z + Math.sin(fa) * fr * 0.8);
    }
  }
}
function roundTree(b: Batch, M: THREE.Matrix4, r: () => number, s: number): void {
  const L = M.clone().multiply(new THREE.Matrix4().makeScale(s, s, s));
  b.addIn(L, geo.cyl(0.16, 0.24, 2.4, 7), C.trunk, 0, 1.2, 0);
  const col = pick(r, [C.leaf, 0x5cb55e, 0x6fbf5f]);
  b.addIn(L, lp(1.5), col, 0, 3.3, 0);
  b.addIn(L, lp(1.0), col, 0.9, 2.9, 0.3);
  b.addIn(L, lp(1.05), col, -0.8, 3.0, -0.3);
  b.addIn(L, lp(0.9), col, 0.1, 4.2, 0.2);
}
function cabbageTree(b: Batch, M: THREE.Matrix4, r: () => number): void {
  const h = range(r, 3, 4.2);
  b.addIn(M, geo.cyl(0.1, 0.16, h, 6), 0x9a7a5a, 0, h / 2, 0);
  for (const [dx, dy] of [
    [0, 0],
    [0.5, -0.6],
    [-0.45, -0.4],
  ]) {
    if (dx !== 0) b.addIn(M, geo.cyl(0.06, 0.08, 0.8, 5), 0x9a7a5a, dx / 2, h + dy - 0.3, 0, 0, 0, -dx * 1.2);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      b.addIn(M, geo.cone(0.05, 0.9, 4), 0x6f9a4a, dx + Math.cos(a) * 0.2, h + dy + 0.15, Math.sin(a) * 0.2, Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0);
    }
  }
}
function treeFern(b: Batch, M: THREE.Matrix4, r: () => number): void {
  // ponga: shaggy trunk and a crown of arching fronds
  const h = range(r, 1.8, 2.8);
  b.addIn(M, geo.cyl(0.13, 0.19, h, 7), 0x5a4030, 0, h / 2, 0);
  b.addIn(M, geo.sphere(0.2, 8, 6), 0x6b4a32, 0, h, 0);
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2 + r() * 0.3;
    const L = M.clone().multiply(frameM(0, h, 0, -a));
    b.addIn(L, geo.box(0.34, 0.025, 0.8), 0x4c9a4a, 0.38, 0.12, 0, 0, Math.PI / 2, 0.3);
    b.addIn(L, geo.box(0.26, 0.025, 0.7), 0x5aab55, 1.05, 0.08, 0, 0, Math.PI / 2, -0.55);
  }
}
function bush(b: Batch, M: THREE.Matrix4, r: () => number): void {
  for (let i = 0; i < 3; i++) b.addIn(M, lp(range(r, 0.45, 0.7)), pick(r, [0x5aa557, 0x6bb35c, 0x4f9e52]), (i - 1) * 0.55, 0.4, (r() - 0.5) * 0.4, 0, 0, 0, 1, 0.8, 1);
  if (r() < 0.5) for (let k = 0; k < 6; k++) b.addIn(M, geo.sphere(0.07, 5, 3), pick(r, [C.white, C.sun, 0xff9fc0]), (r() - 0.5) * 1.6, 0.6 + r() * 0.3, (r() - 0.5) * 0.7);
}
function barkPatch(b: Batch, M: THREE.Matrix4, w: number, d: number): void {
  b.addIn(M, geo.box(w, 0.02, d), 0xb07d55, 0, 0.01, 0);
  b.addIn(M, geo.box(w + 0.2, 0.1, 0.12), C.woodLight, 0, 0.05, d / 2 + 0.06);
  b.addIn(M, geo.box(w + 0.2, 0.1, 0.12), C.woodLight, 0, 0.05, -d / 2 - 0.06);
  b.addIn(M, geo.box(0.12, 0.1, d), C.woodLight, w / 2 + 0.06, 0.05, 0);
  b.addIn(M, geo.box(0.12, 0.1, d), C.woodLight, -w / 2 - 0.06, 0.05, 0);
}
function bench(b: Batch, M: THREE.Matrix4): void {
  b.addIn(M, rb(1.8, 0.08, 0.45), C.wood, 0, 0.45, 0);
  b.addIn(M, rb(1.8, 0.35, 0.06), C.wood, 0, 0.75, -0.22, -0.15, 0, 0);
  for (const sx of [-0.7, 0.7]) b.addIn(M, geo.box(0.08, 0.45, 0.4), C.ink, sx, 0.22, 0);
}
function picnicTable(b: Batch, M: THREE.Matrix4): void {
  b.addIn(M, rb(1.9, 0.07, 0.8), C.wood, 0, 0.75, 0);
  for (const sz of [-0.65, 0.65]) b.addIn(M, rb(1.9, 0.06, 0.3), C.wood, 0, 0.45, sz);
  for (const sx of [-0.7, 0.7]) {
    b.addIn(M, geo.box(0.08, 0.8, 0.08), C.woodLight, sx, 0.38, 0, 0.6, 0, 0);
    b.addIn(M, geo.box(0.08, 0.8, 0.08), C.woodLight, sx, 0.38, 0, -0.6, 0, 0);
  }
}
function fence(b: Batch, M: THREE.Matrix4, len: number): void {
  b.addIn(M, geo.box(0.06, 0.06, len), C.cream, 0, 0.75, 0);
  b.addIn(M, geo.box(0.06, 0.06, len), C.cream, 0, 0.35, 0);
  for (let z = -len / 2 + 0.1; z <= len / 2; z += 0.28) {
    b.addIn(M, geo.box(0.05, 0.9, 0.12), C.cream, 0.04, 0.45, z);
    b.addIn(M, geo.cone(0.085, 0.12, 4), C.cream, 0.04, 0.96, z, 0, Math.PI / 4, 0);
  }
}
function sandpitProp(b: Batch, M: THREE.Matrix4, r: () => number): void {
  const w = 3.6,
    d = 3.6;
  b.addIn(M, geo.box(w, 0.25, d), C.sand, 0, 0.12, 0);
  for (const sz of [-1, 1]) b.addIn(M, rb(w + 0.3, 0.35, 0.22), C.wood, 0, 0.17, (sz * (d + 0.08)) / 2);
  for (const sx of [-1, 1]) b.addIn(M, rb(0.22, 0.35, d), C.wood, (sx * (w + 0.08)) / 2, 0.17, 0);
  // sandcastle, bucket, spade
  b.addIn(M, geo.cyl(0.4, 0.5, 0.4, 10), 0xe9c77f, 0.6, 0.45, -0.4);
  b.addIn(M, geo.cyl(0.26, 0.32, 0.3, 10), 0xe9c77f, 0.6, 0.8, -0.4);
  b.addIn(M, geo.cone(0.12, 0.3, 8), 0xe9c77f, 0.6, 1.1, -0.4);
  b.addIn(M, geo.box(0.06, 0.25, 0.01), C.red, 0.6, 1.3, -0.4);
  b.addIn(M, geo.cyl(0.2, 0.15, 0.3, 12), pick(r, [C.red, C.blue, C.sun]), -0.8, 0.4, 0.6);
  b.addIn(M, geo.torus(0.12, 0.012, 4, 10, Math.PI), C.ink, -0.8, 0.55, 0.6);
  b.addIn(M, geo.cyl(0.2, 0.15, 0.3, 12), pick(r, [C.teal, C.sun]), 1.0, 0.25, 1.1, Math.PI / 2.4, 0, 0.3);
  b.addIn(M, geo.box(0.06, 0.04, 0.6), C.blue, -0.3, 0.27, -0.9, 0, 0.6, 0);
  b.addIn(M, geo.box(0.22, 0.03, 0.26), C.blue, -0.47, 0.27, -1.15, 0, 0.6, 0);
}
/** Climbing frame with tower, slide and monkey bars (static). Local +Z faces the track. */
function climbingFrame(b: Batch, M: THREE.Matrix4, r: () => number): void {
  barkPatch(b, M, 7, 5);
  const s = 2.0,
    deck = 1.8,
    H = 3.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.addIn(M, geo.box(0.14, H, 0.14), C.wood, (sx * s) / 2, H / 2, (sz * s) / 2);
  b.addIn(M, geo.box(s + 0.1, 0.12, s + 0.1), C.woodLight, 0, deck, 0);
  for (const sz of [-1, 1]) b.addIn(M, geo.box(s, 0.6, 0.06), pick(r, PLAY), 0, deck + 0.45, (sz * s) / 2);
  // roof
  b.addIn(M, geo.cone(1.65, 1.1, 4), pick(r, [C.red, C.blue, C.teal]), 0, H + 0.5, 0, 0, Math.PI / 4, 0);
  // slide down one side
  const sl = 3.2;
  const ang = Math.atan2(deck, sl);
  const hyp = Math.hypot(sl, deck);
  b.addIn(M, rb(0.8, 0.08, hyp), C.sun, s / 2 + sl / 2, deck / 2 + 0.05, 0, 0, Math.PI / 2, 0);
  const L = M.clone().multiply(frameM(s / 2 + sl / 2, deck / 2 + 0.05, 0, Math.PI / 2));
  b.addIn(L, rb(0.8, 0.08, hyp), C.sun, 0, 0, 0, ang, 0, 0);
  for (const sx of [-1, 1]) b.addIn(L, rb(0.08, 0.25, hyp), 0xf0a830, sx * 0.4, 0.12, 0, ang, 0, 0);
  // monkey bars to the other side
  const mb = 3.4;
  for (const sz of [-1, 1]) b.addIn(M, geo.box(mb, 0.07, 0.07), C.blue, -s / 2 - mb / 2, 2.2, (sz * 0.6) / 1);
  for (let i = 0; i <= 8; i++) b.addIn(M, geo.cyl(0.03, 0.03, 1.2, 6), C.steel, -s / 2 - (i * mb) / 8, 2.2, 0, Math.PI / 2, 0, 0);
  for (const sz of [-1, 1]) b.addIn(M, geo.box(0.1, 2.2, 0.1), C.blue, -s / 2 - mb, 1.1, sz * 0.6);
  // ladder
  for (let i = 0; i < 5; i++) b.addIn(M, geo.cyl(0.03, 0.03, 0.8, 6), C.steel, 0, 0.3 + i * 0.36, s / 2 + 0.05, 0, 0, Math.PI / 2);
}
function springRiderBase(b: Batch, M: THREE.Matrix4): void {
  b.addIn(M, geo.cyl(0.35, 0.35, 0.06, 14), C.ink, 0, 0.03, 0);
  b.addIn(M, cached('spring', () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 40 }, (_, i) => new THREE.Vector3(Math.cos(i * 0.9) * 0.14, 0.06 + i * 0.011, Math.sin(i * 0.9) * 0.14))), 60, 0.025, 5)), C.steel, 0, 0, 0);
}
function springDuck(b: Batch): void {
  // in rider-local coords, origin at the top of the spring
  b.add(geo.sphere(0.32, 12, 10), C.sun, 0, 0.2, 0, 0, 0, 0, 1.3, 0.8, 1);
  b.add(geo.sphere(0.2, 12, 10), C.sun, 0, 0.55, 0.3);
  b.add(geo.cone(0.08, 0.18, 8), C.coral, 0, 0.52, 0.52, Math.PI / 2, 0, 0);
  b.add(geo.sphere(0.035, 6, 4), C.ink, -0.1, 0.62, 0.44);
  b.add(geo.sphere(0.035, 6, 4), C.ink, 0.1, 0.62, 0.44);
  b.add(geo.cyl(0.02, 0.02, 0.4, 6), C.red, 0, 0.42, 0.18, 0, 0, Math.PI / 2);
  b.add(geo.cone(0.12, 0.25, 6), C.sun, 0, 0.35, -0.42, -1.2, 0, 0);
}

// ------------------------------------------------------------------ animated prop factories
function swingSet(root: THREE.Object3D, b: Batch, M: THREE.Matrix4, r: () => number): THREE.Object3D[] {
  barkPatch(b, M, 5, 3);
  const H = 2.6,
    W = 3.6;
  const col = pick(r, [C.red, C.blue, C.teal]);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) b.addIn(M, geo.cyl(0.06, 0.06, H / Math.cos(0.3), 8), col, (sx * W) / 2, H / 2, sz * 0.38, sz * 0.3, 0, 0);
  b.addIn(M, geo.cyl(0.07, 0.07, W + 0.2, 10), col, 0, H, 0, 0, 0, Math.PI / 2);
  const seats: THREE.Object3D[] = [];
  for (const x of [-0.85, 0.85]) {
    const g = new THREE.Group();
    const sb = new Batch();
    const Lc = 1.9;
    for (const sx of [-0.2, 0.2]) sb.add(geo.cyl(0.012, 0.012, Lc, 3), C.steel, sx, -Lc / 2, 0);
    sb.add(rb(0.5, 0.05, 0.2, 0.02), pick(r, [C.ink, C.red, C.sun]), 0, -Lc, 0);
    g.add(new THREE.Mesh(sb.geometry(), vcMat(0.6)));
    g.applyMatrix4(M.clone().multiply(frameM(x, H, 0)));
    root.add(g);
    seats.push(g);
  }
  return seats;
}

// ------------------------------------------------------------------ obstacle builders
function lowObstacle(req: ObstacleRequest): ObstacleVisual {
  const w = req.laneSpan * LANE_WIDTH,
    h = Math.min(req.height, 0.9),
    L = Math.max(0.8, req.length);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const b = new Batch();
  const I = new THREE.Matrix4();
  const r = req.rng;
  const v = h >= 0.7 && r() < 0.4 ? 1 : r() < 0.6 ? 0 : 2;
  const tilts: THREE.Object3D[] = [];
  if (v === 0) {
    // sandpit with a timber edge, sandcastle, bucket and spade (all under h)
    const t = 0.2;
    const eh = h * 0.7;
    for (const sz of [-1, 1]) b.addIn(I, geo.rbox(w, eh, t, 0.05), C.wood, 0, eh / 2, sz * (L / 2 - t / 2));
    for (const sx of [-1, 1]) b.addIn(I, geo.rbox(t, eh, L - 2 * t, 0.05), C.wood, sx * (w / 2 - t / 2), eh / 2, 0);
    b.addIn(I, geo.box(w - 2 * t, eh - 0.08, L - 2 * t), C.sand, 0, (eh - 0.08) / 2, 0);
    const offs = laneOffsets(req.laneSpan);
    offs.forEach((x, i) => {
      const k = (i + Math.floor(r() * 3)) % 3;
      const base = eh - 0.08;
      if (k === 0) {
        // sandcastle
        const th = h - base;
        b.addIn(I, geo.cyl(0.28, 0.34, th * 0.5, 10), 0xe9c77f, x, base + th * 0.25, 0);
        b.addIn(I, geo.cyl(0.18, 0.22, th * 0.3, 10), 0xe9c77f, x, base + th * 0.65, 0);
        b.addIn(I, geo.cone(0.09, th * 0.2, 8), 0xe9c77f, x, base + th * 0.9, 0);
      } else if (k === 1) {
        // bucket
        const bh = Math.min(0.3, h - base);
        b.addIn(I, geo.cyl(0.2, 0.15, bh, 12), pick(r, [C.red, C.blue, C.sun]), x + 0.3, base + bh / 2, 0);
        b.addIn(I, geo.box(0.06, 0.03, 0.55), C.teal, x - 0.3, base + 0.02, 0, 0, 0.5, 0);
        b.addIn(I, geo.box(0.22, 0.03, 0.24), C.teal, x - 0.45, base + 0.02, -0.25, 0, 0.5, 0);
      } else {
        // a little sand mound with a flag
        b.addIn(I, geo.sphere(0.35, 12, 6, ), 0xe9c77f, x, base, 0, 0, 0, 0, 1, Math.min(1, (h - base) / 0.35) * 0.6, 1);
      }
    });
  } else if (v === 1) {
    // see-saws (one per lane), tilting gently; ends never rise above h
    const pivot = 0.38;
    laneOffsets(req.laneSpan).forEach((x) => {
      b.addIn(I, geo.cyl(0.08, 0.08, 0.5, 10), C.steel, x, pivot, 0, Math.PI / 2, 0, 0);
      b.addIn(I, wedgeGeo(0.3, pivot, 0.5), C.blue, x, 0, 0.0, 0, 0, 0);
      const tilt = new THREE.Group();
      tilt.position.set(x, pivot, 0);
      const tb = new Batch();
      const half = 1.0;
      tb.add(geo.rbox(half * 2, 0.08, 0.36, 0.03), pick(r, [C.red, C.sun, C.teal]), 0, 0.06, 0);
      for (const sx of [-1, 1]) {
        tb.add(geo.rbox(0.3, 0.06, 0.34, 0.03), C.ink, sx * (half - 0.2), 0.12, 0);
        tb.add(geo.torus(0.09, 0.02, 4, 10, Math.PI), C.steel, sx * (half - 0.45), 0.1, 0, 0, Math.PI / 2, 0);
      }
      tilt.add(new THREE.Mesh(tb.geometry(), vcMat(0.6)));
      tilt.userData.maxA = Math.asin(Math.min(0.95, (h - pivot - 0.2) / half));
      body.add(tilt);
      tilts.push(tilt);
    });
  } else {
    // row of half-buried painted tyres
    const n = req.laneSpan * 3;
    const R = Math.min(h, 0.55) * 0.95;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w / n) * (i + 0.5);
      b.addIn(I, geo.torus(R * 0.72, R * 0.28, 8, 18), PLAY[i % PLAY.length], x, 0, 0, 0, Math.PI / 2, 0, 1, 1, 1);
    }
    b.addIn(I, geo.box(w, 0.04, L), 0xb07d55, 0, 0.02, 0);
  }
  b.into(body);
  root.add(blobShadow(w * 1.05, L * 1.6, 0.25));
  return visual(root, body, (t) => {
    tilts.forEach((tl, i) => {
      const mx = tl.userData.maxA as number;
      tl.rotation.z = Math.sin(t * 1.6 + i * 1.7) * mx;
    });
  });
}

function highObstacle(req: ObstacleRequest): ObstacleVisual {
  const w = req.laneSpan * LANE_WIDTH,
    top = Math.max(2.4, req.height),
    L = Math.max(0.6, req.length);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const b = new Batch();
  const I = new THREE.Matrix4();
  const r = req.rng;
  const v = Math.floor(r() * 2);
  const seats: THREE.Object3D[] = [];
  const postX = w / 2 + 0.3;
  const col = pick(r, [C.red, C.blue, C.teal]);
  // A-frame legs outside the lane span
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) b.addIn(I, geo.cyl(0.07, 0.08, top / Math.cos(0.28), 8), col, sx * postX, top / 2, sz * 0.35, sz * 0.28, 0, 0);
    b.addIn(I, geo.sphere(0.12, 10, 8), C.sun, sx * postX, top + 0.02, 0);
    const s = blobShadow(0.7, 1.4, 0.25);
    s.position.x = sx * postX;
    root.add(s);
  }
  b.addIn(I, geo.cyl(0.09, 0.09, w + 0.7, 12), col, 0, top, 0, 0, 0, Math.PI / 2);
  if (v === 0) {
    // swings: seats hang from the top bar and swing; lowest point stays at 1.15
    const bottom = 1.15;
    const Lc = top - bottom;
    const n = req.laneSpan * 2;
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w / n) * (i + 0.5);
      const g = new THREE.Group();
      g.position.set(x, top, 0);
      const sb = new Batch();
      for (const sx of [-0.22, 0.22]) sb.add(geo.cyl(0.014, 0.014, Lc - 0.03, 3), C.steel, sx, -Lc / 2, 0);
      sb.add(geo.rbox(0.56, 0.07, 0.24, 0.03), pick(r, [C.ink, C.red, C.sun, C.blue]), 0, -Lc + 0.035, 0);
      g.add(new THREE.Mesh(sb.geometry(), vcMat(0.6)));
      g.userData.phase = r() * Math.PI * 2;
      body.add(g);
      seats.push(g);
    }
  } else {
    // monkey bars: a rung ladder with hanging rings (bottom of rings at 1.15)
    const yb = top - 0.25;
    for (const sz of [-1, 1]) b.addIn(I, geo.box(w + 0.6, 0.08, 0.08), C.blue, 0, yb, sz * 0.4);
    const n = Math.round((w + 0.4) / 0.4);
    for (let i = 0; i <= n; i++) b.addIn(I, geo.cyl(0.03, 0.03, 0.8, 6), C.steel, -w / 2 - 0.2 + (i * (w + 0.4)) / n, yb, 0, Math.PI / 2, 0, 0);
    const rings = req.laneSpan * 2;
    for (let i = 0; i < rings; i++) {
      const x = -w / 2 + (w / rings) * (i + 0.5);
      const g = new THREE.Group();
      g.position.set(x, yb, 0.4);
      const sb = new Batch();
      const cl = yb - 1.15 - 0.36;
      sb.add(geo.cyl(0.012, 0.012, cl, 3), C.steel, 0, -cl / 2, 0);
      sb.add(geo.torus(0.16, 0.035, 6, 16), pick(r, [C.red, C.sun]), 0, -cl - 0.17, 0);
      g.add(new THREE.Mesh(sb.geometry(), vcMat(0.5)));
      g.userData.phase = r() * Math.PI * 2;
      g.userData.ring = true;
      body.add(g);
      seats.push(g);
    }
  }
  b.into(body);
  return visual(root, body, (t) => {
    seats.forEach((g) => {
      const a = g.userData.ring ? 0.12 : 0.38;
      g.rotation.x = Math.sin(t * (g.userData.ring ? 1.6 : 2.1) + (g.userData.phase as number)) * a;
    });
  });
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
  const spinners: THREE.Object3D[] = [];
  laneOffsets(req.laneSpan).forEach((x, i) => {
    const k = req.laneSpan === 1 ? Math.floor(r() * 3) : (i + Math.floor(r() * 3)) % 3;
    if (k === 0) {
      // roundabout: spins on its own; central pole and a sunny canopy make it tall and solid
      const g = new THREE.Group();
      g.position.x = x;
      const sb = new Batch();
      const R = 1.0;
      sb.add(geo.cyl(R, R, 0.14, 24), C.red, 0, 0.34, 0);
      for (let q = 0; q < 4; q++) sb.add(cached(`rq${q}`, () => new THREE.CylinderGeometry(R - 0.02, R - 0.02, 0.02, 12, 1, false, (q * Math.PI) / 2, Math.PI / 4)), C.sun, 0, 0.42, 0);
      for (let q = 0; q < 4; q++) {
        const a = (q / 4) * Math.PI * 2;
        sb.add(geo.cyl(0.03, 0.03, 0.75, 6), C.steel, Math.cos(a) * 0.7, 0.78, Math.sin(a) * 0.7);
        sb.add(geo.cyl(0.03, 0.03, 0.75, 6), C.steel, Math.cos(a) * 0.35, 1.13, Math.sin(a) * 0.35, Math.sin(a) * Math.PI / 2, 0, -Math.cos(a) * Math.PI / 2);
      }
      sb.add(geo.torus(0.7, 0.03, 6, 24), C.steel, 0, 1.15, 0, Math.PI / 2, 0, 0);
      sb.add(geo.cyl(0.09, 0.09, h - 0.5, 10), C.steel, 0, (h - 0.5) / 2 + 0.3, 0);
      // canopy: striped cone
      for (let q = 0; q < 6; q++) sb.add(cached(`canopy${q}`, () => new THREE.ConeGeometry(1.05, 0.7, 6, 1, true, (q * Math.PI) / 3, Math.PI / 3)), q % 2 ? C.cream : C.blue, 0, h - 0.35, 0);
      sb.add(geo.sphere(0.12, 10, 8), C.sun, 0, h - 0.13, 0);
      sb.add(geo.cyl(0.25, 0.35, 0.3, 12), C.ink, 0, 0.15, 0);
      const mesh = new THREE.Mesh(sb.geometry(), vcMat(0.6, { side: THREE.DoubleSide }));
      g.add(mesh);
      body.add(g);
      spinners.push(g);
    } else if (k === 1) {
      // cubby playhouse
      const W = 2.0,
        D = Math.min(L, 2.0),
        wh = h * 0.6;
      b.addIn(I, geo.rbox(W, wh, D, 0.05), pick(r, [C.cream, 0xfde3c6]), x, wh / 2, 0);
      b.addIn(I, wedgeGeo(D + 0.2, h - wh, (W + 0.3) / 2), C.red, x - (W + 0.3) / 4, wh, 0, 0, -Math.PI / 2, 0);
      b.addIn(I, wedgeGeo(D + 0.2, h - wh, (W + 0.3) / 2), C.red, x + (W + 0.3) / 4, wh, 0, 0, Math.PI / 2, 0);
      b.addIn(I, geo.box(0.6, 1.0, 0.05), pick(r, [C.blue, C.teal]), x - 0.35, 0.5, D / 2 + 0.02);
      b.addIn(I, geo.sphere(0.04, 6, 4), C.sun, x - 0.15, 0.5, D / 2 + 0.06);
      b.addIn(I, geo.box(0.5, 0.45, 0.05), 0xbfe6ff, x + 0.45, wh * 0.62, D / 2 + 0.02);
      b.addIn(I, geo.box(0.6, 0.06, 0.08), C.wood, x + 0.45, wh * 0.62 - 0.27, D / 2 + 0.05);
      b.addIn(I, geo.box(0.6, 0.05, 0.06), C.white, x + 0.45, wh * 0.62, D / 2 + 0.05);
      b.addIn(I, geo.box(0.05, 0.45, 0.06), C.white, x + 0.45, wh * 0.62, D / 2 + 0.05);
      // flower box
      for (let f = 0; f < 4; f++) b.addIn(I, geo.sphere(0.06, 6, 4), pick(r, [C.flower, C.sun, 0xff9fc0]), x + 0.27 + f * 0.12, wh * 0.62 - 0.2, D / 2 + 0.08);
    } else {
      // pohutukawa tree in the lane (canopy kept inside the lane width)
      b.addIn(I, geo.cyl(0.22, 0.32, h * 0.55, 8), C.trunk, x, h * 0.27, 0);
      b.addIn(I, geo.cyl(0.08, 0.12, 0.7, 6), C.trunk, x + 0.25, h * 0.5, 0, 0, 0, -0.6);
      const cy = h - 0.62;
      b.addIn(I, lp(0.75), C.pohu, x, cy, 0, 0, 0, 0, 1.35, 0.8, Math.min(1.35, L / 1.5));
      b.addIn(I, lp(0.55), 0x4a8c55, x - 0.45, cy - 0.15, 0.1);
      b.addIn(I, lp(0.55), 0x4a8c55, x + 0.45, cy - 0.1, -0.1);
      for (let f = 0; f < 10; f++) {
        const a = r() * Math.PI * 2;
        b.addIn(I, geo.sphere(0.11, 6, 4), C.flower, x + Math.cos(a) * 0.7, cy + 0.25 + r() * 0.25, Math.sin(a) * 0.5);
      }
    }
  });
  b.into(body);
  root.add(blobShadow(req.laneSpan * LANE_WIDTH * 1.05, L * 1.6, 0.3));
  return visual(root, body, (_t, dt) => {
    for (const s of spinners) s.rotation.y += dt * 1.1;
  });
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
  // climbing-frame deck: a solid timber base, plank deck on top at y = 2.0
  b.addIn(I, geo.rbox(w, T - 0.1, L, 0.05, 2), 0xd9a874, 0, (T - 0.1) / 2, 0);
  const n = Math.max(4, Math.round(L / 0.5));
  for (let k = 0; k < n; k++) b.addIn(I, geo.box(w, 0.1, L / n - 0.04), k % 2 ? C.woodLight : 0xe8bd8a, 0, T - 0.05, L / 2 - (L / n) * (k + 0.5));
  // corner posts with caps
  const np = Math.max(2, Math.round(L / 4) + 1);
  for (let k = 0; k < np; k++) {
    const z = L / 2 - (k * L) / (np - 1);
    for (const sx of [-1, 1]) {
      b.addIn(I, geo.box(0.16, T + 0.02, 0.16), C.wood, sx * (w / 2 + 0.02), (T + 0.02) / 2, z);
      b.addIn(I, geo.cone(0.13, 0.22, 4), C.red, sx * (w / 2 + 0.02), T + 0.12, z, 0, Math.PI / 4, 0);
    }
  }
  // front face: climbing wall with friendly coloured holds
  const fw = w - 0.1;
  b.addIn(I, geo.box(fw, T - 0.2, 0.06), C.blue, 0, (T - 0.2) / 2 + 0.05, L / 2 + 0.02);
  const holds = Math.round(fw * 4);
  for (let k = 0; k < holds; k++) {
    const hx = (r() - 0.5) * (fw - 0.3),
      hy = 0.25 + r() * (T - 0.6);
    b.addIn(I, geo.sphere(0.08, 6, 4), pick(r, [C.sun, C.red, C.mint, C.lilac]), hx, hy, L / 2 + 0.06, 0, 0, 0, 1, 0.8, 0.6);
  }
  // side panels: alternating colours with porthole windows
  const ns = Math.max(1, Math.round(L / 2.2));
  for (let k = 0; k < ns; k++) {
    const z = L / 2 - (L / ns) * (k + 0.5);
    for (const sx of [-1, 1]) {
      b.addIn(I, geo.box(0.05, 1.4, L / ns - 0.3), PLAY[(k + (sx > 0 ? 1 : 0)) % 4], sx * (w / 2 + 0.01), 1.0, z);
      b.addIn(I, geo.cyl(0.3, 0.3, 0.07, 16), C.cream, sx * (w / 2 + 0.03), 1.05, z, 0, 0, Math.PI / 2);
    }
  }
  b.into(body);
  root.add(blobShadow(w * 1.2, L + 1.5, 0.3));
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
  const ang = Math.atan2(T, L);
  const hyp = Math.hypot(L, T);
  if (r() < 0.5) {
    // wide sunny slide (run up it!)
    b.addIn(I, wedgeGeo(w, T, L), pick(r, [C.sun, 0xffb84a]), 0, 0, 0);
    for (const sx of [-1, 1]) {
      b.addIn(I, geo.box(0.12, 0.22, hyp), 0xf0a830, sx * (w / 2 - 0.06), T / 2 + 0.08, 0, ang, 0, 0);
      b.addIn(I, wedgeGeo(0.06, T, L), C.blue, sx * (w / 2 + 0.03), 0, 0);
    }
    for (const x of laneOffsets(req.laneSpan)) {
      if (req.laneSpan > 1) b.addIn(I, geo.box(0.06, 0.03, hyp), 0xf0a830, x + LANE_WIDTH / 2, T / 2 + 0.01, 0, ang, 0, 0);
    }
  } else {
    // climbing ramp board with timber slats
    b.addIn(I, wedgeGeo(w, T, L), C.wood, 0, 0, 0);
    const n = Math.max(3, Math.round(L / 0.7));
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n;
      b.addIn(I, geo.box(w - 0.3, 0.05, 0.12), C.woodLight, 0, u * T + 0.01, L / 2 - u * L, ang, 0, 0);
    }
    for (const sx of [-1, 1]) b.addIn(I, wedgeGeo(0.06, T, L), C.teal, sx * (w / 2 + 0.03), 0, 0);
  }
  b.into(body);
  root.add(blobShadow(w * 1.1, L, 0.2));
  return visual(root, body);
}

function moverBlockObstacle(req: ObstacleRequest): ObstacleVisual {
  // a big painted playground tyre rolling across the lanes
  const R = 0.86;
  const root = new THREE.Group();
  const body = new THREE.Group();
  const roll = new THREE.Group();
  root.add(body);
  body.add(roll);
  roll.position.y = R;
  const r = req.rng;
  const b = new Batch();
  const tube = 0.3;
  b.add(geo.torus(R - tube, tube, 12, 32), C.ink, 0, 0, 0);
  const paint = pick(r, PLAY);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.add(geo.box(0.22, 0.06, 0.5), i % 2 ? paint : C.cream, Math.cos(a) * (R - 0.02), Math.sin(a) * (R - 0.02), 0, 0, 0, a + Math.PI / 2);
  }
  // painted sidewalls so the roll reads from behind
  for (const sz of [-1, 1]) {
    b.add(geo.torus(R - tube, tube * 0.55, 6, 32), paint, 0, 0, sz * tube * 0.62, 0, 0, 0, 1, 1, 0.35);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.add(geo.sphere(0.09, 8, 6), C.cream, Math.cos(a) * (R - tube), Math.sin(a) * (R - tube), sz * tube * 0.85, 0, 0, 0, 1, 1, 0.4);
    }
  }
  // spokes of rope in the middle (a tyre-swing tyre)
  for (let i = 0; i < 3; i++) b.add(geo.cyl(0.02, 0.02, (R - tube) * 2, 4), 0xd9c08a, 0, 0, 0, 0, 0, (i * Math.PI) / 3);
  roll.add(new THREE.Mesh(b.geometry(), vcMat(0.8)));
  root.add(blobShadow(1.8, 0.9, 0.3));
  return visual(root, body, (_t, _dt, _d, moved) => {
    roll.rotation.z -= moved / R;
  });
}

/** A pukeko strutting across: true-to-life high-stepping walk, flicking white tail. */
function makePukeko(): { group: THREE.Group; legs: THREE.Object3D[]; head: THREE.Object3D; tail: THREE.Object3D } {
  const group = new THREE.Group();
  const b = new Batch();
  b.add(geo.sphere(0.2, 14, 10), 0x2f4596, 0, 0.42, 0, 0, 0, 0, 0.9, 0.85, 1.25);
  b.add(geo.sphere(0.17, 12, 8), 0x223269, 0, 0.47, -0.04, 0.2, 0, 0, 0.92, 0.75, 1.15);
  b.add(geo.cyl(0.06, 0.08, 0.2, 8), 0x2f4596, 0, 0.58, 0.18, 0.6, 0, 0);
  const torso = new THREE.Mesh(b.geometry(), vcMat(0.6));
  group.add(torso);
  const head = new THREE.Group();
  head.position.set(0, 0.68, 0.24);
  const hb = new Batch();
  hb.add(geo.sphere(0.085, 12, 8), 0x2f4596, 0, 0, 0);
  hb.add(geo.cone(0.045, 0.16, 8), 0xe0342c, 0, -0.02, 0.12, Math.PI / 2 + 0.25, 0, 0);
  hb.add(geo.sphere(0.04, 8, 6), 0xe0342c, 0, 0.04, 0.07, 0, 0, 0, 0.9, 1.2, 0.8);
  hb.add(geo.sphere(0.018, 6, 4), 0xfff4e0, -0.055, 0.02, 0.05);
  hb.add(geo.sphere(0.018, 6, 4), 0xfff4e0, 0.055, 0.02, 0.05);
  hb.add(geo.sphere(0.011, 4, 3), 0x1a1a22, -0.06, 0.022, 0.062);
  hb.add(geo.sphere(0.011, 4, 3), 0x1a1a22, 0.06, 0.022, 0.062);
  head.add(new THREE.Mesh(hb.geometry(), vcMat(0.5)));
  group.add(head);
  const tail = new THREE.Group();
  tail.position.set(0, 0.45, -0.24);
  const tb = new Batch();
  tb.add(geo.cone(0.07, 0.14, 8), 0xffffff, 0, 0.02, -0.04, -2.2, 0, 0);
  tail.add(new THREE.Mesh(tb.geometry(), vcMat(0.6)));
  group.add(tail);
  const legs: THREE.Object3D[] = [];
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(sx * 0.07, 0.32, 0.02);
    const lb = new Batch();
    lb.add(geo.cyl(0.016, 0.014, 0.32, 5), 0xe5673a, 0, -0.16, 0);
    for (const a of [-0.5, 0, 0.5]) lb.add(geo.box(0.012, 0.01, 0.13), 0xe5673a, Math.sin(a) * 0.05, -0.315, Math.cos(a) * 0.06, 0, a, 0);
    lb.add(geo.box(0.012, 0.01, 0.07), 0xe5673a, 0, -0.315, -0.04);
    leg.add(new THREE.Mesh(lb.geometry(), vcMat(0.6)));
    group.add(leg);
    legs.push(leg);
  }
  return { group, legs, head, tail };
}

function moverLowObstacle(req: ObstacleRequest): ObstacleVisual {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const r = req.rng;
  const dir = req.dir ?? 1;
  if (r() < 0.7) {
    // a pair of pukeko (parent + chick) strutting across
    const big = makePukeko();
    big.group.scale.setScalar(1.0);
    const chick = makePukeko();
    chick.group.scale.setScalar(0.62);
    chick.group.position.set(-dir * 0.55, 0, 0.35);
    const walker = new THREE.Group();
    walker.add(big.group, chick.group);
    walker.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2; // face the walking direction
    body.add(walker);
    root.add(blobShadow(1.1, 0.7, 0.25));
    let phase = 0;
    return visual(root, body, (t, dt, _d, moved) => {
      phase += Math.abs(moved) * 5.5 + dt * (Math.abs(moved) > 0.0001 ? 0 : 2.5);
      for (const [p, k] of [
        [big, 1],
        [chick, 1.6],
      ] as const) {
        const ph = phase * k;
        p.legs[0].rotation.x = Math.sin(ph) * 0.7;
        p.legs[1].rotation.x = Math.sin(ph + Math.PI) * 0.7;
        p.head.position.z = 0.24 + Math.sin(ph * 2) * 0.03;
        p.group.position.y = Math.abs(Math.sin(ph)) * 0.025;
        p.tail.rotation.x = Math.sin(t * 9) > 0.6 ? -0.35 : 0;
      }
    });
  }
  // a rolling playground ball
  const R = 0.36;
  const roll = new THREE.Group();
  roll.position.y = R;
  body.add(roll);
  const b = new Batch();
  const seq = [C.red, C.white, C.blue, C.white, C.sun, C.white];
  for (let i = 0; i < 6; i++) b.add(sphereWedge(R, (i * Math.PI) / 3, Math.PI / 3, 4, 12), seq[i], 0, 0, 0, Math.PI / 2, 0, 0);
  roll.add(new THREE.Mesh(b.geometry(), vcMat(0.45)));
  root.add(blobShadow(0.9, 0.9, 0.3));
  return visual(root, body, (_t, _dt, _d, moved) => {
    roll.rotation.z -= moved / R;
  });
}

// ------------------------------------------------------------------ patterns
const PATTERNS: StagePattern[] = [
  { id: 'out-sandpit-hops', difficulty: 1, length: 30, items: [
    { dz: 4, lane: 0, kind: 'low', laneSpan: 3, height: 0.6 },
    { dz: 18, lane: -1, kind: 'low', laneSpan: 2, height: 0.7 },
    { dz: 28, lane: 1, kind: 'block', height: 2.8 },
  ] },
  { id: 'out-swing-duck', difficulty: 1, length: 30, items: [
    { dz: 4, lane: 0, kind: 'high', laneSpan: 3, height: 2.7 },
    { dz: 18, lane: -1, kind: 'block', height: 2.8 },
    { dz: 18, lane: 1, kind: 'block', height: 2.8 },
  ] },
  { id: 'out-roundabout-weave', difficulty: 1, length: 40, items: [
    { dz: 4, lane: 0, kind: 'block', height: 2.6 },
    { dz: 16, lane: -1, kind: 'block', height: 2.8 },
    { dz: 16, lane: 1, kind: 'low', height: 0.7 },
    { dz: 30, lane: 1, kind: 'block', laneSpan: 1, height: 3.0 },
  ] },
  { id: 'out-climb-deck', difficulty: 2, length: 46, items: [
    { dz: 4, lane: 0, kind: 'ramp', length: 8 },
    { dz: 20, lane: 0, kind: 'platform', length: 24 },
    { dz: 12, lane: -1, kind: 'high', height: 2.6 },
    { dz: 22, lane: 1, kind: 'block', height: 2.8 },
    { dz: 42, lane: 0, kind: 'low', laneSpan: 3, height: 0.6 },
  ] },
  { id: 'out-pukeko-parade', difficulty: 2, length: 32, items: [
    { dz: 4, lane: -1, kind: 'moverLow', dir: 1 },
    { dz: 16, lane: 0, kind: 'high', laneSpan: 3, height: 2.6 },
    { dz: 28, lane: 1, kind: 'moverLow', dir: -1 },
  ] },
  { id: 'out-tyre-roll', difficulty: 2, length: 34, items: [
    { dz: 4, lane: 1, kind: 'moverBlock', dir: -1 },
    { dz: 17, lane: 0, kind: 'low', laneSpan: 3, height: 0.7 },
    { dz: 30, lane: -1, kind: 'moverBlock', dir: 1 },
  ] },
  { id: 'out-seesaw-row', difficulty: 2, length: 34, items: [
    { dz: 4, lane: -1, kind: 'low', height: 0.8 },
    { dz: 4, lane: 0, kind: 'block', height: 2.6 },
    { dz: 4, lane: 1, kind: 'low', height: 0.8 },
    { dz: 17, lane: 0, kind: 'high', laneSpan: 2, height: 2.6 },
    { dz: 17, lane: -1, kind: 'block', height: 2.8 },
    { dz: 30, lane: 0, kind: 'low', laneSpan: 3, height: 0.6 },
  ] },
  { id: 'out-two-decks', difficulty: 3, length: 56, items: [
    { dz: 4, lane: -1, kind: 'ramp', length: 8 },
    { dz: 18, lane: -1, kind: 'platform', length: 20 },
    { dz: 12, lane: 0, kind: 'block', height: 2.6 },
    { dz: 26, lane: 1, kind: 'ramp', length: 8 },
    { dz: 40, lane: 1, kind: 'platform', length: 20 },
    { dz: 38, lane: 0, kind: 'high', height: 2.6 },
    { dz: 52, lane: 0, kind: 'low', laneSpan: 3, height: 0.7 },
  ] },
  { id: 'out-playground-dash', difficulty: 3, length: 50, items: [
    { dz: 4, lane: 0, kind: 'low', laneSpan: 3, height: 0.6 },
    { dz: 14, lane: 0, kind: 'high', laneSpan: 3, height: 2.6 },
    { dz: 24, lane: -1, kind: 'block', height: 2.8 },
    { dz: 24, lane: 1, kind: 'block', height: 2.8 },
    { dz: 24, lane: 0, kind: 'moverLow', dir: 1 },
    { dz: 36, lane: 0, kind: 'block', laneSpan: 2, height: 3.0 },
    { dz: 47, lane: -1, kind: 'high', laneSpan: 3, height: 2.6 },
  ] },
  { id: 'out-busy-park', difficulty: 3, length: 42, items: [
    { dz: 4, lane: 0, kind: 'moverBlock', dir: 1 },
    { dz: 15, lane: -1, kind: 'block', height: 3.0 },
    { dz: 15, lane: 1, kind: 'high', height: 2.6 },
    { dz: 27, lane: 1, kind: 'block', height: 3.0 },
    { dz: 27, lane: -1, kind: 'low', height: 0.75 },
    { dz: 39, lane: 0, kind: 'moverLow', dir: -1 },
  ] },
  { id: 'out-slide-up', difficulty: 1, length: 28, items: [
    { dz: 4, lane: 1, kind: 'ramp', length: 8 },
    { dz: 14, lane: 1, kind: 'platform', length: 12 },
    { dz: 14, lane: -1, kind: 'low', height: 0.6 },
  ] },
  { id: 'out-monkey-bars', difficulty: 2, length: 36, items: [
    { dz: 4, lane: -1, kind: 'high', laneSpan: 2, height: 2.7 },
    { dz: 4, lane: 1, kind: 'block', height: 2.6 },
    { dz: 17, lane: 0, kind: 'low', laneSpan: 3, height: 0.7 },
    { dz: 30, lane: 0, kind: 'high', laneSpan: 2, height: 2.7 },
    { dz: 30, lane: -1, kind: 'block', height: 2.6 },
  ] },
];

// ------------------------------------------------------------------ the stage
export function createOutdoorStage(): StageModule {
  const group = new THREE.Group();
  group.name = 'outdoor-stage';
  const anims = new DecorAnims();
  let quality: 'low' | 'high' = 'high';
  let scene: THREE.Scene | null = null;
  let prevBg: THREE.Scene['background'] = null;
  let prevFog: THREE.Fog | THREE.FogExp2 | null = null;
  const trackMat = () => texMat('outdoor-track', trackTexture, { repeat: true, rough: 0.95 });
  const grassMat = () => texMat('outdoor-grass', grassTexture, { repeat: true, rough: 0.95 });
  const barkMat = () => texMat('outdoor-bark', barkTexture, { repeat: true, rough: 1 });

  // ---- sky + far backdrop that travels with the runner
  const sky = skyDome('#6fb8ec', '#a9d8f5', '#eef6ef');
  const backdrop = new THREE.Group();
  const clouds = new THREE.Group();
  const sunDisc = new THREE.Mesh(geo.circle(14, 32), keep(new THREE.MeshBasicMaterial({ toneMapped: false, color: 0xfff1b8, fog: false })));
  const sunHalo = new THREE.Mesh(geo.circle(30, 32), keep(new THREE.MeshBasicMaterial({ toneMapped: false, color: 0xfff6d0, transparent: true, opacity: 0.35, fog: false, depthWrite: false })));
  {
    const hb = new Batch();
    const r = Math.random;
    // three rings of soft rolling hills
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      const s = range(r, 25, 55);
      const x = side * (s * 1.6 + range(r, 34, 70));
      const z = -range(r, -60, 260);
      hb.add(lp(1), pick(r, [0x8fcf78, 0x7cc46a, 0x9bd585, 0x6fb862]), x, -s * 0.55, z, 0, r() * 3, 0, s * 1.6, s * 0.9, s);
    }
    for (let i = 0; i < 10; i++) {
      const x = (r() - 0.5) * 260;
      const s = range(r, 40, 70);
      hb.add(lp(1), pick(r, [0xa9d9a0, 0xb5dfa8]), x, -s * 0.6, -range(r, 200, 300), 0, r() * 3, 0, s * 1.8, s * 0.85, s);
    }
    // distant tree clumps along the hills
    for (let i = 0; i < 40; i++) {
      const side = i % 2 ? 1 : -1;
      hb.add(lp(1), pick(r, [0x4f9e52, 0x5aa557, 0x3f8a4a]), side * range(r, 32, 60), range(r, 1, 4), -range(r, -40, 220), 0, 0, 0, range(r, 3, 6), range(r, 3, 5), range(r, 3, 6));
    }
    const hills = hb.build(vcMat(0.95))!;
    backdrop.add(hills);
    const cb = new Batch();
    for (let i = 0; i < 9; i++) {
      const x = (r() - 0.5) * 220,
        y = range(r, 45, 80),
        z = -range(r, 80, 320);
      for (let k = 0; k < 5; k++) cb.add(lp(1), 0xffffff, x + (k - 2) * 7 + r() * 3, y + (k % 2) * 3, z + r() * 4, 0, 0, 0, range(r, 6, 10), range(r, 4, 6), range(r, 5, 8));
    }
    const cl = cb.build(keep(new THREE.MeshBasicMaterial({ toneMapped: false, vertexColors: true, fog: false })))!;
    clouds.add(cl);
    sunDisc.position.set(-90, 120, -320);
    sunHalo.position.copy(sunDisc.position);
    sunHalo.position.z -= 1;
    sunDisc.lookAt(0, 0, 0);
    sunHalo.lookAt(0, 0, 0);
  }

  // ---- ambient: dog + frisbee, kite, bubbles, tui
  const dog = new THREE.Group();
  const dogParts: { legs: THREE.Object3D[]; tail: THREE.Object3D; head: THREE.Object3D; body: THREE.Object3D } = { legs: [], tail: new THREE.Group(), head: new THREE.Group(), body: new THREE.Group() };
  {
    const fur = 0xe2b16e,
      furDark = 0xc58f4f;
    const bb = new Batch();
    bb.add(geo.capsule(0.22, 0.6, 8), fur, 0, 0, 0, Math.PI / 2, 0, 0);
    bb.add(geo.sphere(0.2, 10, 8), 0xfff1dc, 0, -0.06, 0.25, 0, 0, 0, 0.9, 0.8, 0.9);
    const bodyMesh = new THREE.Mesh(bb.geometry(), vcMat(0.8));
    dogParts.body.add(bodyMesh);
    dogParts.body.position.y = 0.62;
    dog.add(dogParts.body);
    const hb = new Batch();
    hb.add(geo.sphere(0.2, 12, 10), fur, 0, 0, 0);
    hb.add(geo.capsule(0.1, 0.12, 6), furDark, 0, -0.05, 0.2, Math.PI / 2, 0, 0);
    hb.add(geo.sphere(0.05, 8, 6), 0x2b2420, 0, -0.03, 0.33);
    hb.add(geo.sphere(0.03, 6, 4), 0x2b2420, -0.08, 0.06, 0.17);
    hb.add(geo.sphere(0.03, 6, 4), 0x2b2420, 0.08, 0.06, 0.17);
    for (const sx of [-1, 1]) hb.add(geo.capsule(0.06, 0.16, 6), furDark, sx * 0.17, -0.02, 0, 0, 0, sx * 0.35);
    hb.add(geo.box(0.06, 0.02, 0.09), 0xff8a8a, 0, -0.13, 0.25, 0.3, 0, 0);
    dogParts.head.add(new THREE.Mesh(hb.geometry(), vcMat(0.8)));
    dogParts.head.position.set(0, 0.9, 0.48);
    dog.add(dogParts.head);
    const tb = new Batch();
    tb.add(geo.capsule(0.04, 0.3, 6), fur, 0, 0.17, 0);
    dogParts.tail.add(new THREE.Mesh(tb.geometry(), vcMat(0.8)));
    dogParts.tail.position.set(0, 0.72, -0.5);
    dog.add(dogParts.tail);
    for (const [x, z] of [
      [-0.12, 0.3],
      [0.12, 0.3],
      [-0.12, -0.3],
      [0.12, -0.3],
    ]) {
      const leg = new THREE.Group();
      leg.position.set(x, 0.55, z);
      const lb = new Batch();
      lb.add(geo.capsule(0.055, 0.38, 6), fur, 0, -0.25, 0);
      lb.add(geo.sphere(0.07, 8, 6), 0xfff1dc, 0, -0.5, 0.02);
      leg.add(new THREE.Mesh(lb.geometry(), vcMat(0.8)));
      dog.add(leg);
      dogParts.legs.push(leg);
    }
    dog.add(blobShadow(0.8, 1.3, 0.25));
  }
  const frisbee = new THREE.Mesh(geo.cyl(0.16, 0.13, 0.04, 16), keep(new THREE.MeshStandardMaterial({ color: 0xff6f5e, roughness: 0.4 })));
  const kite = new THREE.Group();
  {
    const kb = new Batch();
    const kg = cached('kite', () => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 1, 0, -0.7, 0, 0, 0, -1.4, 0, 0, 1, 0, 0, -1.4, 0, 0.7, 0, 0], 3));
      g.computeVertexNormals();
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
      return g;
    });
    kb.add(kg, C.red, 0, 0, 0);
    kb.add(kg, C.sun, 0, 0, 0.01, 0, 0, 0, 0.55, 0.55, 1);
    kb.add(geo.box(0.03, 2.4, 0.03), C.wood, 0, -0.2, -0.02);
    kb.add(geo.box(1.4, 0.03, 0.03), C.wood, 0, 0, -0.02);
    kite.add(new THREE.Mesh(kb.geometry(), vcMat(0.6, { side: THREE.DoubleSide })));
    for (let i = 0; i < 6; i++) {
      const bow = new THREE.Mesh(geo.box(0.3, 0.12, 0.02), keep(new THREE.MeshStandardMaterial({ color: [C.blue, C.sun, C.teal][i % 3], roughness: 0.6 })));
      bow.position.set(0, -1.6 - i * 0.55, 0);
      kite.add(bow);
    }
  }
  const NBU = 18;
  const bubbles = new THREE.InstancedMesh(geo.sphere(0.12, 12, 8), keep(new THREE.MeshStandardMaterial({ color: 0xdff4ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.38, emissive: 0x6ab0ff, emissiveIntensity: 0.15, depthWrite: false })), NBU);
  bubbles.frustumCulled = false;
  const bubP = new Float32Array(NBU * 3),
    bubL = new Float32Array(NBU);
  const tui = new THREE.Group();
  const tuiWings: THREE.Object3D[] = [];
  {
    const b = new Batch();
    b.add(geo.sphere(0.16, 10, 8), 0x1f3a3a, 0, 0, 0, 0, 0, 0, 0.8, 0.8, 1.4);
    b.add(geo.sphere(0.1, 10, 8), 0x1f3a3a, 0, 0.06, 0.2);
    b.add(geo.sphere(0.045, 6, 4), 0xffffff, 0, -0.04, 0.26);
    b.add(geo.cone(0.02, 0.1, 5), 0x111111, 0, 0.05, 0.32, Math.PI / 2, 0, 0);
    b.add(geo.cone(0.07, 0.22, 5), 0x1f3a3a, 0, 0, -0.3, -Math.PI / 2, 0, 0);
    tui.add(new THREE.Mesh(b.geometry(), vcMat(0.4)));
    for (const sx of [-1, 1]) {
      const w = new THREE.Group();
      const wm = new THREE.Mesh(geo.box(0.42, 0.02, 0.18), keep(new THREE.MeshStandardMaterial({ color: 0x2b4848, roughness: 0.5 })));
      wm.position.x = sx * 0.22;
      w.add(wm);
      w.position.set(sx * 0.06, 0.04, 0);
      tui.add(w);
      tuiWings.push(w);
    }
    tui.scale.setScalar(1.4);
  }
  group.add(dog, frisbee, kite, bubbles, tui);
  const dummy = new THREE.Object3D();
  let dogZ = 0,
    dogX = -9,
    dogT = 0,
    lastPZ = 0,
    runnerSpeed = 12,
    dogSide = -1;
  let tuiT = -1,
    nextTui = 3;
  const tuiFrom = new THREE.Vector3(),
    tuiTo = new THREE.Vector3();

  // ---- decor
  function buildDecor(req: DecorRequest): THREE.Object3D {
    const { d0, d1, rng: r } = req;
    const root = new THREE.Group();
    root.name = `outdoor-decor-${d0}`;
    root.add(floorStrip(d0, d1, -3.6, 3.6, trackMat(), 8.8));
    // bark chip shoulders, then grass out to the hills
    for (const sx of [-1, 1]) root.add(floorStrip(d0, d1, sx < 0 ? -6.2 : 3.6, sx < 0 ? -3.6 : 6.2, barkMat(), 2.6, 0.004, 1));
    root.add(floorStrip(d0, d1, -70, 70, grassMat(), 8, -0.01, 140 / 8));
    const b = new Batch();
    const I = new THREE.Matrix4();
    const len = d1 - d0;
    const q = quality === 'low' ? 0.6 : 1;
    // timber edging along the track and bark shoulders
    for (const sx of [-1, 1]) {
      b.addIn(I, geo.box(0.22, 0.16, len), C.woodLight, sx * 3.72, 0.08, -(d0 + len / 2));
      b.addIn(I, geo.box(0.16, 0.12, len), C.woodLight, sx * 6.25, 0.06, -(d0 + len / 2));
    }
    const swings: THREE.Object3D[] = [];
    const rockers: THREE.Object3D[] = [];
    const spinners: THREE.Object3D[] = [];
    const tilts: THREE.Object3D[] = [];

    for (const sx of [-1, 1]) {
      const face = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
      // near band (|x| 4..6.2, on bark): small things only
      let z = d0 + r() * 3;
      while (z < d1 - 1) {
        const k = r();
        const x = sx * range(r, 4.6, 5.6);
        if (k < 0.25) bench(b, frameM(sx * 4.75, 0, -(z + 1), face));
        else if (k < 0.5) bush(b, frameM(x, 0, -(z + 1), r() * 3), r);
        else if (k < 0.65) {
          // spring rider duck
          const M = frameM(x, 0, -(z + 1), face + (r() - 0.5));
          springRiderBase(b, M);
          const rider = new THREE.Group();
          const rb2 = new Batch();
          springDuck(rb2);
          rider.add(new THREE.Mesh(rb2.geometry(), vcMat(0.55)));
          rider.applyMatrix4(M.clone().multiply(frameM(0, 0.5, 0)));
          rider.userData.base = rider.rotation.clone();
          root.add(rider);
          rockers.push(rider);
        } else if (k < 0.8) treeFern(b, frameM(sx * range(r, 5.6, 6.0), 0, -(z + 1)), r);
        z += range(r, 4, 7);
      }
      // play band (|x| 8..16): big equipment on bark patches
      let zp = d0 + r() * 4;
      while (zp < d1 - 4) {
        const k = r();
        const x = sx * range(r, 10, 12.5);
        if (k < 0.24) {
          const M = frameM(x, 0, -(zp + 3), 0);
          swings.push(...swingSet(root, b, M, r));
          zp += 8;
        } else if (k < 0.44) {
          climbingFrame(b, frameM(sx * range(r, 11, 13), 0, -(zp + 3), face + (r() < 0.5 ? 0 : Math.PI)), r);
          zp += 9;
        } else if (k < 0.6) {
          sandpitProp(b, frameM(x, 0, -(zp + 2.5), r()), r);
          zp += 6;
        } else if (k < 0.76) {
          // a roundabout (spinning) on its bark patch
          const M = frameM(x, 0, -(zp + 2.5));
          barkPatch(b, M, 3.4, 3.4);
          const g = new THREE.Group();
          const sb = new Batch();
          sb.add(geo.cyl(1.0, 1.0, 0.12, 24), C.red, 0, 0.3, 0);
          for (let qq = 0; qq < 4; qq++) {
            const a = (qq / 4) * Math.PI * 2;
            sb.add(geo.cyl(0.03, 0.03, 0.7, 6), C.steel, Math.cos(a) * 0.75, 0.7, Math.sin(a) * 0.75);
            sb.add(geo.cyl(0.03, 0.03, 0.75, 6), C.steel, Math.cos(a) * 0.37, 1.05, Math.sin(a) * 0.37, Math.sin(a) * Math.PI / 2, 0, -Math.cos(a) * Math.PI / 2);
          }
          sb.add(geo.torus(0.75, 0.03, 6, 24), C.sun, 0, 1.05, 0, Math.PI / 2, 0, 0);
          sb.add(geo.cyl(0.25, 0.35, 0.25, 12), C.ink, 0, 0.12, 0);
          g.add(new THREE.Mesh(sb.geometry(), vcMat(0.6)));
          g.applyMatrix4(M);
          root.add(g);
          spinners.push(g);
          zp += 6;
        } else if (k < 0.88) {
          // see-saw along z, tilting
          const M = frameM(x, 0, -(zp + 2), 0);
          barkPatch(b, M, 1.8, 4.4);
          b.addIn(M, geo.cyl(0.1, 0.1, 0.6, 10), C.steel, 0, 0.45, 0, 0, 0, Math.PI / 2);
          b.addIn(M, wedgeGeo(0.4, 0.45, 0.6), C.blue, 0, 0, 0, 0, Math.PI / 2, 0);
          const tl = new THREE.Group();
          const tb = new Batch();
          tb.add(rb(0.36, 0.08, 3.6), C.red, 0, 0.06, 0);
          for (const sz of [-1, 1]) {
            tb.add(rb(0.36, 0.06, 0.4), C.ink, 0, 0.12, sz * 1.5);
            tb.add(geo.torus(0.1, 0.02, 4, 10, Math.PI), C.steel, 0, 0.1, sz * 1.2);
          }
          tl.add(new THREE.Mesh(tb.geometry(), vcMat(0.6)));
          tl.applyMatrix4(M.clone().multiply(frameM(0, 0.48, 0)));
          root.add(tl);
          tilts.push(tl);
          zp += 6;
        } else {
          picnicTable(b, frameM(x, 0, -(zp + 2), r()));
          zp += 5;
        }
      }
      // tree band (|x| 15..30)
      let zt = d0 + r() * 5;
      while (zt < d1) {
        const x = sx * range(r, 16, 28);
        const k = r();
        if (k < 0.38) pohutukawa(b, frameM(x, 0, -zt, r() * 6), r, range(r, 1.0, 1.4));
        else if (k < 0.72) roundTree(b, frameM(x, 0, -zt, r() * 6), r, range(r, 1.0, 1.5));
        else if (k < 0.88) cabbageTree(b, frameM(x, 0, -zt), r);
        else bush(b, frameM(x, 0, -zt, r() * 3), r);
        zt += range(r, 4, 8) / q;
      }
      // picket fence between play band and trees
      if (r() < 0.6) fence(b, frameM(sx * 14.6, 0, -(d0 + 20)), 30);
    }
    b.into(root, vcMat(0.8));
    void vcGlow;
    anims.add(root, -(d0 + len / 2), (t) => {
      swings.forEach((s, i) => (s.rotation.x = Math.sin(t * 2.2 + i * 1.3) * 0.5));
      rockers.forEach((s, i) => {
        s.rotation.x = Math.sin(t * 3 + i) * 0.12;
        s.rotation.z = Math.cos(t * 2.4 + i) * 0.06;
      });
      spinners.forEach((s, i) => (s.rotation.y = t * (0.8 + i * 0.2)));
      tilts.forEach((s, i) => (s.rotation.x = Math.sin(t * 1.4 + i * 2) * 0.22));
    });
    return root;
  }

  return {
    id: 'outdoor',
    name: 'Outdoor Playground',
    length: 1500,
    music: 'mus_outdoor',
    sections: [{ id: 'outdoor', label: 'Outdoor Playground', start: 0 }],
    sprinkleSfx: ['swing_creak', 'seesaw_thunk', 'roundabout_whirr', 'bird_tweet'],
    patterns: PATTERNS,
    build(ctx: StageBuildContext) {
      scene = ctx.scene;
      quality = ctx.quality;
      prevBg = scene.background;
      prevFog = scene.fog;
      const fogCol = 0xe6f3ee;
      scene.background = new THREE.Color(0xa9d8f5);
      scene.fog = new THREE.Fog(fogCol, 40, quality === 'low' ? 110 : 130);
      const hemi = new THREE.HemisphereLight(0xd6ecff, 0x9cc27a, 1.55);
      const sun = new THREE.DirectionalLight(0xfff0d2, 2.1);
      sun.position.set(-8, 14, 6);
      group.add(hemi, sun, sun.target, sky, backdrop, clouds, sunHalo, sunDisc);
      scene.add(group);
    },
    buildDecor,
    makeObstacle(req) {
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
        default:
          return moverLowObstacle(req);
      }
    },
    update(time, dt, _dist, playerPos) {
      const pz = playerPos.z;
      sky.position.set(playerPos.x, 0, pz);
      backdrop.position.set(0, 0, pz);
      clouds.position.set(0, 0, pz + ((time * 1.5) % 200) * 0); // clouds drift very slowly with time below
      clouds.position.x = Math.sin(time * 0.01) * 20;
      sunDisc.position.z = pz - 320;
      sunHalo.position.z = pz - 321;
      anims.run(time, dt, pz);
      if (dt > 0) runnerSpeed = runnerSpeed * 0.95 + (Math.abs(lastPZ - pz) / dt) * 0.05;
      lastPZ = pz;

      // dog chasing a frisbee along the grass, a little slower than the runner
      const rel = dogZ - pz;
      if (rel > 8 || rel < -90) {
        dogSide = Math.random() < 0.5 ? -1 : 1;
        dogZ = pz - 45 - Math.random() * 20;
        dogX = dogSide * (8.2 + Math.random() * 2);
        dogT = 0;
      }
      dogT += dt;
      const dogSpeed = Math.max(3, runnerSpeed * 0.55);
      dogZ -= dogSpeed * dt;
      const gait = dogT * 9;
      const leap = Math.max(0, Math.sin(dogT * 1.3)) > 0.97 ? Math.sin((dogT * 1.3) % Math.PI) : 0;
      dog.position.set(dogX + Math.sin(dogT * 0.7) * 1.2, Math.abs(Math.sin(gait)) * 0.08 + leap * 0.4, dogZ);
      dog.rotation.y = Math.PI + Math.cos(dogT * 0.7) * 0.25;
      dogParts.legs.forEach((l, i) => (l.rotation.x = Math.sin(gait + (i < 2 ? 0 : Math.PI)) * 0.7));
      dogParts.tail.rotation.z = Math.sin(time * 14) * 0.6;
      dogParts.tail.rotation.x = -0.6;
      dogParts.head.rotation.x = -0.2 + Math.sin(gait) * 0.05;
      // the frisbee floats ahead in long lazy arcs
      const ft = dogT * 0.8;
      frisbee.position.set(dogX + Math.sin(dogT * 0.7 + 0.6) * 1.6, 1.4 + Math.sin(ft * 2) * 0.5, dogZ - 3.2 - Math.sin(ft) * 1.2);
      frisbee.rotation.set(0.25, time * 12, 0.15);

      // kite high above the trees, swooping gently
      kite.position.set(-14 + Math.sin(time * 0.4) * 3, 15 + Math.sin(time * 0.7) * 1.5, pz - 55);
      kite.rotation.set(0.1, 0.3, Math.sin(time * 0.9) * 0.3);
      kite.children.forEach((c, i) => {
        if (i === 0) return;
        c.position.x = Math.sin(time * 3 - i * 0.7) * 0.25 * i * 0.3;
      });

      // bubbles drifting up beside the track
      for (let i = 0; i < NBU; i++) {
        const k = i * 3;
        bubL[i] -= dt;
        if (bubL[i] <= 0 || bubP[k + 2] - pz > 6) {
          const side = i % 2 ? 1 : -1;
          bubP[k] = side * (4.3 + Math.random() * 3);
          bubP[k + 1] = 0.8 + Math.random() * 1.2;
          bubP[k + 2] = pz - 12 - Math.random() * 30;
          bubL[i] = 5 + Math.random() * 4;
        }
        bubP[k + 1] += dt * 0.35;
        bubP[k] += Math.sin(time * 1.3 + i) * dt * 0.25;
        dummy.position.set(bubP[k], bubP[k + 1], bubP[k + 2]);
        dummy.scale.setScalar((0.6 + (i % 5) * 0.2) * Math.min(1, bubL[i]));
        dummy.updateMatrix();
        bubbles.setMatrixAt(i, dummy.matrix);
      }
      bubbles.instanceMatrix.needsUpdate = true;

      // a tui swoops across overhead now and then
      nextTui -= dt;
      if (tuiT < 0 && nextTui <= 0) {
        tuiT = 0;
        const side = Math.random() < 0.5 ? -1 : 1;
        tuiFrom.set(side * 26, 6 + Math.random() * 3, pz - 30 - Math.random() * 15);
        tuiTo.set(-side * 26, 7 + Math.random() * 3, tuiFrom.z - 10 - Math.random() * 10);
      }
      if (tuiT >= 0) {
        tuiT += dt / 4.5;
        const u = Math.min(1, tuiT);
        tui.position.lerpVectors(tuiFrom, tuiTo, u);
        tui.position.y += Math.sin(u * Math.PI) * 2 + Math.sin(time * 6) * 0.15;
        tui.lookAt(tuiTo.x, tui.position.y, tuiTo.z);
        const flap = Math.sin(time * 18) * 0.8;
        tuiWings[0].rotation.z = flap;
        tuiWings[1].rotation.z = -flap;
        tui.visible = true;
        if (u >= 1) {
          tuiT = -1;
          nextTui = 5 + Math.random() * 6;
          tui.visible = false;
        }
      } else tui.visible = false;
    },
    ambienceAt: () => 'amb_outdoor',
    dispose() {
      if (scene) {
        scene.remove(group);
        scene.background = prevBg;
        scene.fog = prevFog;
      }
      anims.clear();
      group.clear();
    },
  };
}

void PAL;
void ballGeo;
