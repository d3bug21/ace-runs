// Shared helpers for the indoor playground, indoor arcade and outdoor playground stages.
// The big idea: side scenery and obstacle bodies are built from many little rounded parts,
// then merged into ONE vertex-coloured mesh per material so a 40 m stretch costs a handful
// of draw calls instead of hundreds.
import * as THREE from 'three';
import { canvasTexture, clamp, mat } from '../kit/kit';
import { LANE_WIDTH, PLATFORM_TOP, type ObstacleRequest, type ObstacleVisual, type StagePattern } from '../contracts';

// ------------------------------------------------------------------ shared long-lived resources
/**
 * The engine may run kit.disposeTree() over removed decor. Materials / geometries / textures we
 * share across many stretches must survive that, otherwise every removal forces a shader
 * recompile or buffer re-upload. `keep()` turns their dispose() into a no-op.
 */
export function keep<T extends THREE.Material | THREE.BufferGeometry>(x: T): T {
  (x as { dispose: () => void }).dispose = () => {};
  return x;
}

const vcCache = new Map<string, THREE.Material>();
/** Lit vertex-colour material (soft, matches kit.mat roughness). Shared + protected. */
export function vcMat(rough = 0.75, opts: { emissive?: number; emissiveIntensity?: number; side?: THREE.Side } = {}): THREE.MeshStandardMaterial {
  const key = `lit|${rough}|${opts.emissive ?? 0}|${opts.emissiveIntensity ?? 1}|${opts.side ?? 0}`;
  let m = vcCache.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = keep(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: rough,
        metalness: 0,
        emissive: opts.emissive ?? 0,
        emissiveIntensity: opts.emissiveIntensity ?? 1,
        side: opts.side ?? THREE.FrontSide,
      }),
    );
    vcCache.set(key, m);
  }
  return m;
}
/** Unlit vertex-colour material, for neon strips, screens' glow edges, skylights. */
export function vcGlow(opacity = 1, additive = false): THREE.MeshBasicMaterial {
  const key = `glow|${opacity}|${additive ? 1 : 0}`;
  let m = vcCache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = keep(
      new THREE.MeshBasicMaterial({ toneMapped: false,
        vertexColors: true,
        transparent: opacity < 1 || additive,
        opacity,
        depthWrite: !(opacity < 1 || additive),
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        fog: true,
      }),
    );
    vcCache.set(key, m);
  }
  return m;
}

// ------------------------------------------------------------------ geometry batching
interface Prepared {
  pos: Float32Array;
  nrm: Float32Array;
  uv: Float32Array | null;
}
const prepCache = new WeakMap<THREE.BufferGeometry, Prepared>();
function prepare(g: THREE.BufferGeometry): Prepared {
  let p = prepCache.get(g);
  if (!p) {
    const src = g.index ? g.toNonIndexed() : g;
    if (!src.getAttribute('normal')) src.computeVertexNormals();
    const uvA = src.getAttribute('uv');
    p = {
      pos: new Float32Array(src.getAttribute('position').array as ArrayLike<number>),
      nrm: new Float32Array(src.getAttribute('normal').array as ArrayLike<number>),
      uv: uvA ? new Float32Array(uvA.array as ArrayLike<number>) : null,
    };
    if (src !== g) src.dispose();
    prepCache.set(g, p);
  }
  return p;
}

const _o = new THREE.Object3D();
const _c = new THREE.Color();
const _nm = new THREE.Matrix3();
const _v = new THREE.Vector3();

interface Part {
  g: THREE.BufferGeometry;
  m: THREE.Matrix4;
  r: number;
  gr: number;
  b: number;
}

/** Collects transformed, coloured copies of geometries and merges them into one mesh. */
export class Batch {
  /** Dev-only: when set, accumulates triangles per geometry signature. */
  static stats: Map<string, number> | null = null;
  private parts: Part[] = [];
  private verts = 0;
  /** Transform order: scale, then rotation (XYZ euler), then translation. */
  add(g: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): this {
    _o.position.set(x, y, z);
    _o.rotation.set(rx, ry, rz);
    _o.scale.set(sx, sy, sz);
    _o.updateMatrix();
    return this.addMatrix(g, color, _o.matrix);
  }
  addMatrix(g: THREE.BufferGeometry, color: number, m: THREE.Matrix4): this {
    _c.setHex(color);
    if (Batch.stats) {
      const k = `${g.type}${JSON.stringify((g as THREE.BufferGeometry & { parameters?: unknown }).parameters ?? {}).slice(0, 40)}`;
      Batch.stats.set(k, (Batch.stats.get(k) ?? 0) + prepare(g).pos.length / 9);
    }
    this.parts.push({ g, m: m.clone(), r: _c.r, gr: _c.g, b: _c.b });
    this.verts += prepare(g).pos.length / 3;
    return this;
  }
  /** Add with an extra parent matrix (e.g. a prop's local frame). */
  addIn(parent: THREE.Matrix4, g: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): this {
    _o.position.set(x, y, z);
    _o.rotation.set(rx, ry, rz);
    _o.scale.set(sx, sy, sz);
    _o.updateMatrix();
    const m = parent.clone().multiply(_o.matrix);
    return this.addMatrix(g, color, m);
  }
  get empty(): boolean {
    return this.parts.length === 0;
  }
  /** Merge into one BufferGeometry (positions, normals, colours, uvs). */
  geometry(): THREE.BufferGeometry {
    const n = this.verts;
    const pos = new Float32Array(n * 3);
    const nrm = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    let o = 0;
    for (const p of this.parts) {
      const pr = prepare(p.g);
      const e = p.m.elements;
      _nm.getNormalMatrix(p.m);
      const ne = _nm.elements;
      const cnt = pr.pos.length / 3;
      for (let i = 0; i < cnt; i++) {
        const x = pr.pos[i * 3],
          y = pr.pos[i * 3 + 1],
          z = pr.pos[i * 3 + 2];
        const k = (o + i) * 3;
        pos[k] = e[0] * x + e[4] * y + e[8] * z + e[12];
        pos[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        pos[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        _v.set(pr.nrm[i * 3], pr.nrm[i * 3 + 1], pr.nrm[i * 3 + 2]);
        const nx = ne[0] * _v.x + ne[3] * _v.y + ne[6] * _v.z;
        const ny = ne[1] * _v.x + ne[4] * _v.y + ne[7] * _v.z;
        const nz = ne[2] * _v.x + ne[5] * _v.y + ne[8] * _v.z;
        const l = Math.hypot(nx, ny, nz) || 1;
        nrm[k] = nx / l;
        nrm[k + 1] = ny / l;
        nrm[k + 2] = nz / l;
        col[k] = p.r;
        col[k + 1] = p.gr;
        col[k + 2] = p.b;
        if (pr.uv) {
          uv[(o + i) * 2] = pr.uv[i * 2];
          uv[(o + i) * 2 + 1] = pr.uv[i * 2 + 1];
        }
      }
      o += cnt;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
  /** Build a mesh (null if empty). */
  build(material: THREE.Material = vcMat()): THREE.Mesh | null {
    if (this.empty) return null;
    const me = new THREE.Mesh(this.geometry(), material);
    me.matrixAutoUpdate = false;
    me.updateMatrix();
    return me;
  }
  /** Build into a parent (convenience). */
  into(parent: THREE.Object3D, material?: THREE.Material): THREE.Mesh | null {
    const me = this.build(material);
    if (me) parent.add(me);
    return me;
  }
}

// ------------------------------------------------------------------ custom shapes (cached, protected)
const shapeCache = new Map<string, THREE.BufferGeometry>();
function cshape(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = shapeCache.get(key);
  if (!g) {
    g = keep(make());
    shapeCache.set(key, g);
  }
  return g;
}

/** Triangular prism ramp: width w (x), rising from 0 at local z=+l/2 to h at z=-l/2. Base at y=0. */
export function wedgeGeo(w: number, h: number, l: number): THREE.BufferGeometry {
  return cshape(`wedge${w},${h},${l}`, () => {
    const x0 = -w / 2,
      x1 = w / 2,
      zf = l / 2,
      zb = -l / 2;
    const P = (x: number, y: number, z: number) => [x, y, z];
    const tris: number[][][] = [
      // slope (two tris), facing up and toward +z
      [P(x0, 0, zf), P(x1, 0, zf), P(x1, h, zb)],
      [P(x0, 0, zf), P(x1, h, zb), P(x0, h, zb)],
      // back face (z = zb), facing -z
      [P(x1, 0, zb), P(x0, 0, zb), P(x0, h, zb)],
      [P(x1, 0, zb), P(x0, h, zb), P(x1, h, zb)],
      // bottom
      [P(x0, 0, zb), P(x1, 0, zb), P(x1, 0, zf)],
      [P(x0, 0, zb), P(x1, 0, zf), P(x0, 0, zf)],
      // left side (x0)
      [P(x0, 0, zb), P(x0, 0, zf), P(x0, h, zb)],
      // right side (x1)
      [P(x1, 0, zf), P(x1, 0, zb), P(x1, h, zb)],
    ];
    const pos: number[] = [];
    for (const t of tris) for (const v of t) pos.push(...v);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const uv = new Float32Array((pos.length / 3) * 2);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  });
}

/** Low-poly ball for ball pits etc. */
export const ballGeo = (r: number) => cshape(`ball${r}`, () => new THREE.IcosahedronGeometry(r, 1));
/** Smooth-ish ball. */
export const ballGeo2 = (r: number) => cshape(`ball2${r}`, () => new THREE.IcosahedronGeometry(r, 2));
/** Flat triangle pennant (bunting flag) in the XY plane, point down. */
export const pennantGeo = (w: number, h: number) =>
  cshape(`pen${w},${h}`, () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, 0, 0, 0, -h, 0, w / 2, 0, 0, w / 2, 0, 0, 0, -h, 0, -w / 2, 0, 0], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
    return g;
  });
/** Partial torus tube (for tube slides). */
export const arcTube = (R: number, r: number, arc: number, seg = 18) => cshape(`arc${R},${r},${arc},${seg}`, () => new THREE.TorusGeometry(R, r, 10, seg, arc));
/** Five-point star prism (flat, in XY plane, depth d). */
export const starGeo = (r: number, d: number) =>
  cshape(`star${r},${d}`, () => {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.48;
      const x = Math.cos(a) * rr,
        y = Math.sin(a) * rr;
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: r * 0.08, bevelThickness: r * 0.08, bevelSegments: 1 });
    g.translate(0, 0, -d / 2);
    return g;
  });
/** Heart prism (flat, XY plane). */
export const heartGeo = (r: number, d: number) =>
  cshape(`heart${r},${d}`, () => {
    const s = new THREE.Shape();
    s.moveTo(0, -r);
    s.bezierCurveTo(r * 1.3, -r * 0.1, r * 0.9, r * 1.0, 0, r * 0.45);
    s.bezierCurveTo(-r * 0.9, r * 1.0, -r * 1.3, -r * 0.1, 0, -r);
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: r * 0.08, bevelThickness: r * 0.08, bevelSegments: 1, curveSegments: 6 });
    g.translate(0, 0, -d / 2);
    return g;
  });
/** Half disc (semicircle prism) for arches / tunnel tops, in XY plane. */
export const archGeo = (R: number, r: number, d: number) =>
  cshape(`archT${R},${r},${d}`, () => {
    const s = new THREE.Shape();
    s.absarc(0, 0, R, 0, Math.PI, false);
    s.lineTo(-r, 0);
    s.absarc(0, 0, r, Math.PI, 0, true);
    s.lineTo(R, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2, curveSegments: 20 });
    g.translate(0, 0, -d / 2);
    return g;
  });

// ------------------------------------------------------------------ floors
/**
 * A flat strip of floor from track distance d0..d1 spanning x0..x1. UVs: u across x (0..1),
 * v = distance / tileLen (continuous across stretches so textures tile seamlessly).
 */
export function floorStrip(d0: number, d1: number, x0: number, x1: number, material: THREE.Material, tileLen: number, y = 0, uRepeat = 1): THREE.Mesh {
  const g = new THREE.BufferGeometry();
  const za = -d0,
    zb = -d1;
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, za, x1, y, za, x1, y, zb, x0, y, zb], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, d0 / tileLen, uRepeat, d0 / tileLen, uRepeat, d1 / tileLen, 0, d1 / tileLen], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const m = new THREE.Mesh(g, material);
  m.matrixAutoUpdate = false;
  m.updateMatrix();
  return m;
}

const texMatCache = new Map<string, THREE.Material>();
/** A cached, protected textured standard material (for floors / signs). */
export function texMat(key: string, make: () => THREE.Texture, o: { rough?: number; repeat?: boolean; unlit?: boolean; transparent?: boolean; emissive?: number } = {}): THREE.Material {
  let m = texMatCache.get(key);
  if (!m) {
    const t = make();
    if (o.repeat) {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
    }
    t.needsUpdate = true;
    m = o.unlit
      ? new THREE.MeshBasicMaterial({ toneMapped: false, map: t, transparent: !!o.transparent, depthWrite: !o.transparent })
      : new THREE.MeshStandardMaterial({
          map: t,
          roughness: o.rough ?? 0.85,
          transparent: !!o.transparent,
          emissive: o.emissive ?? 0,
          emissiveMap: o.emissive ? t : null,
        });
    keep(m);
    texMatCache.set(key, m);
  }
  return m;
}

/** Simple sky dome with a vertical gradient (top -> horizon -> below). Not fogged. */
export function skyDome(top: string, mid: string, horizon: string, radius = 420): THREE.Mesh {
  const tex = canvasTexture(4, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, top);
    grd.addColorStop(0.32, mid);
    grd.addColorStop(0.5, horizon);
    grd.addColorStop(1, horizon);
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
  const m = new THREE.MeshBasicMaterial({ toneMapped: false, map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
  const me = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), m);
  me.renderOrder = -10;
  me.frustumCulled = false;
  return me;
}

// ------------------------------------------------------------------ glow sprites
let glowTex: THREE.Texture | null = null;
function glowTexture(): THREE.Texture {
  if (!glowTex) {
    glowTex = canvasTexture(64, 64, (g) => {
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      grd.addColorStop(0.6, 'rgba(255,255,255,0.14)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    });
  }
  return glowTex;
}
const glowMatCache = new Map<string, THREE.SpriteMaterial>();
export function glowMaterial(color: number, opacity = 0.6): THREE.SpriteMaterial {
  const key = `${color}|${opacity}`;
  let m = glowMatCache.get(key);
  if (!m) {
    m = keep(
      new THREE.SpriteMaterial({ toneMapped: false, map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: true }),
    );
    glowMatCache.set(key, m);
  }
  return m;
}
/** Additive soft glow sprite (bloom-like halo). */
export function glowSprite(color: number, size: number, opacity = 0.6): THREE.Sprite {
  const s = new THREE.Sprite(glowMaterial(color, opacity));
  s.scale.set(size, size, 1);
  return s;
}
/** Additive glow halo as a flat quad facing +Z (cheaper than sprites when facing is known). */
const glowPlaneMat = new Map<string, THREE.MeshBasicMaterial>();
export function glowQuadMaterial(color: number, opacity = 0.5): THREE.MeshBasicMaterial {
  const key = `${color}|${opacity}`;
  let m = glowPlaneMat.get(key);
  if (!m) {
    m = keep(new THREE.MeshBasicMaterial({ toneMapped: false, map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
    glowPlaneMat.set(key, m);
  }
  return m;
}

// ------------------------------------------------------------------ text / sign textures
export const FONT = '"Fredoka", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';
export function signTexture(text: string, w: number, h: number, bg: string, fg: string, opts: { border?: string; radius?: number; weight?: number; size?: number } = {}): THREE.CanvasTexture {
  return canvasTexture(w, h, (g) => {
    const r = opts.radius ?? h * 0.25;
    g.clearRect(0, 0, w, h);
    g.fillStyle = bg;
    roundRect(g, 4, 4, w - 8, h - 8, r);
    g.fill();
    if (opts.border) {
      g.lineWidth = Math.max(4, h * 0.06);
      g.strokeStyle = opts.border;
      roundRect(g, 4 + g.lineWidth / 2, 4 + g.lineWidth / 2, w - 8 - g.lineWidth, h - 8 - g.lineWidth, r);
      g.stroke();
    }
    g.fillStyle = fg;
    g.font = `${opts.weight ?? 700} ${opts.size ?? Math.floor(h * 0.56)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + h * 0.03);
  });
}
export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
export const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

// ------------------------------------------------------------------ animated decor registry
interface AnimEntry {
  root: THREE.Object3D;
  z: number;
  fn: (t: number, dt: number) => void;
  orphanT: number; // time first seen without a parent (-1 = attached)
}
/** Animations living inside decor stretches. Pruned automatically when the engine removes the stretch. */
export class DecorAnims {
  private list: AnimEntry[] = [];
  add(root: THREE.Object3D, z: number, fn: (t: number, dt: number) => void): void {
    this.list.push({ root, z, fn, orphanT: -1 });
  }
  run(t: number, dt: number, playerZ: number): void {
    let w = 0;
    for (let i = 0; i < this.list.length; i++) {
      const a = this.list[i];
      if (!a.root.parent) {
        // not (yet / any more) in the scene: keep briefly in case it is about to be added
        if (a.orphanT < 0) a.orphanT = t;
        if (t - a.orphanT < 3) this.list[w++] = a;
        continue;
      }
      a.orphanT = -1;
      this.list[w++] = a;
      const dz = a.z - playerZ;
      if (dz < -140 || dz > 30) continue; // far ahead or behind
      a.fn(t, dt);
    }
    this.list.length = w;
  }
  clear(): void {
    this.list.length = 0;
  }
}

// ------------------------------------------------------------------ obstacle helpers
/** Damped spring wobble used by react('bonk'|'bump'). */
export class Wobble {
  a = 0;
  v = 0;
  squash = 0;
  sv = 0;
  kick(k: 'bonk' | 'bump'): void {
    this.v += k === 'bonk' ? 9 : 5;
    this.sv += k === 'bonk' ? -2.6 : -1.6;
  }
  step(dt: number): void {
    const d = Math.min(dt, 0.05);
    this.v += (-60 * this.a - 7 * this.v) * d;
    this.a += this.v * d;
    this.sv += (-90 * this.squash - 9 * this.sv) * d;
    this.squash += this.sv * d;
  }
  apply(o: THREE.Object3D, baseScale = 1): void {
    o.rotation.z = this.a * 0.12;
    o.rotation.x = -Math.abs(this.a) * 0.03;
    const s = clamp(1 + this.squash * 0.12, 0.8, 1.2);
    o.scale.set(baseScale / Math.sqrt(s), baseScale * s, baseScale / Math.sqrt(s));
  }
}

/**
 * Standard obstacle wrapper: root (engine positions it) > body (we wobble it).
 * `anim` gets (time, dt, dist, movedX) where movedX is how far the engine slid the root this frame.
 */
export function visual(root: THREE.Group, body: THREE.Object3D, anim?: (t: number, dt: number, dist: number, movedX: number) => void): ObstacleVisual {
  const wob = new Wobble();
  let lastX = Number.NaN;
  let active = false;
  return {
    object: root,
    update(t, dt, dist) {
      const x = root.position.x;
      const moved = Number.isNaN(lastX) ? 0 : x - lastX;
      lastX = x;
      if (anim) anim(t, dt, dist, Math.abs(moved) > 1.5 ? 0 : moved);
      if (active || Math.abs(wob.v) > 0.001 || Math.abs(wob.a) > 0.001) {
        wob.step(dt);
        wob.apply(body);
        active = Math.abs(wob.v) + Math.abs(wob.a) + Math.abs(wob.sv) + Math.abs(wob.squash) > 0.002;
        if (!active) {
          body.rotation.z = 0;
          body.rotation.x = 0;
          body.scale.set(1, 1, 1);
        }
      }
    },
    react(kind) {
      wob.kick(kind);
      active = true;
    },
  };
}

/** Footprint width for a request. */
export const spanW = (req: ObstacleRequest): number => req.laneSpan * LANE_WIDTH;
/** Lane-centre x offsets (local) for each lane of a request. */
export function laneOffsets(span: number): number[] {
  if (span <= 1) return [0];
  if (span === 2) return [-LANE_WIDTH / 2, LANE_WIDTH / 2];
  return [-LANE_WIDTH, 0, LANE_WIDTH];
}
/** Body length used for platform/ramp defaults. */
export const PTOP = PLATFORM_TOP;

/** Shared spinning blur for bonk is handled by the engine; obstacles just wobble. */

// ------------------------------------------------------------------ simple particle pool
/** Instanced particle pool (confetti, bubbles, petals). Particles live in world space. */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private px: Float32Array;
  private py: Float32Array;
  private pz: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private life: Float32Array;
  private spin: Float32Array;
  private seed: Float32Array;
  private next = 0;
  gravity = -6;
  drag = 0.6;
  flutter = 0;
  private dummy = new THREE.Object3D();
  constructor(
    g: THREE.BufferGeometry,
    material: THREE.Material,
    readonly count: number,
    private colors: number[],
  ) {
    this.mesh = new THREE.InstancedMesh(g, material, count);
    this.mesh.frustumCulled = false;
    this.px = new Float32Array(count);
    this.py = new Float32Array(count);
    this.pz = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.vz = new Float32Array(count);
    this.life = new Float32Array(count);
    this.spin = new Float32Array(count);
    this.seed = new Float32Array(count);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      c.setHex(colors[i % colors.length]);
      this.mesh.setColorAt(i, c);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.life[i] = life;
    this.spin[i] = Math.random() * 6;
    this.seed[i] = Math.random() * 10;
  }
  update(dt: number, t: number, floorY = 0): void {
    const d = this.dummy;
    let any = false;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      this.vy[i] += this.gravity * dt;
      const k = Math.exp(-this.drag * dt);
      this.vx[i] *= k;
      this.vz[i] *= k;
      if (this.flutter) {
        this.vx[i] += Math.sin(t * 3 + this.seed[i]) * this.flutter * dt;
      }
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < floorY + 0.02) {
        this.py[i] = floorY + 0.02;
        this.vy[i] = 0;
        this.vx[i] *= 0.5;
        this.vz[i] *= 0.5;
      }
      const s = clamp(this.life[i] * 2, 0, 1);
      d.position.set(this.px[i], this.py[i], this.pz[i]);
      const sp = this.spin[i] + t * (this.py[i] > floorY + 0.03 ? 5 : 0);
      d.rotation.set(sp, sp * 0.7, this.seed[i]);
      d.scale.setScalar(s);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = any;
  }
  clear(): void {
    this.life.fill(0);
    this.mesh.visible = false;
  }
}

// ------------------------------------------------------------------ pattern helpers
/** Sanity checker for authored patterns (used by the dev harness). Returns a list of problems. */
export function checkPattern(p: StagePattern): string[] {
  const errs: string[] = [];
  const DEF: Record<string, number> = { low: 1.2, high: 1.0, block: 1.6, platform: 16, ramp: 8, moverBlock: 1.6, moverLow: 1.0 };
  const lanesOf = (i: StagePattern['items'][number]): number[] => {
    const span = i.laneSpan ?? 1;
    return span === 3 ? [-1, 0, 1] : span === 2 ? [i.lane, i.lane + 1] : [i.lane];
  };
  for (const r of p.items.filter((i) => i.kind === 'ramp')) {
    const rl = r.length ?? 8;
    const plat = p.items.find((i) => i.kind === 'platform' && i.lane === r.lane && Math.abs(r.dz + rl / 2 - (i.dz - (i.length ?? 12) / 2)) < 0.01);
    if (!plat) errs.push(`${p.id}: ramp at ${r.dz} has no platform directly after it`);
  }
  for (const it of p.items) {
    if (it.dz < 0 || it.dz > p.length) errs.push(`${p.id}: item at ${it.dz} outside length ${p.length}`);
    if ((it.laneSpan ?? 1) === 2 && it.lane === 1) errs.push(`${p.id}: laneSpan 2 must use lane -1 or 0`);
  }
  // passability: sample along the pattern; at every z at least one lane must be free / jumpable / slidable / on a platform
  for (let z = 0; z <= p.length; z += 0.5) {
    let open = 0;
    for (const lane of [-1, 0, 1]) {
      const here = p.items.filter((i) => lanesOf(i).includes(lane) && Math.abs(i.dz - z) <= (i.length ?? DEF[i.kind]) / 2);
      if (!here.some((i) => i.kind === 'block' || i.kind === 'moverBlock')) open++;
    }
    if (open === 0) {
      errs.push(`${p.id}: no passable lane at dz ${z}`);
      break;
    }
  }
  // spacing: rows needing different actions (ignoring ramp/platform) should be >= 9 m apart
  const act = (k: string) => (k === 'low' || k === 'moverLow' ? 'jump' : k === 'high' ? 'slide' : k === 'block' || k === 'moverBlock' ? 'lane' : '');
  const rows = [...new Set(p.items.filter((i) => act(i.kind)).map((i) => i.dz))].sort((a, b) => a - b);
  for (let k = 1; k < rows.length; k++) {
    const gap = rows[k] - rows[k - 1];
    if (gap >= 9) continue;
    const A = new Set(p.items.filter((i) => i.dz === rows[k - 1]).map((i) => act(i.kind)).filter(Boolean));
    const B = new Set(p.items.filter((i) => i.dz === rows[k]).map((i) => act(i.kind)).filter(Boolean));
    const same = A.size === B.size && [...A].every((x) => B.has(x));
    if (!same) errs.push(`${p.id}: rows ${rows[k - 1]} and ${rows[k]} only ${gap} m apart with different actions`);
  }
  return errs;
}

/** Tiny shim so stage files can share a common mat call style. */
export const M = mat;

// ------------------------------------------------------------------ local frames for props
/** Matrix for a prop's local frame: translate (x, y, z), rotate ry about Y, uniform scale s. */
export function frameM(x: number, y: number, z: number, ry = 0, s = 1): THREE.Matrix4 {
  _o.position.set(x, y, z);
  _o.rotation.set(0, ry, 0);
  _o.scale.set(s, s, s);
  _o.updateMatrix();
  return _o.matrix.clone();
}
/** Partial sphere (cached), e.g. beach-ball wedges. */
export const sphereWedge = (r: number, phiStart: number, phiLen: number, ws = 4, hs = 10) =>
  cshape(`sw${r},${phiStart.toFixed(3)},${phiLen.toFixed(3)},${ws},${hs}`, () => new THREE.SphereGeometry(r, ws, hs, phiStart, phiLen));
/** Tube along a helix (cached): radius R around Y, from y0 to y1 over `turns` turns, tube radius r. */
export const helixTube = (R: number, r: number, y0: number, y1: number, turns: number, startAngle = 0) =>
  cshape(`hx${R},${r},${y0},${y1},${turns},${startAngle}`, () => {
    const pts: THREE.Vector3[] = [];
    const n = Math.ceil(turns * 24);
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const a = startAngle + u * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * R, y0 + (y1 - y0) * u, Math.sin(a) * R));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, r, 10, false);
  });
/** Tube along arbitrary points (cached by key). */
export const pathTube = (key: string, pts: THREE.Vector3[], r: number, seg = 40, radial = 8) =>
  cshape(`pt${key}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, radial, false));
/** Generic cached custom geometry. */
export const cached = cshape;

let glowAdd: THREE.MeshBasicMaterial | null = null;
/** Additive, textured (soft radial) vertex-colour material for merged halo quads. */
export function glowAddMat(): THREE.MeshBasicMaterial {
  if (!glowAdd) {
    glowAdd = keep(
      new THREE.MeshBasicMaterial({ toneMapped: false,
        map: glowTexture(),
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: true,
      }),
    );
  }
  return glowAdd;
}
/** Plane geometry whose UVs map to one cell of a cols x rows atlas (cached). */
export const atlasPlane = (w: number, h: number, cols: number, rows: number, cell: number) =>
  cached(`ap${w},${h},${cols},${rows},${cell}`, () => {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    const cx = cell % cols,
      cy = Math.floor(cell / cols);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (cx + uv.getX(i)) / cols, 1 - (cy + 1 - uv.getY(i)) / rows);
    return g;
  });
