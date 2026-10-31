// Pooled camera-facing sprite particles: one instanced quad mesh per layer (1 draw call), CPU
// simulation in typed arrays, no per-frame allocations. Particles live either in "runner-local"
// space (offset from the runner origin uniform, so they travel with the runner) or in world space.
import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS, spriteAtlas } from './atlas';

export const F_JUNK = 1; // washed away by water / bounce back
export const F_GERM = 2; // bounces off the shield bubble
export const F_JITTER = 4; // jittery sugar-rush shake
export const F_SWAY = 8; // gentle side-to-side drift (Z letters, sighs)
export const F_POP = 16; // pops in with an overshoot
export const F_SPIN_IN = 32; // germ already bounced (internal)
export const F_HOLD = 64; // stay opaque until the last 25%

const VERT = /* glsl */ `
attribute vec4 iPos;   // xyz, space (0 = runner-local, 1 = world)
attribute vec4 iColor; // rgb, alpha
attribute vec4 iMisc;  // size, rotation, sprite, additive
uniform vec3 uOrigin;
varying vec2 vUv;
varying vec4 vColor;
varying float vAdd;
void main() {
  vec3 wp = iPos.xyz + uOrigin * (1.0 - iPos.w);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  float c = cos(iMisc.y), s = sin(iMisc.y);
  vec2 q = position.xy;
  mv.xy += vec2(c * q.x - s * q.y, s * q.x + c * q.y) * iMisc.x;
  gl_Position = projectionMatrix * mv;
  float sp = iMisc.z;
  float cx = mod(sp, ${ATLAS_COLS.toFixed(1)});
  float cy = floor(sp / ${ATLAS_COLS.toFixed(1)});
  vUv = vec2((cx + uv.x) / ${ATLAS_COLS.toFixed(1)}, 1.0 - (cy + 1.0 - uv.y) / ${ATLAS_ROWS.toFixed(1)});
  vColor = iColor;
  vAdd = iMisc.w;
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
varying vec4 vColor;
varying float vAdd;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(t.rgb * vColor.rgb * a, a * (1.0 - vAdd));
}`;

export class SpriteLayer {
  readonly mesh: THREE.Mesh;
  readonly origin = new THREE.Vector3();
  /** Shield bounce sphere (runner-local), radius 0 = off. */
  readonly bounceCenter = new THREE.Vector3();
  bounceR = 0;
  onBounce: ((x: number, y: number, z: number) => void) | null = null;
  rate = 1; // emission multiplier (reduced motion)
  sizeScale = 1; // particle size multiplier (not manual slots)

  private readonly cap: number;
  private readonly manualN: number;
  private count = 0;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aCol: THREE.InstancedBufferAttribute;
  private readonly aMisc: THREE.InstancedBufferAttribute;
  private readonly iPos: Float32Array;
  private readonly iCol: Float32Array;
  private readonly iMisc: Float32Array;
  // particle state (index = particle slot)
  private readonly p: Float32Array; // x y z vx vy vz
  private readonly q: Float32Array; // life max s0 s1 rot vr grav drag
  private readonly c: Float32Array; // r g b a
  private readonly m: Float32Array; // sprite add space seed
  private readonly fl: Uint8Array;
  private readonly touched: Uint8Array;
  private readonly mat: THREE.ShaderMaterial;

  constructor(cap: number, manual: number, onTop: boolean) {
    this.cap = cap;
    this.manualN = manual;
    const total = cap + manual;
    const base = new THREE.PlaneGeometry(1, 1);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = base.index;
    this.geo.setAttribute('position', base.attributes.position);
    this.geo.setAttribute('uv', base.attributes.uv);
    this.iPos = new Float32Array(total * 4);
    this.iCol = new Float32Array(total * 4);
    this.iMisc = new Float32Array(total * 4);
    this.aPos = new THREE.InstancedBufferAttribute(this.iPos, 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.iCol, 4).setUsage(THREE.DynamicDrawUsage);
    this.aMisc = new THREE.InstancedBufferAttribute(this.iMisc, 4).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('iPos', this.aPos);
    this.geo.setAttribute('iColor', this.aCol);
    this.geo.setAttribute('iMisc', this.aMisc);
    this.geo.instanceCount = 0;
    this.p = new Float32Array(cap * 6);
    this.q = new Float32Array(cap * 8);
    this.c = new Float32Array(cap * 4);
    this.m = new Float32Array(cap * 4);
    this.fl = new Uint8Array(cap);
    this.touched = new Uint8Array(Math.max(1, manual));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uMap: { value: spriteAtlas() }, uOrigin: { value: this.origin } },
      transparent: true,
      depthWrite: false,
      depthTest: !onTop,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquation: THREE.AddEquation,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = onTop ? 30 : 20;
    this.mesh.name = onTop ? 'fx:spritesTop' : 'fx:sprites';
  }

  get active(): number {
    return this.count;
  }

  /** Spawn a particle. Position/velocity are runner-local when space = 0, world when space = 1. */
  spawn(
    sprite: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    s0: number,
    s1: number,
    color = 0xffffff,
    alpha = 1,
    add = 0,
    space = 0,
    grav = 0,
    drag = 0,
    flags = 0,
    rot = Math.random() * 6.283,
    vr = 0,
  ): number {
    if (this.count >= this.cap) return -1;
    const i = this.count++;
    const p = i * 6;
    this.p[p] = x;
    this.p[p + 1] = y;
    this.p[p + 2] = z;
    this.p[p + 3] = vx;
    this.p[p + 4] = vy;
    this.p[p + 5] = vz;
    const q = i * 8;
    this.q[q] = 0;
    this.q[q + 1] = Math.max(0.05, life);
    this.q[q + 2] = s0;
    this.q[q + 3] = s1;
    this.q[q + 4] = rot;
    this.q[q + 5] = vr;
    this.q[q + 6] = grav;
    this.q[q + 7] = drag;
    const c = i * 4;
    this.c[c] = ((color >> 16) & 255) / 255;
    this.c[c + 1] = ((color >> 8) & 255) / 255;
    this.c[c + 2] = (color & 255) / 255;
    this.c[c + 3] = alpha;
    this.m[c] = sprite;
    this.m[c + 1] = add;
    this.m[c + 2] = space;
    this.m[c + 3] = Math.random();
    this.fl[i] = flags;
    return i;
  }

  /** Set a manual (per-frame) sprite slot. Slots not set in a frame are hidden. */
  manual(slot: number, sprite: number, x: number, y: number, z: number, size: number, rot: number, color: number, alpha: number, add = 0, space = 0): void {
    if (slot >= this.manualN) return;
    this.touched[slot] = 1;
    const o = slot * 4;
    this.iPos[o] = x;
    this.iPos[o + 1] = y;
    this.iPos[o + 2] = z;
    this.iPos[o + 3] = space;
    this.iCol[o] = ((color >> 16) & 255) / 255;
    this.iCol[o + 1] = ((color >> 8) & 255) / 255;
    this.iCol[o + 2] = (color & 255) / 255;
    this.iCol[o + 3] = alpha;
    this.iMisc[o] = alpha > 0.002 ? size : 0;
    this.iMisc[o + 1] = rot;
    this.iMisc[o + 2] = sprite;
    this.iMisc[o + 3] = add;
  }

  /** Fade out every particle carrying a flag (e.g. junk visuals washed away). */
  killFlag(flag: number): void {
    for (let i = 0; i < this.count; i++) {
      if (this.fl[i] & flag) {
        const q = i * 8;
        this.q[q] = Math.max(this.q[q], this.q[q + 1] * 0.8);
      }
    }
  }

  clear(): void {
    this.count = 0;
    for (let s = 0; s < this.manualN; s++) this.iMisc[s * 4] = 0;
    this.geo.instanceCount = 0;
  }

  /** Simulate + upload. Call once per frame after setting manual slots. */
  update(dt: number): void {
    const P = this.p;
    const Q = this.q;
    const bc = this.bounceCenter;
    for (let i = 0; i < this.count; ) {
      const q = i * 8;
      Q[q] += dt;
      if (Q[q] >= Q[q + 1]) {
        this.removeAt(i);
        continue;
      }
      const p = i * 6;
      const drag = Q[q + 7];
      if (drag > 0) {
        const k = Math.max(0, 1 - drag * dt);
        P[p + 3] *= k;
        P[p + 4] *= k;
        P[p + 5] *= k;
      }
      P[p + 4] -= Q[q + 6] * dt;
      P[p] += P[p + 3] * dt;
      P[p + 1] += P[p + 4] * dt;
      P[p + 2] += P[p + 5] * dt;
      Q[q + 4] += Q[q + 5] * dt;
      const f = this.fl[i];
      if (f & F_GERM && !(f & F_SPIN_IN) && this.bounceR > 0) {
        const dx = P[p] - bc.x;
        const dy = P[p + 1] - bc.y;
        const dz = P[p + 2] - bc.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < this.bounceR) {
          const nx = dx / d;
          const ny = dy / d;
          const nz = dz / d;
          const vn = P[p + 3] * nx + P[p + 4] * ny + P[p + 5] * nz;
          const sp = 1.35;
          P[p + 3] = (P[p + 3] - 2 * vn * nx) * sp;
          P[p + 4] = (P[p + 4] - 2 * vn * ny) * sp + 1.5;
          P[p + 5] = (P[p + 5] - 2 * vn * nz) * sp;
          Q[q + 5] = (Math.random() < 0.5 ? -1 : 1) * 9;
          Q[q + 6] = 3;
          Q[q + 1] = Q[q] + 0.9;
          this.fl[i] = f | F_SPIN_IN;
          this.onBounce?.(bc.x + nx * this.bounceR, bc.y + ny * this.bounceR, bc.z + nz * this.bounceR);
        }
      }
      i++;
    }
    // upload: manual slots first (hidden unless set this frame), then particles
    const n0 = this.manualN;
    for (let s = 0; s < n0; s++) {
      if (!this.touched[s]) this.iMisc[s * 4] = 0;
      this.touched[s] = 0;
    }
    const C = this.c;
    const M = this.m;
    for (let i = 0; i < this.count; i++) {
      const p = i * 6;
      const q = i * 8;
      const c = i * 4;
      const o = (n0 + i) * 4;
      const t = Q[q] / Q[q + 1];
      const f = this.fl[i];
      let x = P[p];
      let y = P[p + 1];
      let z = P[p + 2];
      const age = Q[q];
      if (f & F_SWAY) x += Math.sin(age * 2.6 + M[c + 3] * 6.28) * 0.14;
      if (f & F_JITTER) {
        x += (Math.random() - 0.5) * 0.04;
        y += (Math.random() - 0.5) * 0.04;
      }
      let size = (Q[q + 2] + (Q[q + 3] - Q[q + 2]) * t) * this.sizeScale;
      if (f & F_POP) {
        const u = Math.min(1, age / 0.18);
        const back = 1 + 2.2 * Math.pow(u - 1, 3) + 1.2 * Math.pow(u - 1, 2);
        size *= back;
      }
      const fadeIn = Math.min(1, age / 0.08);
      const fo = f & F_HOLD ? 0.25 : 0.4;
      const fadeOut = t > 1 - fo ? (1 - t) / fo : 1;
      this.iPos[o] = x;
      this.iPos[o + 1] = y;
      this.iPos[o + 2] = z;
      this.iPos[o + 3] = M[c + 2];
      this.iCol[o] = C[c];
      this.iCol[o + 1] = C[c + 1];
      this.iCol[o + 2] = C[c + 2];
      this.iCol[o + 3] = C[c + 3] * fadeIn * fadeOut;
      this.iMisc[o] = size;
      this.iMisc[o + 1] = Q[q + 4];
      this.iMisc[o + 2] = M[c];
      this.iMisc[o + 3] = M[c + 1];
    }
    const n = n0 + this.count;
    this.geo.instanceCount = n;
    this.aPos.clearUpdateRanges();
    this.aCol.clearUpdateRanges();
    this.aMisc.clearUpdateRanges();
    this.aPos.addUpdateRange(0, n * 4);
    this.aCol.addUpdateRange(0, n * 4);
    this.aMisc.addUpdateRange(0, n * 4);
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aMisc.needsUpdate = true;
  }

  private removeAt(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.p.copyWithin(i * 6, last * 6, last * 6 + 6);
    this.q.copyWithin(i * 8, last * 8, last * 8 + 8);
    this.c.copyWithin(i * 4, last * 4, last * 4 + 4);
    this.m.copyWithin(i * 4, last * 4, last * 4 + 4);
    this.fl[i] = this.fl[last];
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}
