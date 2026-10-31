// Procedural 3D food models. Every food id in FOODS has a builder here.
// Each model is assembled from rounded primitives into vertex-coloured parts that are merged per
// material "kind", so a model costs only 1-4 draw calls. Built geometry is cached per id; every
// createFoodModel() call returns fresh Mesh objects sharing that cached geometry and the shared
// materials (do NOT dispose them; just remove the object from the scene).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { geo, rng } from '../kit/kit';
import { FOODS } from '../content/foods';

type V3 = [number, number, number];
type Kind = 'std' | 'rough' | 'gloss' | 'metal' | 'dbl' | 'glass' | 'liquid' | 'hi' | 'glow' | 'stink';
type ColorFn = (p: THREE.Vector3, n: THREE.Vector3) => number;
interface PartOpts {
  k?: Kind;
  flat?: boolean;
  cf?: ColorFn;
}

const TAU = Math.PI * 2;
const HALF = Math.PI / 2;

// ------------------------------------------------------------------ materials
/** Adds a gentle self-lift so food colours stay bright and appetising in shady stage lighting. */
function lift(m: THREE.Material, amount: number): void {
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * ${amount.toFixed(3)};`,
    );
  };
  m.customProgramCacheKey = () => `foodlift${amount}`;
}

const stinkTime = { value: 0 };
const kindMats = new Map<Kind, THREE.Material>();

function kindMat(k: Kind): THREE.Material {
  let m = kindMats.get(k);
  if (m) return m;
  switch (k) {
    case 'std':
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 });
      lift(m, 0.14);
      break;
    case 'rough':
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
      lift(m, 0.12);
      break;
    case 'gloss':
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 });
      lift(m, 0.14);
      break;
    case 'metal':
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.35 });
      lift(m, 0.2);
      break;
    case 'dbl':
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
      lift(m, 0.14);
      break;
    case 'glass':
      m = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.08,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      });
      lift(m, 0.25);
      break;
    case 'liquid':
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, transparent: true, opacity: 0.78 });
      lift(m, 0.22);
      break;
    case 'hi':
      m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false });
      break;
    case 'glow':
      m = new THREE.MeshBasicMaterial({ vertexColors: true });
      break;
    case 'stink': {
      const sm = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
      sm.onBeforeCompile = (s) => {
        s.uniforms.uTime = stinkTime;
        s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float sw = sin(position.y * 20.0 - uTime * 6.0 + position.x * 7.0);
           transformed.x += sw * 0.022;
           transformed.z += cos(position.y * 15.0 - uTime * 5.0) * 0.014;
           transformed.y += sin(uTime * 2.6 + position.x * 9.0) * 0.012;`,
        );
      };
      sm.customProgramCacheKey = () => 'foodstink';
      m = sm;
      break;
    }
  }
  kindMats.set(k, m);
  return m;
}

const RENDER_ORDER: Partial<Record<Kind, number>> = { liquid: 2, glass: 3, hi: 4, stink: 4 };

// ------------------------------------------------------------------ builder
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();

function toMatrix(p: V3, r: V3 | THREE.Quaternion, s: number | V3): THREE.Matrix4 {
  const q = r instanceof THREE.Quaternion ? r : new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2]));
  const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(s[0], s[1], s[2]);
  return new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2]), q, sc);
}

class Builder {
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  readonly parts = new Map<Kind, THREE.BufferGeometry[]>();

  /** Run fn with an extra local transform (position, euler or quaternion, scale). */
  at(p: V3, r: V3 | THREE.Quaternion, s: number | V3, fn: () => void): void {
    const top = this.stack[this.stack.length - 1];
    this.stack.push(top.clone().multiply(toMatrix(p, r, s)));
    fn();
    this.stack.pop();
  }

  /** Add a primitive with an optional local transform. */
  add(g: THREE.BufferGeometry, color: number, o: PartOpts = {}, p: V3 = [0, 0, 0], r: V3 | THREE.Quaternion = [0, 0, 0], s: number | V3 = 1): void {
    const gg = g.index ? g.toNonIndexed() : g.clone();
    for (const name of Object.keys(gg.attributes)) if (name !== 'position' && name !== 'normal') gg.deleteAttribute(name);
    gg.morphAttributes = {};
    gg.clearGroups();
    if (o.flat || !gg.attributes.normal) gg.computeVertexNormals();
    const pos = gg.attributes.position as THREE.BufferAttribute;
    const nor = gg.attributes.normal as THREE.BufferAttribute;
    const cols = new Float32Array(pos.count * 3);
    _c.setHex(color);
    for (let i = 0; i < pos.count; i++) {
      if (o.cf) {
        _v.fromBufferAttribute(pos, i);
        _n.fromBufferAttribute(nor, i);
        _c.setHex(o.cf(_v, _n));
      }
      cols[i * 3] = _c.r;
      cols[i * 3 + 1] = _c.g;
      cols[i * 3 + 2] = _c.b;
    }
    gg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const m = this.stack[this.stack.length - 1].clone().multiply(toMatrix(p, r, s));
    gg.applyMatrix4(m);
    const k = o.k ?? 'std';
    let list = this.parts.get(k);
    if (!list) this.parts.set(k, (list = []));
    list.push(gg);
  }
}

// ------------------------------------------------------------------ shape helpers
function lathe(pts: [number, number][], seg = 24, phiStart = 0, phiLength = TAU): THREE.BufferGeometry {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, phiStart, phiLength);
}

/** Radius of a lathe profile at height y (linear interpolation). */
function profR(pts: [number, number][], y: number): number {
  for (let i = 0; i < pts.length - 1; i++) {
    const [r0, y0] = pts[i];
    const [r1, y1] = pts[i + 1];
    if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) {
      const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
      return r0 + (r1 - r0) * t;
    }
  }
  return 0;
}

/** Tube along a Catmull-Rom curve with a varying radius (t in 0..1). */
function sweep(pts: V3[], rad: (t: number) => number, segs = 24, radial = 8): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const P = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    const r = rad(t);
    const N = frames.normals[i];
    const Bn = frames.binormals[i];
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU;
      const cx = Math.cos(a);
      const sx = Math.sin(a);
      const nx = cx * N.x + sx * Bn.x;
      const ny = cx * N.y + sx * Bn.y;
      const nz = cx * N.z + sx * Bn.z;
      pos.push(P.x + r * nx, P.y + r * ny, P.z + r * nz);
      nor.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = (i + 1) * radial + j;
      const c = (i + 1) * radial + ((j + 1) % radial);
      const d = i * radial + ((j + 1) % radial);
      idx.push(a, d, b, b, d, c);
    }
  }
  // end caps (both windings, tiny)
  for (const end of [0, 1]) {
    const ring = end === 0 ? 0 : segs;
    const T = frames.tangents[ring];
    curve.getPointAt(end, P);
    const ci = pos.length / 3;
    const sgn = end === 0 ? -1 : 1;
    pos.push(P.x, P.y, P.z);
    nor.push(T.x * sgn, T.y * sgn, T.z * sgn);
    for (let j = 0; j < radial; j++) {
      const a = ring * radial + j;
      const b = ring * radial + ((j + 1) % radial);
      idx.push(ci, a, b, ci, b, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

function extrude(shape: THREE.Shape, depth: number, bevel = 0.015, curveSegments = 14): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Annular sector shape (r0 may be 0 for a pie slice). Angles in radians. */
function sectorShape(r0: number, r1: number, a0: number, a1: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(Math.cos(a0) * r1, Math.sin(a0) * r1);
  s.absarc(0, 0, r1, a0, a1, false);
  if (r0 > 0) s.absarc(0, 0, r0, a1, a0, true);
  else s.lineTo(0, 0);
  s.closePath();
  return s;
}

const sph = (seg = 16, rings = 12) => geo.sphere(1, seg, rings);
const hemiDown = (seg = 24, rings = 10) => new THREE.SphereGeometry(1, seg, rings, 0, TAU, HALF, HALF);
const disc = (seg = 28) => geo.circle(1, seg);
const UP_FACE: V3 = [-HALF, 0, 0]; // rotate a +Z-facing circle to face +Y

/** Quaternion turning +Z to a direction. */
function faceQ(nx: number, ny: number, nz: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(nx, ny, nz).normalize());
}

// ------------------------------------------------------------------ reusable sub-models
function steamCurl(b: Builder, x: number, y: number, z: number, h: number, phase: number): void {
  const pts: V3[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push([x + Math.sin(t * 5 + phase) * 0.045, y + t * h, z + Math.cos(t * 4 + phase) * 0.02]);
  }
  b.add(sweep(pts, (t) => 0.016 * (1 - t * 0.7), 20, 6), 0xffffff, { k: 'hi' });
}

/** Half fruit with the cut face up (y=0), skin bowl below. */
function cutHalf(b: Builder, R: number, depthScale: number, skin: number, skinKind: Kind, face: () => void, oval = 1): void {
  b.add(hemiDown(), skin, { k: skinKind }, [0, 0, 0], [0, 0, 0], [R, R * depthScale, R * oval]);
  b.at([0, 0, 0], [0, 0, 0], [1, 1, oval], face);
}

function bowl(b: Builder, r: number, h: number, outer: number, inner: number, k: Kind = 'gloss'): void {
  const pts: [number, number][] = [
    [0, 0],
    [r * 0.42, 0],
    [r * 0.45, 0.02],
    [r * 0.5, 0.03],
    [r * 0.78, h * 0.3],
    [r * 0.95, h * 0.72],
    [r, h],
    [r * 0.95, h + 0.008],
    [r * 0.9, h * 0.97],
    [r * 0.74, h * 0.45],
    [r * 0.45, h * 0.14],
    [0, h * 0.12],
  ];
  b.add(lathe(pts, 32), 0, { k, cf: (p) => (p.y > h * 0.96 || Math.hypot(p.x, p.z) < r * 0.9 - (h - p.y) * 0.3 ? inner : outer) });
}

function breadShape(sc: number): THREE.Shape {
  const s = new THREE.Shape();
  const P = (x: number, y: number) => [x * sc, y * sc] as const;
  s.moveTo(...P(-0.2, -0.27));
  s.lineTo(...P(0.2, -0.27));
  s.quadraticCurveTo(...P(0.26, -0.27), ...P(0.255, -0.21));
  s.lineTo(...P(0.245, 0.05));
  s.bezierCurveTo(...P(0.37, 0.09), ...P(0.36, 0.33), ...P(0.15, 0.335));
  s.bezierCurveTo(...P(0.07, 0.37), ...P(-0.07, 0.37), ...P(-0.15, 0.335));
  s.bezierCurveTo(...P(-0.36, 0.33), ...P(-0.37, 0.09), ...P(-0.245, 0.05));
  s.lineTo(...P(-0.255, -0.21));
  s.quadraticCurveTo(...P(-0.26, -0.27), ...P(-0.2, -0.27));
  return s;
}

function breadSlice(b: Builder, crust: number, crumb: number, crumbKind: Kind = 'rough'): void {
  const d = 0.085;
  b.add(extrude(breadShape(1), d, 0.022), crust, { k: 'std' });
  const cg = extrude(breadShape(0.86), d + 0.05, 0);
  cg.translate(0, 0.012, 0);
  b.add(cg, crumb, { k: crumbKind });
}

const BREAD_FACE_Z = (0.085 + 0.05) / 2;

function strawberry(b: Builder, r: () => number, s: number): void {
  const prof: [number, number][] = [
    [0, -0.2],
    [0.05, -0.175],
    [0.105, -0.11],
    [0.145, -0.02],
    [0.16, 0.06],
    [0.14, 0.12],
    [0.08, 0.15],
    [0, 0.152],
  ];
  b.at([0, 0, 0], [0, 0, 0], s, () => {
    b.add(lathe(prof, 20), 0xf0453f, { k: 'gloss', cf: (p) => (p.y < -0.16 ? 0xe23a3a : 0xf0453f) });
    for (let row = 0; row < 5; row++) {
      const y = -0.14 + row * 0.055;
      const rr = profR(prof, y);
      const n = Math.max(5, Math.round(rr * 55));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + row * 0.5 + r() * 0.2;
        b.add(sph(6, 4), 0xffe27a, { k: 'gloss' }, [Math.cos(a) * rr, y, Math.sin(a) * rr], [0, -a, 0], [0.006, 0.011, 0.008]);
      }
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      b.at([0, 0.15, 0], [0, -a, 0], 1, () => {
        b.add(sph(8, 6), 0x4fae5a, {}, [0.07, -0.004, 0], [0, 0, -0.35], [0.075, 0.012, 0.03]);
      });
    }
    b.add(geo.cyl(0.012, 0.016, 0.07, 6), 0x5aa557, {}, [0, 0.19, 0], [0, 0, 0.2]);
  });
}

function eggHalf(b: Builder): void {
  b.add(hemiDown(20, 8), 0xfffaf2, { k: 'gloss' }, [0, 0, 0], [0, 0, 0], [0.15, 0.11, 0.2]);
  b.add(disc(), 0xfffdf8, { k: 'std' }, [0, 0.001, 0], UP_FACE, [0.15, 0.2, 1]);
  b.add(new THREE.SphereGeometry(1, 20, 8, 0, TAU, 0, HALF), 0xffb11f, { k: 'gloss' }, [0, 0, 0.01], [0, 0, 0], [0.08, 0.05, 0.085]);
}

function kiwiFace(b: Builder, R: number): void {
  b.add(disc(32), 0x86c93f, {}, [0, 0.001, 0], UP_FACE, R);
  b.add(disc(24), 0xb7e27a, {}, [0, 0.004, 0], UP_FACE, R * 0.62);
  b.add(disc(20), 0xf3f5d6, {}, [0, 0.008, 0], UP_FACE, [R * 0.26, R * 0.2, 1]);
  const n = 22;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = R * (0.42 + (i % 2) * 0.06);
    b.add(sph(6, 4), 0x2b2a22, { k: 'gloss' }, [Math.cos(a) * rr, 0.006, Math.sin(a) * rr], [0, -a, 0], [0.018, 0.006, 0.007]);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.13;
    b.add(sph(4, 3), 0xc9ec92, {}, [Math.cos(a) * R * 0.78, 0.004, Math.sin(a) * R * 0.78], [0, -a, 0], [R * 0.13, 0.002, 0.005]);
  }
}

// ------------------------------------------------------------------ the models
type ModelFn = (b: Builder, r: () => number) => void;

const MODELS: Record<string, ModelFn> = {
  // ---------------------------------------------------------- vision
  carrot_sticks(b, r) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = i / (n - 1) - 0.5;
      const h = 0.5 + r() * 0.12;
      const base = i % 2 ? 0xff8a2a : 0xff9a3c;
      b.at([a * 0.1, -0.26, (i % 2 ? 0.035 : -0.035) + (r() - 0.5) * 0.02], [(r() - 0.5) * 0.25, 0, -a * 0.75], 1, () => {
        b.add(geo.rbox(0.075, h, 0.075, 0.024, 2), 0, { cf: (_p, nn) => (Math.abs(nn.y) > 0.8 ? 0xffc07a : base) }, [0, h / 2, 0]);
      });
    }
    b.add(geo.torus(1, 0.22, 8, 28), 0x4fae5a, { k: 'gloss' }, [0, -0.12, 0], [HALF, 0, 0], [0.095, 0.075, 0.11]);
    b.add(sph(10, 8), 0x4fae5a, { k: 'gloss' }, [0.02, -0.12, 0.085], [0, 0, 0.6], [0.06, 0.03, 0.02]);
    b.add(sph(10, 8), 0x4fae5a, { k: 'gloss' }, [-0.03, -0.12, 0.085], [0, 0, -0.6], [0.06, 0.03, 0.02]);
  },
  carrot(b, r) {
    const prof: [number, number][] = [
      [0, -0.4],
      [0.015, -0.38],
      [0.045, -0.26],
      [0.08, -0.06],
      [0.1, 0.12],
      [0.105, 0.2],
      [0.09, 0.25],
      [0.04, 0.27],
      [0, 0.272],
    ];
    b.at([0, 0, 0], [0, 0, -0.75], 1, () => {
      b.add(lathe(prof, 18), 0xff8a2a, { cf: (p) => (p.y > 0.24 ? 0xff9a3c : 0xff8a2a) });
      for (let i = 0; i < 6; i++) {
        const y = -0.28 + i * 0.09 + r() * 0.03;
        const rr = profR(prof, y) + 0.001;
        b.add(geo.torus(1, 0.05, 4, 14, Math.PI * (0.5 + r() * 0.5)), 0xe8711c, {}, [0, y, 0], [HALF, 0, r() * TAU], [rr, rr, 0.12]);
      }
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU + 0.3;
        const lean = 0.25 + (i % 2) * 0.15;
        const len = 0.22 + r() * 0.08;
        const pts: V3[] = [
          [0, 0.26, 0],
          [Math.cos(a) * lean * 0.2, 0.26 + len * 0.5, Math.sin(a) * lean * 0.2],
          [Math.cos(a) * lean * 0.45, 0.26 + len, Math.sin(a) * lean * 0.45],
        ];
        b.add(sweep(pts, () => 0.011, 8, 5), 0x5aa557);
        for (let j = 0; j < 3; j++) {
          const t = 0.45 + j * 0.25;
          const px = Math.cos(a) * lean * 0.45 * t;
          const pz = Math.sin(a) * lean * 0.45 * t;
          b.add(sph(8, 6), j % 2 ? 0x4fae5a : 0x5fbf62, { flat: true }, [px, 0.26 + len * t, pz], [r(), -a, 0.6], [0.05, 0.018, 0.03]);
        }
      }
    });
  },
  // ---------------------------------------------------------- muscles
  broccoli(b, r) {
    b.add(geo.cyl(0.07, 0.095, 0.3, 12), 0x9ad57a, {}, [0, -0.17, 0]);
    b.add(geo.cyl(0.035, 0.05, 0.16, 8), 0x9ad57a, {}, [0.08, -0.04, 0.02], [0, 0, -0.6]);
    b.add(geo.cyl(0.035, 0.05, 0.16, 8), 0x9ad57a, {}, [-0.08, -0.04, -0.02], [0, 0, 0.6]);
    const fl: [number, number, number, number][] = [
      [0, 0.1, 0, 0.15],
      [0.14, 0.04, 0.02, 0.11],
      [-0.14, 0.04, -0.02, 0.11],
      [0.06, 0.06, 0.12, 0.11],
      [-0.07, 0.07, 0.11, 0.1],
      [0.05, 0.05, -0.12, 0.11],
      [-0.07, 0.07, -0.1, 0.1],
      [0.0, 0.2, 0.03, 0.1],
    ];
    for (const [x, y, z, s] of fl) {
      b.add(new THREE.IcosahedronGeometry(1, 1), 0x3f9e48, { flat: true }, [x, y, z], [r(), r(), r()], s);
      for (let i = 0; i < 4; i++) {
        const a = r() * TAU;
        const e = r() * 0.9;
        b.add(new THREE.IcosahedronGeometry(1, 0), i % 2 ? 0x56b94f : 0x4aab4c, { flat: true }, [x + Math.cos(a) * Math.cos(e) * s * 0.9, y + Math.sin(e) * s * 0.9, z + Math.sin(a) * Math.cos(e) * s * 0.9], [r(), r(), r()], s * 0.38);
      }
    }
    steamCurl(b, 0.08, 0.27, 0.02, 0.2, 0);
    steamCurl(b, -0.08, 0.25, -0.02, 0.17, 2);
  },
  spinach(b, r) {
    const leaves = 5;
    for (let i = 0; i < leaves; i++) {
      const a = (i / leaves) * TAU + r() * 0.3;
      const tilt = 0.55 + r() * 0.3;
      const col = i % 2 ? 0x2f8f45 : 0x3ba352;
      b.at([0, -0.18, 0], [0, a, 0], 1, () => {
        b.at([0, 0, 0], [tilt, 0, 0], 1, () => {
          b.add(geo.cyl(0.012, 0.014, 0.16, 6), 0x8fd47a, {}, [0, 0.08, 0]);
          b.at([0, 0.32, 0], [0, 0, 0], 1, () => {
            b.add(sph(14, 10), col, { k: 'gloss' }, [0, 0, 0], [0, 0, 0], [0.13, 0.2, 0.022]);
            b.add(geo.cyl(0.006, 0.01, 0.34, 5), 0x8fd47a, {}, [0, -0.02, 0.019]);
            for (let k = -1; k <= 1; k += 2) {
              for (let j = 0; j < 3; j++) {
                b.add(geo.cyl(0.004, 0.006, 0.1, 4), 0x7cc46a, {}, [k * 0.04, -0.09 + j * 0.08, 0.018], [0, 0, k * 0.9], 1);
              }
            }
          });
        });
      });
    }
  },
  peas(b) {
    const L = 3.3;
    b.at([0, 0, 0], [0.25, 0, 0.12], 1, () => {
      b.add(new THREE.SphereGeometry(1, 24, 10, 0, TAU, HALF, HALF), 0x5cb848, { k: 'dbl', cf: (p) => (p.y > -0.15 ? 0x7cc95a : 0x5cb848) }, [0, 0, 0], [0, 0, 0], [0.1 * L, 0.1, 0.105]);
      b.at([0, 0, -0.1], [-2.0, 0, 0], 1, () => {
        b.add(new THREE.SphereGeometry(1, 24, 10, 0, TAU, HALF, HALF), 0x5cb848, { k: 'dbl', cf: (p) => (p.y > -0.15 ? 0x7cc95a : 0x5cb848) }, [0, 0, -0.1], [0, 0, 0], [0.1 * L, 0.08, 0.1]);
      });
      for (let i = 0; i < 5; i++) {
        const x = (i - 2) * 0.115;
        const rr = 0.058 - Math.abs(i - 2) * 0.004;
        b.add(sph(14, 10), 0x86d14f, { k: 'gloss' }, [x, -0.005, 0], [0, 0, 0], rr);
      }
      b.add(sweep([[0.33, 0.0, 0], [0.38, 0.04, 0], [0.4, 0.1, 0.02]], () => 0.014, 8, 6), 0x4f9f42);
      b.add(sweep([[-0.33, 0.0, 0], [-0.37, 0.03, 0.0], [-0.36, 0.06, 0.03]], (t) => 0.012 * (1 - t * 0.6), 8, 6), 0x4f9f42);
    });
  },
  // ---------------------------------------------------------- bones & teeth
  milk(b) {
    const glass: [number, number][] = [
      [0, -0.3],
      [0.14, -0.3],
      [0.155, -0.285],
      [0.175, 0.24],
      [0.18, 0.26],
      [0.168, 0.26],
      [0.163, 0.24],
      [0.145, -0.27],
      [0, -0.27],
    ];
    b.add(lathe(glass, 28), 0xe4f4ff, { k: 'glass' });
    b.add(lathe([[0, -0.27], [0.144, -0.27], [0.16, 0.15], [0.1, 0.16], [0, 0.165]], 28), 0xfdfcf8, { k: 'std' });
    b.add(lathe([[0.168, -0.2], [0.178, 0.2]], 4, 2.2, 0.35), 0xffffff, { k: 'hi' });
    // bendy straw
    b.add(sweep([[0.05, -0.15, 0], [0.06, 0.3, 0], [0.1, 0.38, 0], [0.18, 0.4, 0]], () => 0.016, 24, 8), 0, {
      k: 'gloss',
      cf: (p) => (Math.floor((p.y + p.x) * 22) % 2 ? 0x5a8dee : 0xffffff),
    });
    // little splash crown on top of the milk
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      b.add(sph(8, 6), 0xffffff, {}, [Math.cos(a) * 0.06 - 0.03, 0.18 + (i % 2) * 0.015, Math.sin(a) * 0.06], [0, 0, 0], [0.018, 0.03, 0.018]);
    }
  },
  yoghurt(b) {
    const pot: [number, number][] = [
      [0, -0.24],
      [0.13, -0.24],
      [0.15, -0.22],
      [0.19, 0.1],
      [0.205, 0.12],
      [0.2, 0.14],
      [0.185, 0.135],
      [0, 0.13],
    ];
    b.add(lathe(pot, 30), 0, {
      cf: (p) => {
        const rr = Math.hypot(p.x, p.z);
        if (p.y > 0.12 && rr < 0.186) return 0xfff8f0;
        if (p.y > -0.12 && p.y < 0.04) return 0xe85d8a;
        if (p.y > 0.04 && p.y < 0.065) return 0xffffff;
        return 0xfbf3ea;
      },
    });
    // dots on the band
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const y = -0.04;
      const rr = profR(pot, y) + 0.002;
      b.add(disc(10), 0xffffff, {}, [Math.cos(a) * rr, y, Math.sin(a) * rr], faceQ(Math.cos(a), 0, Math.sin(a)), 0.018);
    }
    // dollop swirl + berry
    b.add(lathe([[0, 0.13], [0.1, 0.13], [0.08, 0.17], [0.04, 0.2], [0.012, 0.235], [0, 0.24]], 20), 0xfffaf4, { k: 'gloss' });
    b.add(sph(12, 10), 0xe85d8a, { k: 'gloss' }, [0.02, 0.245, 0.01], [0, 0, 0], [0.035, 0.032, 0.035]);
    // peeled foil lid
    b.add(new THREE.CylinderGeometry(0.15, 0.15, 0.008, 28), 0xff9fc0, { k: 'gloss', cf: (p) => (p.y > 0 ? 0xff9fc0 : 0xffc2d6) }, [0, 0.25, -0.19], [-1.25, 0, 0]);
    // spoon
    b.at([0.08, 0.2, 0.03], [0.2, 0, -0.55], 1, () => {
      b.add(geo.rbox(0.035, 0.34, 0.014, 0.007, 2), 0xd8dee6, { k: 'metal' }, [0, 0.12, 0]);
      b.add(sph(12, 8), 0xd8dee6, { k: 'metal' }, [0, -0.07, 0], [0, 0, 0], [0.04, 0.06, 0.014]);
    });
  },
  cheese(b) {
    const s = new THREE.Shape();
    s.moveTo(0.36, 0);
    s.lineTo(-0.24, 0.21);
    s.quadraticCurveTo(-0.31, 0, -0.24, -0.21);
    s.lineTo(0.36, 0);
    const H = 0.26;
    const bev = 0.02;
    b.at([0, 0, 0], [-HALF, 0, 0], 1, () => {
      b.add(extrude(s, H, bev, 16), 0xffcf4a, { cf: (_p, n) => (n.x < -0.85 ? 0xf6b93a : 0xffcf4a) });
    });
    const top = H / 2 + bev + 0.002;
    const hole = (p: V3, n: V3, rad: number) => {
      const q = faceQ(n[0], n[1], n[2]);
      b.add(disc(18), 0xe3a12a, {}, p, q, rad);
      // lighter inner part offset "down" the hole for depth
      const off = new THREE.Vector3(0, -1, 0);
      if (Math.abs(n[1]) > 0.9) off.set(0, 0, 1);
      off.multiplyScalar(rad * 0.22);
      b.add(disc(18), 0xf0b83a, {}, [p[0] + off.x + n[0] * 0.001, p[1] + off.y + n[1] * 0.001, p[2] + off.z + n[2] * 0.001], q, rad * 0.72);
    };
    hole([0.02, top, 0.02], [0, 1, 0], 0.05);
    hole([-0.14, top, -0.08], [0, 1, 0], 0.035);
    hole([-0.15, top, 0.1], [0, 1, 0], 0.028);
    hole([0.17, top, -0.005], [0, 1, 0], 0.022);
    // slanted face toward +z: from tip (0.36, 0) to corner (-0.24, +0.21) in world xz
    const nf = new THREE.Vector3(0.21, 0, 0.6).normalize();
    const onFace = (t: number, y: number, rad: number, side: 1 | -1) => {
      const x = 0.36 + (-0.6) * t;
      const z = 0.21 * t * side;
      const push = bev + 0.003;
      hole([x + nf.x * push, y, z * 1 + nf.z * push * side], [nf.x, 0, nf.z * side], rad);
    };
    onFace(0.35, 0.02, 0.045, 1);
    onFace(0.7, -0.06, 0.032, 1);
    onFace(0.62, 0.08, 0.022, 1);
    onFace(0.45, -0.03, 0.04, -1);
    onFace(0.78, 0.05, 0.03, -1);
  },
  // ---------------------------------------------------------- shield
  orange(b) {
    const R = 0.2;
    // whole orange behind
    b.add(sph(26, 18), 0xff9a2e, { k: 'gloss' }, [-0.06, 0.02, -0.1], [0, 0, 0], R);
    b.add(geo.cyl(0.012, 0.018, 0.04, 6), 0x7a5a30, {}, [-0.06, 0.225, -0.1]);
    b.add(sph(10, 6), 0x4fae5a, { k: 'gloss' }, [0.0, 0.235, -0.1], [0, 0.3, 0.35], [0.075, 0.012, 0.035]);
    // half orange in front, cut face toward the viewer
    b.at([0.12, -0.04, 0.12], [1.05, 0.35, 0], 1, () => {
      cutHalf(b, 0.17, 0.9, 0xff9a2e, 'gloss', () => {
        b.add(disc(32), 0xfff1d6, {}, [0, 0.001, 0], UP_FACE, 0.17);
        const n = 10;
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * TAU + 0.04;
          b.add(new THREE.CircleGeometry(0.145, 4, a0, TAU / n - 0.09), i % 2 ? 0xffa83a : 0xffb24a, { k: 'gloss' }, [0, 0.004, 0], UP_FACE, 1);
        }
        b.add(disc(12), 0xfff1d6, {}, [0, 0.006, 0], UP_FACE, 0.018);
      });
    });
  },
  kiwifruit(b) {
    const R = 0.19;
    b.at([-0.1, 0.02, 0.16], [1.2, 0, 0.2], 1, () => cutHalf(b, R, 1.0, 0x9a6a40, 'rough', () => kiwiFace(b, R), 0.92));
    b.at([0.14, 0.0, -0.16], [-1.45, 0.3, -0.25], 1, () => cutHalf(b, R, 1.0, 0x9a6a40, 'rough', () => kiwiFace(b, R), 0.92));
  },
  feijoa(b) {
    // whole feijoa
    b.at([-0.1, 0.03, -0.08], [0.15, 0, 0.35], 1, () => {
      b.add(sph(22, 16), 0x4f8f3a, { k: 'std', cf: (p) => (p.y > 0.7 ? 0x5f9f45 : 0x4f8f3a) }, [0, 0, 0], [0, 0, 0], [0.14, 0.21, 0.14]);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        b.add(sph(6, 4), 0x6b4a30, {}, [Math.cos(a) * 0.02, 0.205, Math.sin(a) * 0.02], [0, -a, 0.9], [0.03, 0.008, 0.012]);
      }
      b.add(geo.cyl(0.006, 0.01, 0.05, 5), 0x6b4a30, {}, [0, 0.23, 0]);
    });
    // half (cut lengthwise)
    b.at([0.13, -0.05, 0.1], [1.0, 0.4, -0.2], 1, () => {
      cutHalf(b, 0.13, 0.85, 0x4f8f3a, 'std', () => {
        b.add(disc(30), 0xd3e09a, {}, [0, 0.001, 0], UP_FACE, 0.13);
        b.add(disc(30), 0xf4f0cc, {}, [0, 0.003, 0], UP_FACE, 0.115);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + 0.785;
          b.add(disc(16), 0xe1e7a4, { k: 'gloss' }, [Math.cos(a) * 0.035, 0.006, Math.sin(a) * 0.045], [-HALF, 0, -a], [0.045, 0.026, 1]);
          b.add(sph(5, 4), 0xa48a4a, {}, [Math.cos(a) * 0.04, 0.008, Math.sin(a) * 0.05], [0, 0, 0], [0.008, 0.004, 0.008]);
        }
      }, 1.5);
    });
  },
  strawberry(b, r) {
    b.at([0.02, -0.02, 0.07], [0.2, 0, -0.25], 1, () => strawberry(b, r, 1.15));
    b.at([-0.18, 0.04, -0.06], [-0.1, 0.5, 0.35], 1, () => strawberry(b, r, 0.9));
    b.at([0.2, 0.06, -0.08], [-0.2, -0.4, -0.5], 1, () => strawberry(b, r, 0.82));
  },
  // ---------------------------------------------------------- energy
  banana(b) {
    const one = () => {
      const pts: V3[] = [
        [-0.32, 0.13, 0],
        [-0.2, -0.02, 0],
        [0, -0.08, 0],
        [0.2, -0.03, 0],
        [0.32, 0.12, 0],
      ];
      b.add(sweep(pts, (t) => 0.072 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02)), 0.55) + 0.012, 30, 6), 0, {
        k: 'gloss',
        flat: true,
        cf: (p) => (p.x < -0.27 ? 0xd9d24e : p.x > 0.3 ? 0xe0b040 : 0xffd84a),
      });
      b.add(sph(8, 6), 0x6b4a2a, {}, [0.325, 0.13, 0], [0, 0, 0], 0.016);
      b.add(sweep([[-0.32, 0.13, 0], [-0.35, 0.18, 0], [-0.36, 0.24, 0]], () => 0.02, 6, 6), 0x9a9a3a);
      b.add(geo.cyl(0.021, 0.021, 0.01, 6), 0x6b5a30, {}, [-0.36, 0.245, 0]);
    };
    b.at([0, 0, 0.05], [0.3, 0, 0], 1, one);
    b.at([0.02, 0.03, -0.06], [-0.35, 0.15, -0.08], 1, one);
  },
  corn(b, r) {
    b.at([0, 0, 0], [0.2, 0, -0.85], 1, () => {
      const len = 0.6;
      const rC = 0.12;
      b.add(geo.capsule(rC * 0.85, len - 0.2, 10), 0xf5d36a, {});
      const rows = 12;
      const around = 11;
      const k = new THREE.SphereGeometry(1, 6, 5);
      for (let i = 0; i < rows; i++) {
        const y = -len / 2 + 0.06 + (i / (rows - 1)) * (len - 0.12);
        const taper = Math.sqrt(Math.max(0.15, 1 - Math.pow(y / (len / 2), 2)));
        const rr = rC * (0.55 + 0.45 * taper);
        for (let j = 0; j < around; j++) {
          const a = (j / around) * TAU + (i % 2) * (Math.PI / around);
          b.add(k, r() < 0.15 ? 0xffc52e : 0xffd23f, { k: 'gloss' }, [Math.cos(a) * rr, y, Math.sin(a) * rr], [0, -a, 0], [0.032 * (0.7 + taper * 0.3), 0.03, 0.034 * (0.7 + 0.3 * taper)]);
        }
      }
      // husk leaves peeled back at the bottom
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.4;
        b.at([0, -len / 2 + 0.02, 0], [0, -a, 0], 1, () => {
          b.add(sph(12, 8), i % 2 ? 0x8fcf6a : 0x7cc46a, { k: 'dbl' }, [0.09, -0.08, 0], [0, 0, 0.55], [0.035, 0.2, 0.08]);
        });
      }
      b.add(geo.cyl(0.04, 0.05, 0.08, 8), 0x9fbf6a, {}, [0, -len / 2 - 0.04, 0]);
    });
  },
  kumara(b, r) {
    const prof: [number, number][] = [
      [0, -0.4],
      [0.012, -0.37],
      [0.035, -0.32],
      [0.075, -0.22],
      [0.11, -0.1],
      [0.122, 0],
      [0.115, 0.1],
      [0.085, 0.2],
      [0.045, 0.29],
      [0.015, 0.35],
      [0, 0.38],
    ];
    b.at([0, -0.02, 0], [0, 0.2, HALF], [1.45, 1, 1.45], () => {
      b.add(lathe(prof, 18), 0x9b3f63, { k: 'std', cf: (p) => (p.x > 0.07 ? 0x8a3456 : Math.sin(p.y * 60) > 0.85 ? 0x7f3050 : 0xa84a6c) });
      b.add(sweep([[0, -0.39, 0], [0.01, -0.44, 0.0], [0.03, -0.48, 0]], (t) => 0.008 * (1 - t * 0.7), 6, 4), 0x7f3050);
    });
    // split open along the top, golden flesh bulging out
    b.at([0, 0.11, 0], [0, 0.2, 0], 1, () => {
      b.add(sph(24, 12), 0xffb347, { k: 'gloss' }, [0, 0, 0], [0, 0, 0], [0.27, 0.07, 0.085]);
      b.add(sph(18, 10), 0xffc966, { k: 'gloss' }, [0.03, 0.035, 0.01], [0, 0, 0], [0.16, 0.035, 0.05]);
      for (const side of [-1, 1]) b.add(geo.capsule(0.024, 0.36, 8), 0xa84a6c, {}, [0, 0.005, side * 0.088], [0, 0, HALF]);
      b.add(geo.rbox(0.075, 0.03, 0.065, 0.012, 2), 0xfff0a0, { k: 'gloss' }, [-0.05, 0.075, 0.0], [0.1, 0.5, 0.12]);
      for (let i = 0; i < 4; i++) b.add(sph(5, 4), 0x4f9f42, {}, [0.04 + i * 0.04, 0.07, (r() - 0.5) * 0.05], [0, r() * 3, 0], [0.012, 0.004, 0.006]);
    });
    steamCurl(b, 0.05, 0.19, 0, 0.26, 0.5);
    steamCurl(b, -0.1, 0.18, 0, 0.2, 2.5);
  },
  bread(b, r) {
    b.at([0, 0, 0], [0, 0, 0.08], 1, () => {
      breadSlice(b, 0xb87a3e, 0xe7c08a);
      for (const side of [1, -1]) {
        for (let i = 0; i < 18; i++) {
          let x = 0;
          let y = 0;
          do {
            x = (r() - 0.5) * 0.38;
            y = (r() - 0.5) * 0.5 + 0.02;
          } while (Math.abs(x) > 0.19 - (y > 0.15 ? (y - 0.15) * 0.8 : 0));
          const c = i % 3 === 0 ? 0x7a5230 : i % 3 === 1 ? 0xf5e6bf : 0xa8743e;
          b.add(sph(6, 4), c, {}, [x, y, side * (BREAD_FACE_Z + 0.002)], [0, 0, r() * TAU], [0.018, 0.009, 0.006]);
        }
      }
    });
  },
  // ---------------------------------------------------------- refresh
  water(b) {
    const glass: [number, number][] = [
      [0, -0.3],
      [0.14, -0.3],
      [0.155, -0.285],
      [0.18, 0.26],
      [0.185, 0.28],
      [0.172, 0.28],
      [0.167, 0.26],
      [0.145, -0.27],
      [0, -0.27],
    ];
    b.add(lathe(glass, 28), 0xd8f0ff, { k: 'glass' });
    b.add(lathe([[0, -0.27], [0.144, -0.27], [0.164, 0.17], [0, 0.17]], 28), 0, {
      k: 'liquid',
      cf: (p, n) => (n.y > 0.9 ? 0xc8f0ff : p.y < -0.1 ? 0x4fb4ea : 0x7fd0f7),
    });
    b.add(lathe([[0.172, -0.2], [0.183, 0.22]], 4, 2.3, 0.3), 0xffffff, { k: 'hi' });
    b.add(lathe([[0.17, -0.15], [0.178, 0.05]], 3, 2.75, 0.1), 0xffffff, { k: 'hi' });
    // ice cube + bubbles
    b.add(geo.rbox(0.09, 0.08, 0.09, 0.02, 2), 0xeefaff, { k: 'hi' }, [0.03, 0.17, 0.02], [0.3, 0.5, 0.2]);
    const bub: V3[] = [
      [-0.06, -0.1, 0.08],
      [0.05, -0.18, 0.09],
      [-0.03, 0.02, 0.1],
      [0.08, 0.06, 0.07],
    ];
    for (const p of bub) b.add(sph(8, 6), 0xffffff, { k: 'hi' }, p, [0, 0, 0], 0.016);
    // splash drops above
    b.add(sph(10, 8), 0x7fd0f7, { k: 'gloss' }, [-0.08, 0.36, 0.02], [0, 0, 0.3], [0.03, 0.042, 0.03]);
    b.add(sph(10, 8), 0x7fd0f7, { k: 'gloss' }, [0.1, 0.4, -0.02], [0, 0, -0.3], [0.024, 0.034, 0.024]);
  },
  watermelon(b, r) {
    const a0 = -HALF - 0.68;
    const a1 = -HALF + 0.68;
    b.at([0, 0.22, 0], [0.05, 0, 0], 1, () => {
      b.add(extrude(sectorShape(0, 0.43, a0, a1), 0.11, 0.012), 0xff5a6a, { k: 'gloss' });
      b.add(extrude(sectorShape(0.43, 0.465, a0, a1), 0.104, 0.008), 0xe0f2b8, {});
      b.add(extrude(sectorShape(0.465, 0.5, a0, a1), 0.098, 0.01), 0, {
        cf: (p) => (Math.floor((Math.atan2(p.y, p.x) + 4) * 16) % 2 ? 0x2f8a3e : 0x4fae5a),
      });
      for (const side of [1, -1]) {
        const seeds: [number, number][] = [
          [0.22, -0.32],
          [0.3, -0.18],
          [0.3, 0.18],
          [0.22, 0.32],
          [0.33, 0],
          [0.36, -0.22],
          [0.36, 0.22],
        ];
        for (const [rr, da] of seeds) {
          const a = -HALF + da + (r() - 0.5) * 0.05;
          b.add(sph(8, 6), 0x2b2a22, { k: 'gloss' }, [Math.cos(a) * rr, Math.sin(a) * rr, side * (0.055 + 0.012)], [0, 0, a], [0.022, 0.012, 0.006]);
        }
      }
    });
  },
  // ---------------------------------------------------------- grow strong
  egg(b) {
    b.at([-0.16, 0, 0.02], [0.75, 0.25, 0.12], 1, () => eggHalf(b));
    b.at([0.16, -0.02, -0.02], [0.75, -0.25, -0.12], 1, () => eggHalf(b));
    for (let i = 0; i < 3; i++) b.add(sph(6, 4), 0x4fae5a, {}, [-0.04 + i * 0.04, 0.07 + (i % 2) * 0.01, 0.1], [0, 0, i], [0.012, 0.005, 0.02]);
  },
  chicken(b, r) {
    const prof: [number, number][] = [
      [0, -0.24],
      [0.09, -0.225],
      [0.15, -0.16],
      [0.175, -0.06],
      [0.16, 0.05],
      [0.12, 0.14],
      [0.075, 0.21],
      [0.055, 0.25],
      [0.05, 0.26],
      [0, 0.262],
    ];
    b.at([0, -0.02, 0], [0.25, 0, -0.85], 1, () => {
      b.add(lathe(prof, 22), 0xd98a3a, {
        cf: (p) => {
          const n = Math.sin(p.x * 40 + p.y * 23) * Math.cos(p.z * 37 - p.y * 11);
          if (p.z > 0.08 && p.y < 0.0 && p.y > -0.15) return 0xf0b060;
          return n > 0.45 ? 0xc06a28 : 0xd98a3a;
        },
      }, [0, 0, 0], [0, 0, 0], [1, 1, 0.92]);
      b.add(geo.cyl(0.03, 0.034, 0.16, 10), 0xfff6e6, { k: 'gloss' }, [0, 0.32, 0]);
      b.add(sph(12, 10), 0xfff6e6, { k: 'gloss' }, [0.03, 0.41, 0], [0, 0, 0], 0.042);
      b.add(sph(12, 10), 0xfff6e6, { k: 'gloss' }, [-0.03, 0.41, 0], [0, 0, 0], 0.042);
      // little herb flecks
      for (let i = 0; i < 6; i++) {
        const y = -0.15 + r() * 0.25;
        const a = r() * Math.PI - 0.2;
        const rr = profR(prof, y) * 0.95;
        b.add(sph(5, 4), 0x4f9f42, {}, [Math.cos(a) * rr, y, Math.sin(a) * rr * 0.92], [0, -a, 0], [0.003, 0.012, 0.012]);
      }
    });
  },
  fish(b, r) {
    b.at([0, 0, 0], [0.62, 0, 0], 1, () => {
      // plate
      b.add(lathe([[0, -0.03], [0.24, -0.03], [0.3, -0.01], [0.36, 0.03], [0.355, 0.04], [0.29, 0.01], [0, 0.0]], 36), 0, {
        k: 'gloss',
        cf: (p) => (Math.hypot(p.x, p.z) > 0.31 ? 0x5a8dee : 0xffffff),
      });
      // fillet
      const s = new THREE.Shape();
      s.moveTo(-0.22, 0.0);
      s.bezierCurveTo(-0.22, 0.1, -0.02, 0.12, 0.12, 0.08);
      s.bezierCurveTo(0.2, 0.06, 0.24, 0.03, 0.25, 0);
      s.bezierCurveTo(0.24, -0.03, 0.2, -0.06, 0.12, -0.08);
      s.bezierCurveTo(-0.02, -0.12, -0.22, -0.1, -0.22, 0);
      b.at([-0.02, 0.05, 0], [-HALF, 0, 0.15], 1.2, () => {
        b.add(extrude(s, 0.06, 0.03, 16), 0, { cf: (_p, n) => (n.z > 0.5 ? 0xeeb062 : 0xf8e2c8) });
      });
      // flaky baked lines
      for (let i = 0; i < 4; i++) {
        const x = -0.13 + i * 0.075;
        b.add(sweep([[x - 0.01, 0.125, -0.07], [x + 0.015, 0.128, 0], [x - 0.01, 0.125, 0.07]], () => 0.006, 8, 4), 0xd9974e, {}, [0, 0, 0], [0, 0.15, 0]);
      }
      // parsley
      for (let i = 0; i < 6; i++) b.add(sph(5, 4), 0x3f9e48, {}, [-0.1 + r() * 0.2, 0.13, -0.04 + r() * 0.08], [r(), r(), r()], [0.015, 0.006, 0.012]);
      // lemon wedge
      b.at([0.17, 0.08, 0.13], [0.5, -0.6, 0.2], 1, () => {
        b.add(extrude(sectorShape(0, 0.085, 0, Math.PI), 0.06, 0.008), 0, { k: 'gloss', cf: (p, n) => (Math.abs(n.z) > 0.6 ? (Math.hypot(p.x, p.y) > 0.07 ? 0xfff6c8 : 0xffe873) : 0xffd84a) });
      });
    });
  },
  nuts(b, r) {
    b.at([0, -0.05, 0], [0.45, 0, 0], 1, () => {
      bowl(b, 0.3, 0.13, 0xc98f5a, 0xb07a48, 'std');
      const pile: { x: number; y: number; z: number }[] = [];
      for (let i = 0; i < 26; i++) {
        const a = r() * TAU;
        const d = Math.sqrt(r()) * 0.22;
        pile.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, y: 0.1 + (0.22 - d) * 0.6 + r() * 0.02 });
      }
      pile.forEach((p, i) => {
        const t = i % 4;
        const rot: V3 = [r() * TAU, r() * TAU, r() * TAU];
        if (t === 0) b.add(sph(10, 8), 0xb87445, { k: 'gloss' }, [p.x, p.y, p.z], rot, [0.035, 0.022, 0.06]); // almond
        else if (t === 1) {
          b.add(sph(10, 8), 0x9a6034, { k: 'gloss' }, [p.x, p.y, p.z], [0, 0, 0], 0.04); // hazelnut
          b.add(new THREE.SphereGeometry(1, 10, 4, 0, TAU, 0, 0.9), 0xd9b27a, {}, [p.x, p.y + 0.006, p.z], [0, 0, 0], 0.041);
        } else if (t === 2) b.add(new THREE.IcosahedronGeometry(1, 1), 0xc9955a, { flat: true }, [p.x, p.y, p.z], rot, [0.055, 0.04, 0.05]); // walnut
        else b.add(geo.torus(1, 0.45, 6, 10, 3.3), 0xf0d6a0, {}, [p.x, p.y, p.z], rot, 0.05); // cashew
      });
    });
  },
  // ---------------------------------------------------------- happy tummy
  apple_slices(b) {
    // a whole apple behind so it reads as "apple" instantly
    b.add(lathe([[0, -0.17], [0.09, -0.185], [0.16, -0.12], [0.19, 0.0], [0.17, 0.12], [0.1, 0.17], [0.03, 0.15], [0, 0.135]], 26), 0xe8473c, {
      k: 'gloss',
      cf: (p) => (p.x < -0.1 && p.y > -0.05 ? 0xf0614a : 0xe8473c),
    }, [0.1, 0.08, -0.14]);
    b.add(geo.cyl(0.01, 0.014, 0.09, 6), 0x7a5a30, {}, [0.11, 0.25, -0.14], [0, 0, -0.25]);
    b.add(sph(10, 6), 0x4fae5a, { k: 'gloss' }, [0.17, 0.25, -0.14], [0, 0.2, 0.4], [0.06, 0.012, 0.03]);
    const wedge = () => {
      const a0 = HALF - 0.5;
      const a1 = HALF + 0.5;
      b.add(extrude(sectorShape(0, 0.23, a0, a1), 0.09, 0.014), 0xfff1cc, { k: 'std' });
      b.add(extrude(sectorShape(0.228, 0.255, a0, a1), 0.094, 0.01), 0xe8473c, { k: 'gloss' });
      for (const side of [1, -1]) {
        b.add(disc(14), 0xf3e2b0, {}, [0, 0.075, side * 0.06], side > 0 ? [0, 0, 0] : [0, Math.PI, 0], [0.03, 0.05, 1]);
        b.add(sph(8, 6), 0x6a3f22, { k: 'gloss' }, [0, 0.075, side * 0.06], [0, 0, 0], [0.013, 0.022, 0.006]);
      }
    };
    b.at([-0.2, -0.16, 0.08], [0.15, 0.25, 0.3], 1, wedge);
    b.at([0.0, -0.18, 0.14], [0.1, 0, 0], 1, wedge);
    b.at([0.21, -0.16, 0.08], [0.15, -0.25, -0.3], 1, wedge);
  },
  fruit_salad(b, r) {
    b.at([0, -0.08, 0], [0.42, 0, 0], 1, () => {
      bowl(b, 0.33, 0.2, 0xdff1ff, 0xffffff, 'gloss');
      b.add(disc(28), 0xffe9c2, {}, [0, 0.17, 0], UP_FACE, 0.3);
      const pieces = 22;
      for (let i = 0; i < pieces; i++) {
        const a = r() * TAU;
        const d = Math.sqrt(r()) * 0.24;
        const x = Math.cos(a) * d;
        const z = Math.sin(a) * d;
        const y = 0.2 + (0.24 - d) * 0.35;
        const rot: V3 = [(r() - 0.5) * 1.2, r() * TAU, (r() - 0.5) * 1.2];
        switch (i % 6) {
          case 0: // kiwi slice
            b.at([x, y, z], rot, 1, () => {
              b.add(geo.cyl(0.065, 0.065, 0.02, 16), 0x86c93f, { cf: (_p, n) => (Math.abs(n.y) < 0.5 ? 0x9a7a4a : 0x86c93f) });
              b.add(disc(10), 0xf3f5d6, {}, [0, 0.011, 0], UP_FACE, 0.018);
              for (let k = 0; k < 8; k++) {
                const ka = (k / 8) * TAU;
                b.add(sph(4, 3), 0x2b2a22, {}, [Math.cos(ka) * 0.033, 0.011, Math.sin(ka) * 0.033], [0, -ka, 0], [0.008, 0.003, 0.004]);
              }
            });
            break;
          case 1: // strawberry half
            b.add(new THREE.SphereGeometry(1, 12, 6, 0, TAU, 0, HALF), 0xf0453f, { k: 'gloss' }, [x, y, z], rot, [0.05, 0.065, 0.05]);
            break;
          case 2: // blueberries
            b.add(sph(10, 8), 0x4a5fc8, { k: 'gloss' }, [x, y + 0.02, z], [0, 0, 0], 0.03);
            b.add(sph(10, 8), 0x3f52b0, { k: 'gloss' }, [x + 0.04, y + 0.015, z + 0.02], [0, 0, 0], 0.028);
            break;
          case 3: // orange segment
            b.add(sph(10, 8), 0xffa83a, { k: 'gloss' }, [x, y + 0.01, z], rot, [0.075, 0.035, 0.035]);
            break;
          case 4: // banana coin
            b.add(geo.cyl(0.045, 0.045, 0.02, 14), 0xfff0b0, {}, [x, y + 0.01, z], rot);
            break;
          default: // grapes
            b.add(sph(10, 8), i % 2 ? 0xa6d65a : 0x8a4fa8, { k: 'gloss' }, [x, y + 0.015, z], [0, 0, 0], [0.035, 0.04, 0.035]);
        }
      }
    });
  },
  veggie_bowl(b, r) {
    b.at([0, -0.08, 0], [0.42, 0, 0], 1, () => {
      bowl(b, 0.33, 0.19, 0x2fb5a8, 0xfbf7ef, 'gloss');
      b.add(new THREE.SphereGeometry(1, 24, 8, 0, TAU, 0, HALF), 0xfffcf4, { k: 'rough' }, [0, 0.13, 0], [0, 0, 0], [0.3, 0.12, 0.3]);
      for (let i = 0; i < 40; i++) {
        const a = r() * TAU;
        const d = Math.sqrt(r()) * 0.26;
        const yy = 0.13 + 0.12 * Math.sqrt(Math.max(0, 1 - (d / 0.3) ** 2));
        b.add(geo.capsule(0.008, 0.016, 4), 0xffffff, {}, [Math.cos(a) * d, yy, Math.sin(a) * d], [r() * 3, r() * 3, r() * 3]);
      }
      const top = (d: number) => 0.13 + 0.12 * Math.sqrt(Math.max(0, 1 - (d / 0.3) ** 2));
      // broccoli
      for (let i = 0; i < 3; i++) {
        const a = -2.2 + i * 0.4;
        const d = 0.15;
        b.add(new THREE.IcosahedronGeometry(1, 1), 0x3f9e48, { flat: true }, [Math.cos(a) * d, top(d) + 0.03, Math.sin(a) * d], [r(), r(), r()], 0.05);
      }
      // carrot coins
      for (let i = 0; i < 4; i++) {
        const a = -0.6 + i * 0.35;
        const d = 0.17;
        b.add(geo.cyl(0.035, 0.035, 0.014, 12), 0xff8a2a, {}, [Math.cos(a) * d, top(d) + 0.012, Math.sin(a) * d], [0.4, 0, 0.3]);
      }
      // corn
      for (let i = 0; i < 10; i++) {
        const a = 0.9 + r() * 0.8;
        const d = 0.1 + r() * 0.12;
        b.add(sph(6, 4), 0xffd23f, { k: 'gloss' }, [Math.cos(a) * d, top(d) + 0.012, Math.sin(a) * d], [0, 0, 0], [0.018, 0.015, 0.018]);
      }
      // peas
      for (let i = 0; i < 9; i++) {
        const a = 2.4 + r() * 0.9;
        const d = 0.1 + r() * 0.12;
        b.add(sph(8, 6), 0x86d14f, { k: 'gloss' }, [Math.cos(a) * d, top(d) + 0.015, Math.sin(a) * d], [0, 0, 0], 0.022);
      }
      // egg half on top
      b.at([0.0, top(0) + 0.01, 0.02], [0.2, 0.3, 0], 0.55, () => eggHalf(b));
      // chopsticks
      b.add(geo.capsule(0.012, 0.55, 6), 0xc98f5a, {}, [0.05, 0.27, -0.14], [0, 0.35, HALF - 0.08]);
      b.add(geo.capsule(0.012, 0.55, 6), 0xc98f5a, {}, [0.08, 0.27, -0.1], [0, 0.25, HALF - 0.02]);
    });
  },
  veggie_soup(b, r) {
    b.at([0, -0.1, 0], [0.5, 0, 0], 1, () => {
      bowl(b, 0.36, 0.17, 0xff9a3c, 0xfff4e0, 'gloss');
      b.add(disc(32), 0xf08a3a, { k: 'gloss' }, [0, 0.145, 0], UP_FACE, 0.32);
      for (let i = 0; i < 18; i++) {
        const a = r() * TAU;
        const d = Math.sqrt(r()) * 0.26;
        const p: V3 = [Math.cos(a) * d, 0.152, Math.sin(a) * d];
        const rot: V3 = [r() * 0.4, r() * TAU, r() * 0.4];
        const t = i % 4;
        if (t === 0) b.add(geo.rbox(0.045, 0.03, 0.045, 0.01, 1), 0xff8a2a, {}, p, rot);
        else if (t === 1) b.add(sph(8, 6), 0x86d14f, { k: 'gloss' }, p, rot, 0.02);
        else if (t === 2) b.add(geo.rbox(0.05, 0.026, 0.04, 0.01, 1), 0xfff1cc, {}, p, rot);
        else b.add(sph(8, 6), 0x4fae5a, {}, p, rot, [0.04, 0.008, 0.025]);
      }
      // spoon
      b.at([0.17, 0.2, 0.06], [0.0, -0.5, -0.5], 1, () => {
        b.add(geo.rbox(0.036, 0.36, 0.014, 0.007, 2), 0xd8dee6, { k: 'metal' }, [0, 0.14, 0]);
        b.add(sph(12, 8), 0xd8dee6, { k: 'metal' }, [0, -0.06, 0], [0, 0, 0], [0.045, 0.065, 0.016]);
      });
      steamCurl(b, -0.06, 0.18, 0.0, 0.26, 0.2);
      steamCurl(b, 0.07, 0.18, -0.08, 0.22, 1.9);
      steamCurl(b, -0.16, 0.18, -0.05, 0.18, 3.6);
    });
  },

  // ---------------------------------------------------------- sometimes foods
  fizzy_can(b) {
    const body: [number, number][] = [
      [0.13, -0.27],
      [0.165, -0.235],
      [0.168, 0.23],
      [0.135, 0.275],
    ];
    b.add(lathe(body, 30), 0, {
      k: 'gloss',
      cf: (p) => {
        const a = Math.atan2(p.z, p.x);
        const w = 0.035 * Math.sin(a * 2);
        if (Math.abs(p.y - w) < 0.04) return 0xffffff;
        if (Math.abs(p.y - w - 0.075) < 0.015) return 0xffe066;
        return 0xf0564a;
      },
    });
    b.add(lathe([[0, -0.3], [0.1, -0.3], [0.13, -0.27], [0.135, -0.265]], 30), 0xd8dee6, { k: 'metal' });
    b.add(lathe([[0.135, 0.275], [0.14, 0.29], [0.128, 0.295], [0.118, 0.282], [0, 0.282]], 30), 0xd8dee6, { k: 'metal' });
    // ring pull
    b.add(geo.torus(1, 0.32, 6, 18), 0xc2cad4, { k: 'metal' }, [0.035, 0.29, 0], [HALF, 0, 0], [0.045, 0.03, 0.04]);
    b.add(geo.cyl(0.014, 0.014, 0.012, 8), 0xc2cad4, { k: 'metal' }, [0, 0.288, 0]);
    b.add(geo.rbox(0.06, 0.006, 0.035, 0.003, 1), 0x7a8592, { k: 'metal' }, [-0.06, 0.287, 0]);
    // fizz bubbles popping out
    const bub: [number, number, number, number][] = [
      [-0.05, 0.34, 0.0, 0.022],
      [-0.02, 0.4, 0.02, 0.016],
      [-0.07, 0.45, -0.01, 0.013],
      [0.0, 0.36, -0.03, 0.012],
    ];
    for (const [x, y, z, s] of bub) b.add(sph(10, 8), 0xffffff, { k: 'hi' }, [x, y, z], [0, 0, 0], s);
  },
  fizzy_bottle(b) {
    const prof: [number, number][] = [
      [0, -0.34],
      [0.1, -0.34],
      [0.125, -0.32],
      [0.13, -0.26],
      [0.122, -0.2],
      [0.13, -0.14],
      [0.13, 0.04],
      [0.11, 0.12],
      [0.06, 0.22],
      [0.042, 0.27],
      [0.042, 0.3],
    ];
    b.add(lathe(prof, 28), 0xe4f6ea, { k: 'glass' });
    const liq = prof.slice(0, 8).map(([rr, y]) => [Math.max(0, rr - 0.008), y + 0.004] as [number, number]);
    liq.push([0.1, 0.12], [0, 0.12]);
    b.add(lathe(liq, 24), 0, { k: 'std', cf: (_p, n) => (n.y > 0.8 ? 0xffd08a : 0xff9a3c) });
    // label
    b.add(new THREE.CylinderGeometry(0.134, 0.134, 0.15, 28, 1, true), 0, {
      k: 'gloss',
      cf: (p) => {
        const a = Math.atan2(p.z, p.x);
        return Math.abs(p.y - 0.025 * Math.sin(a * 3)) < 0.022 ? 0xffffff : 0x5a8dee;
      },
    }, [0, -0.06, 0]);
    // cap
    b.add(geo.cyl(0.052, 0.052, 0.06, 16), 0xf0564a, { k: 'gloss' }, [0, 0.32, 0]);
    b.add(geo.cyl(0.06, 0.06, 0.012, 16), 0xf0564a, { k: 'gloss' }, [0, 0.288, 0]);
    // bubbles
    const bub: V3[] = [
      [0.05, -0.02, 0.118],
      [-0.06, 0.06, 0.1],
      [0.02, 0.09, 0.09],
      [-0.03, -0.2, 0.12],
      [0.07, -0.24, 0.1],
    ];
    for (const p of bub) b.add(sph(8, 6), 0xffffff, { k: 'hi' }, p, [0, 0, 0], 0.014);
  },
  doughnut(b, r) {
    b.at([0, 0, 0], [1.05, 0, 0], 1, () => {
      b.add(geo.torus(0.2, 0.095, 14, 30), 0xe0a05a, {}, [0, 0, 0], [HALF, 0, 0]);
      b.add(geo.torus(0.2, 0.1, 14, 30), 0xff8fb8, { k: 'gloss', cf: (p) => (p.z < -0.03 ? 0xff9fc0 : 0xff8fb8) }, [0, 0.032, 0], [HALF, 0, 0], [1, 1, 0.72]);
      const cols = [0xffe066, 0x7fdcc0, 0x9fd6f0, 0xb59cf0, 0xffffff, 0xff7a6b];
      for (let i = 0; i < 34; i++) {
        const a = r() * TAU;
        const t = (r() - 0.5) * 0.15;
        const R = 0.2 + t;
        const y = 0.032 + Math.sqrt(Math.max(0, 0.1 * 0.1 - t * t)) * 0.72 + 0.004;
        b.add(geo.capsule(0.009, 0.026, 4), cols[i % cols.length], { k: 'gloss' }, [Math.cos(a) * R, y, Math.sin(a) * R], [HALF, r() * TAU, 0]);
      }
    });
  },
  lollies(b, r) {
    const candy = (c: number) => {
      b.add(sph(18, 12), 0, {
        k: 'gloss',
        cf: (p) => (Math.floor((Math.atan2(p.y, p.z) * 3) / Math.PI + p.x * 18 + 10) % 2 ? 0xffffff : c),
      }, [0, 0, 0], [0, 0, 0], [0.11, 0.085, 0.085]);
      for (const s of [-1, 1]) {
        b.add(geo.cone(0.075, 0.09, 10), c, { k: 'gloss', flat: true }, [s * 0.155, 0, 0], [0, 0, s * HALF], 1);
        b.add(sph(8, 6), c, { k: 'gloss' }, [s * 0.107, 0, 0], [0, 0, 0], [0.012, 0.03, 0.03]);
      }
    };
    b.at([-0.08, -0.12, 0.08], [0.3, 0.4, -0.25], 1, () => candy(0xe85d8a));
    b.at([0.14, -0.1, -0.02], [-0.2, -0.5, 0.4], 0.92, () => candy(0x2fb5a8));
    b.at([0.0, -0.06, -0.14], [0.1, 1.2, 0.1], 0.88, () => candy(0xffc94a));
    // swirly lollipop behind
    b.at([-0.08, 0.14, -0.04], [0.1, 0.2, 0.25], 1, () => {
      const turns = 3;
      for (const [col, ph] of [[0xff7a9a, 0], [0xffffff, Math.PI]] as const) {
        const pts: V3[] = [];
        for (let i = 0; i <= 60; i++) {
          const th = (i / 60) * turns * TAU + ph;
          const rr = 0.01 + (i / 60) * 0.12;
          pts.push([Math.cos(th) * rr, Math.sin(th) * rr, 0]);
        }
        b.add(sweep(pts, () => 0.02, 90, 6), col, { k: 'gloss' }, [0, 0, 0], [0, 0, 0], [1, 1, 1.4]);
      }
      b.add(geo.cyl(0.013, 0.013, 0.3, 8), 0xffffff, {}, [0, -0.27, -0.005]);
    });
    void r;
  },
  chocolate(b) {
    b.at([0, 0, 0], [0.1, 0.2, 0.35], 1, () => {
      b.add(geo.rbox(0.34, 0.56, 0.07, 0.025, 2), 0x6e3b22, {});
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          b.add(geo.rbox(0.14, 0.11, 0.025, 0.012, 2), 0x84492b, { k: 'gloss' }, [-0.075 + i * 0.15, 0.2 - j * 0.125, 0.04]);
          b.add(geo.rbox(0.14, 0.11, 0.025, 0.012, 2), 0x84492b, { k: 'gloss' }, [-0.075 + i * 0.15, 0.2 - j * 0.125, -0.04]);
        }
      }
      // wrapper over the bottom half, with a jagged gold foil edge
      b.add(geo.rbox(0.37, 0.32, 0.1, 0.03, 2), 0xe85d8a, { k: 'gloss' }, [0, -0.13, 0]);
      for (let i = 0; i < 9; i++) {
        const x = -0.16 + i * 0.04;
        b.add(geo.cone(0.024, 0.04 + (i % 3) * 0.012, 4), 0xffd35a, { k: 'metal', flat: true }, [x, 0.04 + (i % 3) * 0.006, 0], [0, 0.78, 0], [1, 1, 2.2]);
      }
      b.add(geo.rbox(0.375, 0.03, 0.104, 0.012, 1), 0xffd35a, { k: 'metal' }, [0, 0.025, 0]);
      b.add(disc(24), 0xfff4e0, {}, [0, -0.13, 0.052], [0, 0, 0], [0.11, 0.07, 1]);
      b.add(disc(16), 0x84492b, {}, [0, -0.13, 0.054], [0, 0, 0], [0.05, 0.035, 1]);
      b.add(disc(24), 0xfff4e0, {}, [0, -0.13, -0.052], [0, Math.PI, 0], [0.11, 0.07, 1]);
    });
  },
  ice_cream(b) {
    b.add(lathe([[0, -0.38], [0.02, -0.34], [0.13, 0.04], [0.145, 0.06], [0.14, 0.08], [0, 0.08]], 24), 0, {
      cf: (p) => {
        const a = (Math.atan2(p.z, p.x) / Math.PI) * 5;
        const u = a + p.y * 14;
        const v = a - p.y * 14;
        const f = (x: number) => x - Math.floor(x);
        return f(u) < 0.14 || f(v) < 0.14 ? 0xc98a42 : 0xe8b46a;
      },
    });
    b.add(sph(20, 16), 0xff9fc0, { k: 'gloss' }, [0, 0.14, 0], [0, 0, 0], [0.155, 0.13, 0.155]);
    b.add(geo.torus(0.135, 0.035, 8, 20), 0xff9fc0, { k: 'gloss' }, [0, 0.07, 0], [HALF, 0, 0]);
    b.add(geo.capsule(0.022, 0.05, 6), 0xff9fc0, { k: 'gloss' }, [0.06, 0.03, 0.12], [0.3, 0, 0]);
    b.add(sph(20, 16), 0xa8ecd0, { k: 'gloss' }, [0, 0.3, 0], [0, 0, 0], [0.13, 0.115, 0.13]);
    b.add(geo.torus(0.11, 0.03, 8, 18), 0xa8ecd0, { k: 'gloss' }, [0, 0.235, 0], [HALF, 0, 0]);
    b.add(sph(14, 10), 0xe8363f, { k: 'gloss' }, [0.01, 0.44, 0], [0, 0, 0], 0.045);
    b.add(sweep([[0.01, 0.48, 0], [0.03, 0.53, 0], [0.07, 0.56, 0]], () => 0.006, 8, 4), 0x5a3a20);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.3;
      b.add(geo.capsule(0.007, 0.02, 4), [0xffe066, 0x9fd6f0, 0xffffff][i % 3], {}, [Math.cos(a) * 0.08, 0.36 + (i % 2) * 0.02, Math.sin(a) * 0.08], [a, a * 2, 0]);
    }
  },
  chips(b, r) {
    // puffy pillow bag
    b.add(geo.rbox(0.46, 0.56, 0.17, 0.08, 4), 0x5a8dee, { k: 'gloss' }, [0, -0.02, 0]);
    b.add(sph(20, 12), 0x5a8dee, { k: 'gloss' }, [0, -0.02, 0], [0, 0, 0], [0.21, 0.25, 0.11]);
    // crimped seams (saw-tooth) top and bottom
    for (const y of [0.27, -0.31]) {
      b.add(geo.rbox(0.47, 0.05, 0.03, 0.012, 1), 0x4a76d0, { k: 'gloss' }, [0, y, 0]);
      for (let i = 0; i < 11; i++) b.add(geo.cone(0.022, 0.035, 4), 0x4a76d0, { k: 'gloss', flat: true }, [-0.21 + i * 0.042, y + (y > 0 ? 0.035 : -0.035), 0], [0, 0.78, y > 0 ? 0 : Math.PI], [1, 1, 0.6]);
    }
    // sunny badge with a chip picture, both sides
    for (const side of [1, -1]) {
      const z = side * 0.112;
      const ry = side > 0 ? 0 : Math.PI;
      b.add(geo.circle(1, 12), 0xffe066, {}, [0, -0.02, z], [0, ry, 0.3], 0.14);
      b.add(sph(12, 8), 0xffc94a, { flat: true }, [0, -0.02, z + side * 0.004], [0, ry, 0.3], [0.08, 0.055, 0.01]);
      b.add(geo.rbox(0.3, 0.05, 0.01, 0.01, 1), 0xffffff, {}, [0, 0.18, z - side * 0.006], [0, ry, 0]);
    }
    // a few chips popping out above
    for (let i = 0; i < 4; i++) {
      const x = -0.12 + i * 0.08;
      b.add(sph(10, 6), i % 2 ? 0xffd35a : 0xffc94a, { flat: true }, [x, 0.38 + (i % 2) * 0.05 + r() * 0.02, (r() - 0.5) * 0.04], [0.5 + r(), r() * 3, (r() - 0.5) * 0.8], [0.065, 0.012, 0.05]);
    }
  },
  hot_chips(b, r) {
    // fries first so the scoop hides their bottoms
    for (let i = 0; i < 14; i++) {
      const x = -0.12 + (i % 5) * 0.06 + (r() - 0.5) * 0.02;
      const z = -0.05 + Math.floor(i / 5) * 0.05;
      const h = 0.34 + r() * 0.12;
      b.add(geo.rbox(0.045, h, 0.045, 0.012, 1), 0, { cf: (_p, n) => (n.y > 0.8 ? 0xe9a42c : 0xffd23f) }, [x, 0.02 + h / 2 - 0.12, z], [(r() - 0.5) * 0.3, r(), (r() - 0.5) * 0.4]);
    }
    b.add(lathe([[0, -0.26], [0.15, -0.26], [0.21, 0.08], [0.0, 0.08]], 4, Math.PI / 4), 0, {
      flat: true,
      cf: (p) => {
        if (p.y > 0.07) return 0xd94a40;
        const u = Math.abs(p.x) > Math.abs(p.z) ? p.z : p.x;
        return Math.floor(u * 22 + 20) % 2 ? 0xffffff : 0xf0564a;
      },
    }, [0, 0, 0], [0, 0, 0], [1, 1, 0.65]);
  },
  mouldy_bread(b, r) {
    b.at([0, 0, 0], [0, 0.1, -0.12], 1, () => {
      breadSlice(b, 0xc9a06a, 0xeee3c2);
      const spots: [number, number, number, number][] = [
        [0.08, 0.12, 0.05, 1],
        [-0.1, -0.08, 0.04, 1],
        [0.06, -0.16, 0.03, 1],
        [-0.05, 0.16, 0.035, -1],
        [0.08, -0.05, 0.04, -1],
      ];
      const cols = [0x8fe0c8, 0x6cc6c0, 0xa8d8f0, 0x9fe6c8];
      for (const [x, y, s, side] of spots) {
        b.add(disc(16), 0xc9e8d8, {}, [x, y, side * (BREAD_FACE_Z + 0.001)], side > 0 ? [0, 0, 0] : [0, Math.PI, 0], s * 1.15);
        for (let i = 0; i < 6; i++) {
          const a = r() * TAU;
          const d = r() * s * 0.8;
          b.add(sph(8, 6), cols[i % cols.length], {}, [x + Math.cos(a) * d, y + Math.sin(a) * d, side * (BREAD_FACE_Z + 0.004)], [0, 0, 0], s * (0.3 + r() * 0.2));
        }
      }
    });
  },
  smelly_fish(b) {
    b.at([0, -0.06, 0], [0, 0, 0.12], 1, () => {
      b.add(sph(24, 16), 0x8fb0c8, { cf: (p) => (p.y < -0.25 ? 0xdce8ee : 0x8fb0c8) }, [0, 0, 0], [0, 0, 0], [0.3, 0.17, 0.1]);
      // scales
      for (let i = 0; i < 3; i++) {
        for (const s of [1, -1]) b.add(geo.torus(1, 0.12, 4, 10, Math.PI), 0xa7c4d8, {}, [-0.06 + i * -0.07, 0.03, s * 0.085], [0, s > 0 ? 0 : Math.PI, -HALF], [0.04, 0.04, 0.03]);
      }
      // tail
      const tail = new THREE.Shape();
      tail.moveTo(0, 0);
      tail.quadraticCurveTo(-0.08, 0.06, -0.15, 0.14);
      tail.quadraticCurveTo(-0.12, 0, -0.15, -0.14);
      tail.quadraticCurveTo(-0.08, -0.06, 0, 0);
      b.add(extrude(tail, 0.03, 0.012), 0x6f93ad, {}, [-0.26, 0, 0]);
      // fins
      const fin = new THREE.Shape();
      fin.moveTo(-0.1, 0);
      fin.quadraticCurveTo(-0.05, 0.1, 0.08, 0.03);
      fin.lineTo(0.08, 0);
      fin.lineTo(-0.1, 0);
      b.add(extrude(fin, 0.02, 0.01), 0x6f93ad, {}, [0, 0.15, 0]);
      b.add(sph(10, 8), 0x6f93ad, {}, [0.0, -0.06, 0.09], [0, 0, -0.5], [0.07, 0.025, 0.015]);
      b.add(sph(10, 8), 0x6f93ad, {}, [0.0, -0.06, -0.09], [0, 0, -0.5], [0.07, 0.025, 0.015]);
      // funny droopy eyes (both sides) and a little "o" mouth
      for (const s of [1, -1]) {
        b.add(sph(14, 10), 0xffffff, { k: 'gloss' }, [0.17, 0.05, s * 0.07], [0, 0, 0], 0.05);
        b.add(sph(10, 8), 0x2b3440, { k: 'gloss' }, [0.19, 0.035, s * 0.105], [0, 0, 0], 0.022);
        b.add(new THREE.SphereGeometry(1, 14, 6, 0, TAU, 0, 1.25), 0x7aa0bb, {}, [0.17, 0.05, s * 0.07], [s * 0.3, 0, -0.35], 0.054);
      }
      b.add(geo.torus(0.022, 0.009, 6, 12), 0x5a6f80, {}, [0.29, -0.03, 0], [0, HALF, 0]);
      // wiggly stink lines (animated in the shader)
      for (let i = 0; i < 3; i++) {
        const x0 = -0.12 + i * 0.12;
        const pts: V3[] = [];
        for (let k = 0; k <= 6; k++) pts.push([x0 + Math.sin(k * 1.4 + i) * 0.03, 0.2 + k * 0.045, (i - 1) * 0.02]);
        b.add(sweep(pts, (t) => 0.014 * (1 - t * 0.5), 24, 6), 0xa6dd5a, { k: 'stink' });
      }
    });
  },
};

// ------------------------------------------------------------------ assembly + cache
/** Per-model size (largest dimension in metres) so silhouettes read evenly in play. */
const SIZE: Record<string, number> = {
  peas: 0.74,
  nuts: 0.64,
  water: 0.66,
  milk: 0.66,
  apple_slices: 0.7,
  lollies: 0.68,
  spinach: 0.7,
  strawberry: 0.66,
  smelly_fish: 0.74,
};
const DEFAULT_SIZE = 0.7;

interface CachedModel {
  parts: { kind: Kind; geometry: THREE.BufferGeometry }[];
  tris: number;
}
const cache = new Map<string, CachedModel>();

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

function buildCached(id: string): CachedModel {
  const fn = MODELS[id] ?? MODELS.apple_slices;
  const b = new Builder();
  fn(b, rng(hashId(id)));
  const parts: CachedModel['parts'] = [];
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  for (const [kind, list] of b.parts) {
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    merged.computeBoundingBox();
    tmp.copy(merged.boundingBox!);
    box.union(tmp);
    parts.push({ kind, geometry: merged });
  }
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  const k = (SIZE[id] ?? DEFAULT_SIZE) / Math.max(s.x, s.y, s.z, 1e-3);
  let tris = 0;
  for (const p of parts) {
    p.geometry.translate(-c.x, -c.y, -c.z);
    p.geometry.scale(k, k, k);
    p.geometry.computeBoundingSphere();
    p.geometry.computeBoundingBox();
    tris += p.geometry.attributes.position.count / 3;
  }
  // stable draw order: opaque first
  const order: Kind[] = ['std', 'rough', 'gloss', 'metal', 'dbl', 'glow', 'liquid', 'glass', 'hi', 'stink'];
  parts.sort((a, z) => order.indexOf(a.kind) - order.indexOf(z.kind));
  return { parts, tris };
}

function getCached(id: string): CachedModel {
  let m = cache.get(id);
  if (!m) {
    m = buildCached(id);
    cache.set(id, m);
  }
  return m;
}

function tickStink(): void {
  stinkTime.value = performance.now() / 1000;
}

/**
 * A big, readable 3D model for a food id (origin at the visual centre, ~0.55-0.75 m across).
 * Geometry and materials are shared/cached: remove the object when done, do not dispose it.
 */
export function createFoodModel(id: string): THREE.Object3D {
  const cm = getCached(id);
  const g = new THREE.Group();
  g.name = `food:${id}`;
  for (const p of cm.parts) {
    const m = new THREE.Mesh(p.geometry, kindMat(p.kind));
    m.renderOrder = RENDER_ORDER[p.kind] ?? 0;
    if (p.kind === 'stink') m.onBeforeRender = tickStink;
    m.name = `food:${id}:${p.kind}`;
    g.add(m);
  }
  g.userData.foodId = id;
  g.userData.sharedGeometry = true;
  return g;
}

/** Pre-build every food's geometry (optional warm-up during loading). */
export function prewarmFoodModels(): void {
  for (const f of FOODS) getCached(f.id);
}

/** Debug stats: draw calls and triangles per food id. */
export function foodModelStats(id: string): { drawCalls: number; triangles: number } {
  const cm = getCached(id);
  return { drawCalls: cm.parts.length, triangles: Math.round(cm.tris) };
}

/** True if a dedicated model exists for the id. */
export function hasFoodModel(id: string): boolean {
  return id in MODELS;
}

// ------------------------------------------------------------------ prop builder (shared with fx)
export type PropKind = Kind;
export type PropBuilder = Builder;
export { sweep as propSweep, lathe as propLathe, extrude as propExtrude };

/**
 * Build a small procedural prop with the food pipeline (vertex-coloured parts merged per material
 * kind, 1-4 draw calls). Unlike food models it is not re-centred or rescaled.
 */
export function buildProp(fn: (b: PropBuilder) => void): THREE.Group {
  const b = new Builder();
  fn(b);
  const g = new THREE.Group();
  for (const [kind, list] of b.parts) {
    const merged = mergeGeometries(list, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, kindMat(kind));
    m.renderOrder = RENDER_ORDER[kind] ?? 0;
    g.add(m);
  }
  return g;
}
