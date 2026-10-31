// Indoor arcade: a cosy, dim games hall in teal / purple / warm amber. Glowing cabinets with
// animated screens, claw machines with plush toys and moving claws, prize counters, air hockey,
// ticket machines, neon strips. Little surprises: a cabinet hits JACKPOT (confetti + tickets),
// a friendly floor-cleaning robot trundles along the aisle.
import * as THREE from 'three';
import { LANE_WIDTH, type DecorRequest, type ObstacleRequest, type ObstacleVisual, type StageBuildContext, type StageModule, type StagePattern } from '../contracts';
import { blobShadow, canvasTexture, geo, pick, range } from '../kit/kit';
import {
  Batch,
  DecorAnims,
  FONT,
  Particles,
  atlasPlane,
  ballGeo,
  cached,
  floorStrip,
  frameM,
  glowAddMat,
  heartGeo,
  keep,
  laneOffsets,
  roundRect,
  starGeo,
  texMat,
  vcGlow,
  vcMat,
  visual,
  wedgeGeo,
} from './helpersA';

// Cohesive palette: deep indigo/purple bodies, teal + warm amber glow, a touch of soft pink.
const C = {
  bg: 0x1f1a3a,
  indigo: 0x2c2758,
  purple: 0x45397f,
  plum: 0x5b3a78,
  navy: 0x26325c,
  tealDark: 0x1f6670,
  teal: 0x46e0d2,
  amber: 0xffb75a,
  pink: 0xff86b8,
  lilac: 0xb79cff,
  cream: 0xfff1dc,
  white: 0xffffff,
  chrome: 0xc9cfe0,
  black: 0x15122a,
  wood: 0xc98f5a,
  felt: 0x2f8f7c,
};
const BODY = [C.purple, C.navy, C.plum, C.tealDark];
const NEON = [C.teal, C.amber, C.lilac, C.pink];
const PLUSH = [0xffb3c7, 0xffd98a, 0x9fe3cf, 0xa9cdf7, 0xd2b8ff, 0xf6efe4];

const WALL_X = 17;
const CEIL_Y = 7.5;

// ------------------------------------------------------------------ textures
function carpet(w: number, h: number, base: string, density: number, alpha: number): (g: CanvasRenderingContext2D) => void {
  return (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const cols = [`rgba(70,224,210,${alpha})`, `rgba(255,183,90,${alpha})`, `rgba(183,156,255,${alpha})`, `rgba(255,134,184,${alpha * 0.8})`];
    let seed = 7;
    const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < density; i++) {
      const x = R() * w,
        y = R() * h,
        c = cols[Math.floor(R() * cols.length)],
        s = 5 + R() * 7;
      g.strokeStyle = c;
      g.fillStyle = c;
      g.lineWidth = 2.5;
      const k = R();
      if (k < 0.3) {
        // 4-point sparkle
        g.beginPath();
        g.moveTo(x, y - s);
        g.lineTo(x + s * 0.25, y - s * 0.25);
        g.lineTo(x + s, y);
        g.lineTo(x + s * 0.25, y + s * 0.25);
        g.lineTo(x, y + s);
        g.lineTo(x - s * 0.25, y + s * 0.25);
        g.lineTo(x - s, y);
        g.lineTo(x - s * 0.25, y - s * 0.25);
        g.closePath();
        g.fill();
      } else if (k < 0.55) {
        g.beginPath();
        g.arc(x, y, s * 0.6, 0, Math.PI * 2);
        g.stroke();
      } else if (k < 0.8) {
        g.beginPath();
        g.moveTo(x - s, y);
        g.quadraticCurveTo(x - s / 2, y - s, x, y);
        g.quadraticCurveTo(x + s / 2, y + s, x + s, y);
        g.stroke();
      } else {
        g.beginPath();
        g.arc(x, y, 2.2, 0, Math.PI * 2);
        g.fill();
      }
    }
  };
}
function trackTexture(): THREE.Texture {
  // 7.2 m x 4.4 m @ 80 px/m
  return canvasTexture(576, 352, (g, w, h) => {
    carpet(w, h, '#3d3478', 90, 0.5)(g);
    // lanes: slightly different carpet runners for readability
    g.fillStyle = 'rgba(255,255,255,0.045)';
    g.fillRect(200, 0, 176, h);
    // lane separators: soft amber stitched bands
    for (const x of [200, 376]) {
      g.fillStyle = 'rgba(20,16,40,0.55)';
      g.fillRect(x - 5, 0, 10, h);
      g.fillStyle = 'rgba(255,183,90,0.6)';
      for (let y = 8; y < h; y += 44) g.fillRect(x - 2, y, 4, 24);
    }
    // edges
    g.fillStyle = '#1c1736';
    g.fillRect(0, 0, 24, h);
    g.fillRect(w - 24, 0, 24, h);
  });
}
function sideTexture(): THREE.Texture {
  return canvasTexture(256, 256, (g, w, h) => carpet(w, h, '#262049', 60, 0.33)(g));
}
function wallTexture(): THREE.Texture {
  // 40 m x 7.5 m dark wall with neon wave stripes and starry dots
  return canvasTexture(1024, 192, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#1b1733');
    grd.addColorStop(1, '#2c2552');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(255,255,255,${0.1 + Math.random() * 0.25})`;
      g.fillRect(Math.random() * w, Math.random() * h * 0.55, 1.5, 1.5);
    }
    const wave = (y: number, c: string, amp: number, f: number) => {
      g.strokeStyle = c;
      g.lineWidth = 4;
      g.shadowColor = c;
      g.shadowBlur = 10;
      g.beginPath();
      for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin((x / w) * Math.PI * 2 * f) * amp);
      g.stroke();
      g.shadowBlur = 0;
    };
    wave(h * 0.62, '#46e0d2', 6, 4);
    wave(h * 0.7, '#ffb75a', 5, 4);
    // dado
    g.fillStyle = '#17132b';
    g.fillRect(0, h * 0.84, w, h * 0.16);
  });
}

/** Four tiny friendly games drawn into a 2x2 atlas; redrawn a few times a second. */
class ScreenAtlas {
  readonly tex: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;
  private acc = 0;
  constructor() {
    this.tex = canvasTexture(512, 384, () => {});
    this.tex.anisotropy = 1;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
    this.g = (this.tex.image as HTMLCanvasElement).getContext('2d')!;
    this.draw(0);
  }
  update(t: number, dt: number): void {
    this.acc += dt;
    if (this.acc < 1 / 12) return;
    this.acc = 0;
    this.draw(t);
    this.tex.needsUpdate = true;
  }
  private draw(t: number): void {
    const g = this.g;
    const W = 256,
      H = 192;
    // 0: fruit catcher
    this.cell(0, 0, '#1d3b6b', () => {
      for (let i = 0; i < 5; i++) {
        const x = 30 + i * 46,
          y = ((t * 60 + i * 53) % 170) + 6;
        g.fillStyle = ['#ff9a3c', '#f0564a', '#8bc34a', '#ffe066', '#e85d8a'][i];
        g.beginPath();
        g.arc(x, y, 9, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#4fae5a';
        g.fillRect(x - 1, y - 13, 3, 5);
      }
      const bx = 128 + Math.sin(t * 1.7) * 90;
      g.fillStyle = '#c98f5a';
      roundRect(g, bx - 26, 160, 52, 22, 8);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `700 18px ${FONT}`;
      g.fillText(String(100 + Math.floor(t * 7) * 10), 10, 22);
    });
    // 1: brick breaker
    this.cell(1, 0, '#2a1f4f', () => {
      const cols = ['#ff86b8', '#ffb75a', '#46e0d2', '#b79cff'];
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 8; c++) {
          if ((r * 8 + c + Math.floor(t * 0.8)) % 7 === 0) continue;
          g.fillStyle = cols[r];
          roundRect(g, 8 + c * 30, 14 + r * 16, 26, 12, 3);
          g.fill();
        }
      const px = 128 + Math.sin(t * 2.1) * 80;
      const bx = 128 + Math.sin(t * 2.1 + 0.3) * 80,
        by = 100 + Math.sin(t * 4.2) * 60;
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(bx, by, 6, 0, Math.PI * 2);
      g.fill();
      roundRect(g, px - 28, 172, 56, 9, 4);
      g.fill();
    });
    // 2: racer
    this.cell(0, 1, '#2f7d5a', () => {
      g.fillStyle = '#8fd3ff';
      g.fillRect(0, 0, W, 60);
      g.fillStyle = '#5b5f73';
      g.beginPath();
      g.moveTo(110, 60);
      g.lineTo(146, 60);
      g.lineTo(240, H);
      g.lineTo(16, H);
      g.closePath();
      g.fill();
      g.fillStyle = '#ffe066';
      for (let i = 0; i < 6; i++) {
        const u = ((t * 1.6 + i / 6) % 1) ** 2;
        const y = 60 + u * (H - 60);
        g.fillRect(127 - u * 4, y, 2 + u * 8, 6 + u * 14);
      }
      const cx = 128 + Math.sin(t * 1.3) * 50;
      g.fillStyle = '#f0564a';
      roundRect(g, cx - 22, 148, 44, 30, 8);
      g.fill();
      g.fillStyle = '#24304a';
      g.fillRect(cx - 24, 170, 10, 10);
      g.fillRect(cx + 14, 170, 10, 10);
    });
    // 3: kiwi hop over ferns
    this.cell(1, 1, '#ffd9a8', () => {
      g.fillStyle = '#7cc46a';
      g.fillRect(0, 150, W, 42);
      for (let i = 0; i < 4; i++) {
        const x = W - ((t * 70 + i * 80) % (W + 40));
        g.fillStyle = '#2f8f4a';
        g.beginPath();
        g.moveTo(x, 150);
        g.lineTo(x + 10, 120);
        g.lineTo(x + 20, 150);
        g.fill();
      }
      const hop = Math.abs(Math.sin(t * 3.4)) * 46;
      g.fillStyle = '#8a5a3a';
      g.beginPath();
      g.ellipse(70, 132 - hop, 20, 16, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#e8b04a';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(86, 128 - hop);
      g.lineTo(104, 136 - hop);
      g.stroke();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(80, 126 - hop, 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffc94a';
      g.beginPath();
      g.arc(214, 36, 18, 0, Math.PI * 2);
      g.fill();
    });
  }
  private cell(cx: number, cy: number, bg: string, body: () => void): void {
    const g = this.g;
    g.save();
    g.translate(cx * 256, cy * 192);
    g.beginPath();
    g.rect(0, 0, 256, 192);
    g.clip();
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 192);
    body();
    // soft scanlines + vignette
    g.fillStyle = 'rgba(0,0,0,0.08)';
    for (let y = 0; y < 192; y += 4) g.fillRect(0, y, 256, 1);
    g.restore();
  }
}

// ------------------------------------------------------------------ prop builders (Batches in world coords)
interface Bat {
  b: Batch; // lit bodies
  glow: Batch; // unlit neon
  halo: Batch; // additive soft halos
  screens: Batch; // screen quads (atlas)
  glass: Batch; // faint transparent glass
}
const rb = (w: number, h: number, d: number, r = 0.06) => geo.rbox(w, h, d, r, 2);
const rb1 = (w: number, h: number, d: number, r = 0.05) => geo.rbox(w, h, d, r, 1);
const sp = (r: number) => geo.sphere(r, 7, 5);

/** Classic upright cabinet; local frame faces +Z (screen toward +Z). */
function cabinet(B: Bat, M: THREE.Matrix4, r: () => number, H = 2.25): void {
  const body = pick(r, BODY);
  const neon = pick(r, NEON);
  const W = 0.95,
    D = 0.85;
  B.b.addIn(M, rb1(W, H * 0.48, D), body, 0, (H * 0.48) / 2, 0);
  B.b.addIn(M, rb1(W, H * 0.44, D * 0.62), body, 0, H * 0.48 + (H * 0.44) / 2, -D * 0.19);
  // control panel
  B.b.addIn(M, geo.box(W, 0.12, 0.42), C.black, 0, H * 0.48 + 0.02, D * 0.24, 0.35, 0, 0);
  B.b.addIn(M, geo.cyl(0.025, 0.025, 0.14, 6), C.chrome, -0.22, H * 0.48 + 0.15, D * 0.3);
  B.b.addIn(M, geo.sphere(0.055, 6, 4), C.pink, -0.22, H * 0.48 + 0.23, D * 0.3);
  for (let i = 0; i < 3; i++) B.glow.addIn(M, geo.cyl(0.04, 0.04, 0.03, 6), NEON[(i + 1) % 4], 0.06 + i * 0.12, H * 0.48 + 0.12, D * 0.26 - i * 0.02, 0.35, 0, 0);
  // screen, slightly tilted back
  B.b.addIn(M, geo.box(W - 0.12, 0.66, 0.05), C.black, 0, H * 0.7, D * 0.12 + 0.01, -0.12, 0, 0);
  B.screens.addIn(M, atlasPlane(0.72, 0.54, 2, 2, Math.floor(r() * 4)), 0xffffff, 0, H * 0.7, D * 0.12 + 0.045, -0.12, 0, 0);
  // marquee
  B.b.addIn(M, rb1(W, 0.3, D * 0.7), body, 0, H * 0.92 + 0.15, -D * 0.12);
  B.glow.addIn(M, geo.box(W - 0.1, 0.22, 0.02), neon, 0, H * 0.92 + 0.15, D * 0.24);
  B.halo.addIn(M, geo.plane(1.9, 1.0), neon, 0, H * 0.92 + 0.15, D * 0.3);
  // side art stripes
  for (const sx of [-1, 1]) B.glow.addIn(M, geo.box(0.02, H * 0.85, 0.05), neon, sx * (W / 2 + 0.005), H * 0.45, D * 0.38);
  // coin door
  B.b.addIn(M, geo.box(0.34, 0.3, 0.03), C.black, 0, 0.55, D / 2 + 0.01);
  B.glow.addIn(M, geo.box(0.05, 0.1, 0.02), C.amber, -0.07, 0.6, D / 2 + 0.03);
  B.glow.addIn(M, geo.box(0.05, 0.1, 0.02), C.amber, 0.07, 0.6, D / 2 + 0.03);
}

/** Distant cabinet silhouette: body, screen, marquee glow. */
function cabinetLite(B: Bat, M: THREE.Matrix4, r: () => number, H = 2.3): void {
  const body = pick(r, BODY);
  const neon = pick(r, NEON);
  B.b.addIn(M, geo.box(0.95, H, 0.85), body, 0, H / 2, 0);
  B.screens.addIn(M, atlasPlane(0.72, 0.54, 2, 2, Math.floor(r() * 4)), 0xffffff, 0, H * 0.7, 0.43, -0.1, 0, 0);
  B.glow.addIn(M, geo.box(0.85, 0.22, 0.02), neon, 0, H - 0.17, 0.43);
  B.halo.addIn(M, geo.plane(1.6, 0.9), neon, 0, H - 0.17, 0.5);
}

function plushToy(b: Batch, M: THREE.Matrix4, x: number, y: number, z: number, s: number, col: number, kind: number, ry = 0, simple = false): void {
  const L = M.clone().multiply(frameM(x, y, z, ry, s));
  if (simple) {
    b.addIn(L, sp(0.16), col, 0, 0.14, 0);
    b.addIn(L, sp(0.12), col, 0, 0.36, 0.02);
    if (kind !== 1) {
      b.addIn(L, geo.sphere(0.05, 5, 3), col, -0.09, 0.46, 0);
      b.addIn(L, geo.sphere(0.05, 5, 3), col, 0.09, 0.46, 0);
    }
    return;
  }
  if (kind === 0) {
    // teddy bear
    b.addIn(L, sp(0.16), col, 0, 0.14, 0);
    b.addIn(L, sp(0.12), col, 0, 0.36, 0.02);
    b.addIn(L, sp(0.05), col, -0.09, 0.46, 0);
    b.addIn(L, sp(0.05), col, 0.09, 0.46, 0);
    b.addIn(L, sp(0.045), C.cream, 0, 0.33, 0.12);
    b.addIn(L, geo.sphere(0.018, 4, 2), C.black, -0.045, 0.39, 0.11);
    b.addIn(L, geo.sphere(0.018, 4, 2), C.black, 0.045, 0.39, 0.11);
  } else if (kind === 1) {
    // round chick / duckling plush
    b.addIn(L, sp(0.18), col, 0, 0.17, 0);
    b.addIn(L, geo.cone(0.05, 0.09, 5), C.amber, 0, 0.2, 0.19, Math.PI / 2, 0, 0);
    b.addIn(L, geo.sphere(0.02, 4, 2), C.black, -0.07, 0.26, 0.14);
    b.addIn(L, geo.sphere(0.02, 4, 2), C.black, 0.07, 0.26, 0.14);
  } else {
    // bunny
    b.addIn(L, sp(0.15), col, 0, 0.14, 0);
    b.addIn(L, sp(0.11), col, 0, 0.33, 0.02);
    b.addIn(L, geo.cyl(0.035, 0.03, 0.2, 5), col, -0.05, 0.5, 0, 0, 0, 0.15);
    b.addIn(L, geo.cyl(0.035, 0.03, 0.2, 5), col, 0.05, 0.5, 0, 0, 0, -0.15);
    b.addIn(L, geo.sphere(0.018, 4, 2), C.black, -0.04, 0.36, 0.1);
    b.addIn(L, geo.sphere(0.018, 4, 2), C.black, 0.04, 0.36, 0.1);
  }
}

/** Claw machine, local frame faces +Z. Returns the claw rig group (animated separately). */
function clawMachine(B: Bat, M: THREE.Matrix4, r: () => number, H = 2.35, animated = true): THREE.Group | null {
  const W = 1.25,
    D = 1.15;
  const body = pick(r, [C.plum, C.tealDark, C.purple]);
  const neon = pick(r, [C.pink, C.teal, C.amber]);
  const base = 0.95;
  B.b.addIn(M, rb(W, base, D), body, 0, base / 2, 0);
  B.b.addIn(M, rb(0.36, 0.28, 0.06), C.black, W * 0.22, 0.4, D / 2 + 0.01);
  B.glow.addIn(M, geo.box(0.3, 0.06, 0.02), neon, W * 0.22, 0.58, D / 2 + 0.04);
  // corner posts + roof
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.b.addIn(M, geo.box(0.06, H - base - 0.3, 0.06), C.chrome, (sx * (W - 0.06)) / 2, base + (H - base - 0.3) / 2, (sz * (D - 0.06)) / 2);
  B.b.addIn(M, rb(W, 0.32, D), body, 0, H - 0.16, 0);
  B.glow.addIn(M, geo.box(W - 0.12, 0.2, 0.02), neon, 0, H - 0.16, D / 2 + 0.01);
  B.halo.addIn(M, geo.plane(2.2, 1.0), neon, 0, H - 0.1, D / 2 + 0.08);
  // interior: soft backlight + heap of plush
  B.glow.addIn(M, geo.box(W - 0.1, H - base - 0.32, 0.02), 0x3d3a7a, 0, base + (H - base - 0.32) / 2, -D / 2 + 0.05);
  for (let i = 0; i < 10; i++) plushToy(B.b, M, (r() - 0.5) * (W - 0.4), base, (r() - 0.5) * (D - 0.4), range(r, 0.7, 0.95), pick(r, PLUSH), Math.floor(r() * 3), (r() - 0.5) * 1.2);
  // glass (front + sides)
  B.glass.addIn(M, geo.plane(W - 0.08, H - base - 0.32), 0xbfe6ff, 0, base + (H - base - 0.32) / 2, D / 2 - 0.02);
  for (const sx of [-1, 1]) B.glass.addIn(M, geo.plane(D - 0.08, H - base - 0.32), 0xbfe6ff, (sx * (W - 0.04)) / 2, base + (H - base - 0.32) / 2, 0, 0, (sx * Math.PI) / 2, 0);
  // control panel
  B.b.addIn(M, rb(W, 0.1, 0.3), C.black, 0, base + 0.02, D / 2 + 0.12);
  B.b.addIn(M, geo.sphere(0.06, 8, 6), C.pink, -0.2, base + 0.14, D / 2 + 0.12);
  B.glow.addIn(M, geo.cyl(0.05, 0.05, 0.04, 10), C.teal, 0.2, base + 0.09, D / 2 + 0.12);
  // claw rig (separate + animated, or merged static)
  const cb = animated ? new Batch() : null;
  if (!cb) {
    const T = M.clone().multiply(frameM((r() - 0.5) * 0.4, H - 0.38, (r() - 0.5) * 0.4));
    clawParts(B.b, T);
    return null;
  }
  clawParts(cb, new THREE.Matrix4());
  const rig = new THREE.Group();
  rig.add(new THREE.Mesh(cb.geometry(), vcMat(0.35)));
  rig.userData = { top: H - 0.38, base: base + 0.75, W, D };
  rig.position.set(0, H - 0.38, 0);
  return rig;
}

function clawParts(b: Batch, T: THREE.Matrix4): void {
  b.addIn(T, geo.box(0.12, 0.08, 0.12), C.chrome, 0, 0, 0);
  b.addIn(T, geo.cyl(0.008, 0.008, 0.5, 3), C.chrome, 0, -0.25, 0);
  b.addIn(T, geo.sphere(0.05, 8, 6), C.chrome, 0, -0.52, 0);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.addIn(T, geo.cyl(0.012, 0.012, 0.18, 4), C.chrome, Math.cos(a) * 0.06, -0.6, Math.sin(a) * 0.06, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
  }
}

function ticketMachine(B: Bat, M: THREE.Matrix4, r: () => number): void {
  const body = pick(r, BODY);
  B.b.addIn(M, rb(0.7, 1.8, 0.6), body, 0, 0.9, 0);
  B.b.addIn(M, geo.cyl(0.24, 0.24, 0.4, 16), body, 0, 1.95, 0, Math.PI / 2, 0, 0);
  B.glow.addIn(M, geo.cyl(0.17, 0.17, 0.42, 16), 0xe0a04e, 0, 1.95, 0.02, Math.PI / 2, 0, 0);
  B.glow.addIn(M, geo.box(0.5, 0.1, 0.02), C.teal, 0, 1.55, 0.31);
  B.halo.addIn(M, geo.plane(0.9, 0.9), 0x8a5a20, 0, 1.95, 0.3);
  // ticket strip spilling out
  for (let i = 0; i < 6; i++) B.b.addIn(M, geo.box(0.16, 0.01, 0.12), C.amber, 0.05 * Math.sin(i), 1.0 - i * 0.14, 0.33 + i * 0.03, 0.9 + i * 0.15, 0, 0);
  B.b.addIn(M, geo.box(0.24, 0.04, 0.05), C.black, 0, 1.05, 0.31);
}

function hoopShooter(B: Bat, M: THREE.Matrix4, r: () => number): void {
  // basketball arcade lane, extends along local -Z from the front at z=0
  const body = pick(r, BODY);
  const neon = pick(r, [C.teal, C.amber]);
  const len = 2.6;
  B.b.addIn(M, wedgeGeo(1.0, 0.5, len), body, 0, 0.45, -len / 2, 0, Math.PI, 0);
  B.b.addIn(M, rb(1.05, 0.45, len), body, 0, 0.225, -len / 2);
  for (const sx of [-1, 1]) B.glass.addIn(M, geo.plane(len, 1.4), 0xbfe6ff, sx * 0.5, 1.5, -len / 2, 0, (sx * Math.PI) / 2, 0);
  B.b.addIn(M, rb(1.1, 2.6, 0.12), body, 0, 1.3, -len);
  B.b.addIn(M, rb(0.8, 0.55, 0.04), C.white, 0, 2.0, -len + 0.08);
  B.glow.addIn(M, geo.torus(0.2, 0.025, 6, 16), neon, 0, 1.75, -len + 0.32, Math.PI / 2, 0, 0);
  B.glow.addIn(M, geo.box(0.9, 0.18, 0.02), neon, 0, 2.48, -len + 0.08);
  B.halo.addIn(M, geo.plane(1.8, 1.2), neon, 0, 2.2, -len + 0.2);
  for (let i = 0; i < 5; i++) B.b.addIn(M, ballGeo(0.12), C.amber, (i - 2) * 0.17, 0.62, -0.3 - (i % 2) * 0.1);
}

function airHockeyTable(B: Bat, M: THREE.Matrix4, r: () => number, L = 2.4, W = 1.3, H = 0.85): THREE.Group {
  const body = pick(r, BODY);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.b.addIn(M, geo.box(0.1, H - 0.2, 0.1), C.black, (sx * (W - 0.3)) / 2, (H - 0.2) / 2, (sz * (L - 0.4)) / 2);
  B.b.addIn(M, rb(W, 0.22, L), body, 0, H - 0.13, 0);
  B.b.addIn(M, geo.box(W - 0.14, 0.02, L - 0.14), 0xeef6ff, 0, H - 0.01, 0);
  B.glow.addIn(M, geo.box(W - 0.06, 0.03, 0.04), C.teal, 0, H - 0.005, L / 2 - 0.05);
  B.glow.addIn(M, geo.box(W - 0.06, 0.03, 0.04), C.pink, 0, H - 0.005, -L / 2 + 0.05);
  B.glow.addIn(M, geo.box(0.04, 0.03, L - 0.1), C.lilac, W / 2 - 0.05, H - 0.005, 0);
  B.glow.addIn(M, geo.box(0.04, 0.03, L - 0.1), C.lilac, -W / 2 + 0.05, H - 0.005, 0);
  B.b.addIn(M, geo.box(W - 0.2, 0.005, 0.02), C.pink, 0, H + 0.003, 0);
  B.b.addIn(M, geo.torus(0.22, 0.012, 4, 16), C.pink, 0, H + 0.003, 0, Math.PI / 2, 0, 0);
  B.b.addIn(M, geo.cyl(0.08, 0.1, 0.05, 12), C.teal, 0.2, H + 0.025, L / 2 - 0.35);
  B.b.addIn(M, geo.cyl(0.08, 0.1, 0.05, 12), C.pink, -0.15, H + 0.025, -L / 2 + 0.4);
  const pb = new Batch();
  pb.add(geo.cyl(0.07, 0.07, 0.02, 12), C.amber, 0, 0, 0);
  const puck = new THREE.Mesh(pb.geometry(), vcGlow());
  const g = new THREE.Group();
  g.add(puck);
  g.userData = { W, L, H };
  return g;
}

function prizeWall(B: Bat, M: THREE.Matrix4, r: () => number, len: number): void {
  // back wall shelves full of plush, with a counter in front. local frame faces +Z.
  B.b.addIn(M, rb(len, 4.2, 0.4), C.indigo, 0, 2.1, -0.6);
  for (let s = 0; s < 3; s++) {
    const y = 1.3 + s * 0.95;
    B.b.addIn(M, geo.box(len - 0.3, 0.06, 0.5), C.wood, 0, y, -0.25);
    B.glow.addIn(M, geo.box(len - 0.3, 0.03, 0.02), s % 2 ? C.teal : C.amber, 0, y - 0.04, 0.01);
    for (let x = -len / 2 + 0.35; x < len / 2 - 0.2; x += range(r, 0.45, 0.6)) plushToy(B.b, M, x, y + 0.03, -0.28, range(r, 0.95, 1.25), pick(r, PLUSH), Math.floor(r() * 3), (r() - 0.5) * 0.6, true);
  }
  // counter
  B.b.addIn(M, rb(len * 0.8, 1.05, 0.7), C.purple, 0, 0.525, 1.4);
  B.b.addIn(M, rb(len * 0.8 + 0.1, 0.08, 0.8), C.wood, 0, 1.09, 1.4);
  B.glow.addIn(M, geo.box(len * 0.8 - 0.1, 0.05, 0.02), C.amber, 0, 0.9, 1.76);
  B.glow.addIn(M, geo.box(len * 0.8 - 0.1, 0.05, 0.02), C.teal, 0, 0.15, 1.76);
  for (let i = 0; i < 5; i++) B.b.addIn(M, geo.cyl(0.08, 0.08, 0.22, 10), PLUSH[i], -len * 0.3 + i * 0.3, 1.24, 1.4);
}

// a few cached neon sign textures
const signCache = new Map<string, THREE.Material>();
function neonSignMat(text: string, color: string): THREE.Material {
  const key = `${text}|${color}`;
  let m = signCache.get(key);
  if (!m) {
    const tex = canvasTexture(512, 160, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.font = `700 104px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = color;
      g.shadowBlur = 26;
      g.strokeStyle = color;
      g.lineWidth = 10;
      g.strokeText(text, w / 2, h / 2 + 6);
      g.shadowBlur = 8;
      g.fillStyle = '#fffaf0';
      g.fillText(text, w / 2, h / 2 + 6);
    });
    m = keep(new THREE.MeshBasicMaterial({ toneMapped: false, map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    signCache.set(key, m);
  }
  return m;
}
let signAtlas: THREE.Material | null = null;
/** All four neon signs in one 1x4 atlas so a stretch's signs merge into a single draw call. */
function signAtlasMat(): THREE.Material {
  if (!signAtlas) {
    const tex = canvasTexture(512, 640, (g, w) => {
      g.clearRect(0, 0, w, 640);
      SIGNS.forEach(([text, color], i) => {
        const cy = i * 160 + 86;
        g.font = `700 104px ${FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.shadowColor = color;
        g.shadowBlur = 26;
        g.strokeStyle = color;
        g.lineWidth = 10;
        g.strokeText(text, w / 2, cy);
        g.shadowBlur = 8;
        g.fillStyle = '#fffaf0';
        g.fillText(text, w / 2, cy);
      });
    });
    signAtlas = keep(new THREE.MeshBasicMaterial({ toneMapped: false, map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  }
  return signAtlas;
}
const SIGNS: [string, string][] = [
  ['PRIZES', '#ffb75a'],
  ['GAME ON', '#46e0d2'],
  ['BONUS!', '#ff86b8'],
  ['HI-SCORE', '#b79cff'],
];

// ------------------------------------------------------------------ obstacles
function bats(): Bat {
  return { b: new Batch(), glow: new Batch(), halo: new Batch(), screens: new Batch(), glass: new Batch() };
}
function finish(B: Bat, into: THREE.Object3D, screenMat: THREE.Material | null): void {
  B.b.into(into, vcMat(0.6));
  B.glow.into(into, vcGlow());
  const h = B.halo.build(glowAddMat());
  if (h) {
    h.userData.noCollide = true;
    h.renderOrder = 2;
    into.add(h);
  }
  if (screenMat) B.screens.into(into, screenMat);
  const gl = B.glass.build(glassMat());
  if (gl) {
    gl.userData.noCollide = true;
    gl.renderOrder = 1;
    into.add(gl);
  }
}
let _glass: THREE.Material | null = null;
function glassMat(): THREE.Material {
  if (!_glass) _glass = keep(new THREE.MeshBasicMaterial({ toneMapped: false, vertexColors: true, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  return _glass;
}

// ------------------------------------------------------------------ patterns
const PATTERNS: StagePattern[] = [
  { id: 'ar-hockey-hop', difficulty: 1, length: 30, items: [
    { dz: 4, lane: 0, kind: 'low', laneSpan: 3, height: 0.85 },
    { dz: 17, lane: -1, kind: 'block', height: 2.8 },
    { dz: 17, lane: 1, kind: 'block', height: 2.8 },
  ] },
  { id: 'ar-neon-gate', difficulty: 1, length: 28, items: [
    { dz: 4, lane: 0, kind: 'high', laneSpan: 3, height: 2.6 },
    { dz: 18, lane: 0, kind: 'block', height: 3.0 },
  ] },
  { id: 'ar-cabinet-alley', difficulty: 1, length: 40, items: [
    { dz: 4, lane: -1, kind: 'block', laneSpan: 2, height: 2.8 },
    { dz: 17, lane: 0, kind: 'block', laneSpan: 2, height: 2.8 },
    { dz: 30, lane: -1, kind: 'block', height: 3.0 },
    { dz: 30, lane: 1, kind: 'block', height: 3.0 },
  ] },
  { id: 'ar-prize-counter', difficulty: 2, length: 46, items: [
    { dz: 4, lane: 0, kind: 'ramp', length: 8 },
    { dz: 20, lane: 0, kind: 'platform', length: 24 },
    { dz: 12, lane: -1, kind: 'block', height: 2.8 },
    { dz: 22, lane: 1, kind: 'low', height: 0.85 },
    { dz: 42, lane: 0, kind: 'high', laneSpan: 3, height: 2.6 },
  ] },
  { id: 'ar-puck-slide', difficulty: 2, length: 32, items: [
    { dz: 4, lane: 1, kind: 'moverLow', dir: -1 },
    { dz: 16, lane: 0, kind: 'high', laneSpan: 2, height: 2.5 },
    { dz: 16, lane: -1, kind: 'block', height: 2.8 },
    { dz: 29, lane: -1, kind: 'moverLow', dir: 1 },
  ] },
  { id: 'ar-capsule-roll', difficulty: 2, length: 34, items: [
    { dz: 4, lane: -1, kind: 'moverBlock', dir: 1 },
    { dz: 17, lane: 0, kind: 'low', laneSpan: 3, height: 0.8 },
    { dz: 30, lane: 1, kind: 'moverBlock', dir: -1 },
  ] },
  { id: 'ar-claw-row', difficulty: 2, length: 36, items: [
    { dz: 4, lane: -1, kind: 'block', height: 2.6 },
    { dz: 4, lane: 0, kind: 'low', height: 0.85 },
    { dz: 4, lane: 1, kind: 'block', height: 2.6 },
    { dz: 17, lane: 0, kind: 'block', height: 3.0 },
    { dz: 32, lane: 0, kind: 'high', laneSpan: 3, height: 2.6 },
  ] },
  { id: 'ar-skeeball-steps', difficulty: 3, length: 56, items: [
    { dz: 4, lane: 1, kind: 'ramp', length: 8 },
    { dz: 18, lane: 1, kind: 'platform', length: 20 },
    { dz: 12, lane: 0, kind: 'block', height: 2.8 },
    { dz: 26, lane: -1, kind: 'ramp', length: 8 },
    { dz: 40, lane: -1, kind: 'platform', length: 20 },
    { dz: 40, lane: 0, kind: 'high', height: 2.5 },
    { dz: 52, lane: 0, kind: 'low', laneSpan: 3, height: 0.8 },
  ] },
  { id: 'ar-jackpot-dash', difficulty: 3, length: 46, items: [
    { dz: 4, lane: 0, kind: 'high', laneSpan: 3, height: 2.6 },
    { dz: 14, lane: -1, kind: 'block', height: 2.8 },
    { dz: 14, lane: 0, kind: 'block', height: 2.8 },
    { dz: 24, lane: 1, kind: 'low', height: 0.85 },
    { dz: 24, lane: 0, kind: 'moverLow', dir: -1 },
    { dz: 35, lane: 0, kind: 'block', laneSpan: 2, height: 3.0 },
    { dz: 44, lane: 0, kind: 'high', laneSpan: 3, height: 2.5 },
  ] },
  { id: 'ar-bonus-zigzag', difficulty: 3, length: 44, items: [
    { dz: 4, lane: 0, kind: 'moverBlock', dir: -1 },
    { dz: 15, lane: 1, kind: 'block', height: 3.0 },
    { dz: 15, lane: -1, kind: 'high', height: 2.5 },
    { dz: 27, lane: -1, kind: 'block', height: 3.0 },
    { dz: 27, lane: 1, kind: 'low', height: 0.85 },
    { dz: 40, lane: 0, kind: 'low', laneSpan: 3, height: 0.7 },
  ] },
  { id: 'ar-counter-hop', difficulty: 1, length: 26, items: [
    { dz: 4, lane: -1, kind: 'ramp', length: 8 },
    { dz: 14, lane: -1, kind: 'platform', length: 12 },
    { dz: 14, lane: 1, kind: 'block', height: 2.6 },
  ] },
  { id: 'ar-ticket-rolls', difficulty: 1, length: 32, items: [
    { dz: 4, lane: -1, kind: 'low', laneSpan: 2, height: 0.7 },
    { dz: 16, lane: 0, kind: 'low', laneSpan: 2, height: 0.7 },
    { dz: 28, lane: 0, kind: 'low', laneSpan: 3, height: 0.6 },
  ] },
];

// ------------------------------------------------------------------ the stage
export function createArcadeStage(): StageModule {
  const group = new THREE.Group();
  group.name = 'arcade-stage';
  const anims = new DecorAnims();
  let quality: 'low' | 'high' = 'high';
  let scene: THREE.Scene | null = null;
  let prevBg: THREE.Scene['background'] = null;
  let prevFog: THREE.Fog | THREE.FogExp2 | null = null;

  const atlas = new ScreenAtlas();
  const haloCache = new Map<number, THREE.Material>();
  const puckMat = keep(new THREE.MeshBasicMaterial({ toneMapped: false, color: C.amber }));
  const screenMat = keep(new THREE.MeshBasicMaterial({ map: atlas.tex, toneMapped: false }));
  const trackMat = () => texMat('arcade-track', trackTexture, { repeat: true, rough: 0.95 });
  const sideMat = () => texMat('arcade-side', sideTexture, { repeat: true, rough: 0.95 });
  const wallMat = () => texMat('arcade-wall', wallTexture, { repeat: true, unlit: true });

  // cabinets (world x, z, facing sign) for the jackpot surprise
  const cabinets: { x: number; z: number; face: number }[] = [];

  // ---- jackpot surprise: sign pop + confetti + tickets
  const confetti = new Particles(geo.box(0.09, 0.012, 0.06), keep(new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide })), 140, [C.teal, C.amber, C.pink, C.lilac, C.cream]);
  confetti.gravity = -2.2;
  confetti.drag = 1.2;
  confetti.flutter = 3;
  const tickets = new Particles(geo.box(0.2, 0.01, 0.1), keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x553311 })), 60, [C.amber, 0xffd27a]);
  tickets.gravity = -7;
  tickets.drag = 0.4;
  const jackpotSign = new THREE.Mesh(geo.plane(2.4, 0.75), (() => {
    const tex = canvasTexture(512, 160, (g, w, h) => {
      g.fillStyle = 'rgba(40,20,80,0.85)';
      roundRect(g, 6, 6, w - 12, h - 12, 40);
      g.fill();
      g.strokeStyle = '#ffb75a';
      g.lineWidth = 8;
      g.shadowColor = '#ffb75a';
      g.shadowBlur = 20;
      roundRect(g, 10, 10, w - 20, h - 20, 36);
      g.stroke();
      g.font = `700 96px ${FONT}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#fff3c0';
      g.fillText('JACKPOT!', w / 2, h / 2 + 6);
    });
    return keep(new THREE.MeshBasicMaterial({ toneMapped: false, map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  })());
  const jackpotGlow = new THREE.Mesh(geo.plane(4.5, 3), glowAddMatColor(C.amber));
  jackpotSign.visible = jackpotGlow.visible = false;
  group.add(confetti.mesh, tickets.mesh, jackpotSign, jackpotGlow);
  let jackT = -1,
    nextJack = 2.5;
  const jackPos = new THREE.Vector3();
  let jackFace = 1;

  function glowAddMatColor(c: number): THREE.Material {
    const hit = haloCache.get(c);
    if (hit) return hit;
    return haloCache.set(c, keep(new THREE.MeshBasicMaterial({ toneMapped: false, map: (glowAddMat().map as THREE.Texture), color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8, side: THREE.DoubleSide }))).get(c)!;
  }

  // ---- floor-cleaning robot pottering along the side aisle
  const robot = new THREE.Group();
  {
    const rb2 = new Batch();
    rb2.add(geo.cyl(0.34, 0.36, 0.16, 20), C.cream, 0, 0.12, 0);
    rb2.add(geo.cyl(0.3, 0.3, 0.05, 20), C.purple, 0, 0.22, 0);
    rb2.add(geo.sphere(0.2, 14, 8), C.cream, 0, 0.26, 0, 0, 0, 0, 1, 0.6, 1);
    rb2.add(geo.box(0.06, 0.04, 0.02), C.black, -0.07, 0.33, 0.17);
    rb2.add(geo.box(0.06, 0.04, 0.02), C.black, 0.07, 0.33, 0.17);
    rb2.add(geo.torus(0.05, 0.012, 4, 10, Math.PI), C.black, 0, 0.29, 0.18, Math.PI, 0, 0);
    rb2.add(geo.cyl(0.01, 0.01, 0.25, 4), C.chrome, 0.1, 0.45, -0.05);
    robot.add(new THREE.Mesh(rb2.geometry(), vcMat(0.5)));
    const light = new THREE.Mesh(geo.sphere(0.04, 8, 6), keep(new THREE.MeshBasicMaterial({ toneMapped: false, color: C.teal })));
    light.position.set(0.1, 0.58, -0.05);
    robot.add(light);
    const halo = new THREE.Mesh(geo.plane(0.4, 0.4), glowAddMatColor(C.teal));
    halo.position.copy(light.position);
    robot.add(halo);
    robot.add(blobShadow(0.9, 0.9, 0.35));
    group.add(robot);
  }
  let robotZ = 0,
    robotSide = -1,
    robotX = -4.25;

  // ---- decor
  function wallsAndCeiling(d0: number, d1: number): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    const za = -d0,
      zb = -d1,
      H = CEIL_Y;
    const u0 = d0 / 40,
      u1 = d1 / 40;
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
    root.name = `arcade-decor-${d0}`;
    root.add(floorStrip(d0, d1, -3.6, 3.6, trackMat(), 4.4));
    root.add(floorStrip(d0, d1, -WALL_X, WALL_X, sideMat(), 4, -0.01, (WALL_X * 2) / 4));
    root.add(wallsAndCeiling(d0, d1));
    const B = bats();
    const I = new THREE.Matrix4();
    const len = d1 - d0;
    const zc = -(d0 + len / 2);

    // neon track edges + glowing lane studs (flat, y <= 0.03)
    for (const sx of [-1, 1]) {
      B.glow.addIn(I, geo.box(0.08, 0.02, len), C.teal, sx * 3.48, 0.012, zc);
      B.halo.addIn(I, geo.plane(0.9, len), C.teal, sx * 3.48, 0.02, zc, -Math.PI / 2, 0, 0);
    }
    for (let z = Math.ceil(d0 / 2.2) * 2.2; z < d1; z += 2.2) for (const x of [-1.1, 1.1]) B.glow.addIn(I, geo.cyl(0.07, 0.07, 0.02, 10), C.amber, x, 0.012, -z);
    // ceiling: dark panel + downlight grid + light trusses with coloured cans
    B.glow.addIn(I, geo.box(WALL_X * 2, 0.2, len), 0x231d42, 0, CEIL_Y + 0.1, zc);
    for (let z = Math.ceil(d0 / 5) * 5; z < d1; z += 5)
      for (const x of [-12, -6, 0, 6, 12]) {
        B.glow.addIn(I, geo.cyl(0.32, 0.32, 0.04, 16), 0xfff0d6, x, CEIL_Y - 0.02, -z);
        B.halo.addIn(I, geo.plane(1.6, 1.6), 0xffd7a0, x, CEIL_Y - 0.06, -z, Math.PI / 2, 0, 0);
      }
    for (let z = Math.ceil(d0 / 10) * 10; z < d1; z += 10) {
      B.b.addIn(I, geo.box(WALL_X * 2, 0.16, 0.16), 0x3a3560, 0, CEIL_Y - 0.9, -z);
      for (let x = -14; x <= 14; x += 4) {
        const c = NEON[((x + 14) / 4) % 4];
        B.b.addIn(I, geo.cyl(0.12, 0.16, 0.3, 10), 0x2a2645, x, CEIL_Y - 1.12, -z);
        B.glow.addIn(I, geo.cyl(0.11, 0.11, 0.02, 10), c, x, CEIL_Y - 1.28, -z);
      }
    }
    // hanging neon sign over the track once per stretch (high above: y > 4.5)
    const signs = new Batch();
    signs.addIn(I, atlasPlane(4.2, 1.3, 1, 4, Math.floor(d0 / 40) % SIGNS.length), 0xffffff, 0, 5.6, -(d0 + 20));
    B.b.addIn(I, geo.cyl(0.01, 0.01, 1.4, 3), C.chrome, -1.6, 6.6, -(d0 + 20));
    B.b.addIn(I, geo.cyl(0.01, 0.01, 1.4, 3), C.chrome, 1.6, 6.6, -(d0 + 20));

    const claws: { rig: THREE.Group; phase: number }[] = [];
    const tables: { g: THREE.Group; phase: number }[] = [];

    for (const sx of [-1, 1]) {
      const face = sx < 0 ? Math.PI / 2 : -Math.PI / 2; // local +Z toward the track
      // near row along the aisle
      let z = d0 + r() * 1.5;
      while (z < d1 - 1.2) {
        const k = r();
        if (k < 0.45) {
          const n = 3 + Math.floor(r() * 4);
          for (let i = 0; i < n && z < d1 - 0.6; i++) {
            const H = range(r, 2.1, 2.4);
            const M = frameM(sx * 5.0, 0, -(z + 0.5), face);
            cabinet(B, M, r, H);
            cabinets.push({ x: sx * 5.0, z: -(z + 0.5), face: -sx });
            z += 1.05;
          }
          z += range(r, 0.6, 1.6);
        } else if (k < 0.7) {
          const n = 2 + Math.floor(r() * 2);
          for (let i = 0; i < n && z < d1 - 0.8; i++) {
            const M = frameM(sx * 5.2, 0, -(z + 0.65), face);
            const rig = clawMachine(B, M, r, 2.35, claws.length < 2);
            if (rig) {
              rig.applyMatrix4(M);
              root.add(rig);
              claws.push({ rig, phase: r() * 10 });
            }
            z += 1.35;
          }
          z += range(r, 0.6, 1.4);
        } else if (k < 0.82) {
          ticketMachine(B, frameM(sx * 5.1, 0, -(z + 0.4), face), r);
          ticketMachine(B, frameM(sx * 5.1, 0, -(z + 1.2), face), r);
          z += 2.2;
        } else {
          for (let i = 0; i < 3 && z < d1 - 0.6; i++) {
            hoopShooter(B, frameM(sx * 4.7, 0, -(z + 0.6), face), r);
            z += 1.2;
          }
          z += 1;
        }
      }
      // middle area: air hockey tables, kiddie rides, stools
      let zm = d0 + 2 + r() * 4;
      while (zm < d1 - 3) {
        if (r() < 0.6) {
          const M = frameM(sx * range(r, 9, 10.5), 0, -(zm + 1.4), r() < 0.5 ? 0 : Math.PI / 2);
          const tg = airHockeyTable(B, M, r);
          if (tables.length < 2) {
            tg.applyMatrix4(M);
            root.add(tg);
            tables.push({ g: tg, phase: r() * 10 });
          } else B.glow.addIn(M, geo.cyl(0.07, 0.07, 0.02, 12), C.amber, (r() - 0.5) * 0.6, 0.86, (r() - 0.5) * 1.4);
          zm += 6 + r() * 3;
        } else {
          // row of cabinets back to back, facing along z
          for (let i = 0; i < 3; i++) cabinetLite(B, frameM(sx * (8.6 + i * 1.05), 0, -(zm + 1), 0), r, range(r, 2.1, 2.4));
          zm += 5 + r() * 3;
        }
      }
      // back: prize wall (one per stretch, alternating side) or more cabinets
      const isPrizeSide = (Math.floor(d0 / 40) % 2 === 0) === sx < 0;
      if (isPrizeSide) prizeWall(B, frameM(sx * (WALL_X - 1.2), 0, -(d0 + 20), face), r, 14);
      else for (let zz = d0 + 2; zz < d1 - 1; zz += 1.1) cabinetLite(B, frameM(sx * (WALL_X - 0.7), 0, -zz, face), r, 2.3);
      // wall neon signs
      signs.addIn(I, atlasPlane(5, 1.55, 1, 4, (Math.floor(d0 / 40) + (sx > 0 ? 1 : 2)) % SIGNS.length), 0xffffff, sx * (WALL_X - 0.05), 5.4, -(d0 + (isPrizeSide ? 20 : 8)), 0, face, 0);
    }

    finish(B, root, screenMat);
    const sm = signs.build(signAtlasMat());
    if (sm) {
      sm.renderOrder = 2;
      root.add(sm);
    }
    anims.add(root, zc, (t) => {
      for (const c of claws) {
        // move about, drop, grab, lift: a slow, friendly loop
        const u = (t * 0.25 + c.phase) % 1;
        const { top, base, W, D } = c.rig.userData as { top: number; base: number; W: number; D: number };
        const p = c.phase * 13.7 + Math.floor(t * 0.25 + c.phase);
        const tx = Math.sin(p) * (W * 0.3),
          tz = Math.cos(p * 1.3) * (D * 0.3);
        const inner = c.rig.children[0];
        let y = 0;
        if (u > 0.55 && u < 0.8) y = -Math.sin(((u - 0.55) / 0.25) * Math.PI) * (top - base);
        inner.position.set(tx * Math.min(1, u * 3), y, tz * Math.min(1, u * 3));
      }
      for (const tb of tables) {
        const { W, L, H } = tb.g.userData as { W: number; L: number; H: number };
        const pk = tb.g.children[0];
        const a = t * 1.3 + tb.phase;
        // bouncy triangle-wave path inside the rim
        const tri = (v: number) => 2 * Math.abs(v - Math.floor(v + 0.5));
        pk.position.set((tri(a * 0.37) - 0.5) * (W - 0.3), H + 0.012, (tri(a * 0.23) - 0.5) * (L - 0.4));
      }
    });
    while (cabinets.length > 120) cabinets.shift();
    return root;
  }

  // ---------------------------------------------------------------- obstacles
  function lowObstacle(req: ObstacleRequest): ObstacleVisual {
    const w = req.laneSpan * LANE_WIDTH,
      h = Math.min(req.height, 0.9),
      L = Math.max(0.8, req.length);
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const B = bats();
    const I = new THREE.Matrix4();
    const r = req.rng;
    const v = Math.floor(r() * 2);
    let puck: THREE.Mesh | null = null;
    if (v === 0) {
      // air-hockey table across the lanes (playfield faces the runner from above)
      const col = pick(r, BODY);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.b.addIn(I, geo.box(0.12, h - 0.2, 0.12), C.black, sx * (w / 2 - 0.25), (h - 0.2) / 2, sz * (L / 2 - 0.2));
      B.b.addIn(I, geo.rbox(w, 0.24, L, 0.06), col, 0, h - 0.18, 0);
      B.b.addIn(I, geo.box(w - 0.18, 0.02, L - 0.18), 0xeef6ff, 0, h - 0.07, 0);
      B.glow.addIn(I, geo.box(w - 0.06, 0.06, 0.06), C.teal, 0, h - 0.03, L / 2 - 0.05);
      B.glow.addIn(I, geo.box(w - 0.06, 0.06, 0.06), C.teal, 0, h - 0.03, -L / 2 + 0.05);
      B.glow.addIn(I, geo.box(0.06, 0.06, L - 0.1), C.pink, w / 2 - 0.05, h - 0.03, 0);
      B.glow.addIn(I, geo.box(0.06, 0.06, L - 0.1), C.pink, -w / 2 + 0.05, h - 0.03, 0);
      B.b.addIn(I, geo.box(0.03, 0.006, L - 0.3), C.pink, 0, h - 0.058, 0);
      B.b.addIn(I, geo.torus(Math.min(0.3, L * 0.25), 0.012, 4, 20), C.pink, 0, h - 0.058, 0, Math.PI / 2, 0, 0);
      for (const sx of [-1, 1]) B.b.addIn(I, geo.cyl(0.11, 0.13, 0.05, 14), sx < 0 ? C.teal : C.pink, sx * (w / 2 - 0.45), h - 0.035, 0);
      B.halo.addIn(I, geo.plane(w + 1, L + 1), C.teal, 0, 0.03, 0, -Math.PI / 2, 0, 0);
      puck = new THREE.Mesh(geo.cyl(0.09, 0.09, 0.03, 14), puckMat);
      puck.position.y = h - 0.045;
    } else {
      // giant ticket rolls lying across the lanes
      const rad = Math.min(h / 2, L / 2, 0.45);
      const n = req.laneSpan;
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (w / n) * (i + 0.5);
        const rw = w / n - 0.14;
        B.b.addIn(I, geo.cyl(rad, rad, rw, 22), C.amber, x, rad, 0, 0, 0, Math.PI / 2);
        B.b.addIn(I, geo.cyl(rad * 0.35, rad * 0.35, rw + 0.02, 14), 0x8a5a2a, x, rad, 0, 0, 0, Math.PI / 2);
        for (let k = 0; k < 5; k++) B.b.addIn(I, geo.torus(rad, 0.012, 4, 22), 0xd07a2a, x - rw / 2 + (rw / 5) * (k + 0.5), rad, 0, 0, Math.PI / 2, 0);
        // a ticket strip flopping off the front
        B.b.addIn(I, geo.box(rw * 0.35, 0.012, 0.6), 0xffd27a, x, 0.01, rad + 0.25);
        for (let k = 0; k < 3; k++) B.b.addIn(I, geo.box(rw * 0.35, 0.014, 0.012), 0xd07a2a, x, 0.016, rad + 0.05 + k * 0.18);
      }
      B.halo.addIn(I, geo.plane(w + 0.8, L + 1.2), C.amber, 0, 0.03, 0, -Math.PI / 2, 0, 0);
    }
    finish(B, body, null);
    if (puck) body.add(puck);
    root.add(blobShadow(w * 1.05, L * 1.5, 0.35));
    return visual(root, body, (t) => {
      if (puck) {
        const tri = (x: number) => 2 * Math.abs(x - Math.floor(x + 0.5));
        puck.position.x = (tri(t * 0.5) - 0.5) * (w - 0.5);
        puck.position.z = (tri(t * 0.83) - 0.5) * (L - 0.4);
      }
    });
  }

  function highObstacle(req: ObstacleRequest): ObstacleVisual {
    const w = req.laneSpan * LANE_WIDTH,
      top = Math.max(2.2, req.height),
      L = Math.max(0.6, Math.min(req.length, 1.2));
    const bottom = 1.15;
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const B = bats();
    const I = new THREE.Matrix4();
    const r = req.rng;
    const postX = w / 2 + 0.3;
    const neon = pick(r, [C.teal, C.amber, C.lilac]);
    for (const sx of [-1, 1]) {
      B.b.addIn(I, geo.rbox(0.36, top + 0.2, 0.5, 0.08), C.indigo, sx * postX, (top + 0.2) / 2, 0);
      B.glow.addIn(I, geo.box(0.06, top, 0.02), neon, sx * postX, top / 2, 0.26);
      for (let k = 0; k < 6; k++) B.glow.addIn(I, geo.sphere(0.05, 8, 6), k % 2 ? C.amber : C.cream, sx * postX, 0.3 + k * ((top - 0.4) / 5), 0.27);
    }
    // sign board
    const bh = top - bottom;
    B.b.addIn(I, geo.rbox(w + 0.5, bh, L, 0.1), C.purple, 0, bottom + bh / 2, 0);
    B.glow.addIn(I, geo.box(w + 0.46, 0.05, 0.03), neon, 0, bottom + 0.06, L / 2 + 0.01);
    B.glow.addIn(I, geo.box(w + 0.46, 0.05, 0.03), neon, 0, top - 0.06, L / 2 + 0.01);
    // chasing bulbs along the bottom edge
    const nb = Math.round(w / 0.4);
    for (let k = 0; k < nb; k++) B.glow.addIn(I, geo.sphere(0.045, 6, 4), k % 2 ? C.amber : C.cream, -w / 2 + (w / nb) * (k + 0.5), bottom + 0.03, L / 2 + 0.04);
    B.halo.addIn(I, geo.plane(w + 2, bh + 1.6), neon, 0, bottom + bh / 2, L / 2 + 0.2);
    finish(B, body, null);
    const [txt, col] = pick(r, SIGNS);
    const sign = new THREE.Mesh(geo.plane(Math.min(w * 0.85, bh * 3.4), Math.min(w * 0.85, bh * 3.4) / 3.2), neonSignMat(txt, col));
    sign.position.set(0, bottom + bh / 2, L / 2 + 0.03);
    body.add(sign);
    for (const sx of [-1, 1]) {
      const s = blobShadow(0.9, 0.9, 0.35);
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
    const B = bats();
    const r = req.rng;
    const rigs: THREE.Group[] = [];
    laneOffsets(req.laneSpan).forEach((x) => {
      if (req.laneSpan === 1 && r() < 0.5) {
        // claw machine facing the runner, scaled up to the block height
        const s = h / 2.35;
        const M = frameM(x, 0, 0, 0, 1).multiply(new THREE.Matrix4().makeScale(1.55, s, 1.3));
        const rig = clawMachine(B, M, r)!;
        rig.applyMatrix4(M);
        body.add(rig);
        rigs.push(rig);
      } else {
        // big cabinet: two side-by-side halves look like one chunky machine per lane
        const M = frameM(x, 0, 0, 0, 1).multiply(new THREE.Matrix4().makeScale(2.0, 1, Math.max(1, L / 0.85)));
        cabinet(B, M, r, (h - 0.3) / 0.92);
      }
    });
    finish(B, body, screenMat);
    root.add(blobShadow(req.laneSpan * LANE_WIDTH * 1.05, L * 1.6, 0.4));
    return visual(root, body, (t) => {
      rigs.forEach((rig, i) => {
        const u = (t * 0.3 + i * 0.37) % 1;
        const inner = rig.children[0];
        inner.position.x = Math.sin(t * 0.7 + i) * 0.3;
        inner.position.y = u > 0.6 && u < 0.85 ? -Math.sin(((u - 0.6) / 0.25) * Math.PI) * 0.6 : 0;
      });
    });
  }

  function platformObstacle(req: ObstacleRequest): ObstacleVisual {
    const w = req.laneSpan * LANE_WIDTH - 0.04,
      L = Math.max(4, req.length),
      T = 2.0;
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const B = bats();
    const I = new THREE.Matrix4();
    const r = req.rng;
    // prize counter: solid body, polished wood top at exactly y = 2.0
    B.b.addIn(I, geo.rbox(w, T - 0.1, L, 0.08), C.purple, 0, (T - 0.1) / 2, 0);
    B.b.addIn(I, geo.rbox(w + 0.1, 0.1, L + 0.1, 0.03, 1), C.wood, 0, T - 0.05, 0);
    B.glow.addIn(I, geo.box(w + 0.12, 0.04, 0.04), C.amber, 0, T - 0.12, L / 2 + 0.05);
    for (const sx of [-1, 1]) B.glow.addIn(I, geo.box(0.04, 0.04, L + 0.1), C.amber, sx * (w / 2 + 0.06), T - 0.12, 0);
    // front face: lit display window with plush prizes
    for (const x of laneOffsets(req.laneSpan)) {
      B.glow.addIn(I, geo.box(1.8, 1.2, 0.02), 0x4a3f8f, x, 1.05, L / 2 + 0.01);
      B.b.addIn(I, geo.box(1.9, 0.08, 0.3), C.wood, x, 0.5, L / 2 + 0.12);
      for (let k = 0; k < 4; k++) plushToy(B.b, I, x - 0.66 + k * 0.44, 0.54, L / 2 + 0.12, 0.95, PLUSH[(k + Math.floor(r() * 6)) % 6], (k + Math.floor(r() * 3)) % 3);
      B.glow.addIn(I, geo.box(1.84, 0.05, 0.03), C.teal, x, 1.67, L / 2 + 0.03);
    }
    // sides: shelf windows with plush rows peeking out
    const np = Math.max(1, Math.round(L / 2.4));
    for (let k = 0; k < np; k++) {
      const z = L / 2 - (L / np) * (k + 0.5);
      for (const sx of [-1, 1]) {
        B.glow.addIn(I, geo.box(0.02, 1.0, L / np - 0.5), 0x3d3a7a, sx * (w / 2 + 0.01), 1.1, z);
        B.glow.addIn(I, geo.box(0.03, 0.04, L / np - 0.4), k % 2 ? C.teal : C.lilac, sx * (w / 2 + 0.02), 0.5, z);
      }
    }
    B.halo.addIn(I, geo.plane(w + 1.5, 2.4), C.lilac, 0, 1.1, L / 2 + 0.3);
    finish(B, body, null);
    // "PRIZES" sign on the front, just below the top edge
    const sign = new THREE.Mesh(geo.plane(Math.min(w, 2.0), Math.min(w, 2.0) / 3.2), neonSignMat('PRIZES', '#ffb75a'));
    sign.position.set(0, 1.6 - 0.3, L / 2 + 0.06);
    sign.scale.setScalar(0.55);
    body.add(sign);
    root.add(blobShadow(w * 1.15, L + 1.5, 0.4));
    return visual(root, body);
  }

  function rampObstacle(req: ObstacleRequest): ObstacleVisual {
    const w = req.laneSpan * LANE_WIDTH - 0.04,
      L = Math.max(3, req.length),
      T = 2.0;
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const B = bats();
    const I = new THREE.Matrix4();
    // skee-ball lane: warm wooden slope, glowing rails and chevrons pointing up
    B.b.addIn(I, wedgeGeo(w, T, L), C.wood, 0, 0, 0);
    const ang = Math.atan2(T, L);
    const hyp = Math.hypot(L, T);
    for (const sx of [-1, 1]) {
      B.b.addIn(I, geo.box(0.12, 0.16, hyp), C.purple, sx * (w / 2 - 0.06), T / 2 + 0.06, 0, ang, 0, 0);
      B.glow.addIn(I, geo.box(0.04, 0.04, hyp), C.teal, sx * (w / 2 - 0.06), T / 2 + 0.15, 0, ang, 0, 0);
      B.b.addIn(I, wedgeGeo(0.05, T, L), C.plum, sx * (w / 2 + 0.02), 0, 0);
    }
    const n = Math.max(2, Math.round(L / 1.4));
    for (const x of laneOffsets(req.laneSpan))
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n;
        const y = u * T,
          z = L / 2 - u * L;
        for (const s of [-1, 1]) B.glow.addIn(I, geo.box(0.5, 0.02, 0.09), C.amber, x + s * 0.2, y + 0.012, z, ang, s * 0.6, 0);
      }
    B.halo.addIn(I, geo.plane(w + 0.8, L), C.amber, 0, 0.03, 0, -Math.PI / 2, 0, 0);
    finish(B, body, null);
    root.add(blobShadow(w * 1.1, L, 0.3));
    return visual(root, body);
  }

  function moverBlockObstacle(req: ObstacleRequest): ObstacleVisual {
    // giant prize capsule rolling across the lanes
    const R = 0.85;
    const root = new THREE.Group();
    const body = new THREE.Group();
    const roll = new THREE.Group();
    root.add(body);
    body.add(roll);
    roll.position.y = R;
    const r = req.rng;
    const B = bats();
    const I = new THREE.Matrix4();
    const top = pick(r, [C.pink, C.teal, C.lilac, C.amber]);
    B.b.addIn(I, cached(`hemi${R}`, () => new THREE.SphereGeometry(R, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), top, 0, 0, 0, Math.PI / 2, 0, 0);
    B.b.addIn(I, cached(`hemi${R}`, () => new THREE.SphereGeometry(R, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), C.cream, 0, 0, 0, -Math.PI / 2, 0, 0);
    B.b.addIn(I, geo.torus(R, 0.07, 8, 32), 0xffffff, 0, 0, 0, 0, Math.PI / 2, 0);
    // a cute star decal on each face
    for (const sz of [-1, 1]) B.glow.addIn(I, starGeo(0.28, 0.04), C.amber, 0, 0.3, sz * (R - 0.08));
    for (const sz of [-1, 1]) B.glow.addIn(I, heartGeo(0.18, 0.04), C.pink, 0, -0.35, sz * (R - 0.12));
    finish(B, roll, null);
    const halo = new THREE.Mesh(geo.plane(2.6, 0.8), glowAddMatColor(top));
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.03;
    halo.userData.noCollide = true;
    root.add(halo);
    root.add(blobShadow(1.8, 1.4, 0.4));
    return visual(root, body, (_t, _dt, _d, moved) => {
      roll.rotation.z -= moved / R;
    });
  }

  function moverLowObstacle(req: ObstacleRequest): ObstacleVisual {
    // big glowing air-hockey puck gliding and spinning across
    const R = 0.62;
    const root = new THREE.Group();
    const body = new THREE.Group();
    const spin = new THREE.Group();
    root.add(body);
    body.add(spin);
    const r = req.rng;
    const col = pick(r, [C.teal, C.pink, C.amber]);
    const B = bats();
    const I = new THREE.Matrix4();
    B.b.addIn(I, geo.cyl(R, R, 0.26, 32), C.black, 0, 0.17, 0);
    B.glow.addIn(I, geo.torus(R, 0.05, 6, 32), col, 0, 0.3, 0, Math.PI / 2, 0, 0);
    B.glow.addIn(I, geo.torus(R, 0.04, 6, 32), col, 0, 0.06, 0, Math.PI / 2, 0, 0);
    B.b.addIn(I, geo.cyl(R * 0.55, R * 0.55, 0.04, 24), C.indigo, 0, 0.31, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      B.glow.addIn(I, geo.box(0.26, 0.02, 0.06), C.cream, Math.cos(a) * R * 0.75, 0.31, Math.sin(a) * R * 0.75, 0, -a, 0);
    }
    B.halo.addIn(I, geo.plane(2.2, 2.2), col, 0, 0.03, 0, -Math.PI / 2, 0, 0);
    finish(B, spin, null);
    root.add(blobShadow(1.5, 1.5, 0.4));
    return visual(root, body, (_t, dt, _d, moved) => {
      spin.rotation.y += dt * 2.5 + moved * 0.6;
    });
  }

  return {
    id: 'arcade',
    name: 'Indoor Arcade',
    length: 1400,
    music: 'mus_arcade',
    sections: [{ id: 'arcade', label: 'Indoor Arcade', start: 0 }],
    sprinkleSfx: ['arcade_bleep', 'claw_machine', 'prize_ding', 'air_hockey_puck'],
    patterns: PATTERNS,
    build(ctx: StageBuildContext) {
      scene = ctx.scene;
      quality = ctx.quality;
      prevBg = scene.background;
      prevFog = scene.fog;
      scene.background = new THREE.Color(C.bg);
      scene.fog = new THREE.Fog(C.bg, 22, quality === 'low' ? 80 : 95);
      const hemi = new THREE.HemisphereLight(0xb7a8ff, 0x2a2140, 1.35);
      const key = new THREE.DirectionalLight(0xffd9b0, 1.25);
      key.position.set(-4, 10, 8);
      const fill = new THREE.DirectionalLight(0x5fe3d6, 0.55);
      fill.position.set(8, 4, -6);
      group.add(hemi, key, key.target, fill);
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
      anims.run(time, dt, playerPos.z);
      atlas.update(time, dt);
      // jackpot!
      nextJack -= dt;
      if (nextJack <= 0 && jackT < 0) {
        nextJack = 5 + Math.random() * 4;
        let best: { x: number; z: number; face: number } | null = null;
        for (const c of cabinets) {
          const ahead = playerPos.z - c.z;
          if (ahead > 14 && ahead < 34 && (!best || Math.random() < 0.3)) best = c;
        }
        if (best) {
          jackT = 0;
          jackPos.set(best.x, 2.9, best.z);
          jackFace = best.face;
          for (let i = 0; i < 70; i++) confetti.emit(best.x + jackFace * 0.4, 2.6, best.z + (Math.random() - 0.5) * 0.6, jackFace * (0.5 + Math.random() * 2) * 0.6, 2 + Math.random() * 3.5, (Math.random() - 0.5) * 2.5, 2.5 + Math.random());
        }
      }
      if (jackT >= 0) {
        jackT += dt;
        const pop = Math.min(1, jackT * 5);
        const s = pop * (1 + Math.sin(Math.min(jackT * 10, Math.PI)) * 0.25);
        jackpotSign.visible = jackpotGlow.visible = true;
        jackpotSign.position.set(jackPos.x + jackFace * 0.6, jackPos.y + 0.4 + Math.sin(jackT * 6) * 0.05, jackPos.z);
        jackpotSign.rotation.y = jackFace > 0 ? Math.PI / 2 - 0.5 : -Math.PI / 2 + 0.5;
        jackpotSign.scale.setScalar(s);
        jackpotGlow.position.copy(jackpotSign.position);
        jackpotGlow.rotation.copy(jackpotSign.rotation);
        jackpotGlow.scale.setScalar(s * (0.9 + 0.15 * Math.sin(jackT * 14)));
        if (jackT < 1.8 && Math.random() < dt * 30)
          tickets.emit(jackPos.x + jackFace * 0.5, 0.9, jackPos.z + (Math.random() - 0.5) * 0.3, jackFace * (0.6 + Math.random() * 0.8), 0.6, (Math.random() - 0.5) * 0.8, 3);
        if (jackT > 2.6) {
          jackT = -1;
          jackpotSign.visible = jackpotGlow.visible = false;
        }
      }
      confetti.update(dt, time);
      tickets.update(dt, time);
      // robot: potter along an aisle ahead of the runner, turning around now and then
      const rel = robotZ - playerPos.z;
      if (rel > 6 || rel < -60) {
        robotSide = Math.random() < 0.5 ? -1 : 1;
        robotZ = playerPos.z - 30 - Math.random() * 15;
        robotX = robotSide * 4.25;
      }
      robotZ += dt * 0.9 * Math.sin(time * 0.35) * 1.2;
      robot.position.set(robotX + Math.sin(time * 0.8) * 0.12, 0, robotZ);
      robot.rotation.y = Math.cos(time * 0.35) > 0 ? Math.PI : 0;
    },
    ambienceAt: () => 'amb_arcade',
    dispose() {
      if (scene) {
        scene.remove(group);
        scene.background = prevBg;
        scene.fog = prevFog;
      }
      anims.clear();
      cabinets.length = 0;
      confetti.clear();
      tickets.clear();
      group.clear();
    },
  };
}
