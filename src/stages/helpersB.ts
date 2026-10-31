// Shared helpers for the STAGES-B stages (sports, jungle, parks).
// Core idea: almost all static scenery and obstacle bodies are baked into ONE vertex-coloured mesh per
// stretch / obstacle (GeoBuilder), so a 40 m stretch costs a handful of draw calls. Animated foliage,
// flags and crowds use a "sway" material whose vertex shader moves them (no per-frame CPU work).
import * as THREE from 'three';
import { mat, geo, canvasTexture, clamp, lerp } from '../kit/kit';
import type { StageBuildContext, StageSection, ObstacleKind } from '../contracts';
import { HIGH_CLEARANCE } from '../contracts';

// ------------------------------------------------------------------ owned materials
// Materials are registered in the kit's material cache (via a unique, visually negligible metalness key)
// so the engine's kit `disposeTree()` never disposes these shared materials when stretches are removed.
let ownedIdx = 0;
const ownedSlots = new Map<string, THREE.MeshStandardMaterial>();
export function ownedMat(slot: string, setup: (m: THREE.MeshStandardMaterial) => void, rough = 0.8): THREE.MeshStandardMaterial {
  let m = ownedSlots.get(slot);
  if (!m) {
    ownedIdx++;
    m = mat(0xffffff, { rough, metal: 0.0007 + ownedIdx * 0.000013 });
    setup(m);
    m.needsUpdate = true;
    ownedSlots.set(slot, m);
  }
  return m;
}

/** Shared time uniform for sway / glow shaders. Call setStageTime(time) once per frame. */
export const stageTime = { value: 0 };
export function setStageTime(t: number): void {
  stageTime.value = t;
}

/** Plain vertex-coloured soft material. */
export function vcMat(rough = 0.8): THREE.MeshStandardMaterial {
  return ownedMat(`vc${rough}`, (m) => {
    m.vertexColors = true;
  }, rough);
}

/** Vertex-coloured material whose vertices sway/bob from the `sway` attribute (x = horizontal amp, y = vertical wave amp). */
export function swayMat(rough = 0.82): THREE.MeshStandardMaterial {
  return ownedMat(`sway${rough}`, (m) => {
    m.vertexColors = true;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = stageTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 sway;\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            vec4 wp0 = modelMatrix * vec4(transformed, 1.0);
            float ph = wp0.x * 0.31 + wp0.z * 0.17;
            transformed.x += sin(uTime * 1.5 + ph) * sway.x;
            transformed.z += cos(uTime * 1.2 + ph * 1.3) * sway.x * 0.5;
            float wv = pow(max(0.0, sin(uTime * 1.9 - wp0.z * 0.11)), 8.0);
            transformed.y += wv * sway.y + abs(sin(uTime * 5.0 + ph * 7.0)) * sway.y * 0.06;
          }`,
        );
    };
    m.customProgramCacheKey = () => 'acerunsB-sway';
  }, rough);
}

/** Vertex-coloured self-lit material (screens, lamps, glowing fruit). Emissive = vertex colour * intensity. */
export function glowVcMat(intensity = 0.9): THREE.MeshStandardMaterial {
  return ownedMat(`glow${intensity}`, (m) => {
    m.vertexColors = true;
    m.emissive.set(0xffffff);
    m.emissiveIntensity = intensity;
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif',
      );
    };
    m.customProgramCacheKey = () => 'acerunsB-glow';
  }, 0.6);
}

/** Textured floor material (cached per slot). */
export function texMat(slot: string, tex: THREE.Texture, rough = 0.85): THREE.MeshStandardMaterial {
  return ownedMat(`tex:${slot}`, (m) => {
    m.map = tex;
  }, rough);
}

/** Soft translucent material (water, glass). Cached. */
export function clearMat(slot: string, color: number, opacity: number, rough = 0.25, extra?: (m: THREE.MeshStandardMaterial) => void): THREE.MeshStandardMaterial {
  return ownedMat(`clear:${slot}`, (m) => {
    m.color.set(color);
    m.transparent = true;
    m.opacity = opacity;
    m.depthWrite = false;
    extra?.(m);
  }, rough);
}

// ------------------------------------------------------------------ geometry baking
const _m4 = new THREE.Matrix4();
const _n3 = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export interface PutOpts {
  rx?: number;
  ry?: number;
  rz?: number;
  /** uniform scale */
  s?: number;
  sx?: number;
  sy?: number;
  sz?: number;
  /** horizontal sway amplitude (m) for swayMat */
  sway?: number;
  /** vertical "crowd wave" amplitude (m) for swayMat */
  wave?: number;
}

/** Bakes many transformed, coloured primitives into a single indexed BufferGeometry. */
export class GeoBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private sw: number[] = [];
  private idx: number[] = [];
  private vcount = 0;
  private anySway = false;

  get empty(): boolean {
    return this.vcount === 0;
  }
  get vertexCount(): number {
    return this.vcount;
  }

  /** Add geometry `g` transformed by matrix `m` with a flat colour. */
  add(g: THREE.BufferGeometry, color: number | THREE.Color, m: THREE.Matrix4, swayH = 0, swayV = 0): this {
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute | undefined;
    _n3.getNormalMatrix(m);
    if (typeof color === 'number') _c.setHex(color);
    else _c.copy(color);
    const base = this.vcount;
    const cnt = p.count;
    if (swayH !== 0 || swayV !== 0) this.anySway = true;
    for (let i = 0; i < cnt; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(m);
      this.pos.push(_v.x, _v.y, _v.z);
      if (n) {
        _v.fromBufferAttribute(n, i).applyMatrix3(_n3).normalize();
        this.nor.push(_v.x, _v.y, _v.z);
      } else this.nor.push(0, 1, 0);
      this.col.push(_c.r, _c.g, _c.b);
      this.sw.push(swayH, swayV);
    }
    const flip = m.determinant() < 0;
    if (g.index) {
      const ia = g.index.array;
      for (let i = 0; i < ia.length; i += 3) {
        if (flip) this.idx.push(base + ia[i], base + ia[i + 2], base + ia[i + 1]);
        else this.idx.push(base + ia[i], base + ia[i + 1], base + ia[i + 2]);
      }
    } else {
      for (let i = 0; i < cnt; i += 3) {
        if (flip) this.idx.push(base + i, base + i + 2, base + i + 1);
        else this.idx.push(base + i, base + i + 1, base + i + 2);
      }
    }
    this.vcount += cnt;
    return this;
  }

  /** Add geometry at a position with optional Euler rotation (XYZ) and scale. */
  put(g: THREE.BufferGeometry, color: number | THREE.Color, x: number, y: number, z: number, o?: PutOpts): this {
    if (o) {
      _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
      _q.setFromEuler(_e);
      const s = o.s ?? 1;
      _s.set((o.sx ?? 1) * s, (o.sy ?? 1) * s, (o.sz ?? 1) * s);
    } else {
      _q.identity();
      _s.set(1, 1, 1);
    }
    _p.set(x, y, z);
    _m4.compose(_p, _q, _s);
    return this.add(g, color, _m4, o?.sway ?? 0, o?.wave ?? 0);
  }

  /** Add with an explicit parent matrix applied after the local transform (for grouped sub-models). */
  putIn(parent: THREE.Matrix4, g: THREE.BufferGeometry, color: number | THREE.Color, x: number, y: number, z: number, o?: PutOpts): this {
    if (o) {
      _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
      _q.setFromEuler(_e);
      const s = o.s ?? 1;
      _s.set((o.sx ?? 1) * s, (o.sy ?? 1) * s, (o.sz ?? 1) * s);
    } else {
      _q.identity();
      _s.set(1, 1, 1);
    }
    _p.set(x, y, z);
    const local = new THREE.Matrix4().compose(_p, _q, _s);
    return this.add(g, color, local.premultiply(parent), o?.sway ?? 0, o?.wave ?? 0);
  }

  /** Bake into a geometry (or null when empty). */
  geometry(): THREE.BufferGeometry | null {
    if (this.vcount === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.anySway) g.setAttribute('sway', new THREE.Float32BufferAttribute(this.sw, 2));
    g.setIndex(this.vcount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  /** Bake into a mesh with the given material (default soft vertex-colour material). Returns null when empty. */
  build(material: THREE.Material = vcMat()): THREE.Mesh | null {
    const g = this.geometry();
    if (!g) return null;
    const me = new THREE.Mesh(g, material);
    me.matrixAutoUpdate = false;
    me.updateMatrix();
    return me;
  }

  /** Build and add to parent if not empty. */
  into(parent: THREE.Object3D, material?: THREE.Material): THREE.Mesh | null {
    const me = this.build(material);
    if (me) parent.add(me);
    return me;
  }
}

/** Builds a coloured mesh for an animated sub-part (pivot at origin). */
export function part(fill: (b: GeoBuilder) => void, material?: THREE.Material): THREE.Mesh {
  const b = new GeoBuilder();
  fill(b);
  const me = b.build(material) ?? new THREE.Mesh(geo.box(0.01, 0.01, 0.01), vcMat());
  me.matrixAutoUpdate = true;
  return me;
}

// ------------------------------------------------------------------ custom geometries (cached)
const myGeo = new Map<string, THREE.BufferGeometry>();
function cg<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = myGeo.get(key) as T | undefined;
  if (!g) {
    g = make();
    myGeo.set(key, g);
  }
  return g;
}

/** Ramp wedge: width w (x), length len (z), rising from y=0 at +z/2 (front) to y=h at -z/2 (back). */
export function wedgeGeo(w: number, len: number, h: number): THREE.BufferGeometry {
  return cg(`wedge${w},${len},${h}`, () => {
    const x0 = -w / 2, x1 = w / 2, zf = len / 2, zb = -len / 2;
    const P: number[] = [];
    const quad = (a: number[], b: number[], c: number[], d: number[]) => {
      P.push(...a, ...b, ...c, ...a, ...c, ...d);
    };
    const tri = (a: number[], b: number[], c: number[]) => P.push(...a, ...b, ...c);
    // slope (faces up/forward)
    quad([x0, 0, zf], [x1, 0, zf], [x1, h, zb], [x0, h, zb]);
    // back face (faces -z)
    quad([x1, 0, zb], [x0, 0, zb], [x0, h, zb], [x1, h, zb]);
    // sides
    tri([x0, 0, zb], [x0, 0, zf], [x0, h, zb]);
    tri([x1, 0, zf], [x1, 0, zb], [x1, h, zb]);
    // bottom
    quad([x0, 0, zb], [x1, 0, zb], [x1, 0, zf], [x0, 0, zf]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.computeVertexNormals();
    return g;
  });
}

/** Low-poly geometry variants for decor (fewer segments than kit defaults). */
export const lo = {
  sphere: (r: number) => geo.sphere(r, 10, 7),
  sphereHi: (r: number) => geo.sphere(r, 16, 12),
  cyl: (rt: number, rb: number, h: number) => geo.cyl(rt, rb, h, 8),
  cone: (r: number, h: number) => geo.cone(r, h, 8),
  ico: (r: number, d = 0) => cg(`ico${r},${d}`, () => new THREE.IcosahedronGeometry(r, d)),
  dodeca: (r: number) => cg(`dod${r}`, () => new THREE.DodecahedronGeometry(r, 0)),
  capsule: (r: number, len: number) => geo.capsule(r, len, 6),
  /** flat leaf: a diamond in the XZ plane, pointing +z */
  leaf: (w: number, l: number) =>
    cg(`leaf${w},${l}`, () => {
      const g = new THREE.BufferGeometry();
      const P = [0, 0, 0, w / 2, 0.02, l * 0.45, 0, 0.04, l, 0, 0, 0, 0, 0.04, l, -w / 2, 0.02, l * 0.45];
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.computeVertexNormals();
      return g;
    }),
  /** double-sided-ish flat disc lying in XZ */
  disc: (r: number, seg = 16) =>
    cg(`disc${r},${seg}`, () => {
      const g = new THREE.CircleGeometry(r, seg);
      g.rotateX(-Math.PI / 2);
      return g;
    }),
  /** quad lying flat in XZ, centred */
  flat: (w: number, d: number) =>
    cg(`flat${w},${d}`, () => {
      const g = new THREE.PlaneGeometry(w, d);
      g.rotateX(-Math.PI / 2);
      return g;
    }),
  torusArc: (r: number, t: number, arc: number) => geo.torus(r, t, 6, 16, arc),
};

// ------------------------------------------------------------------ floors
/** Track floor plane from distance d0 to d1 with world-aligned UVs (v repeats every tileLen m). */
export function floorStrip(d0: number, d1: number, x0: number, x1: number, material: THREE.Material, tileLen: number, y = 0): THREE.Mesh {
  const len = d1 - d0;
  const g = new THREE.PlaneGeometry(x1 - x0, len, 1, 1);
  g.rotateX(-Math.PI / 2);
  // after rotation: local z in [-len/2, len/2]; place so z from -d0 (near) to -d1 (far)
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const lz = pos.getZ(i); // -len/2 is far (d1)
    const d = d0 + (len / 2 - lz);
    uv.setY(i, d / tileLen);
  }
  uv.needsUpdate = true;
  const me = new THREE.Mesh(g, material);
  me.position.set((x0 + x1) / 2, y, -(d0 + len / 2));
  me.matrixAutoUpdate = false;
  me.updateMatrix();
  return me;
}

/** Repeating canvas texture (wraps both ways). */
export function tileTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const t = canvasTexture(w, h, draw);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const texCache = new Map<string, THREE.Texture>();
export function cachedTex(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = texCache.get(key);
  if (!t) {
    t = make();
    texCache.set(key, t);
  }
  return t;
}

/** Hex number -> css colour string. */
export const css = (hex: number, a = 1): string => {
  const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
};

/** Mix two hex colours. */
export function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t));
}

/** Slight random brightness jitter of a hex colour (for organic variety). */
export function jitter(hex: number, r: () => number, amt = 0.08): number {
  const k = 1 + (r() * 2 - 1) * amt;
  const cr = clamp(Math.round(((hex >> 16) & 255) * k), 0, 255);
  const cgc = clamp(Math.round(((hex >> 8) & 255) * k), 0, 255);
  const cb = clamp(Math.round((hex & 255) * k), 0, 255);
  return (cr << 16) | (cgc << 8) | cb;
}

// ------------------------------------------------------------------ sections
export function sectionAt(sections: StageSection[], d: number): StageSection {
  let s = sections[0];
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].start <= d) s = sections[i];
    else break;
  }
  return s;
}
export function sectionIndexAt(sections: StageSection[], d: number): number {
  let k = 0;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].start <= d) k = i;
    else break;
  }
  return k;
}
/** Split [d0,d1) at section boundaries so each piece can be decorated in its own style. */
export function splitBySection(sections: StageSection[], d0: number, d1: number): { a: number; b: number; section: StageSection }[] {
  const out: { a: number; b: number; section: StageSection }[] = [];
  let a = d0;
  let i = sectionIndexAt(sections, d0);
  while (a < d1) {
    const next = sections[i + 1];
    const b = next ? Math.min(d1, next.start) : d1;
    if (b > a) out.push({ a, b, section: sections[i] });
    a = b;
    i++;
    if (!next) break;
  }
  return out;
}

// ------------------------------------------------------------------ environment (sky, fog, lights)
export interface EnvLook {
  skyTop: number;
  skyHorizon: number;
  skyBottom: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunColor: number;
  sunIntensity: number;
  /** direction FROM the scene TOWARD the sun (normalised internally) */
  sunDir: [number, number, number];
  /** 0..1 visible sun disc + halo in the sky */
  sunGlow: number;
  /** backdrop silhouette tint (multiplies backdrop vertex colours) */
  backdropTint: number;
}

const _ca = new THREE.Color();
const _cb = new THREE.Color();

/** Gradient sky dome + fog + hemisphere + warm key light, all blendable between looks. */
export class StageEnv {
  readonly group = new THREE.Group();
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly fog: THREE.Fog;
  readonly sky: THREE.Mesh;
  /** Distant backdrop materials (fog:false, tinted by backdropTint). */
  readonly backdropMat: THREE.MeshBasicMaterial;
  private uni: {
    top: { value: THREE.Color };
    horizon: { value: THREE.Color };
    bottom: { value: THREE.Color };
    sunColor: { value: THREE.Color };
    sunDir: { value: THREE.Vector3 };
    sunAmt: { value: number };
  };
  private scene: THREE.Scene;
  private prevFog: THREE.Fog | THREE.FogExp2 | null;
  private prevBg: THREE.Scene['background'];
  private sunDir = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
  readonly look: EnvLook;

  constructor(ctx: StageBuildContext, parent: THREE.Object3D, look: EnvLook) {
    this.scene = ctx.scene;
    this.prevFog = ctx.scene.fog;
    this.prevBg = ctx.scene.background;
    this.look = { ...look, sunDir: [...look.sunDir] as [number, number, number] };
    this.uni = {
      top: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() },
      bottom: { value: new THREE.Color() },
      sunColor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3() },
      sunAmt: { value: 0 },
    };
    const radius = Math.max(60, Math.min(420, ctx.camera.far * 0.85));
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.uni,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p; }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunColor; uniform vec3 sunDir; uniform float sunAmt; varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 c = h > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.85, h), 0.7)) : mix(horizon, bottom, smoothstep(0.0, -0.2, h));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          c += sunColor * (smoothstep(0.9965, 0.9985, s) * 0.9 + pow(s, 10.0) * 0.22 + pow(s, 80.0) * 0.25) * sunAmt;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.group.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = false;
    this.group.add(this.hemi, this.sun, this.sun.target);
    this.fog = new THREE.Fog(0xffffff, 30, 110);
    ctx.scene.fog = this.fog;
    this.backdropMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    parent.add(this.group);
    this.apply(look);
  }

  apply(l: EnvLook): void {
    this.blend(l, l, 0);
  }

  /** Blend between two looks (t: 0 = a, 1 = b). Allocation-free. */
  blend(a: EnvLook, b: EnvLook, t: number): void {
    const L = this.look;
    const mixc = (ka: number, kb: number, out: THREE.Color) => out.copy(_ca.setHex(ka)).lerp(_cb.setHex(kb), t);
    mixc(a.skyTop, b.skyTop, this.uni.top.value);
    mixc(a.skyHorizon, b.skyHorizon, this.uni.horizon.value);
    mixc(a.skyBottom, b.skyBottom, this.uni.bottom.value);
    mixc(a.fog, b.fog, this.fog.color);
    this.fog.near = lerp(a.fogNear, b.fogNear, t);
    this.fog.far = lerp(a.fogFar, b.fogFar, t);
    mixc(a.hemiSky, b.hemiSky, this.hemi.color);
    mixc(a.hemiGround, b.hemiGround, this.hemi.groundColor);
    this.hemi.intensity = lerp(a.hemiIntensity, b.hemiIntensity, t);
    mixc(a.sunColor, b.sunColor, this.sun.color);
    this.sun.intensity = lerp(a.sunIntensity, b.sunIntensity, t);
    this.uni.sunColor.value.copy(this.sun.color);
    this.sunDir.set(lerp(a.sunDir[0], b.sunDir[0], t), lerp(a.sunDir[1], b.sunDir[1], t), lerp(a.sunDir[2], b.sunDir[2], t)).normalize();
    this.uni.sunDir.value.copy(this.sunDir);
    this.uni.sunAmt.value = lerp(a.sunGlow, b.sunGlow, t);
    mixc(a.backdropTint, b.backdropTint, this.backdropMat.color);
    L.fogNear = this.fog.near;
    L.fogFar = this.fog.far;
  }

  /** Keep the sky and key light centred on the runner. */
  follow(p: THREE.Vector3): void {
    this.sky.position.copy(p);
    this.sun.position.set(p.x + this.sunDir.x * 40, p.y + this.sunDir.y * 40, p.z + this.sunDir.z * 40);
    this.sun.target.position.copy(p);
  }

  dispose(): void {
    this.group.removeFromParent();
    (this.sky.material as THREE.Material).dispose();
    this.sky.geometry.dispose();
    this.backdropMat.dispose();
    if (this.scene.fog === this.fog) this.scene.fog = this.prevFog;
    this.scene.background = this.prevBg;
  }
}

// ------------------------------------------------------------------ particles (snow, petals, leaves, confetti)
export interface FieldOpts {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  count: number;
  /** box size around the centre (x width, y height, z depth) */
  size: [number, number, number];
  /** box offset from centre (e.g. [0, 0, -20] to bias ahead of the runner) */
  offset?: [number, number, number];
  fall: [number, number]; // m/s
  drift?: number; // sideways flutter amplitude (m/s)
  spin?: number; // rad/s
  scale?: [number, number];
  colors?: number[];
  /** keep particles out of |x| < clearX (e.g. 3.6 for things that must stay off the lanes) */
  clearX?: number;
}
const _o = new THREE.Object3D();
export class FallingField {
  readonly mesh: THREE.InstancedMesh;
  private px: Float32Array;
  private py: Float32Array;
  private pz: Float32Array;
  private vy: Float32Array;
  private ph: Float32Array;
  private sc: Float32Array;
  private o: FieldOpts;
  private densityV = 1;
  private inited = false;
  constructor(o: FieldOpts, r: () => number) {
    this.o = o;
    const n = o.count;
    this.mesh = new THREE.InstancedMesh(o.geometry, o.material, n);
    this.mesh.frustumCulled = false;
    this.px = new Float32Array(n);
    this.py = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.ph = new Float32Array(n);
    this.sc = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.px[i] = (r() - 0.5) * o.size[0];
      this.py[i] = r() * o.size[1];
      this.pz[i] = (r() - 0.5) * o.size[2];
      this.vy[i] = lerp(o.fall[0], o.fall[1], r());
      this.ph[i] = r() * Math.PI * 2;
      this.sc[i] = o.scale ? lerp(o.scale[0], o.scale[1], r()) : 1;
      if (o.clearX && Math.abs(this.px[i]) < o.clearX) this.px[i] = Math.sign(this.px[i] || 1) * (o.clearX + r() * (o.size[0] / 2 - o.clearX));
      if (o.colors) this.mesh.setColorAt(i, _ca.setHex(o.colors[Math.floor(r() * o.colors.length)]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  /** 0..1 fraction of particles visible. */
  set density(v: number) {
    this.densityV = clamp(v, 0, 1);
    this.mesh.count = Math.floor(this.o.count * this.densityV);
    this.mesh.visible = this.mesh.count > 0;
  }
  get density(): number {
    return this.densityV;
  }
  update(dt: number, t: number, center: THREE.Vector3): void {
    const o = this.o;
    const [W, H, D] = o.size;
    const off = o.offset ?? [0, 0, 0];
    const cx = center.x + off[0], cy = off[1], cz = center.z + off[2];
    if (!this.inited) {
      for (let i = 0; i < o.count; i++) {
        this.px[i] += cx;
        this.pz[i] += cz;
      }
      this.inited = true;
    }
    const n = this.mesh.count;
    const drift = o.drift ?? 0.4;
    const spin = o.spin ?? 1;
    for (let i = 0; i < n; i++) {
      const ph = this.ph[i];
      this.py[i] -= this.vy[i] * dt;
      this.px[i] += Math.sin(t * 1.3 + ph) * drift * dt;
      this.pz[i] += Math.cos(t * 0.9 + ph * 1.7) * drift * 0.5 * dt;
      if (this.py[i] < cy) this.py[i] += H;
      // recycle in z relative to the moving centre
      let dz = this.pz[i] - cz;
      if (dz > D / 2) this.pz[i] -= D;
      else if (dz < -D / 2) this.pz[i] += D;
      let dx = this.px[i] - cx;
      if (dx > W / 2) this.px[i] -= W;
      else if (dx < -W / 2) this.px[i] += W;
      dz = this.pz[i];
      _o.position.set(this.px[i], this.py[i], dz);
      _o.rotation.set(t * spin + ph, ph * 2 + t * spin * 0.7, Math.sin(t * 2 + ph) * 0.8);
      _o.scale.setScalar(this.sc[i]);
      _o.updateMatrix();
      this.mesh.setMatrixAt(i, _o.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
  }
}

// ------------------------------------------------------------------ reactions
/** Springy wobble used by obstacle react(): call update(dt) each frame; read .tilt / .squash. */
export class Wobble {
  tilt = 0;
  private v = 0;
  squash = 0;
  private sv = 0;
  private dirSign = 1;
  react(kind: 'bonk' | 'bump'): void {
    this.dirSign = -this.dirSign;
    this.v += (kind === 'bonk' ? 7 : 4) * this.dirSign;
    this.sv += kind === 'bonk' ? 5 : 3;
  }
  update(dt: number): void {
    const k = 90, c = 7;
    const d = Math.min(dt, 0.05);
    this.v += (-k * this.tilt - c * this.v) * d;
    this.tilt += this.v * d;
    this.sv += (-k * this.squash - c * this.sv) * d;
    this.squash += this.sv * d;
  }
  /** Apply as a rotation about Z plus a squash to an object (cheap, allocation-free). */
  applyTo(o: THREE.Object3D, maxTilt = 0.35): void {
    o.rotation.z = clamp(this.tilt * 0.12, -maxTilt, maxTilt);
    // squash only ever shortens the object so collision height limits always hold
    const sq = clamp(Math.abs(this.squash) * 0.03, 0, 0.12);
    o.scale.set(1 + sq * 0.5, 1 - sq, 1 + sq * 0.5);
  }
}

// ------------------------------------------------------------------ shared prop builders (bake into a GeoBuilder)
export const SKIN = [0xf3c9a5, 0xe0a983, 0xc68863, 0x9c6644, 0x7a4b2f, 0xf6d3b8];
export const HAIR = [0x2b2118, 0x4a3122, 0x6b4428, 0xa8743f, 0x1d1a18, 0xd9b26a];

/** Round, friendly broadleaf tree. Canopy colours list = blobs. sway applies to canopy. */
export function addRoundTree(b: GeoBuilder, x: number, z: number, s: number, trunk: number, canopy: number[], r: () => number, sway = 0.05): void {
  const h = 2.2 * s;
  b.put(lo.cyl(0.14 * s, 0.22 * s, h), trunk, x, h / 2, z);
  const blobs = 3 + Math.floor(r() * 2);
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + r();
    const rr = (0.9 + r() * 0.5) * s;
    const ox = i === 0 ? 0 : Math.cos(a) * 0.75 * s;
    const oz = i === 0 ? 0 : Math.sin(a) * 0.75 * s;
    const oy = i === 0 ? h + 0.9 * s : h + 0.4 * s + r() * 0.6 * s;
    b.put(lo.sphere(1), jitter(canopy[i % canopy.length], r, 0.06), x + ox, oy, z + oz, { s: rr, sy: rr * 0.9, sway });
  }
}

/** Bare tree (winter / late autumn): trunk + forked branches. */
export function addBareTree(b: GeoBuilder, x: number, z: number, s: number, col: number, r: () => number, tipCol?: number): void {
  const h = 2.4 * s;
  b.put(lo.cyl(0.12 * s, 0.22 * s, h), col, x, h / 2, z);
  const n = 5 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.6;
    const tilt = 0.5 + r() * 0.5;
    const len = (1.1 + r() * 0.9) * s;
    const y0 = h * (0.62 + r() * 0.35);
    const cx = Math.cos(a) * Math.sin(tilt) * len * 0.5;
    const cz = Math.sin(a) * Math.sin(tilt) * len * 0.5;
    const cy = Math.cos(tilt) * len * 0.5;
    // orient a Y cylinder along direction (sin(tilt)cos a, cos tilt, sin(tilt) sin a)
    b.put(lo.cyl(0.035 * s, 0.07 * s, len), col, x + cx, y0 + cy, z + cz, { rz: -Math.cos(a) * tilt, rx: Math.sin(a) * tilt });
    // little twig fork
    const tx = x + cx * 2, ty = y0 + cy * 2, tz = z + cz * 2;
    b.put(lo.cyl(0.02 * s, 0.035 * s, len * 0.5), col, tx + Math.cos(a + 0.6) * 0.2 * s, ty + 0.18 * s, tz + Math.sin(a + 0.6) * 0.2 * s, { rz: -Math.cos(a + 0.8) * 0.4, rx: Math.sin(a + 0.8) * 0.4 });
    if (tipCol !== undefined) b.put(lo.sphere(0.16 * s), tipCol, tx, ty + 0.05, tz, { sy: 0.6 });
  }
}

/** Pine / conifer of stacked cones. */
export function addPine(b: GeoBuilder, x: number, z: number, s: number, col: number, trunk: number, r: () => number, snow?: number): void {
  b.put(lo.cyl(0.1 * s, 0.16 * s, 0.9 * s), trunk, x, 0.45 * s, z);
  for (let i = 0; i < 3; i++) {
    const rr = (1.2 - i * 0.3) * s;
    const y = (1.1 + i * 0.85) * s;
    b.put(lo.cone(rr, 1.4 * s), jitter(col, r, 0.05), x, y, z, { ry: r() * 3 });
    if (snow !== undefined) b.put(lo.cone(rr * 0.55, 0.62 * s), snow, x, y + 0.42 * s, z, { ry: r() * 3 });
  }
}

/** Rounded bush cluster. */
export function addBush(b: GeoBuilder, x: number, z: number, s: number, col: number, r: () => number, sway = 0.02): void {
  const n = 2 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const rr = (0.45 + r() * 0.3) * s;
    b.put(lo.sphere(1), jitter(col, r, 0.07), x + (r() - 0.5) * 0.8 * s, rr * 0.7, z + (r() - 0.5) * 0.8 * s, { s: rr, sy: rr * 0.8, sway });
  }
}

/** Little flower: stem + bloom. */
export function addFlower(b: GeoBuilder, x: number, z: number, h: number, bloom: number, r: () => number, stem = 0x4f9e4a): void {
  b.put(lo.cyl(0.015, 0.02, h), stem, x, h / 2, z, { sway: 0.03 });
  b.put(lo.sphere(0.09), bloom, x, h + 0.03, z, { sy: 0.7, sway: 0.04 });
  if (r() < 0.5) b.put(lo.sphere(0.035), 0xffe066, x, h + 0.08, z, { sway: 0.04 });
}

/** Rock / boulder. */
export function addRock(b: GeoBuilder, x: number, z: number, s: number, col: number, r: () => number): void {
  b.put(lo.dodeca(0.6), jitter(col, r, 0.08), x, 0.25 * s, z, { s, sy: s * 0.6, ry: r() * 6, rx: r() * 0.4 });
}

export interface PersonOpts {
  shirt: number;
  /** facing angle around Y (0 = facing +z toward camera) */
  ry?: number;
  scale?: number;
  /** raise arms (cheering) */
  cheer?: boolean;
  /** crowd wave amplitude (swayMat) */
  wave?: number;
  hat?: number;
  seated?: boolean;
}
/** Friendly simple person (crowd / spectators): rounded body, head, hair, arms. */
export function addPerson(b: GeoBuilder, x: number, y: number, z: number, r: () => number, o: PersonOpts): void {
  const s = o.scale ?? 1;
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  const hair = HAIR[Math.floor(r() * HAIR.length)];
  const w = o.wave ?? 0;
  const ry = o.ry ?? 0;
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const P = (lx: number, ly: number, lz: number): [number, number, number] => [x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs];
  const bodyH = o.seated ? 0.42 : 0.6;
  let p = P(0, bodyH * 0.5 + (o.seated ? 0.05 : 0.35) * s, 0);
  if (!o.seated) {
    const legs = P(0, 0.2 * s, 0);
    b.put(lo.capsule(0.13 * s, 0.25 * s), 0x3d4a66, legs[0], legs[1], legs[2], { ry, sx: 1.25, wave: w });
  }
  b.put(lo.capsule(0.19 * s, bodyH * 0.55 * s), o.shirt, p[0], p[1], p[2], { ry, sz: 0.85, wave: w });
  const headY = p[1] + bodyH * 0.55 * s + 0.12 * s;
  p = P(0, 0, 0);
  b.put(lo.sphere(0.17 * s), skin, p[0], headY, p[2], { wave: w });
  // hair cap (back/top of head)
  const hp = P(0, 0, -0.03 * s);
  if (o.hat !== undefined) b.put(lo.sphere(0.18 * s), o.hat, hp[0], headY + 0.06 * s, hp[2], { sy: 0.55, wave: w });
  else b.put(lo.sphere(0.175 * s), hair, hp[0], headY + 0.035 * s, hp[2], { sy: 0.85, wave: w });
  // arms
  const armY = p[1] + bodyH * 0.6 * s + (o.seated ? 0.1 : 0.4) * s;
  for (const side of [-1, 1]) {
    const ap = P(side * 0.24 * s, 0, 0);
    if (o.cheer) b.put(lo.capsule(0.06 * s, 0.32 * s), o.shirt, ap[0], armY + 0.35 * s, ap[2], { rz: side * -0.35, ry, wave: w });
    else b.put(lo.capsule(0.06 * s, 0.3 * s), o.shirt, ap[0], armY - 0.05 * s, ap[2], { rz: side * 0.18, ry, wave: w });
    if (o.cheer) b.put(lo.sphere(0.065 * s), skin, ap[0] + side * 0.09 * s, armY + 0.58 * s, ap[2], { wave: w });
  }
}

/** Pennant / flag on a pole (cloth sways). */
export function addFlag(b: GeoBuilder, x: number, z: number, h: number, col: number, side = 1, pole = 0xe9edf2): void {
  b.put(lo.cyl(0.04, 0.05, h), pole, x, h / 2, z);
  b.put(lo.sphere(0.07), 0xffd166, x, h + 0.05, z);
  b.put(geo.box(0.04, 0.7, 1.1), col, x, h - 0.4, z + side * 0.55, { sway: 0.12 });
}

/** Simple picket / rail fence along z from z0 to z1 at x. */
export function addFence(b: GeoBuilder, x: number, z0: number, z1: number, col: number, spacing = 1.2, h = 0.8): void {
  const n = Math.max(1, Math.floor(Math.abs(z1 - z0) / spacing));
  const dir = Math.sign(z1 - z0) || 1;
  for (let i = 0; i <= n; i++) b.put(geo.rbox(0.12, h, 0.12, 0.03, 1), col, x, h / 2, z0 + dir * i * spacing);
  const len = n * spacing;
  const zc = z0 + (dir * len) / 2;
  b.put(geo.rbox(0.06, 0.1, len, 0.02, 1), col, x, h * 0.75, zc);
  b.put(geo.rbox(0.06, 0.1, len, 0.02, 1), col, x, h * 0.35, zc);
}

/** Soft contact shadow (shared cached material, safe with kit disposeTree). Lies at y = 0.015. */
export function addShadow(parent: THREE.Object3D, w: number, d: number, x = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(lo.flat(1, 1), shadowMat());
  me.scale.set(w, 1, d);
  me.position.set(x, 0.015, z);
  me.renderOrder = 1;
  parent.add(me);
  return me;
}
export function shadowMat(): THREE.MeshStandardMaterial {
  return ownedMat('shadow', (m) => {
    const t = canvasTexture(64, 64, (g) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, 64, 64);
      const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      grd.addColorStop(0, 'rgb(255,255,255)');
      grd.addColorStop(0.55, 'rgb(140,140,140)');
      grd.addColorStop(1, 'rgb(0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
    });
    t.colorSpace = THREE.NoColorSpace;
    m.color.set(0x1e283c);
    m.alphaMap = t;
    m.transparent = true;
    m.opacity = 0.32;
    m.depthWrite = false;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -1;
  }, 1);
}

// ------------------------------------------------------------------ obstacle dimension helpers
export interface Footprint {
  w: number; // full width across lanes (laneSpan * LANE_WIDTH)
  hw: number; // half width
  len: number;
  hl: number;
}
export function footprint(laneSpan: number, length: number): Footprint {
  const w = laneSpan * 2.2;
  return { w, hw: w / 2, len: length, hl: length / 2 };
}

/** Collision envelope (for the harness checker). */
export function envelope(kind: ObstacleKind, laneSpan: number, length: number, height: number): { minY: number; maxY: number; w: number; len: number } {
  const w = laneSpan * 2.2;
  switch (kind) {
    case 'low':
      return { minY: 0, maxY: height, w, len: length };
    case 'high':
      return { minY: HIGH_CLEARANCE, maxY: Math.max(2.2, height), w, len: length };
    case 'moverLow':
      return { minY: 0, maxY: Math.min(0.8, height), w, len: length };
    case 'moverBlock':
      return { minY: 0, maxY: height, w, len: length };
    default:
      return { minY: 0, maxY: height, w, len: length };
  }
}

// ------------------------------------------------------------------ signs
/** Big friendly banner texture with an icon drawer and a label. Cached by key. */
export function bannerTexture(key: string, label: string, bg: number, fg: number, icon?: (g: CanvasRenderingContext2D, cx: number, cy: number, r: number) => void): THREE.Texture {
  return cachedTex(`banner:${key}`, () =>
    canvasTexture(512, 128, (g, w, h) => {
      g.fillStyle = css(bg);
      const rr = 40;
      g.beginPath();
      g.roundRect(4, 4, w - 8, h - 8, rr);
      g.fill();
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.beginPath();
      g.roundRect(14, 14, w - 28, h - 28, rr - 10);
      g.stroke();
      if (icon) icon(g, 74, h / 2, 34);
      g.fillStyle = css(fg);
      g.font = '700 62px Fredoka, "Trebuchet MS", system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, icon ? w / 2 + 40 : w / 2, h / 2 + 3);
    }),
  );
}

/** Material for a sign texture (cached per key, unlit-ish so it reads clearly). */
export function signMat(key: string, tex: THREE.Texture): THREE.MeshStandardMaterial {
  return ownedMat(`sign:${key}`, (m) => {
    m.map = tex;
    m.emissive.set(0xffffff);
    m.emissiveMap = tex;
    m.emissiveIntensity = 0.35;
  }, 0.7);
}

// ------------------------------------------------------------------ small math
export const TAU = Math.PI * 2;
export function tri(t: number): number {
  // triangle wave 0..1..0 over period 1
  const f = t - Math.floor(t);
  return f < 0.5 ? f * 2 : 2 - f * 2;
}
/** Ease in-out sine. */
export const easeSine = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
