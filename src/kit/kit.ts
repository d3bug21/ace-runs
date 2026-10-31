// Shared modelling kit: palette, cached materials, rounded shapes, seeded random, blob shadows.
// Every module builds procedural low-poly models from these so the whole game feels cohesive.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Balanced, friendly palette (soft, slightly warm, not a loud rainbow). */
export const PAL = {
  cream: 0xfff4e0,
  paper: 0xfbf7ef,
  ink: 0x2b3440,
  sky: 0x9fd6f0,
  skyWarm: 0xffe2b8,
  grass: 0x7cc46a,
  grassDark: 0x5aa557,
  leaf: 0x4fae5a,
  sand: 0xf1d79a,
  wood: 0xc98f5a,
  woodDark: 0x9a6a40,
  coral: 0xff7a6b,
  peach: 0xffb38a,
  sun: 0xffc94a,
  lemon: 0xffe066,
  mint: 0x7fdcc0,
  teal: 0x2fb5a8,
  sea: 0x3f9fd8,
  blue: 0x5a8dee,
  lilac: 0xb59cf0,
  berry: 0xe85d8a,
  pink: 0xff9fc0,
  orange: 0xff9a3c,
  red: 0xf0564a,
  white: 0xffffff,
  grey: 0xb8c2cc,
  slate: 0x66727f,
  night: 0x24304a,
} as const;

const matCache = new Map<string, THREE.Material>();

export interface MatOpts {
  rough?: number;
  metal?: number;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  flat?: boolean;
  side?: THREE.Side;
}

/** Cached soft standard material. Do not mutate returned materials (clone first). */
export function mat(color: number, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const key = `${color}|${o.rough ?? 0.75}|${o.metal ?? 0}|${o.emissive ?? 0}|${o.emissiveIntensity ?? 1}|${o.transparent ? 1 : 0}|${o.opacity ?? 1}|${o.flat ? 1 : 0}|${o.side ?? 0}`;
  let m = matCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.rough ?? 0.75,
      metalness: o.metal ?? 0,
      emissive: o.emissive ?? 0x000000,
      emissiveIntensity: o.emissiveIntensity ?? 1,
      transparent: !!o.transparent,
      opacity: o.opacity ?? 1,
      flatShading: !!o.flat,
      side: o.side ?? THREE.FrontSide,
    });
    matCache.set(key, m);
  }
  return m;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function cachedGeo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key) as T | undefined;
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

export const geo = {
  box: (w: number, h: number, d: number) => cachedGeo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)),
  rbox: (w: number, h: number, d: number, r = 0.08, seg = 3) =>
    cachedGeo(`rb${w},${h},${d},${r},${seg}`, () => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2))),
  sphere: (r: number, ws = 16, hs = 12) => cachedGeo(`s${r},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs)),
  cyl: (rt: number, rb: number, h: number, seg = 16) => cachedGeo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)),
  cone: (r: number, h: number, seg = 16) => cachedGeo(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  capsule: (r: number, len: number, seg = 8) => cachedGeo(`p${r},${len},${seg}`, () => new THREE.CapsuleGeometry(r, len, seg / 2, seg * 2)),
  torus: (r: number, t: number, rs = 10, ts = 24, arc = Math.PI * 2) =>
    cachedGeo(`t${r},${t},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc)),
  plane: (w: number, h: number) => cachedGeo(`pl${w},${h}`, () => new THREE.PlaneGeometry(w, h)),
  circle: (r: number, seg = 24) => cachedGeo(`ci${r},${seg}`, () => new THREE.CircleGeometry(r, seg)),
};

/** Convenience mesh factory: mesh(geometry, material, x, y, z). */
export function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  return me;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = <T>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length) % arr.length];
export const range = (r: () => number, a: number, b: number): number => a + (b - a) * r();

let shadowTex: THREE.Texture | null = null;
/** Soft round contact shadow (a transparent radial gradient on a flat quad). */
export function blobShadow(w = 1, d = 1, opacity = 0.28): THREE.Mesh {
  if (!shadowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    grd.addColorStop(0, 'rgba(30,40,60,1)');
    grd.addColorStop(0.55, 'rgba(30,40,60,0.55)');
    grd.addColorStop(1, 'rgba(30,40,60,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
    shadowTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity, depthWrite: false });
  const me = new THREE.Mesh(geo.plane(1, 1), m);
  me.rotation.x = -Math.PI / 2;
  me.scale.set(w, d, 1);
  me.position.y = 0.012;
  me.renderOrder = 1;
  return me;
}

/** Canvas texture helper (sRGB). */
export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Dispose geometries/materials that are NOT from the shared caches. */
export function disposeTree(o: THREE.Object3D): void {
  const cachedGeos = new Set(geoCache.values());
  const cachedMats = new Set(matCache.values());
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry && !cachedGeos.has(m.geometry)) m.geometry.dispose();
    const mm = m.material as THREE.Material | THREE.Material[] | undefined;
    if (mm) for (const x of Array.isArray(mm) ? mm : [mm]) if (!cachedMats.has(x)) x.dispose();
  });
}

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const damp = (a: number, b: number, lambda: number, dt: number): number => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smooth = (t: number): number => t * t * (3 - 2 * t);
