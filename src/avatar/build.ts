// Low-level modelling helpers for the avatar: merge many rounded primitives into one
// vertex-coloured mesh per rig bone, so a whole character + ride stays ~45 draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type V3 = readonly [number, number, number];

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();

/** Shared vertex-coloured materials (never disposed; shared by every avatar). */
let bodyMat: THREE.MeshStandardMaterial | null = null;
let rideMat: THREE.MeshStandardMaterial | null = null;
let glossMat: THREE.MeshStandardMaterial | null = null;

export function bodyMaterial(): THREE.MeshStandardMaterial {
  if (!bodyMat) bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74, metalness: 0 });
  return bodyMat;
}
export function rideMaterial(): THREE.MeshStandardMaterial {
  if (!rideMat) rideMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.08 });
  return rideMat;
}
export function glossMaterial(): THREE.MeshStandardMaterial {
  if (!glossMat) glossMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0 });
  return glossMat;
}

/** Copy only position/normal (+ an index) so every part merges cleanly. */
function prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const c = new THREE.BufferGeometry();
  c.setAttribute('position', g.getAttribute('position').clone());
  const n = g.getAttribute('normal');
  if (n) c.setAttribute('normal', n.clone());
  if (g.index) c.setIndex(g.index.clone());
  else {
    const count = g.getAttribute('position').count;
    const idx: number[] = new Array(count);
    for (let i = 0; i < count; i++) idx[i] = i;
    c.setIndex(idx);
  }
  if (!n) c.computeVertexNormals();
  return c;
}

function colorize(g: THREE.BufferGeometry, color: number, shade: number): void {
  tmpC.setHex(color);
  const pos = g.getAttribute('position');
  const n = pos.count;
  const arr = new Float32Array(n * 3);
  if (shade > 0) {
    // Soft vertical gradient (slightly darker underneath) for depth without textures.
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const h = Math.max(1e-5, bb.max.y - bb.min.y);
    for (let i = 0; i < n; i++) {
      const k = 1 - shade * (1 - (pos.getY(i) - bb.min.y) / h);
      arr[i * 3] = tmpC.r * k;
      arr[i * 3 + 1] = tmpC.g * k;
      arr[i * 3 + 2] = tmpC.b * k;
    }
  } else {
    for (let i = 0; i < n; i++) {
      arr[i * 3] = tmpC.r;
      arr[i * 3 + 1] = tmpC.g;
      arr[i * 3 + 2] = tmpC.b;
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

/** Collects coloured primitives and merges them into a single mesh. */
export class Parts {
  private list: THREE.BufferGeometry[] = [];

  /** Add a primitive: position, scale (uniform or xyz), Euler rotation (radians). */
  add(g: THREE.BufferGeometry, color: number, pos: V3 = [0, 0, 0], scale: number | V3 = 1, rot: V3 = [0, 0, 0], shade = 0, order: THREE.EulerOrder = 'XYZ'): this {
    tmpP.set(pos[0], pos[1], pos[2]);
    tmpE.set(rot[0], rot[1], rot[2], order);
    tmpQ.setFromEuler(tmpE);
    if (typeof scale === 'number') tmpS.set(scale, scale, scale);
    else tmpS.set(scale[0], scale[1], scale[2]);
    tmpM.compose(tmpP, tmpQ, tmpS);
    return this.addMatrix(g, color, tmpM, shade);
  }

  /** Add with a quaternion orientation. */
  addQ(g: THREE.BufferGeometry, color: number, pos: THREE.Vector3, q: THREE.Quaternion, scale: number | V3 = 1, shade = 0): this {
    if (typeof scale === 'number') tmpS.set(scale, scale, scale);
    else tmpS.set(scale[0], scale[1], scale[2]);
    const m = new THREE.Matrix4().compose(pos, q, tmpS);
    return this.addMatrix(g, color, m, shade);
  }

  /** A capsule limb from a to b (caps extend radius beyond each end, like joint balls). */
  limb(color: number, a: V3, b: V3, radius: number, shade = 0, seg = 8): this {
    const A = new THREE.Vector3(a[0], a[1], a[2]);
    const B = new THREE.Vector3(b[0], b[1], b[2]);
    const d = B.clone().sub(A);
    const len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const mid = A.add(B).multiplyScalar(0.5);
    return this.addQ(capsuleGeo(radius, len, seg), color, mid, q, 1, shade);
  }

  addMatrix(g: THREE.BufferGeometry, color: number, m: THREE.Matrix4, shade = 0): this {
    const c = prep(g);
    c.applyMatrix4(m);
    colorize(c, color, shade);
    this.list.push(c);
    return this;
  }

  get count(): number {
    return this.list.length;
  }

  /** Merge into one geometry (parts list is consumed). */
  geometry(): THREE.BufferGeometry {
    const merged = this.list.length === 1 ? this.list[0] : mergeGeometries(this.list, false);
    if (!merged) throw new Error('avatar: failed to merge parts');
    if (this.list.length > 1) for (const g of this.list) g.dispose();
    this.list = [];
    merged.computeBoundingSphere();
    return merged;
  }

  mesh(material: THREE.Material = bodyMaterial()): THREE.Mesh {
    const me = new THREE.Mesh(this.geometry(), material);
    me.matrixAutoUpdate = true;
    return me;
  }
}

// ---------------------------------------------------------------- shared unit primitives
const cache = new Map<string, THREE.BufferGeometry>();
function cached<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = cache.get(key) as T | undefined;
  if (!g) {
    g = make();
    g.userData.shared = true;
    cache.set(key, g);
  }
  return g;
}

/** Unit primitives (radius 1 / height 1) meant to be scaled when added to Parts. */
export const U = {
  sphere: (ws = 14, hs = 10) => cached(`s${ws},${hs}`, () => new THREE.SphereGeometry(1, ws, hs)),
  /** Upper hemisphere dome (y >= 0). */
  dome: (ws = 20, hs = 8) => cached(`d${ws},${hs}`, () => new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, 0, Math.PI / 2)),
  /** Partial sphere from the top down to `theta` (radians from +Y). */
  cap: (theta: number, ws = 22, hs = 10) => cached(`cp${theta},${ws},${hs}`, () => new THREE.SphereGeometry(1, ws, hs, 0, Math.PI * 2, 0, theta)),
  cyl: (seg = 14) => cached(`c${seg}`, () => new THREE.CylinderGeometry(1, 1, 1, seg)),
  cone: (seg = 12) => cached(`k${seg}`, () => new THREE.ConeGeometry(1, 1, seg)),
  torus: (tube: number, arc = Math.PI * 2, rs = 8, ts = 20) => cached(`t${tube},${arc},${rs},${ts}`, () => new THREE.TorusGeometry(1, tube, rs, ts, arc)),
  /** Rounded box of unit size with relative corner radius. */
  rbox: (r = 0.25, seg = 1) => cached(`rb${r},${seg}`, () => new RoundedBox(r, seg)),
};

/** Unit rounded box (1x1x1) built from RoundedBoxGeometry. */
class RoundedBox extends RoundedBoxGeometry {
  constructor(r: number, seg: number) {
    super(1, 1, 1, seg, r);
  }
}

/** Capsule with real radius/length (cached by rounded key). */
export function capsuleGeo(r: number, len: number, seg = 8): THREE.BufferGeometry {
  const rk = Math.round(r * 1000);
  const lk = Math.round(len * 1000);
  return cached(`cap${rk},${lk},${seg}`, () => new THREE.CapsuleGeometry(rk / 1000, lk / 1000, Math.max(2, Math.round(seg / 3)), seg));
}

/** A flat 4-point sparkle star (unit size) facing -Z. */
export function starGeometry(points = 4, inner = 0.32): THREE.BufferGeometry {
  return cached(`star${points},${inner}`, () => {
    const s = new THREE.Shape();
    for (let i = 0; i < points * 2; i++) {
      const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
      const r = i % 2 === 0 ? 1 : inner;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    s.closePath();
    const g = new THREE.ShapeGeometry(s);
    g.rotateY(Math.PI); // face -Z
    return g;
  });
}
