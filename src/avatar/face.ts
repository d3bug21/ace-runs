// Expressive cartoon face: big glossy eyes with highlights + lids + happy arcs, brows,
// a fully dynamic mouth (smiles, D-grins, O's, wavy tummy mouth, yawns) with real teeth
// (shine / sticky caramel / a tiny cavity speck), puffable rosy cheeks and star sparkles.
import * as THREE from 'three';
import type { Expression, TeethState } from '../contracts';
import { bodyMaterial, glossMaterial, Parts, starGeometry, U } from './build';
import { DIM, type CharSpec } from './spec';

interface FaceParams {
  lid: number; // 0 open .. 1 closed (upper lid)
  squint: number; // 0..1 happy closed "^ ^" arcs
  iris: number; // iris scale
  browY: number; // brow raise (m)
  browA: number; // + = inner ends up (worried), - = inner down (focused)
  browTilt: number; // asymmetry (one brow higher)
  hw: number; // mouth half width
  c: number; // corner lift (smile curvature)
  o: number; // opening below the top edge
  oUp: number; // opening above (round O mouths)
  wave: number; // wavy mouth amplitude
  skew: number; // lopsided mouth
  teeth: number; // upper teeth visibility
  low: number; // lower teeth visibility
  tongue: number;
  cheek: number; // cheek puff scale
}
type ParamKey = keyof FaceParams;
const KEYS: ParamKey[] = ['lid', 'squint', 'iris', 'browY', 'browA', 'browTilt', 'hw', 'c', 'o', 'oUp', 'wave', 'skew', 'teeth', 'low', 'tongue', 'cheek'];

const BASE: FaceParams = { lid: 0.06, squint: 0, iris: 1, browY: 0, browA: 0, browTilt: 0, hw: 0.056, c: 0.024, o: 0, oUp: 0, wave: 0, skew: 0, teeth: 0, low: 0, tongue: 0, cheek: 1 };
const ex = (o: Partial<FaceParams>): FaceParams => ({ ...BASE, ...o });

const EXPR: Record<Expression, FaceParams> = {
  happy: ex({}),
  grin: ex({ lid: 0.16, squint: 0.12, hw: 0.064, c: 0.026, o: 0.044, teeth: 1, tongue: 0.45, cheek: 1.08, browY: 0.006 }),
  wow: ex({ lid: 0, iris: 1.1, browY: 0.02, browA: 0.12, hw: 0.027, c: 0, o: 0.036, oUp: 0.024, tongue: 0.7 }),
  yum: ex({ lid: 0, squint: 1, hw: 0.04, c: 0.014, o: 0.01, cheek: 1.32, browY: 0.008, teeth: 1 }),
  oops: ex({ lid: 0, iris: 0.86, browY: 0.016, browA: 0.28, browTilt: 0.012, hw: 0.03, c: -0.003, o: 0.022, oUp: 0.012, skew: 0.006, teeth: 0.6 }),
  sleepy: ex({ lid: 0.6, browY: -0.006, browA: 0.12, hw: 0.03, c: 0.004, o: 0.004 }),
  droopy: ex({ lid: 0.34, browY: -0.003, browA: 0.45, hw: 0.034, c: -0.011, o: 0, cheek: 0.96 }),
  tummy: ex({ lid: 0.22, browY: 0.004, browA: 0.42, hw: 0.05, c: -0.004, o: 0.022, wave: 0.0055, teeth: 1 }),
  determined: ex({ lid: 0.27, browY: -0.008, browA: -0.34, hw: 0.038, c: 0.014, o: 0, skew: 0.005 }),
  brr: ex({ lid: 0.3, browY: 0.004, browA: 0.32, hw: 0.054, c: 0, o: 0.024, teeth: 1, low: 1 }),
  cheer: ex({ lid: 0, squint: 1, browY: 0.02, browA: 0.06, hw: 0.066, c: 0.03, o: 0.066, teeth: 1, tongue: 1, cheek: 1.12 }),
};

const EYE = { x: 0.093, y: -0.004, w: 0.052, h: 0.064, d: 0.03 };
const MOUTH_Y = -0.112;
const N_MOUTH = 18;
const TEETH = 4;
const K_TOOTH = 5;
const TEETH_SPAN = 0.74; // fraction of mouth width covered by teeth

const WHITE_TOOTH = new THREE.Color(0xfffaf0);
const CARAMEL = new THREE.Color(0xc47a26);
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const NEG_Z = new THREE.Vector3(0, 0, -1);

let starMat: THREE.MeshBasicMaterial | null = null;
let twinkleMat: THREE.SpriteMaterial | null = null;
let mouthMat: THREE.MeshStandardMaterial | null = null;
let tongueMat: THREE.MeshStandardMaterial | null = null;
let speckMat: THREE.MeshStandardMaterial | null = null;
let whiteMat: THREE.MeshStandardMaterial | null = null;

function sharedMats() {
  if (!starMat) {
    starMat = new THREE.MeshBasicMaterial({ color: 0xfff6c4, toneMapped: false });
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,240,1)');
    grd.addColorStop(0.25, 'rgba(255,246,190,0.75)');
    grd.addColorStop(1, 'rgba(255,240,160,0)');
    g.fillStyle = grd;
    g.beginPath();
    // four-point star with a soft glow
    g.moveTo(32, 0);
    g.quadraticCurveTo(36, 28, 64, 32);
    g.quadraticCurveTo(36, 36, 32, 64);
    g.quadraticCurveTo(28, 36, 0, 32);
    g.quadraticCurveTo(28, 28, 32, 0);
    g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    twinkleMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    mouthMat = new THREE.MeshStandardMaterial({ color: 0x7a2c3a, roughness: 0.65 });
    tongueMat = new THREE.MeshStandardMaterial({ color: 0xf2848c, roughness: 0.55 });
    speckMat = new THREE.MeshStandardMaterial({ color: 0x4a3a33, roughness: 0.8 });
    whiteMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, emissive: 0xffffff, emissiveIntensity: 0.32 });
  }
  return { star: starMat!, twinkle: twinkleMat!, mouth: mouthMat!, tongue: tongueMat!, speck: speckMat!, white: whiteMat! };
}

/** Point on the head ellipsoid surface (head-bone space) + outward-facing orientation. */
function surf(x: number, yRel: number, push: number, outPos: THREE.Vector3, outQ: THREE.Quaternion): void {
  const [ax, by, cz] = DIM.head;
  const k = Math.max(0, 1 - (x / ax) ** 2 - (yRel / by) ** 2);
  const z = -cz * Math.sqrt(k);
  _n.set(x / (ax * ax), yRel / (by * by), z / (cz * cz)).normalize();
  outPos.set(x, DIM.headC + yRel, z).addScaledVector(_n, push);
  outQ.setFromUnitVectors(NEG_Z, _n);
}

interface EyeRig {
  group: THREE.Group;
  iris: THREE.Mesh;
  lid: THREE.Mesh;
  arc: THREE.Mesh;
  star: THREE.Mesh;
  twinkle: THREE.Sprite;
  side: -1 | 1;
}

export class Face {
  readonly eyeL: THREE.Group;
  readonly eyeR: THREE.Group;
  readonly mouth = new THREE.Group();
  readonly meshes: THREE.Object3D[] = [];
  /** 0..1 current yawn amount (the body tilts the head back a little). */
  yawn = 0;
  /** 0..1 chatter shiver (brr) for the head. */
  shiver = 0;
  private eyes: EyeRig[] = [];
  private whites!: THREE.Mesh;
  private hidden = false;
  private brows: THREE.Mesh[] = [];
  private cheeks: THREE.Mesh[] = [];
  private cur: FaceParams = { ...BASE };
  private tgt: FaceParams = { ...BASE };
  private blinkT = 0;
  private nextBlink = 1.5;
  private glanceT = 0;
  private glance = new THREE.Vector2();
  private glanceTo = new THREE.Vector2();
  private mouthGeo: THREE.BufferGeometry;
  private teethGeo: THREE.BufferGeometry;
  private lowGeo: THREE.BufferGeometry;
  private tongue: THREE.Mesh;
  private speck: THREE.Mesh;
  private teethStar: THREE.Mesh;
  private teethMat: THREE.MeshStandardMaterial;
  private sticky = false;
  private teethState: TeethState = { shine: 0, sticky: false, speck: false };
  private sparkle = 0;
  private yawnClock = 2.5;
  private toothTop = new Float32Array(TEETH * (K_TOOTH + 1));
  private rnd: () => number;

  constructor(private spec: CharSpec, head: THREE.Group, headParts: Parts, seed: number) {
    const m = sharedMats();
    let s = seed >>> 0;
    this.rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    // ---------------------------------------------------------- eyes
    const whites = new Parts();
    for (const side of [-1, 1] as const) {
      surf(side * EYE.x, EYE.y, -0.011, pos, q);
      // sclera (static, merged into the head)
      whites.addQ(U.sphere(14, 10), 0xffffff, pos, q, [EYE.w, EYE.h, EYE.d]);
      // Moana: little lash flicks at the outer top corner
      if (spec.id === 'moana') {
        for (let i = 0; i < 2; i++) {
          const lp = new THREE.Vector3(side * (EYE.w * (0.78 + i * 0.16)), EYE.h * (0.62 - i * 0.28), -EYE.d * 0.6).applyQuaternion(q).add(pos);
          const lq = q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, side * (-0.9 - i * 0.35))));
          headParts.addQ(U.sphere(8, 6), spec.lash, lp, lq, [0.006, 0.018, 0.006]);
        }
      }
      const g = new THREE.Group();
      g.position.copy(pos);
      g.quaternion.copy(q);
      head.add(g);
      // iris + pupil + highlights (one glossy mesh that glances)
      const ip = new Parts()
        .add(U.sphere(14, 10), spec.iris, [0, -0.002, -0.021], [EYE.w * 0.8, EYE.h * 0.8, 0.012])
        .add(U.sphere(10, 8), 0x16110f, [0, -0.002, -0.028], [EYE.w * 0.44, EYE.h * 0.47, 0.009])
        .add(U.sphere(8, 6), 0xffffff, [0.013, 0.017, -0.037], [0.0125, 0.0135, 0.004])
        .add(U.sphere(8, 6), 0xffffff, [-0.012, -0.018, -0.035], [0.0062, 0.0062, 0.003]);
      const iris = ip.mesh(glossMaterial());
      g.add(iris);
      // upper lid: a skin dome hinged at the eye centre + a soft lash rim
      // (the ellipsoid scale lives on a parent so the hinge rotates in unit space)
      const lidSpace = new THREE.Group();
      lidSpace.scale.set(EYE.w * 1.04, EYE.h * 1.06, 0.044);
      g.add(lidSpace);
      const lp = new Parts()
        .add(U.dome(16, 6), spec.lid, [0, 0, 0], 1)
        .add(U.torus(0.07, Math.PI * 2, 6, 24), spec.lash, [0, 0, 0], [0.97, 0.97, 1], [Math.PI / 2, 0, 0]);
      const lid = lp.mesh(bodyMaterial());
      lidSpace.add(lid);
      // happy closed eye arc "^"
      const arc = new Parts().add(U.torus(0.2, Math.PI, 6, 16), spec.lash, [0, -0.012, -0.046], [0.042, 0.036, 0.03]).mesh(bodyMaterial());
      arc.visible = false;
      g.add(arc);
      // sparkle star (carrot vision)
      const star = new THREE.Mesh(starGeometry(4, 0.3), m.star);
      star.position.set(0.012, 0.014, -0.047);
      star.scale.setScalar(0.0001);
      star.visible = false;
      g.add(star);
      // outer twinkle (visible beside the head even from behind)
      const tw = new THREE.Sprite(m.twinkle);
      tw.position.set(side * 0.31, DIM.headC + 0.05, -0.12);
      tw.scale.setScalar(0.0001);
      tw.visible = false;
      tw.renderOrder = 3;
      head.add(tw);
      this.eyes.push({ group: g, iris, lid, arc, star, twinkle: tw, side });
      this.meshes.push(iris, lid, arc, star, tw);
    }
    const whiteMesh = whites.mesh(m.white);
    this.whites = whiteMesh;
    head.add(whiteMesh);
    this.meshes.push(whiteMesh);
    this.eyeL = this.eyes[0].group;
    this.eyeR = this.eyes[1].group;

    // ---------------------------------------------------------- brows
    for (const side of [-1, 1] as const) {
      surf(side * 0.094, 0.092, 0.004, pos, q);
      const bg = new THREE.Group();
      bg.position.copy(pos);
      bg.quaternion.copy(q);
      head.add(bg);
      const thick = spec.id === 'moana' ? 0.0125 : 0.011;
      const b = new Parts()
        .limb(spec.brow, [-0.027, -0.003, 0], [0, 0.004, -0.002], thick, 0, 8)
        .limb(spec.brow, [0, 0.004, -0.002], [0.027, -0.003, 0], thick, 0, 8)
        .mesh(bodyMaterial());
      bg.add(b);
      this.brows.push(b);
      this.meshes.push(b);
    }

    // ---------------------------------------------------------- nose + cheeks
    surf(0, -0.052, -0.006, pos, q);
    headParts.addQ(U.sphere(10, 8), spec.nose, pos, q, [0.026, 0.02, 0.02]);
    for (const side of [-1, 1] as const) {
      surf(side * 0.15, -0.074, -0.024, pos, q);
      const ch = new Parts()
        .add(U.sphere(12, 8), spec.skin, [0, 0, 0], [0.054, 0.044, 0.03])
        .add(U.sphere(10, 6), spec.blush, [0, 0, -0.0255], [0.04, 0.025, 0.006])
        .mesh(bodyMaterial());
      ch.position.copy(pos);
      ch.quaternion.copy(q);
      head.add(ch);
      this.cheeks.push(ch);
      this.meshes.push(ch);
    }
    if (spec.id === 'ace') {
      // freckles (Ace)
      for (const side of [-1, 1]) {
        const pts: [number, number][] = [[0.112, -0.038], [0.128, -0.05], [0.142, -0.036]];
        for (const [x, y] of pts) {
          surf(side * x, y, 0.0, pos, q);
          headParts.addQ(U.sphere(6, 4), 0xc98f6c, pos, q, [0.0065, 0.0065, 0.003]);
        }
      }
    }

    // ---------------------------------------------------------- mouth
    surf(0, MOUTH_Y, 0.003, pos, q);
    this.mouth.position.copy(pos);
    this.mouth.quaternion.copy(q);
    head.add(this.mouth);
    this.mouthGeo = this.makeStrip(N_MOUTH, false);
    const mouthMesh = new THREE.Mesh(this.mouthGeo, m.mouth);
    this.mouth.add(mouthMesh);
    this.teethMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, emissive: 0xffffff, emissiveIntensity: 0 });
    this.teethGeo = this.makeTeeth();
    this.lowGeo = this.makeTeeth();
    const teeth = new THREE.Mesh(this.teethGeo, this.teethMat);
    const low = new THREE.Mesh(this.lowGeo, this.teethMat);
    teeth.renderOrder = low.renderOrder = 1;
    this.tongue = new THREE.Mesh(U.sphere(14, 8), m.tongue);
    this.tongue.visible = false;
    this.tongue.scale.setScalar(0.001);
    this.speck = new THREE.Mesh(U.sphere(8, 6), m.speck);
    this.speck.scale.set(0.0058, 0.0058, 0.0015);
    this.speck.visible = false;
    this.teethStar = new THREE.Mesh(starGeometry(4, 0.28), m.star);
    this.teethStar.visible = false;
    this.teethStar.scale.setScalar(0.001);
    this.mouth.add(this.tongue, teeth, low, this.speck, this.teethStar);
    this.meshes.push(mouthMesh, teeth, low, this.tongue, this.speck, this.teethStar);
    this.applyTeethColours();
  }

  /** Strip geometry: (n+1) columns of top/bottom vertices. */
  private makeStrip(n: number, colours: boolean): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const cols = n + 1;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cols * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const nrm = new Float32Array(cols * 2 * 3);
    for (let i = 0; i < cols * 2; i++) nrm[i * 3 + 2] = -1;
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    if (colours) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols * 2 * 3).fill(1), 3));
    const idx: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      // top = a, bottom = a+1 ; face -Z (clockwise seen from +Z)
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.15);
    return g;
  }

  private makeTeeth(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    const cols = TEETH * (K_TOOTH + 1);
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cols * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const nrm = new Float32Array(cols * 2 * 3);
    for (let i = 0; i < cols * 2; i++) nrm[i * 3 + 2] = -1;
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols * 2 * 3).fill(1), 3));
    const idx: number[] = [];
    for (let t = 0; t < TEETH; t++) {
      for (let i = 0; i < K_TOOTH; i++) {
        const a = (t * (K_TOOTH + 1) + i) * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.15);
    return g;
  }

  private applyTeethColours(): void {
    const col = this.teethGeo.getAttribute('color') as THREE.BufferAttribute;
    const lowCol = this.lowGeo.getAttribute('color') as THREE.BufferAttribute;
    // sticky caramel smear: bottoms of teeth 0, 2 (with a drip) and a touch on 3
    const smear = [0.8, 0.15, 1, 0.55];
    for (let t = 0; t < TEETH; t++) {
      for (let i = 0; i <= K_TOOTH; i++) {
        const v = (t * (K_TOOTH + 1) + i) * 2;
        const top = WHITE_TOOTH;
        const bot = this.sticky ? WHITE_TOOTH.clone().lerp(CARAMEL, smear[t]) : WHITE_TOOTH;
        col.setXYZ(v, top.r, top.g, top.b);
        col.setXYZ(v + 1, bot.r, bot.g, bot.b);
        lowCol.setXYZ(v, top.r, top.g, top.b);
        lowCol.setXYZ(v + 1, top.r, top.g, top.b);
      }
    }
    col.needsUpdate = true;
    lowCol.needsUpdate = true;
  }

  setTeeth(t: TeethState): void {
    this.teethState = { shine: t.shine, sticky: t.sticky, speck: t.speck };
    if (t.sticky !== this.sticky) {
      this.sticky = t.sticky;
      this.applyTeethColours();
    }
  }

  setSparkle(v: number): void {
    this.sparkle = THREE.MathUtils.clamp(v, 0, 1);
  }

  /** True when a teeth effect wants the smile to show teeth. */
  get teethShowing(): boolean {
    const t = this.teethState;
    return t.sticky || t.speck || t.shine > 0.15;
  }

  update(dt: number, t: number, expr: Expression): void {
    const base = EXPR[expr];
    const tg = this.tgt;
    for (const k of KEYS) tg[k] = base[k];
    // Teeth effects: everyday smile becomes a toothy one so the effect reads.
    if (this.teethShowing && (expr === 'happy' || expr === 'determined')) {
      tg.o = 0.034;
      tg.teeth = 1;
      tg.c = 0.024;
      tg.hw = 0.056;
    }
    // ----- live sub-animations
    this.yawn = 0;
    this.shiver = 0;
    if (expr === 'yum') {
      const munch = Math.max(0, Math.sin(t * 13));
      tg.o = 0.008 + 0.03 * munch;
      tg.cheek = 1.26 + 0.08 * Math.sin(t * 13 + 1.2);
      tg.teeth = munch > 0.25 ? 1 : 0.3;
    } else if (expr === 'brr') {
      const ch = Math.sin(t * 42) > 0 ? 1 : 0;
      tg.o = 0.017 + 0.011 * ch;
      this.shiver = 1;
    } else if (expr === 'tummy') {
      tg.o = 0.02 + 0.006 * Math.sin(t * 5.5);
    } else if (expr === 'sleepy') {
      this.yawnClock -= dt;
      if (this.yawnClock < -1.5) this.yawnClock = 3 + this.rnd() * 2.5;
      if (this.yawnClock < 0) {
        const k = -this.yawnClock / 1.5;
        const y = Math.sin(Math.PI * Math.min(1, k * 1.1)) ** 0.7;
        this.yawn = y;
        tg.o = 0.006 + 0.064 * y;
        tg.oUp = 0.026 * y;
        tg.hw = 0.03 + 0.012 * y;
        tg.c = 0.004 - 0.004 * y;
        tg.tongue = y;
        tg.lid = 0.6 + 0.35 * y;
        tg.browY = -0.006 + 0.014 * y;
      }
    }
    // ----- damp current params toward targets
    const cur = this.cur;
    const kk = 1 - Math.exp(-18 * dt);
    for (const k of KEYS) cur[k] += (tg[k] - cur[k]) * kk;
    // ----- blink
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blinkT = 0.15;
      this.nextBlink = 1.8 + this.rnd() * 3.4;
      if (this.rnd() < 0.18) this.nextBlink = 0.25; // occasional double blink
    }
    let blink = 0;
    if (this.blinkT > 0) {
      this.blinkT -= dt;
      blink = Math.sin(Math.max(0, 1 - this.blinkT / 0.15) * Math.PI);
    }
    // ----- glance
    this.glanceT -= dt;
    if (this.glanceT <= 0) {
      this.glanceT = 0.8 + this.rnd() * 2.2;
      const r = this.rnd();
      if (r < 0.45) this.glanceTo.set(0, 0);
      else this.glanceTo.set((this.rnd() - 0.5) * 2, (this.rnd() - 0.4) * 1.2);
    }
    this.glance.lerp(this.glanceTo, 1 - Math.exp(-14 * dt));
    // ----- eyes
    const sq = cur.squint;
    const lidClose = Math.min(1, Math.max(cur.lid, blink, sq > 0.5 ? 1 : sq * 1.6));
    const spark = this.sparkle;
    for (const e of this.eyes) {
      e.lid.rotation.x = Math.PI / 2 - lidClose * Math.PI;
      e.iris.position.set(this.glance.x * 0.0085, this.glance.y * 0.007, 0);
      e.iris.scale.set(cur.iris, cur.iris, 1);
      const closedHappy = sq > 0.5;
      e.iris.visible = e.lid.visible = !closedHappy;
      e.arc.visible = sq > 0.05;
      e.arc.scale.set(1, Math.max(0.01, sq), 1);
      const showStar = spark > 0.01 && sq < 0.6;
      e.star.visible = showStar;
      if (showStar) {
        const tw = 0.85 + 0.25 * Math.sin(t * 9 + e.side);
        e.star.scale.setScalar(0.034 * spark * tw * (1 - lidClose * 0.7));
        e.star.rotation.z = t * 1.6 * e.side;
      }
      e.twinkle.visible = spark > 0.01;
      if (e.twinkle.visible) {
        const ph = Math.sin(t * 6.5 + e.side * 1.7);
        e.twinkle.scale.setScalar(0.16 * spark * (0.55 + 0.45 * ph * ph));
        e.twinkle.material.rotation = t * 0.8;
      }
    }
    this.whites.visible = sq <= 0.5;
    // ----- brows
    for (let i = 0; i < 2; i++) {
      const b = this.brows[i];
      const side = i === 0 ? -1 : 1;
      const tilt = cur.browTilt * (side > 0 ? 1 : -0.4);
      b.position.y = cur.browY + tilt + (lidClose > 0.9 && sq < 0.5 ? -0.004 : 0);
      b.rotation.z = -side * cur.browA;
    }
    // ----- cheeks
    for (const c of this.cheeks) c.scale.setScalar(cur.cheek);
    // ----- mouth
    this.updateMouth(t);
    if (this.hidden) for (const o of this.meshes) o.visible = false;
  }

  /** Full-body blink support: hides every face mesh until shown again. */
  setHidden(h: boolean): void {
    this.hidden = h;
    if (h) for (const o of this.meshes) o.visible = false;
  }

  private ph = 0;
  private thick = 0.0125;
  /** Mouth surface curvature (follows the head so the corners tuck in). */
  private readonly zc = (x: number, y: number): number => (x * x) / (2 * DIM.head[0]) + (y * y) / (2 * DIM.head[1]) + 0.0005;
  private readonly topY = (u: number, env: number): number => {
    const c = this.cur;
    return c.c * u * u + c.oUp * env + c.wave * Math.sin(u * Math.PI * 2.5 + this.ph) + c.skew * u;
  };
  private readonly botY = (u: number, env: number): number => {
    const c = this.cur;
    return c.c * u * u - c.o * env - this.thick * (0.4 + 0.6 * env) + c.wave * Math.sin(u * Math.PI * 2.5 + this.ph + 0.6) + c.skew * u;
  };

  private updateMouth(t: number): void {
    const c = this.cur;
    const hw = Math.max(0.012, c.hw);
    const pos = this.mouthGeo.getAttribute('position') as THREE.BufferAttribute;
    const thick = 0.0125;
    const ph = t * 7;
    this.ph = ph;
    this.thick = thick;
    const zc = this.zc;
    const topY = this.topY;
    const botY = this.botY;
    for (let i = 0; i <= N_MOUTH; i++) {
      const u = -1 + (2 * i) / N_MOUTH;
      const env = Math.sqrt(Math.max(0, 1 - u * u));
      const x = hw * u;
      const yt = topY(u, env);
      const yb = botY(u, env);
      pos.setXYZ(i * 2, x, yt, zc(x, yt));
      pos.setXYZ(i * 2 + 1, x, yb, zc(x, yb));
    }
    pos.needsUpdate = true;

    // teeth (upper)
    const open = c.o + c.oUp;
    const tVis = THREE.MathUtils.clamp(c.teeth, 0, 1) * THREE.MathUtils.clamp((open - 0.008) / 0.02, 0, 1);
    const teethH = Math.min(0.019, open * 0.48) * tVis;
    const tp = this.teethGeo.getAttribute('position') as THREE.BufferAttribute;
    const gap = 0.0016;
    const span = hw * TEETH_SPAN;
    const toothW = (2 * span) / TEETH;
    const sticky = this.sticky;
    for (let tt = 0; tt < TEETH; tt++) {
      const x0 = -span + tt * toothW + gap * 0.5;
      const x1 = x0 + toothW - gap;
      // front teeth a little bigger
      const big = tt === 1 || tt === 2 ? 1.08 : 0.92;
      for (let i = 0; i <= K_TOOTH; i++) {
        const s = i / K_TOOTH;
        const x = x0 + (x1 - x0) * s;
        const u = x / hw;
        const env = Math.sqrt(Math.max(0, 1 - u * u));
        const yt = topY(u, env) - 0.0012;
        let h = teethH * big * (0.72 + 0.28 * Math.sin(Math.PI * s));
        if (sticky && tt === 2 && s > 0.3 && s < 0.75) h += 0.006 * tVis; // caramel drip
        const yb = yt - h;
        const v = (tt * (K_TOOTH + 1) + i) * 2;
        tp.setXYZ(v, x, yt, zc(x, yt) - 0.0022);
        tp.setXYZ(v + 1, x, yb, zc(x, yb) - 0.0022);
        if (i === 2) this.toothTop[tt] = (yt + yb) * 0.5;
      }
    }
    tp.needsUpdate = true;

    // lower teeth (chattering brr)
    const lVis = THREE.MathUtils.clamp(c.low, 0, 1) * THREE.MathUtils.clamp((c.o - 0.008) / 0.014, 0, 1);
    const lowH = Math.min(0.012, c.o * 0.36) * lVis;
    const lp = this.lowGeo.getAttribute('position') as THREE.BufferAttribute;
    const lspan = hw * 0.62;
    const lw = (2 * lspan) / TEETH;
    for (let tt = 0; tt < TEETH; tt++) {
      const x0 = -lspan + tt * lw + gap * 0.5;
      const x1 = x0 + lw - gap;
      for (let i = 0; i <= K_TOOTH; i++) {
        const s = i / K_TOOTH;
        const x = x0 + (x1 - x0) * s;
        const u = x / hw;
        const env = Math.sqrt(Math.max(0, 1 - u * u));
        const yb = botY(u, env) + 0.0012;
        const yt = yb + lowH * (0.7 + 0.3 * Math.sin(Math.PI * s));
        const v = (tt * (K_TOOTH + 1) + i) * 2;
        lp.setXYZ(v, x, yt, zc(x, yt) - 0.002);
        lp.setXYZ(v + 1, x, yb, zc(x, yb) - 0.002);
      }
    }
    lp.needsUpdate = true;

    // tongue
    const tg = THREE.MathUtils.clamp(c.tongue, 0, 1) * THREE.MathUtils.clamp((open - 0.02) / 0.02, 0, 1);
    this.tongue.visible = tg > 0.02;
    if (this.tongue.visible) {
      const ybot = botY(0, 1);
      const th = open * 0.32 * tg;
      this.tongue.scale.set(hw * 0.52, Math.max(0.002, th), 0.004);
      this.tongue.position.set(c.skew * 0.3, ybot + th * 0.95 + 0.002, zc(0, ybot) - 0.0012);
    }

    // speck on tooth 1 (cute, tiny)
    const ts = this.teethState;
    this.speck.visible = ts.speck && tVis > 0.45;
    if (this.speck.visible) {
      const x = -span + toothW * 1.5 - 0.002;
      const y = this.toothTop[1];
      this.speck.position.set(x, y, zc(x, y) - 0.0034);
    }
    // shine sparkle on the teeth
    const shine = ts.shine;
    this.teethMat.emissiveIntensity = shine * 0.55;
    this.teethStar.visible = shine > 0.05 && tVis > 0.3;
    if (this.teethStar.visible) {
      const tw = Math.max(0, Math.sin(t * 5.2));
      this.teethStar.scale.setScalar(0.036 * shine * (0.4 + 0.6 * tw));
      this.teethStar.rotation.z = t * 2;
      const x = span * 0.6;
      const y = topY(x / hw, 0.8) - 0.004;
      this.teethStar.position.set(x, y, zc(x, y) - 0.006);
    }
  }

  dispose(): void {
    this.mouthGeo.dispose();
    this.teethGeo.dispose();
    this.lowGeo.dispose();
    this.teethMat.dispose();
  }
}
